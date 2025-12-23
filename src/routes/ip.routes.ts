import { Router, Request, Response } from 'express';
import { ipAccessService } from '../services/ip-access.service';

export function createIpRoutes(): Router {
  const router = Router();
  const adminKey = process.env.ADMIN_API_KEY;

  /**
   * POST /api/ip/request
   * Public endpoint to request whitelist for current IP (or a provided IP)
   */
  router.post('/request', async (req: Request, res: Response) => {
    try {
      const ip = (req.body.ip as string) || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      if (!ip) {
        return res.status(400).json({ success: false, error: 'IP is required' });
      }

      const entry = await ipAccessService.requestIp(ip, req.body.note);

      res.json({ success: true, message: 'IP whitelist request submitted', data: { ip: entry.ip, status: entry.status } });
    } catch (error) {
      console.error('Error requesting IP whitelist:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * GET /api/ip
   * Admin: list IP requests (requires X-Admin-Key header)
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      if (!adminKey || req.headers['x-admin-key'] !== adminKey) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }

      const list = await ipAccessService.list();
      res.json({ success: true, data: list });
    } catch (error) {
      console.error('Error listing ip entries:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * PATCH /api/ip/:id/status
   * Admin: update IP status to PENDING/WHITELIST/BLACKLIST (requires X-Admin-Key header)
   */
  router.patch('/:id/status', async (req: Request, res: Response) => {
    try {
      if (!adminKey || req.headers['x-admin-key'] !== adminKey) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }

      const { id } = req.params;
      const { status } = req.body;
      if (!['PENDING', 'WHITELIST', 'BLACKLIST'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }

      const updated = await ipAccessService.updateStatus(id, status as any);
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('Error updating ip status:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  return router;
}
