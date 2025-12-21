import axios from 'axios';
import { ChildProcess, spawn } from 'child_process';
import puppeteer, { Browser, LaunchOptions, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionData } from '../utils/session-manager';

// Use stealth plugin to avoid detection
puppeteerExtra.use(StealthPlugin());

export interface BrowserConfig {
  debugPort?: number;
  headless?: boolean;
  userDataDir?: string;
  executablePath?: string;
  args?: string[];
  isProduction?: boolean;
}

export interface LocalBrowserConfig {
  id: string;
  port: number;
  wsUrl: string;
}

interface ChromeProcessInfo {
  pid: number;
  process: ChildProcess;
  port: number;
}

/**
 * Get default Chrome executable path based on OS
 */
function getDefaultChromePath(): string | null {
  const platform = os.platform();
  
  if (platform === 'win32') {
    const windowsPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    
    for (const chromePath of windowsPaths) {
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    }
  } else if (platform === 'darwin') {
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
    
    for (const chromePath of macPaths) {
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    }
  } else {
    const linuxPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    ];
    
    for (const chromePath of linuxPaths) {
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    }
  }
  
  return null;
}

/**
 * Get default user data directory based on OS
 */
function getDefaultUserDataDir(): string {
  const platform = os.platform();
  
  if (platform === 'win32') {
    return path.join(os.tmpdir(), 'chrome-debug');
  } else {
    return '/tmp/chrome-debug';
  }
}

/**
 * Prepare user profile with clipboard permissions for ChatGPT
 */
function prepareUserProfile(userDataDir: string): void {
  const preferencesPath = path.join(userDataDir, 'Default', 'Preferences');
  const defaultDir = path.join(userDataDir, 'Default');
  
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }

  let prefs: any = {};
  if (fs.existsSync(preferencesPath)) {
    try {
      prefs = JSON.parse(fs.readFileSync(preferencesPath, 'utf8'));
    } catch (e) {
      // Ignore parse errors
    }
  }

  if (!prefs.profile) {
    prefs.profile = {};
  }
  prefs.profile.exit_type = 'Normal';
  prefs.profile.exited_cleanly = true;

  if (!prefs.profile.content_settings) {
    prefs.profile.content_settings = {};
  }
  if (!prefs.profile.content_settings.exceptions) {
    prefs.profile.content_settings.exceptions = {};
  }
  
  // Set clipboard permissions for ChatGPT domains
  const clipboardSettings = {
    'https://chatgpt.com,*': { 
      'last_modified': Date.now().toString(), 
      'setting': 1 
    },
    'https://chat.openai.com,*': { 
      'last_modified': Date.now().toString(), 
      'setting': 1 
    },
  };

  prefs.profile.content_settings.exceptions.clipboard = {
    ...(prefs.profile.content_settings.exceptions.clipboard || {}),
    ...clipboardSettings,
  };

  try {
    fs.writeFileSync(preferencesPath, JSON.stringify(prefs, null, 2));
  } catch (e) {
    // Ignore write errors
  }
}

