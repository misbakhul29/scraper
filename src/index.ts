import express from 'express';
import dotenv from 'dotenv';
import { ChromeManager } from './config/chrome';
import { SessionManager } from './utils/session-manager';
import { ChatGPTScraper } from './services/chatgpt-scraper';
import { ArticleService } from './services/article-service';
import { queueService, ArticleJob } from './services/queue-service';
import { createArticleRoutes } from './routes/article.routes';
import axios from 'axios';
import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { removeAutomationDetection, setRealisticBrowser } from './utils/stealth-helper';
import { prisma } from './lib/prisma'

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CHROME_DEBUG_PORT = parseInt(process.env.CHROME_DEBUG_PORT || '9222');

// Initialize managers
const chromeManager = new ChromeManager({
  debugPort: CHROME_DEBUG_PORT,
  headless: false, // Non-headless untuk bisa login
  userDataDir: process.env.CHROME_USER_DATA_DIR,
});

const sessionManager = new SessionManager();

// Middleware
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Payload sanitization (remove scripts/event handlers/javascript: URLs from incoming payloads)
import { sanitizePayload } from './middleware/sanitize-payload';
app.use(sanitizePayload());

// HTML documentation (human-friendly)
const publicDir = path.join(__dirname, '..', 'public');
app.use('/public', express.static(publicDir));
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'docs.html'));
});

// IP routes (separate router)
import { createIpRoutes } from './routes/ip.routes';
app.use('/api/ip', createIpRoutes());

