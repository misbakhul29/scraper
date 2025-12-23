import { Request, Response, NextFunction } from 'express';

type RateLimitOptions = {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: Request) => string;
};

const DEFAULT_WINDOW = 60_000; // 1 minute
const DEFAULT_MAX = 10;

export function rateLimit(options?: RateLimitOptions) {
  const { windowMs = DEFAULT_WINDOW, max = DEFAULT_MAX, keyGenerator } = options || {};
  const hits: Map<string, { count: number; resetAt: number }> = new Map();

  // Periodic cleanup to avoid unbounded memory growth
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits) {
      if (now > record.resetAt) hits.delete(key);
    }
    if (hits.size === 0) {
      clearInterval(cleanupInterval);
    }
  }, Math.max(1000, windowMs));

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = keyGenerator ? keyGenerator(req) : (req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown');
      const now = Date.now();
      const current = hits.get(key);

      if (!current || now > current.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
      } else {
        current.count += 1;
        hits.set(key, current);
      }

      const record = hits.get(key)!;

      // Helpful headers
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - record.count)));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

      if (record.count > max) {
        return res.status(429).json({ success: false, error: 'Too many requests, please try again later' });
      }

      next();
    } catch (err) {
      // On any internal error in limiter, don't block traffic
      next();
    }
  };
}
