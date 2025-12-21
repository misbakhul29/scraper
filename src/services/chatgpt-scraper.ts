import { Page } from 'puppeteer';
import { SessionManager } from '../utils/session-manager';

export interface ChatGPTScrapeOptions {
  prompt: string;
  sessionName?: string;
  waitTimeout?: number;
}

export interface ChatGPTResponse {
  content: string;
  success: boolean;
  error?: string;
}

export class ChatGPTScraper {
  private page: Page;
  private sessionManager: SessionManager;
  private readonly CHATGPT_URL = 'https://chatgpt.com';

  constructor(page: Page, sessionManager: SessionManager) {
    this.page = page;
    this.sessionManager = sessionManager;
  }

  /**
   * Navigate to ChatGPT and wait for page to load
   */
  async navigateToChatGPT(sessionName?: string): Promise<void> {
    console.log('🌐 Navigating to ChatGPT...');
    
    // Import session BEFORE navigating if provided
    if (sessionName) {
      try {
        await this.sessionManager.importSession(this.page, sessionName);
        console.log(`✅ Session "${sessionName}" imported`);
      } catch (error) {
        console.warn(`⚠️ Failed to import session: ${error}. Continuing without session.`);
      }
    }
    
    await this.page.goto(this.CHATGPT_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for the prompt textarea to be available
    await this.page.waitForSelector('#prompt-textarea', { timeout: 30000 });

    // Additional wait to ensure page is ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ ChatGPT page loaded');
  }

  /**
   * Click the "New chat" button
   */
  async clickNewChat(): Promise<void> {
    console.log('🔄 Clicking new chat button...');
    
    try {
      // Wait for the new chat button with data-testid="create-new-chat-button"
      await this.page.waitForSelector('a[data-testid="create-new-chat-button"]', {
        timeout: 10000,
      });

      // Click the button
      await this.page.click('a[data-testid="create-new-chat-button"]');
      
      // Wait a bit for the new chat to initialize
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log('✅ New chat started');
    } catch (error) {
      console.warn('⚠️ Could not find new chat button, continuing...');
    }
  }

  /**
   * Enter prompt in the textarea
   */
  async enterPrompt(prompt: string): Promise<void> {
    console.log('⌨️ Entering prompt...');
    
    // Wait for the prompt textarea (ProseMirror editor)
    await this.page.waitForSelector('#prompt-textarea', {
      timeout: 10000,
    });

    // Clear any existing content
    await this.page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;
      const editor = doc.querySelector('#prompt-textarea') as any;
      if (editor) {
        editor.innerHTML = '';
        editor.textContent = '';
      }
    });

    // Focus the editor
    await this.page.focus('#prompt-textarea');
    
