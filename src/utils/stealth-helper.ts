import { Page } from 'puppeteer';

/**
 * Remove automation detection from page
 */
export async function removeAutomationDetection(page: Page): Promise<void> {
  // Use CDP to remove automation banner
  try {
    const client = await page.createCDPSession();
    
    // Remove automation indicators via CDP
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        // Remove webdriver property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
        
        // Remove automation indicators
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
        
        // Override chrome runtime
        window.chrome = {
          runtime: {},
          loadTimes: function() {},
          csi: function() {},
          app: {}
        };
        
        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
        
        // Override plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
        
        // Override languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });
      `,
    });
  } catch (e) {
    // Fallback if CDP fails
    console.warn('⚠️ CDP stealth injection failed, using fallback:', e);
  }

  // Remove webdriver property (fallback)
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
    
    // Remove automation indicators
    const win = globalThis as any;
    delete win.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete win.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete win.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
  });

  // Override permissions
  await page.evaluateOnNewDocument(() => {
    const originalQuery = (globalThis as any).navigator.permissions.query;
    (globalThis as any).navigator.permissions.query = (parameters: any) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: (globalThis as any).Notification.permission })
        : originalQuery(parameters);
  });

  // Override plugins
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
  });

  // Override languages
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });

  // Override chrome object
  await page.evaluateOnNewDocument(() => {
    (globalThis as any).chrome = {
      runtime: {},
      loadTimes: function() {},
      csi: function() {},
      app: {},
    };
  });
}

/**
 * Set realistic user agent and viewport
 */
export async function setRealisticBrowser(page: Page): Promise<void> {
  // Set realistic user agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Set extra headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
  });
}

