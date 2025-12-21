import { Page } from 'puppeteer';
import { SessionManager } from '../utils/session-manager';

export interface GeminiScrapeOptions {
  prompt: string;
  sessionName?: string;
  waitTimeout?: number;
}

export interface GeminiResponse {
  content: string;
  success: boolean;
  error?: string;
}

export class GeminiScraper {
  private page: Page;
  private sessionManager: SessionManager;
  private readonly GEMINI_URL = 'https://gemini.google.com/app';

  constructor(page: Page, sessionManager: SessionManager) {
    this.page = page;
    this.sessionManager = sessionManager;
  }

  /**
   * Navigate to Gemini and wait for page to load
   */
  async navigateToGemini(sessionName?: string): Promise<void> {
    console.log('🌐 Navigating to Gemini...');
    
    // Import session BEFORE navigating if provided
    if (sessionName) {
      try {
        await this.sessionManager.importSession(this.page, sessionName);
        console.log(`✅ Session "${sessionName}" imported`);
      } catch (error) {
        console.warn(`⚠️ Failed to import session: ${error}. Continuing without session.`);
      }
    }
    
    await this.page.goto(this.GEMINI_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for the page to be fully loaded
    await this.page.waitForSelector('rich-textarea', { timeout: 30000 });

    // Additional wait to ensure page is ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ Gemini page loaded');
  }

  /**
   * Click the "New Conversation" button
   */
  async clickNewConversation(): Promise<void> {
    console.log('🔄 Clicking new conversation button...');
    
    try {
      // Wait for the button with data-test-id="expanded-button"
      await this.page.waitForSelector('button[data-test-id="expanded-button"]', {
        timeout: 10000,
      });

      // Click the button
      await this.page.click('button[data-test-id="expanded-button"]');
      
      // Wait a bit for the new conversation to initialize
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log('✅ New conversation started');
    } catch (error) {
      console.warn('⚠️ Could not find new conversation button, continuing...');
    }
  }

  /**
   * Enter prompt in the textarea
   */
  async enterPrompt(prompt: string): Promise<void> {
    console.log('⌨️ Entering prompt...');
    
    // Wait for the rich-textarea element
    await this.page.waitForSelector('rich-textarea .ql-editor', {
      timeout: 10000,
    });

    // Clear any existing content
    await this.page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;
      const editor = doc.querySelector('rich-textarea .ql-editor') as any;
      if (editor) {
        editor.innerHTML = '';
      }
    });

    // Type the prompt
    const editorSelector = 'rich-textarea .ql-editor';
    await this.page.focus(editorSelector);
    await this.page.type(editorSelector, prompt, { delay: 50 });
    
    // Wait a bit for the input to be processed
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('✅ Prompt entered');
  }

  /**
   * Click the send button
   */
  async clickSend(): Promise<void> {
    console.log('📤 Sending message...');
    
    // Wait for the send button
    await this.page.waitForSelector('button.send-button', {
      timeout: 10000,
    });

    // Click the send button
    await this.page.click('button.send-button');
    
    // Wait a bit for the request to be sent
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('✅ Message sent');
  }

  /**
   * Wait for Gemini to finish generating response
   */
  async waitForResponse(timeout: number = 120000): Promise<void> {
    console.log('⏳ Waiting for Gemini response...');
    
    const startTime = Date.now();
    
    // Wait for the speech-dictation-mic-button to appear, which indicates response is complete
    try {
      await this.page.waitForSelector('speech-dictation-mic-button', {
        timeout,
      });
      
      // Additional wait to ensure content is fully rendered
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Response received (${elapsed}s)`);
    } catch (error) {
      throw new Error(`Timeout waiting for response: ${error}`);
    }
  }

  /**
   * Copy the generated content
   */
  async copyResponse(): Promise<string> {
    console.log('📋 Extracting response content...');
    
    try {
      // First, try to get content directly from the page
      const content = await this.page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document;
        // Try multiple selectors to find the response content
        const selectors = [
          'copy-button',
          '[data-test-id="copy-button"]',
          '.response-content',
          '.message-content',
          '[data-message-id]',
        ];

        // Find the copy button first to locate the response area
        let responseContainer: any = null;
        
        for (const selector of selectors) {
          const element = doc.querySelector(selector);
          if (element) {
            // Find parent container that likely contains the response
            responseContainer = element.closest('[class*="message"], [class*="response"], [class*="content"]') 
              || element.parentElement?.parentElement 
              || element.parentElement;
            break;
          }
        }

        // If we found a container, extract text from it
        if (responseContainer) {
          // Get all text nodes, excluding buttons and UI elements
          const textElements = responseContainer.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li, td, th');
          const texts: string[] = [];
          
          textElements.forEach((el: any) => {
            // Skip if it's a button or icon
            if (el.closest('button') || el.closest('mat-icon') || el.closest('copy-button')) {
              return;
            }
            const text = el.textContent?.trim();
            if (text && text.length > 0) {
              texts.push(text);
            }
          });

          if (texts.length > 0) {
            return texts.join('\n\n');
          }
        }

        // Fallback: get all text from main content area
        const mainContent = doc.querySelector('main, [role="main"], .chat-container, .conversation-container');
        if (mainContent) {
          // Get text but exclude navigation and input areas
          const inputArea = mainContent.querySelector('rich-textarea, .text-input-field');
          const navArea = mainContent.querySelector('nav, .side-nav');
          
          let content = mainContent.cloneNode(true) as any;
          if (inputArea && content.removeChild) content.removeChild(inputArea);
          if (navArea && content.removeChild) content.removeChild(navArea);
          
          return content.textContent?.trim() || '';
        }

        return '';
      });

      if (content && content.trim().length > 0) {
        console.log('✅ Response extracted from page');
        return content.trim();
      }

      // Fallback: Try clicking copy button and reading from clipboard
      console.log('📋 Trying clipboard method...');
      await this.page.waitForSelector('copy-button button[data-test-id="copy-button"]', {
        timeout: 10000,
      });

      // Click the copy button
      await this.page.click('copy-button button[data-test-id="copy-button"]');
      
      // Wait for clipboard to be updated
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Read from clipboard
      const clipboardContent = await this.page.evaluate(async () => {
        try {
          return await (navigator as any).clipboard.readText();
        } catch (err) {
          console.error('Clipboard read error:', err);
          return '';
        }
      });

      if (clipboardContent && clipboardContent.trim().length > 0) {
        console.log('✅ Response copied from clipboard');
        return clipboardContent.trim();
      }

      throw new Error('Could not extract response content from page or clipboard');
    } catch (error) {
      throw new Error(`Failed to extract response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Complete workflow: navigate, click new, enter prompt, send, wait, and copy
   */
  async generateContent(options: GeminiScrapeOptions): Promise<GeminiResponse> {
    try {
      // Navigate to Gemini
      await this.navigateToGemini(options.sessionName);

      // Click new conversation
      await this.clickNewConversation();

      // Enter prompt
      await this.enterPrompt(options.prompt);

      // Send message
      await this.clickSend();

      // Wait for response
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