/**
 * Comprehensive Browser Manager
 * Handles both single and multiple browser instances
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private config: BrowserConfig;
  private chromeProcesses: Map<number, ChromeProcessInfo> = new Map();

  constructor(config: BrowserConfig = {}) {
    this.config = {
      debugPort: 9222,
      headless: false,
      isProduction: process.env.NODE_ENV === 'production',
      ...config,
    };
  }

  /**
   * Get Chrome executable path
   */
  getChromeExecutablePath(): string {
    if (this.config.executablePath && fs.existsSync(this.config.executablePath)) {
      return this.config.executablePath;
    }

    const defaultPath = getDefaultChromePath();
    if (!defaultPath) {
      throw new Error(
        'Chrome executable not found. Please install Google Chrome or specify executablePath in config.'
      );
    }
    return defaultPath;
  }

  /**
   * Prepare user profile with clipboard permissions
   */
  prepareUserProfile(userDataDir: string): void {
    prepareUserProfile(userDataDir);
  }

  /**
   * Connect to existing Chrome instance via remote debugging
   */
  async connectToRemote(port?: number): Promise<Browser> {
    const debugPort = port || this.config.debugPort || 9222;
    const browserURL = `http://localhost:${debugPort}`;
    
    try {
      const browser = await puppeteer.connect({
        browserURL,
        defaultViewport: null,
      });
      
      console.log(`✅ Connected to Chrome at ${browserURL}`);
      await this.setClipboardPermissions(browser);
      return browser;
    } catch (error) {
      throw new Error(`Failed to connect to Chrome at ${browserURL}: ${error}`);
    }
  }

  /**
   * Launch Chrome with remote debugging enabled
   */
  async launchWithDebugging(port?: number, userDataDir?: string): Promise<Browser> {
    const debugPort = port || this.config.debugPort || 9222;
    const executablePath = this.getChromeExecutablePath();
    const dataDir = userDataDir || this.config.userDataDir || getDefaultUserDataDir();
    
    // Create user data directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Prepare user profile with clipboard permissions
    prepareUserProfile(dataDir);

    const args: string[] = [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${dataDir}`,
      '--no-first-run',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--exclude-switches=enable-automation',
      '--disable-popup-blocking',
      '--disable-translate',
      '--disable-features=TranslateUI',
      '--enable-features=ClipboardContentSetting',
    ];

    // Add custom args
    if (this.config.args) {
      args.push(...this.config.args);
    }

    const launchOptions: LaunchOptions = {
      executablePath,
      headless: this.config.headless,
      args,
      defaultViewport: null,
    };

    try {
      console.log(`🚀 Launching Chrome from: ${executablePath}`);
      console.log(`📁 User data directory: ${dataDir}`);
      console.log(`🔌 Debugging port: ${debugPort}`);
      
      const browser = await puppeteerExtra.launch(launchOptions);
      console.log(`✅ Chrome launched with debugging port ${debugPort}`);
      
      await this.setClipboardPermissions(browser);
      return browser;
    } catch (error) {
      throw new Error(`Failed to launch Chrome: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get or create browser instance (single instance)
   */
  async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    // Try to connect to existing instance first
    try {
      this.browser = await this.connectToRemote();
      return this.browser;
    } catch {
      // If connection fails, launch new instance using launchMultiple
      const debugPort = this.config.debugPort || 9222;
      const sessionFile = process.env.DEFAULT_SESSION ? `sessions/${process.env.DEFAULT_SESSION}.bin` : undefined;
      
      // Launch single instance using launchMultiple
      const configs = await this.launchMultiple(debugPort, 1, sessionFile);
      
      if (configs.length > 0) {
        // Connect to the launched browser using wsUrl
        const config = configs[0];
        this.browser = await puppeteer.connect({
          browserWSEndpoint: config.wsUrl,
        });
        return this.browser;
      } else {
        throw new Error('Failed to launch browser instance');
      }
    }
  }

  /**
   * Launch multiple Chrome instances and inject session
   * Alias: launchAndInject (for backward compatibility)
   */
  async launchMultiple(
    startPort: number,
    count: number,
    sessionFile?: string
  ): Promise<LocalBrowserConfig[]> {
    const results: LocalBrowserConfig[] = [];
    const chromePath = this.getChromeExecutablePath();
    const platform = os.platform();
    const isLinux = platform === 'linux';
    const isProduction = this.config.isProduction || false;
    
    // Load session data
    const sessionData = this.loadSessionData(sessionFile);

    console.log(`🚀 Spawning ${count} Chrome instances starting from port ${startPort}...`);
    if (isProduction && isLinux) {
      console.log(`📦 Production mode: Using xvfb-run for headless display`);
    } else {
      console.log(`🔧 Development mode: Running Chrome directly`);
    }

    // Ensure logs directory exists
    const logsDir = path.resolve('./logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log(`📁 Created logs directory: ${logsDir}`);
    }

    for (let i = 0; i < count; i++) {
      const port = startPort + i;
      const id = `browser-${port}`;
      const userDataDir = path.resolve(`./tmp/profile-${port}`);
      const logFile = path.resolve(`./logs/chrome-${port}.log`);

      // Prepare user profile
      this.prepareUserProfile(userDataDir);

      // Build Chrome arguments
      const chromeArgs = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=Translate',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
      ];

      const timestamp = new Date().toISOString();
      const logHeader = `\n=== Chrome Instance Started: ${timestamp} ===\nPort: ${port}\nID: ${id}\nPlatform: ${platform}\nProduction: ${isProduction}\n\n`;
      
      fs.appendFileSync(logFile, logHeader, 'utf8');

      let chromeProcess: ChildProcess;
      
      if (isProduction && isLinux) {
        // Production Linux: Use xvfb-run with nohup
        const command = `nohup xvfb-run --auto-servernum --server-args="-screen 0 1280x1024x24" ${chromePath} ${chromeArgs.join(' ')} >> ${logFile} 2>&1 &`;
        fs.appendFileSync(logFile, `Command: ${command}\n\n`, 'utf8');
        
        console.log(`📝 [Browser ${i + 1}/${count}] Starting Chrome on port ${port} (xvfb-run), logging to: ${logFile}`);
        
        chromeProcess = spawn('sh', ['-c', command], { 
          detached: true, 
          stdio: 'ignore' 
        });
      } else {
        // Development mode or non-Linux: Run directly
        fs.appendFileSync(logFile, `Command: ${chromePath} ${chromeArgs.join(' ')}\n\n`, 'utf8');
        
        console.log(`📝 [Browser ${i + 1}/${count}] Starting Chrome on port ${port}, logging to: ${logFile}`);
        
        chromeProcess = spawn(chromePath, chromeArgs, {
          detached: true,
          stdio: ['ignore', fs.openSync(logFile, 'a'), fs.openSync(logFile, 'a')],
        });
      }
      
      chromeProcess.unref();
      
      // Track process for cleanup
      if (chromeProcess.pid) {
        this.chromeProcesses.set(port, {
          pid: chromeProcess.pid,
          process: chromeProcess,
          port,
        });
      }
      
      fs.appendFileSync(logFile, `Process spawned with PID: ${chromeProcess.pid || 'unknown'}\n`, 'utf8');

      // Wait for Chrome to be ready
      let wsUrl = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        await this.sleep(1000);
        try {
          const { data } = await axios.get(`http://127.0.0.1:${port}/json/version`, {
            timeout: 2000,
          });
          wsUrl = data.webSocketDebuggerUrl;
          fs.appendFileSync(logFile, `✅ Chrome ready on port ${port} (attempt ${attempt + 1}/10)\nWebSocket URL: ${wsUrl}\n`, 'utf8');
          console.log(`✅ [Browser ${i + 1}/${count}] Chrome ready on port ${port} (attempt ${attempt + 1}/10)`);
          break;
        } catch (e) {
          if (attempt < 9) {
            fs.appendFileSync(logFile, `⏳ Waiting for Chrome on port ${port}... (attempt ${attempt + 1}/10)\n`, 'utf8');
          } else {
            fs.appendFileSync(logFile, `❌ Port ${port} not responding after 10 attempts\nError: ${e instanceof Error ? e.message : String(e)}\n`, 'utf8');
            console.error(`❌ Port ${port} not responding. Check log: ${logFile}`);
          }
        }
      }

      if (wsUrl) {
        // Inject session if available
        if (sessionData) {
          fs.appendFileSync(logFile, `🔄 Injecting session data...\n`, 'utf8');
          await this.injectSession(wsUrl, sessionData, logFile);
          fs.appendFileSync(logFile, `✅ Session injected successfully\n`, 'utf8');
          console.log(`✅ [Browser ${i + 1}/${count}] Session injected on port ${port}`);
        } else {
          fs.appendFileSync(logFile, `⚠️ No session data to inject\n`, 'utf8');
        }
        
        results.push({ id, port, wsUrl });
        fs.appendFileSync(logFile, `✅ Browser instance ${id} is ready and configured\n\n`, 'utf8');
      } else {
        fs.appendFileSync(logFile, `❌ Failed to initialize browser instance ${id}\n\n`, 'utf8');
      }
    }

    return results;
  }

  /**
   * Launch multiple Chrome instances and inject session
   * Alias for launchMultiple (backward compatibility)
   */
  async launchAndInject(
    startPort: number,
    count: number,
    sessionFile?: string
  ): Promise<LocalBrowserConfig[]> {
    return this.launchMultiple(startPort, count, sessionFile);
  }

  /**
   * Load session data from file (supports .bin and .json)
   */
  private loadSessionData(sessionFile?: string): SessionData | null {
    const binFile = sessionFile || './session.bin';
    const jsonFile = sessionFile || './sessions/default.json';
    const legacyJsonFile = './auth-session.json';

    // Try to load .bin file first
    if (fs.existsSync(binFile) && binFile.endsWith('.bin')) {
      try {
        const { SessionBinary } = require('../utils/session-binary');
        return SessionBinary.loadFromBin(binFile);
      } catch (err) {
        console.error('❌ Failed to decode BIN session:', err);
      }
    }

    // Fallback to JSON files
    const jsonFiles = [jsonFile, legacyJsonFile];
    for (const file of jsonFiles) {
      if (fs.existsSync(file)) {
        try {
          const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
          console.log(`📂 Loaded session from JSON file: ${file}`);
          return data;
        } catch (err) {
          console.error(`❌ Failed to parse JSON session file ${file}:`, err);
        }
      }
    }

    return null;
  }

  /**
   * Inject session data into browser
   */
  private async injectSession(
    wsUrl: string,
    sessionData: SessionData,
    logFile?: string
  ): Promise<void> {
    const log = (msg: string) => {
      if (logFile) {
        fs.appendFileSync(logFile, msg, 'utf8');
      }
    };
    
    try {
      log(`🔌 Connecting to browser via WebSocket: ${wsUrl}\n`);
      
      const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl,
        defaultViewport: null
      });
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();

      if (!page) {
        throw new Error('No page available.');
      }

      // Inject cookies
      if (sessionData.cookies && sessionData.cookies.length > 0) {
        const context = browser.defaultBrowserContext();
        for (const cookie of sessionData.cookies) {
          await context.setCookie(cookie);
        }
        log(`🍪 Injected ${sessionData.cookies.length} cookies\n`);
      }

      // Set clipboard permissions
      const context = browser.defaultBrowserContext();
      try {
        await context.overridePermissions('https://chatgpt.com', [
          'clipboard-read',
          'clipboard-write',
          'clipboard-sanitized-write',
        ]);
        await context.overridePermissions('https://chat.openai.com', [
          'clipboard-read',
          'clipboard-write',
          'clipboard-sanitized-write',
        ]);
        log(`🔐 Clipboard permissions granted\n`);
      } catch (err) {
        log(`⚠️ Failed to set clipboard permissions: ${err instanceof Error ? err.message : String(err)}\n`);
      }

      // Navigate to ChatGPT
      log(`🌐 Navigating to https://chatgpt.com\n`);
      await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded' });
      
      // Inject localStorage and sessionStorage
      log(`💾 Injecting localStorage and sessionStorage...\n`);
      await page.evaluate((data: { localStorage: any; sessionStorage: any; }) => {
        try {
          localStorage.clear();
          sessionStorage.clear();
          
          if (data.localStorage) {
            Object.entries(data.localStorage).forEach(([k, v]) => {
              localStorage.setItem(k, v as string);
            });
          }
          
          if (data.sessionStorage) {
            Object.entries(data.sessionStorage).forEach(([k, v]) => {
              sessionStorage.setItem(k, v as string);
            });
          }
        } catch (e) {
          console.error('Error injecting storage:', e);
        }
      }, {
        localStorage: sessionData.localStorage,
        sessionStorage: sessionData.sessionStorage,
      });

      // Reload to apply session data
      log(`🔄 Reloading page to apply session data\n`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      
      browser.disconnect();
      
      log(`✅ Session injection completed successfully\n`);
      
    } catch (error) {
      const errorMsg = `❌ Failed to inject session: ${error instanceof Error ? error.message : String(error)}\nStack: ${error instanceof Error ? error.stack : 'N/A'}\n`;
      log(errorMsg);
      console.error(`⚠️ Failed to inject session:`, error);
    }
  }

  /**
   * Set clipboard permissions for ChatGPT
   */
  private async setClipboardPermissions(browser: Browser): Promise<void> {
    try {
      const context = browser.defaultBrowserContext();
      await context.overridePermissions('https://chatgpt.com', [
        'clipboard-read',
        'clipboard-write',
        'clipboard-sanitized-write',
      ]);
      await context.overridePermissions('https://chat.openai.com', [
        'clipboard-read',
        'clipboard-write',
        'clipboard-sanitized-write',
      ]);
      console.log('✅ Clipboard permissions granted for ChatGPT');
    } catch (error) {
      console.warn('⚠️ Failed to set clipboard permissions:', error);
    }
  }

  /**
   * Close browser (single instance)
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Cleanup all Chrome processes (multiple instances)
   */
  async cleanup(): Promise<void> {
    console.log(`🧹 Cleaning up ${this.chromeProcesses.size} Chrome processes...`);
    
    const cleanupPromises = Array.from(this.chromeProcesses.entries()).map(
      async ([port, { process, pid }]) => {
        try {
          if (!process.killed) {
            process.kill('SIGTERM');
          }
          
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              if (!process.killed) {
                console.warn(`⚠️ Chrome on port ${port} (PID: ${pid}) didn't exit gracefully, forcing kill...`);
                try {
                  process.kill('SIGKILL');
                } catch (e) {
                  // Ignore kill errors
                }
              }
              resolve();
            }, 3000);
            
            process.once('exit', () => {
              clearTimeout(timeout);
              resolve();
            });
          });
          
          console.log(`✅ Cleaned up Chrome process on port ${port} (PID: ${pid})`);
        } catch (error) {
          console.error(`❌ Error cleaning up Chrome on port ${port}:`, error);
        }
      }
    );
    
    await Promise.all(cleanupPromises);
    this.chromeProcesses.clear();
    console.log('✅ All Chrome processes cleaned up');
  }

  /**
   * Get list of active Chrome processes
   */
  getActiveProcesses(): ChromeProcessInfo[] {
    return Array.from(this.chromeProcesses.values());
  }

  /**
   * Check if Chrome is running on debug port
   */
  async isChromeRunning(port?: number): Promise<boolean> {
    const debugPort = port || this.config.debugPort || 9222;
    try {
      const response = await fetch(`http://localhost:${debugPort}/json/version`);
      return response.ok;
    } catch {
      return false;
    }
  }

  private sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
}

// Export for backward compatibility
export { BrowserManager as ChromeManager };
export const browserManager = new BrowserManager();

