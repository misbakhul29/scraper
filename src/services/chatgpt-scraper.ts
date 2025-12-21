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
   * Uses voice button to track if chat has successfully generated
   */
  async waitForResponse(timeout: number = 120000): Promise<void> {
    console.log('⏳ Waiting for ChatGPT response...');
    
    const startTime = Date.now();
    
    try {
      // Wait for the voice button to appear and be enabled
      // The voice button becomes enabled when the response is complete
      // Button has aria-label="Start voice mode" and class "composer-submit-button-color"
      await this.page.waitForFunction(
        () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const doc = (globalThis as any).document;
          
          // Find voice button by aria-label="Start voice mode"
          const voiceButton = Array.from(doc.querySelectorAll('button')).find(
            (btn: any) => {
              const ariaLabel = btn.getAttribute('aria-label');
              return ariaLabel === 'Start voice mode';
            }
          ) as any;
          
          if (voiceButton) {
            // Check if button is enabled (not disabled)
            // The button is disabled when it has the disabled attribute or disabled classes
            const isDisabled = voiceButton.hasAttribute('disabled') || 
                              voiceButton.getAttribute('disabled') === 'true' ||
                              voiceButton.classList.contains('disabled');
            
            // Also check computed style - disabled buttons have opacity-30
            const computedStyle = (globalThis as any).window?.getComputedStyle(voiceButton);
            const isVisuallyDisabled = computedStyle ? parseFloat(computedStyle.opacity) <= 0.3 : false;
            
            // Button is ready when it's not disabled
            return !isDisabled && !isVisuallyDisabled;
          }
          return false;
        },
        { timeout }
      );
      
      // Additional wait to ensure content is fully rendered
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Response received (${elapsed}s)`);
    } catch (error) {
      throw new Error(`Timeout waiting for response: ${error}`);
    }
  }

  /**
   * Copy the generated content using ChatGPT's copy button
   * This ensures we get the content in markdown format
   */
  async copyResponse(): Promise<string> {
    console.log('📋 Copying response content using ChatGPT copy button...');
    
    try {
      // Wait for at least one copy button to be available
      await this.page.waitForSelector('button[data-testid="copy-turn-action-button"]', {
        timeout: 10000,
      });

      // Find all copy buttons (there are two: one for user message, one for GPT response)
      // We want the second one (last one) which is for the GPT response
      const copyButtonIndex = await this.page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document;
        const buttons = Array.from(doc.querySelectorAll('button[data-testid="copy-turn-action-button"]'));
        
        // Return the index of the last button (which should be for GPT response)
        return buttons.length > 1 ? buttons.length - 1 : 0;
      });

      // Click the second/last copy button (GPT response)
      await this.page.evaluate((index) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document;
        const buttons = Array.from(doc.querySelectorAll('button[data-testid="copy-turn-action-button"]'));
        if (buttons[index]) {
          (buttons[index] as any).click();
        }
      }, copyButtonIndex);
      
      // Wait a bit for clipboard to be populated
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get content from clipboard (this will be in markdown format)
      const markdownContent = await this.page.evaluate(async () => {
        try {
          // Try to read from clipboard (ChatGPT copies in markdown format)
          const clipboardText = await (navigator as any).clipboard?.readText();
          if (clipboardText && clipboardText.trim().length > 0) {
            return clipboardText;
          }
        } catch (error) {
          console.warn('Could not read from clipboard:', error);
        }
        return '';
      });

      if (markdownContent && markdownContent.trim().length > 0) {
        console.log('✅ Response copied in markdown format');
        return markdownContent.trim();
      }

      // If clipboard method failed, fallback to extracting markdown from DOM
      console.log('⚠️ Clipboard method failed, extracting markdown from DOM...');
      const markdownContentFallback = await this.page.evaluate((extractMarkdown: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document;
        
        // Find the copy button to locate the message
        const copyButton = doc.querySelector('button[data-testid="copy-turn-action-button"]');
        if (!copyButton) {
          return '';
        }
        
        // Find message container
        let messageContainer = copyButton.closest('[data-message-author-role="assistant"]') ||
                              copyButton.closest('.group.w-full') ||
                              copyButton.closest('[class*="message"]');
        
        if (!messageContainer) {
          return '';
        }
        
        // Extract markdown from the message
        const result: string[] = [];
        const clone = messageContainer.cloneNode(true) as any;
        
        // Remove buttons, icons, and UI elements
        const removeElements = clone.querySelectorAll('button, [class*="icon"], [class*="button"], nav, header');
        removeElements.forEach((el: any) => el.remove());
        
        // Convert to markdown
        const processNode = (node: any): void => {
          if (node.nodeType === 3) { // Text node
            const text = node.textContent?.trim();
            if (text) result.push(text);
          } else if (node.nodeType === 1) { // Element node
            const tagName = node.tagName?.toLowerCase();
            const text = node.textContent?.trim();
            
            if (!text || node.classList?.contains('hidden')) return;
            
            switch (tagName) {
              case 'h1': result.push(`\n# ${text}\n`); break;
              case 'h2': result.push(`\n## ${text}\n`); break;
              case 'h3': result.push(`\n### ${text}\n`); break;
              case 'h4': result.push(`\n#### ${text}\n`); break;
              case 'p': result.push(`\n${text}\n`); break;
              case 'ul':
                Array.from(node.children || []).forEach((li: any, idx: number) => {
                  const liText = li.textContent?.trim();
                  if (liText) result.push(`- ${liText}\n`);
                });
                break;
              case 'ol':
                Array.from(node.children || []).forEach((li: any, idx: number) => {
                  const liText = li.textContent?.trim();
                  if (liText) result.push(`${idx + 1}. ${liText}\n`);
                });
                break;
              case 'code':
                const parent = node.parentElement;
                if (parent?.tagName?.toLowerCase() === 'pre') {
                  result.push(`\n\`\`\`\n${text}\n\`\`\`\n`);
                } else {
                  result.push(`\`${text}\``);
                }
                break;
              case 'pre':
                if (!node.querySelector('code')) {
                  result.push(`\n\`\`\`\n${text}\n\`\`\`\n`);
                }
                break;
              case 'strong':
              case 'b':
                result.push(`**${text}**`);
                break;
              case 'em':
              case 'i':
                result.push(`*${text}*`);
                break;
              case 'a':
                const href = node.getAttribute('href');
                result.push(`[${text}](${href || '#'})`);
                break;
              case 'blockquote':
                text.split('\n').forEach((line: string) => {
                  if (line.trim()) result.push(`> ${line}\n`);
                });
                break;
              default:
                if (text && !result[result.length - 1]?.includes(text)) {
                  result.push(text);
                }
            }
          }
        };
        
        Array.from(clone.childNodes || []).forEach((child: any) => processNode(child));
        
        return result.join('')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/[ \t]+$/gm, '')
          .trim();
      }, '');

      if (markdownContentFallback && markdownContentFallback.trim().length > 0) {
        console.log('✅ Response extracted in markdown format');
        return markdownContentFallback.trim();
      }

      throw new Error('Could not extract response content');
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

