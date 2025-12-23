import { Request, Response, NextFunction } from 'express';

/**
 * Basic sanitization to remove potentially dangerous HTML/JS from payload strings.
 * - Removes <script>, <style>, <iframe>, <object>, <embed>, <svg> blocks
 * - Removes inline event handlers (on*) attributes
 * - Removes javascript: URIs in href/src attributes
 *
 * This is a lightweight, defensive sanitizer intended to reduce obvious vectors
 * for script injection in user-supplied payloads. For higher security needs,
 * consider using a robust library (e.g., DOMPurify + jsdom) and a stricter
 * content policy.
 */

function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') return input;

  let s = input;

  // Remove script and style blocks
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove dangerous embedded content
  s = s.replace(/<(iframe|object|embed|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Remove inline event handlers: on<word>="..." and on<word>='...' and on<word>=unquoted
  s = s.replace(/\son\w+\s*=\s*("[\s\S]*?"|'[\s\S]*?'|[^\s>]+)/gi, '');

  // Remove javascript: URIs in href/src attributes
  s = s.replace(/\s(href|src)\s*=\s*("|')?\s*javascript:[^\"'\s>]+(\2)?/gi, '');

  // Remove <base> or <meta http-equiv> that could alter page behavior
  s = s.replace(/<base\b[^>]*>/gi, '');
  s = s.replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '');

  // Optionally, remove any remaining <script-like> tags
  s = s.replace(/<[^>]*on[a-z]+\s*=\s*[^>]*>/gi, '');

  return s;
}

function sanitizeValue(value: any): any {
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeValue(v);
    }
    return out;
  }
  return value;
}

export function sanitizePayload() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.body) req.body = sanitizeValue(req.body);
      if (req.query) req.query = sanitizeValue(req.query);
      // Mark request as sanitized for downstream handlers/logging
      res.setHeader('X-Payload-Sanitized', 'true');
    } catch (e) {
      // Fail open: if sanitizer has a bug, do not block requests
      console.warn('⚠️ Payload sanitizer error:', e);
    }

    next();
  };
}