    // For ProseMirror contenteditable div, we need to handle it properly
    await this.page.evaluate((text) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;
      const editor = doc.querySelector('#prompt-textarea') as any;
      if (editor) {
        // ProseMirror uses <p> tags inside the editor
        // Clear existing content
        editor.innerHTML = '';
        
        // Create a paragraph element with the text
        const p = doc.createElement('p');
        p.textContent = text;
        editor.appendChild(p);
        
        // Trigger events that ProseMirror listens to
        const inputEvent = new Event('input', { bubbles: true });
        editor.dispatchEvent(inputEvent);
        // Also trigger beforeinput for ProseMirror
        // Guard against InputEvent missing in some environments
        const beforeInputEvent = new Event('beforeinput', { bubbles: true, cancelable: true });
        editor.dispatchEvent(beforeInputEvent);
      }
    }, prompt);
    
    // Wait a bit for the input to be processed
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('✅ Prompt entered');
  }

  /**
   * Click the send button (submit button)
   */
  async clickSend(): Promise<void> {
    console.log('📤 Sending message...');
    
    try {
      // Find and click the submit button
      // The submit button is usually near the textarea
      // Try multiple selectors for the send button
      const sendButtonSelectors = [
        'button[data-testid="send-button"]',
        'button[aria-label*="Send"]',
        'button[type="submit"]',
        'form button[type="submit"]',
        '.composer-submit-button-color',
      ];

      let clicked = false;
      for (const selector of sendButtonSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 3000 });
          await this.page.click(selector);
          clicked = true;
          break;
        } catch (e) {
          // Try next selector
          continue;
        }
      }

      if (!clicked) {
        // Fallback: try to submit by pressing Enter
        await this.page.keyboard.press('Enter');
      }
      
      // Wait a bit for the request to be sent
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('✅ Message sent');
    } catch (error) {
      console.warn('⚠️ Could not find send button, trying Enter key...');
      await this.page.keyboard.press('Enter');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Wait for ChatGPT to finish generating response
   * Modified: Waits for the presence of the 2nd copy button (User + AI)
   */
  async waitForResponse(timeout: number = 120000): Promise<void> {
    console.log('⏳ Waiting for ChatGPT response (Copy Button Strategy)...');
    
    const startTime = Date.now();
    
    try {
      // Kita menunggu sampai jumlah tombol copy minimal 2
      // Index 0 = Prompt User
      // Index 1 = Response AI (muncul setelah selesai generate)
      await this.page.waitForFunction(
        () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const doc = (globalThis as any).document;
          const buttons = doc.querySelectorAll('button[data-testid="copy-turn-action-button"]');
          return buttons.length >= 2;
        },
        { timeout }
      );
      
      // Tambahan delay sedikit untuk memastikan render icon selesai
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Response received (Copy button detected in ${elapsed}s)`);
    } catch (error) {
      throw new Error(`Timeout waiting for response (Copy button not found): ${error}`);
    }
  }

  /**
   * Copy the generated content using ChatGPT's copy button
   * Assumes waitForResponse has already confirmed the button exists
   */
  async copyResponse(): Promise<string> {
    console.log('📋 Copying response content...');
    
    try {
      // Cari index tombol terakhir (seharusnya tombol AI)
      const copyButtonIndex = await this.page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document;
        const buttons = Array.from(doc.querySelectorAll('button[data-testid="copy-turn-action-button"]'));
        // Return index terakhir
        return buttons.length > 0 ? buttons.length - 1 : -1;
      });

      if (copyButtonIndex === -1) {
        throw new Error('Copy button not found');
      }

      // Click tombol copy terakhir
      await this.page.evaluate((index) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document;
        const buttons = Array.from(doc.querySelectorAll('button[data-testid="copy-turn-action-button"]'));
        if (buttons[index]) {
          (buttons[index] as any).click();
        }
      }, copyButtonIndex);
      
      console.log('✅ Copy button clicked');

      // Tunggu clipboard terisi
      await new Promise(resolve => setTimeout(resolve, 500));

      // Ambil isi clipboard
      const markdownContent = await this.page.evaluate(async () => {
        try {
          const clipboardText = await (navigator as any).clipboard?.readText();
          return clipboardText || '';
        } catch (error) {
          console.warn('Could not read from clipboard directly:', error);
          return '';
        }
      });

      if (markdownContent && markdownContent.trim().length > 0) {
        console.log('✅ Content retrieved from clipboard');
        return markdownContent.trim();
      }

      // --- Fallback: Extract dari DOM jika Clipboard API gagal (misal context permission) ---
      console.log('⚠️ Clipboard empty, extracting from DOM as fallback...');
      
      const domContent = await this.page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document;
        // Ambil container pesan terakhir (message group terakhir)
        const messageGroups = doc.querySelectorAll('[data-message-author-role="assistant"]');
        const lastMessage = messageGroups[messageGroups.length - 1];

        if (!lastMessage) return '';

        // Clone untuk manipulasi aman
        const clone = lastMessage.cloneNode(true) as any;
        
        // Hapus elemen UI pengganggu (tombol copy, regenerate, dll)
        const uiElements = clone.querySelectorAll('button, [role="button"], .text-xs');
        uiElements.forEach((el: any) => el.remove());

        return clone.innerText || clone.textContent || '';
      });

      return domContent.trim();

    } catch (error) {
      throw new Error(`Failed to copy response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Complete workflow: navigate, click new chat, enter prompt, send, wait, and copy
   */
  async generateContent(options: ChatGPTScrapeOptions): Promise<ChatGPTResponse> {
    try {
      // Navigate to ChatGPT
      await this.navigateToChatGPT(options.sessionName);

      // Click new chat
      await this.clickNewChat();

      // Enter prompt
      await this.enterPrompt(options.prompt);

      // Send message
      await this.clickSend();

      // Wait for response (using voice button to track completion)
      await this.waitForResponse(options.waitTimeout);

      // Copy response
      const content = await this.copyResponse();

      return {
        content,
        success: true,
      };
    } catch (error) {
      console.error('❌ Error generating content:', error);
      return {
        content: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Export current session
   */
  async exportSession(sessionName: string): Promise<void> {
    await this.sessionManager.exportSession(this.page, sessionName);
  }
}

