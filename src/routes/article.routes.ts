import { Router, Request, Response } from 'express';
import { ArticleService } from '../services/article-service';
import { queueService } from '../services/queue-service';
import { rateLimit } from '../middleware/rate-limit';
import { z } from 'zod';

const articleSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  keywords: z.array(z.string()).optional(),
  category: z.string().optional(),
  author: z.string().optional(),
  sessionName: z.string().optional(),
});

const publicArticleSchema = articleSchema.extend({
  webhookUrl: z.string().url().optional(),
  webhookSecret: z.string().optional(),
});

export function createArticleRoutes(articleService: ArticleService): Router {
  const router = Router();

  /**
   * POST /api/articles/create
   * Queue article generation job
   */
  router.post('/create', rateLimit({ windowMs: 60_000, max: 5 }), async (req: Request, res: Response) => {
    try {
      const validated = articleSchema.parse(req.body);
      
      // Publish job to queue instead of processing directly
      const jobId = await queueService.publishArticleJob({
        topic: validated.topic,
        keywords: validated.keywords,
        category: validated.category,
        author: validated.author,
        sessionName: validated.sessionName,
      });
      
      res.json({
        success: true,
        message: 'Article generation job queued',
        data: {
          jobId,
          topic: validated.topic,
          status: 'queued',
        },
      });
    } catch (error) {
      console.error('Error queueing article:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/articles/generate-public
   * Public endpoint: queue article generation and optionally notify a webhook when the article is generated
   */
  router.post('/generate', rateLimit({ windowMs: 60_000, max: 5 }), async (req: Request, res: Response) => {
    try {
      const validated = publicArticleSchema.parse(req.body);

      // Publish job including webhook info
      const jobId = await queueService.publishArticleJob({
        topic: validated.topic,
        keywords: validated.keywords,
        category: validated.category,
        author: validated.author,
        sessionName: validated.sessionName,
        webhookUrl: validated.webhookUrl,
        webhookSecret: validated.webhookSecret,
      });

      res.json({
        success: true,
        message: 'Public article generation job queued',
        data: {
          jobId,
          topic: validated.topic,
          status: 'queued',
        },
      });
    } catch (error) {
      console.error('Error queueing public article:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/articles
   * Get all articles
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;

      const articles = await articleService.getArticles(status, limit, offset);

      res.json({
        success: true,
        data: articles,
        pagination: {
          limit,
          offset,
          total: articles.length,
        },
      });
    } catch (error) {
      console.error('Error fetching articles:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/articles/:id
   * Get article by ID
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const article = await articleService.getArticle(id);

      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'Article not found',
        });
      }

      res.json({
        success: true,
        data: article,
      });
    } catch (error) {
      console.error('Error fetching article:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * PATCH /api/articles/:id/status
   * Update article status
   */
  router.patch('/:id/status', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status. Must be DRAFT, PUBLISHED, or ARCHIVED',
        });
      }

      const article = await articleService.updateArticleStatus(id, status);

      res.json({
        success: true,
        data: article,
      });
    } catch (error) {
      console.error('Error updating article status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/articles/queue/status
   * Get queue status
   */
  router.get('/queue/status', async (req: Request, res: Response) => {
    try {
      const status = await queueService.getQueueStatus();
      
      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      console.error('Error getting queue status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}

