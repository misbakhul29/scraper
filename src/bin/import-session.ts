import dotenv from 'dotenv';
import { ChromeManager } from '../config/chrome';
import { SessionManager } from '../utils/session-manager';
import { ChatGPTScraper } from '../services/chatgpt-scraper';
import { removeAutomationDetection, setRealisticBrowser } from '../utils/stealth-helper';

dotenv.config();

async function importSession() {
  const sessionName = process.argv[2];

  if (!sessionName) {
    console.error('❌ Please provide a session name');
    console.log('Usage: npm run import-session <session-name>');
    process.exit(1);
  }

  console.log(`📥 Importing session: ${sessionName}`);

  try {
    const CHROME_DEBUG_PORT = parseInt(process.env.CHROME_DEBUG_PORT || '9222');
    const chromeManager = new ChromeManager({
      debugPort: CHROME_DEBUG_PORT,
      headless: false, // Non-headless untuk bisa melihat browser
    });

    const sessionManager = new SessionManager();

    // Check if session exists
    const sessions = sessionManager.listSessions();
    if (!sessions.includes(sessionName)) {
      console.error(`❌ Session "${sessionName}" not found`);
      console.log(`Available sessions: ${sessions.join(', ') || 'none'}`);
      process.exit(1);
    }

    // Connect to Chrome
    const browser = await chromeManager.getBrowser();
    const page = await browser.newPage();

    // Remove automation detection
    await removeAutomationDetection(page);
    
    // Set realistic browser settings
    await setRealisticBrowser(page);

    // Initialize scraper and import session
    const scraper = new ChatGPTScraper(page, sessionManager);
    await scraper.navigateToChatGPT(sessionName);

    console.log(`✅ Session "${sessionName}" imported successfully!`);
    console.log('🌐 You can now use this session in production');

    // Keep browser open for testing
    console.log('⏳ Keeping browser open for 30 seconds for testing...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    await browser.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error importing session:', error);
    process.exit(1);
  }
}

importSession();

