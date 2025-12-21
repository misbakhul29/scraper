import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { ChromeManager } from '../config/chrome';
import { SessionManager } from '../utils/session-manager';
import { ChatGPTScraper } from '../services/chatgpt-scraper';
import { removeAutomationDetection, setRealisticBrowser } from '../utils/stealth-helper';
import { SessionBinary } from '../utils/session-binary';

dotenv.config();

/**
 * Script untuk convert JSON session ke BIN format
 * Usage: npm run convert-session <session-name>
 * 
 * Jika session JSON sudah ada, akan convert ke BIN
 * Jika belum ada, akan export session dulu lalu convert ke BIN
 */
async function convertSession() {
  const sessionName = process.argv[2] || 'default';
  const CHROME_DEBUG_PORT = parseInt(process.env.CHROME_DEBUG_PORT || '9222');
  const sessionManager = new SessionManager();
  
  const sessionsDir = (sessionManager as any).sessionsDir;
  const jsonPath = path.join(sessionsDir, `${sessionName}.json`);
  const binPath = path.join(sessionsDir, `${sessionName}.bin`);

  console.log(`🔄 Converting session: ${sessionName}`);
  
  try {
    // Check if JSON file exists
    if (!fs.existsSync(jsonPath)) {
      console.log(`📤 JSON file not found. Exporting session first...`);
      console.log('🌐 Chrome akan muncul, silakan login ke ChatGPT...');
      console.log('⏳ Setelah login, tunggu beberapa detik untuk session di-export...\n');

      const USER_DATA_DIR = process.env.CHROME_USER_DATA_DIR || './chrome-data';
      
      const chromeManager = new ChromeManager({
        debugPort: CHROME_DEBUG_PORT,
        headless: false, // Non-headless untuk bisa login
        userDataDir: USER_DATA_DIR, // Gunakan user data dir untuk persist session
      });

      // Connect to Chrome atau launch baru
      const browser = await chromeManager.getBrowser();
      const page = await browser.newPage();

      // Remove automation detection
      await removeAutomationDetection(page);
      
      // Set realistic browser settings
      await setRealisticBrowser(page);

      // Navigate to ChatGPT
      console.log('🌐 Navigating to ChatGPT...');
      await page.goto('https://chatgpt.com/', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      // Wait for prompt textarea to be available
      await page.waitForSelector('#prompt-textarea', { timeout: 30000 });

      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log('\n✅ ChatGPT page loaded!');
      console.log('👤 Silakan login ke ChatGPT di browser yang muncul...\n');

      // Check if user is logged in by looking for profile button
      console.log('🔍 Checking login status...');
      const maxWaitTime = 600000; // 10 minutes
      const checkInterval = 2000; // Check every 2 seconds
      const startTime = Date.now();
      let isLoggedIn = false;

      while (Date.now() - startTime < maxWaitTime) {
        try {
          // Check if profile button exists (indicates user is logged in)
          const profileButton = await page.$('[data-testid="accounts-profile-button"]');
          
          if (profileButton) {
            console.log('✅ User is logged in! Profile button detected.');
            isLoggedIn = true;
            break;
          } else {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const remaining = Math.floor((maxWaitTime - (Date.now() - startTime)) / 1000);
            console.log(`⏳ Waiting for login... (${elapsed}s elapsed, ${remaining}s remaining)`);
          }
        } catch (e) {
          // Element not found, continue waiting
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          console.log(`⏳ Waiting for login... (${elapsed}s elapsed)`);
        }

        // Wait before next check
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }

      if (!isLoggedIn) {
        console.warn('⚠️  Warning: Login status not detected after 10 minutes.');
        console.warn('⚠️  Continuing with export anyway. Session may be incomplete.');
      }

      // Wait a bit more for session to stabilize
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Initialize scraper and export session
      console.log('\n📤 Exporting session...');
      const scraper = new ChatGPTScraper(page, sessionManager);
      await scraper.exportSession(sessionName);

      console.log(`\n✅ Session "${sessionName}" exported to JSON!`);
      console.log(`📁 Location: ${jsonPath}`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      await browser.close();
    } else {
      console.log(`✅ JSON file found: ${jsonPath}`);
    }

    // Convert JSON to BIN
    console.log(`\n🔄 Converting JSON to BIN format...`);
    const binOutputPath = SessionBinary.convertJsonToBin(jsonPath, binPath);
    console.log(`✅ Session converted to BIN successfully!`);
    console.log(`📁 BIN Location: ${binOutputPath}`);
    console.log(`\n💡 Tips:`);
    console.log(`   - BIN file dapat digunakan untuk import session`);
    console.log(`   - File lebih compact dan aman dibanding JSON`);
    console.log(`   - Import session akan otomatis menggunakan BIN jika tersedia`);
    
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error converting session:', error);
    process.exit(1);
  }
}

convertSession();
