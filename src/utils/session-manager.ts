import * as fs from 'fs';
import * as path from 'path';
import { Page, Viewport } from 'puppeteer';

export interface SessionData {
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  userAgent?: string;
  viewport?: { width: number; height: number };
  timestamp: number;
}

export class SessionManager {
  private sessionsDir: string;

  constructor(sessionsDir: string = path.join(process.cwd(), 'sessions')) {
    this.sessionsDir = sessionsDir;
    this.ensureSessionsDir();
  }

  private ensureSessionsDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Export session from page
   */
  async exportSession(page: Page, sessionName: string): Promise<string> {
    const sessionData: SessionData = {
      cookies: await page.browserContext().cookies(),
      localStorage: await page.evaluate(() => {
        const storage: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            storage[key] = localStorage.getItem(key) || '';
          }
        }
        return storage;
      }),
      sessionStorage: await page.evaluate(() => {
        const storage: Record<string, string> = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) {
            storage[key] = sessionStorage.getItem(key) || '';
          }
        }
        return storage;
      }),
      userAgent: await page.evaluate(() => navigator.userAgent),
      viewport: (page.viewport() || { width: 1920, height: 1080 }) as Viewport,
      timestamp: Date.now(),
    };

    // Save as JSON
    const jsonPath = path.join(this.sessionsDir, `${sessionName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(sessionData, null, 2));
    console.log(`✅ Session exported to JSON: ${jsonPath}`);
    
    // Also save as BIN
    try {
      const { SessionBinary } = await import('./session-binary');
      const binPath = path.join(this.sessionsDir, `${sessionName}.bin`);
      const binData = SessionBinary.encode(sessionData);
      fs.writeFileSync(binPath, binData);
      console.log(`✅ Session exported to BIN: ${binPath}`);
      return binPath; // Return BIN path as primary
    } catch (e) {
      console.warn('⚠️ Failed to export BIN, JSON only:', e);
      return jsonPath;
    }
  }

  /**
   * Import session to page
   * Supports both .bin and .json files (prefers .bin if available)
   */
  async importSession(page: Page, sessionName: string): Promise<void> {
    const binPath = path.join(this.sessionsDir, `${sessionName}.bin`);
    const jsonPath = path.join(this.sessionsDir, `${sessionName}.json`);
    
    let sessionData: SessionData;
    
    // Try to load from BIN file first (preferred)
    if (fs.existsSync(binPath)) {
      try {
        const { SessionBinary } = await import('./session-binary');
        sessionData = SessionBinary.loadFromBin(binPath);
        console.log(`📂 Loaded session from BIN: ${binPath}`);
      } catch (e) {
        console.warn(`⚠️ Failed to load BIN file, trying JSON:`, e);
        // Fallback to JSON
        if (fs.existsSync(jsonPath)) {
          sessionData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          console.log(`📂 Loaded session from JSON: ${jsonPath}`);
        } else {
          throw new Error(`Session file not found: ${binPath} or ${jsonPath}`);
        }
      }
    } else if (fs.existsSync(jsonPath)) {
      // Fallback to JSON
      sessionData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      console.log(`📂 Loaded session from JSON: ${jsonPath}`);
    } else {
      throw new Error(`Session file not found: ${binPath} or ${jsonPath}`);
    }

    // Set cookies using BrowserContext (new API)
    if (sessionData.cookies && sessionData.cookies.length > 0) {
      try {
        const context = page.browserContext();
        await context.setCookie(...sessionData.cookies);
      } catch (e) {
        console.warn('⚠️ Failed to set cookies:', e);
      }
    }

    // Set localStorage (requires valid origin)
    if (sessionData.localStorage) {
      try {
        await page.evaluate((storage) => {
          try {
            for (const [key, value] of Object.entries(storage)) {
              localStorage.setItem(key, value);
            }
          } catch (e) {
            console.error('Error setting localStorage:', e);
          }
        }, sessionData.localStorage);
      } catch (e) {
        console.warn('⚠️ Failed to set localStorage:', e);
      }
    }

    // Set sessionStorage (requires valid origin and must be on same domain)
    if (sessionData.sessionStorage) {
      try {
        await page.evaluate((storage) => {
          try {
            for (const [key, value] of Object.entries(storage)) {
              sessionStorage.setItem(key, value);
            }
          } catch (e) {
            console.error('Error setting sessionStorage:', e);
          }
        }, sessionData.sessionStorage);
      } catch (e) {
        console.warn('⚠️ Failed to set sessionStorage (may need to be on correct domain):', e);
      }
    }

    // Set viewport if available
    if (sessionData.viewport) {
      await page.setViewport(sessionData.viewport);
    }

    const sourceFile = fs.existsSync(binPath) ? binPath : jsonPath;
    console.log(`✅ Session imported from ${sourceFile}`);
  }

  /**
   * List all available sessions
   */
  listSessions(): string[] {
    if (!fs.existsSync(this.sessionsDir)) {
      return [];
    }

    return fs.readdirSync(this.sessionsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
  }

  /**
   * Delete session
   */
  deleteSession(sessionName: string): void {
    const filePath = path.join(this.sessionsDir, `${sessionName}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ Session deleted: ${sessionName}`);
    }
  }
}

