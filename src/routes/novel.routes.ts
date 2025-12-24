import { Router, Request, Response } from 'express';
import { NovelService } from '../services/novel-service';
import { z } from 'zod';
import { rateLimit } from '../middleware/rate-limit';
import { ipAccessMiddleware } from '../middleware/ip-access';
import { queueService } from '../services/queue-service';

const novelSchema = z.object({
  title: z.string().optional(),
  prompt: z.string().optional(),
  language: z.string().optional(),
  genre: z.string().optional(),
  approxWords: z.number().int().positive().optional(),
  sessionName: z.string().optional(),
});

const publicNovelSchema = novelSchema.extend({
  webhookUrl: z.string().url().optional(),
  webhookSecret: z.string().optional(),
});

export function createNovelRoutes(getNovelService: () => NovelService | null): Router {
  const router = Router();

  /**
   * POST /api/novels/create
   * Queue novel generation job (internal)
   */
  router.post('/create', rateLimit({ windowMs: 60_000, max: 2 }), async (req: Request, res: Response) => {
    try {
      const validated = novelSchema.parse(req.body);

      const { jobId, queuePosition } = await queueService.publishNovelJob({
        title: validated.title,
        prompt: validated.prompt,
        language: validated.language,
        genre: validated.genre,
        approxWords: validated.approxWords,
        sessionName: validated.sessionName,
      });

      res.json({
        success: true,
        message: 'Novel generation job queued',
        data: {
          jobId,
          title: validated.title || null,
          status: 'queued',
          queuePosition: queuePosition ?? null,
        },
      });
    } catch (error) {
      console.error('Error queueing novel:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
      }
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * POST /api/novels/generate
   * Public endpoint: queue novel generation and optionally notify a webhook when the novel is generated
   */
  router.post('/generate', ipAccessMiddleware(), rateLimit({ windowMs: 60_000, max: 2 }), async (req: Request, res: Response) => {
    try {
      const validated = publicNovelSchema.parse(req.body);

      // Publish job including webhook info
      const { jobId, queuePosition } = await queueService.publishNovelJob({
        title: validated.title,
        prompt: validated.prompt,
        language: validated.language,
        genre: validated.genre,
        approxWords: validated.approxWords,
        sessionName: validated.sessionName,
        webhookUrl: validated.webhookUrl,
        webhookSecret: validated.webhookSecret,
      });

      res.json({
        success: true,
        message: 'Public novel generation job queued',
        data: {
          jobId,
          title: validated.title || null,
          status: 'queued',
          queuePosition: queuePosition ?? null,
        },
      });
    } catch (error) {
      console.error('Error queueing public novel:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
      }

      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  return router;
}
