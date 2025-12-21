import dotenv from 'dotenv';
import { ChromeManager } from '../config/chrome';
import { SessionManager } from '../utils/session-manager';
import { ChatGPTScraper } from '../services/chatgpt-scraper';
import { removeAutomationDetection, setRealisticBrowser } from '../utils/stealth-helper';

dotenv.config();

async function exportSession() {
  const sessionName = process.argv[2] || 'default';
  const CHROME_DEBUG_PORT = parseInt(process.env.CHROME_DEBUG_PORT || '9222');

  console.log(`📤 Exporting session: ${sessionName}`);

  try {
    const chromeManager = new ChromeManager({
      debugPort: CHROME_DEBUG_PORT,
      headless: false, // Non-headless untuk bisa login
    });

    const sessionManager = new SessionManager();

    // Connect to Chrome
    const browser = await chromeManager.getBrowser();
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    // Remove automation detection
    await removeAutomationDetection(page);
    
    // Set realistic browser settings
    await setRealisticBrowser(page);

    // Navigate to ChatGPT to ensure we have a valid session
    console.log('🌐 Navigating to ChatGPT...');
    await page.goto('https://chatgpt.com', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for prompt textarea to be available (page loaded)
    await page.waitForSelector('#prompt-textarea', { timeout: 30000 });
    
    // Wait a bit for page to fully load
    await new Promise((resolve) => setTimeout(resolve, 3000));

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
          console.log('⏳ Waiting for login... (checking every 2 seconds)');
          console.log('👤 Please login to ChatGPT in the browser window...');
        }
      } catch (e) {
        // Element not found, continue waiting
        console.log('⏳ Waiting for login...');
      }

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    if (!isLoggedIn) {
      console.warn('⚠️  Warning: Login status not detected after 10 minutes.');
      console.warn('⚠️  Continuing with export anyway. Session may be incomplete.');
    }

    // Wait a bit more for session to stabilize
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Initialize scraper and export session
    console.log('\n📤 Exporting session...');
    const scraper = new ChatGPTScraper(page, sessionManager);
    await scraper.exportSession(sessionName);

    console.log(`✅ Session "${sessionName}" exported successfully!`);
    console.log(`📁 Location: sessions/${sessionName}.json`);

    await browser.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error exporting session:', error);
    process.exit(1);
  }
}

exportSession();