// Webhook test endpoint
app.post('/api/webhook/test', async (req, res) => {
  try {
    const headers = req.headers;
    const body = req.body;
    const receivedAt = new Date().toISOString();

    // Ensure logs/webhooks directory exists
    const logsDir = path.join(process.cwd(), 'logs', 'webhooks');
    await fs.mkdir(logsDir, { recursive: true });

    const filename = `${Date.now()}.json`;
    const filePath = path.join(logsDir, filename);

    const payload = {
      receivedAt,
      headers,
      body,
    };

    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');

    // Optional signature verification: client can provide secret as query ?secret= or header x-webhook-secret
    const signature = (req.headers['x-webhook-signature'] as string) || undefined;
    const secret = (req.query.secret as string) || (req.headers['x-webhook-secret'] as string) || undefined;
    let signatureVerified: boolean | null = null;

    if (signature && secret) {
      try {
        const bodyString = JSON.stringify(body);
        const expected = crypto.createHmac('sha256', secret).update(bodyString).digest('hex');
        signatureVerified = expected === signature;
      } catch (e) {
        signatureVerified = false;
      }
    }

    res.json({ success: true, saved: `/logs/webhooks/${filename}`, signatureVerified });
  } catch (error) {
    console.error('Error in webhook test endpoint:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize browser and services
let chatgptScraper: ChatGPTScraper | null = null;
let articleService: ArticleService | null = null;

async function initializeServices() {
  // Initialize RabbitMQ connection (for queue status endpoint)
  try {
    await queueService.connect();
    console.log('✅ RabbitMQ connected');
  } catch (error) {
    console.warn('⚠️ Failed to connect to RabbitMQ (queue features may not work):', error);
  }
  try {
    console.log('🚀 Initializing services...');
    
    // Get or create browser
    const browser = await chromeManager.getBrowser();
    
    // Use existing page if available, otherwise create new one
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    // Remove automation detection (must be done before navigation)
    await removeAutomationDetection(page);
    
    // Set realistic browser settings
    await setRealisticBrowser(page);

    // Remove automation banner using CDP
    try {
      const client = await page.createCDPSession();
      await client.send('Runtime.addBinding', { name: 'cdc_adoQpoasnfa76pfcZLmcfl_Array' });
      await client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
          });
          delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
          delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
          delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
        `,
      });
    } catch (e) {
      // Ignore CDP errors
      console.warn('⚠️ Could not remove automation banner via CDP:', e);
    }

    // Initialize scraper and service
    chatgptScraper = new ChatGPTScraper(page, sessionManager);
    articleService = new ArticleService(prisma, chatgptScraper);

    // Navigate to ChatGPT automatically in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('🌐 Navigating to ChatGPT...');
      try {
        // Navigate first (sessionStorage needs valid origin)
        await page.goto('https://chatgpt.com', {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        console.log('✅ Navigated to ChatGPT');
        
        // Try to import default session after navigation
        const defaultSession = process.env.DEFAULT_SESSION || 'default';
        const sessions = sessionManager.listSessions();
        
        if (sessions.includes(defaultSession)) {
          try {
            await sessionManager.importSession(page, defaultSession);
            console.log(`✅ Session "${defaultSession}" imported`);
            
            // Reload page to apply session data
            await page.reload({ waitUntil: 'domcontentloaded' });
          } catch (e) {
            console.warn(`⚠️ Could not import session "${defaultSession}":`, e);
          }
        }
      } catch (error) {
        console.warn('⚠️ Failed to navigate to ChatGPT:', error);
      }
    }

    console.log('✅ Services initialized');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    throw error;
  }
}

/**
 * Process article generation job from queue
 */
async function processArticleJob(job: ArticleJob): Promise<void> {
  if (!articleService) {
    throw new Error('Article service not initialized');
  }

  console.log(`\n📝 Processing article job: ${job.id}`);
  console.log(`   Topic: ${job.topic}`);
  console.log(`   Keywords: ${job.keywords?.join(', ') || 'none'}`);
  console.log(`   Category: ${job.category || 'none'}`);

  try {
    const article = await articleService.generateArticle({
      topic: job.topic,
      keywords: job.keywords,
      category: job.category,
      author: job.author,
      sessionName: job.sessionName,
    });

    console.log(`✅ Article generated successfully: ${article.id}`);
    console.log(`   Title: ${article.title}`);
    console.log(`   Word Count: ${article.wordCount}`);

    // If webhook info is provided, send generation result as a POST to the webhook URL
    if (job.webhookUrl) {
      try {
        const payload = {
          success: true,
          jobId: job.id,
          data: article,
        };

        const bodyString = JSON.stringify(payload);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (job.webhookSecret) {
          const sig = crypto.createHmac('sha256', job.webhookSecret).update(bodyString).digest('hex');
          headers['X-Webhook-Signature'] = sig;
        }

        await axios.post(job.webhookUrl, bodyString, { headers, timeout: 10000 });
        console.log(`✅ Webhook POST successful for job ${job.id} -> ${job.webhookUrl}`);
      } catch (e) {
        console.error(`❌ Failed to deliver webhook for job ${job.id} to ${job.webhookUrl}:`, e instanceof Error ? e.message : e);
        // Do NOT throw - webhook failure should not cause the job to be retried by RabbitMQ
      }
    }
  } catch (error) {
    console.error(`❌ Failed to generate article for job ${job.id}:`, error);
    throw error;
  }
}

/**
 * Start consuming jobs from RabbitMQ queue
 */
async function startQueueConsumer(): Promise<void> {
  if (!articleService) {
    console.warn('⚠️ Article service not initialized, skipping queue consumer');
    return;
  }

  try {
    console.log('\n👂 Starting queue consumer...');
    console.log('📬 Listening for article generation jobs...\n');

    // Start consuming jobs
    await queueService.consumeArticleJobs(
      async (job) => {
        await processArticleJob(job);
      },
      { prefetch: 1 } // Process one job at a time (one browser)
    );
  } catch (error) {
    console.error('❌ Failed to start queue consumer:', error);
    // Don't throw - allow server to continue running even if queue fails
  }
}

// Routes
app.use('/api/articles', (req, res, next) => {
  if (!articleService) {
    return res.status(503).json({
      success: false,
      error: 'Services not initialized',
    });
  }
  next();
}, createArticleRoutes(articleService!));

// Session management endpoints
app.post('/api/sessions/export', async (req, res) => {
  try {
    const { sessionName } = req.body;
    
    if (!sessionName) {
      return res.status(400).json({
        success: false,
        error: 'Session name is required',
      });
    }

    if (!chatgptScraper) {
      return res.status(503).json({
        success: false,
        error: 'Scraper not initialized',
      });
    }

    await chatgptScraper.exportSession(sessionName);

    res.json({
      success: true,
      message: `Session "${sessionName}" exported successfully`,
    });
  } catch (error) {
    console.error('Error exporting session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/api/sessions', (req, res) => {
  try {
    const sessions = sessionManager.listSessions();
    res.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Convert body-parser "entity.too.large" errors into JSON 413 responses
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ success: false, error: 'Payload too large. Maximum size is 100kb.' });
  }
  next(err);
});

// Start server
async function startServer() {
  try {
    await initializeServices();
    
    app.listen(PORT, async () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`📝 API: http://localhost:${PORT}/api/articles`);
      
      // Start queue consumer after server is ready
      await startQueueConsumer();
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await queueService.close();
  await chromeManager.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...');
  await queueService.close();
  await chromeManager.close();
  await prisma.$disconnect();
  process.exit(0);
});

startServer();

