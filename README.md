# Scraper (ChatGPT-based Article Generator)

A TypeScript + Express service that queues article generation tasks processed by an automated Chrome-based scraper (ChatGPT). It uses RabbitMQ for job queuing and Prisma/Postgres for storage.

---

## Highlights

- 🐧 Chrome remote debugging + puppeteer-based scraping
- 🐇 RabbitMQ queue for asynchronous processing
- 🔒 Input sanitization (removes scripts / event handlers / javascript: URIs)
- ⚖️ Rate limiting on generation endpoints (default: 5 requests per 60s)
- 📦 Payload limit: 100kb for JSON / urlencoded bodies
- 🧾 Webhook delivery with HMAC-SHA256 signature header (`X-Webhook-Signature`)
- 🛡️ IP whitelist / blacklist management with admin approval workflow
- 🧪 Postman collection for local testing
- 🚀 GitHub Actions deploys to VPS and builds on the server (PM2)

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- RabbitMQ server
- Google Chrome/Chromium installed
- (Optional) xvfb for headless Chrome on Linux

### Install & Prepare

1. Install dependencies:

```bash
npm install
```

2. Copy and edit environment variables:

```bash
cp .env.example .env
# Edit .env and set DATABASE_URL, PORT, RABBITMQ_*, CHROME_DEBUG_PORT, ADMIN_API_KEY, etc.
```

3. Prisma (after editing `prisma/schema.prisma` or pulling migrations):

```bash
npm run prisma:generate
npm run prisma:migrate dev --name init
```

4. Start Chrome with remote debugging (example):

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=./chrome-data
```

5. Run the app in development:

```bash
npm run dev
```

Production build & run:

```bash
npm run build
npm start
```

> Tip: run `npm run type-check` to validate TypeScript types.

---

## API Overview

All APIs return JSON. The root HTML docs are served at `GET /docs` and a machine-friendly JSON at `GET /`.

### Important global behavior

- Body parsers are configured with a 100kb limit for JSON and urlencoded bodies.
- Incoming payloads are sanitized (middleware) to remove obvious script/XSS vectors.
- Rate limiting: generation endpoints have a default of 5 requests per 60s per IP.

### Generate (internal)

POST /api/articles/create

Request body (JSON):
```json
{
  "topic": "Your topic",
  "keywords": ["a", "b"],
  "category": "Optional",
  "author": "Optional",
  "sessionName": "Optional"
}
```
Response:
```json
{
  "success": true,
  "message": "Article generation job queued",
  "data": {
    "jobId": "article-...",
    "topic": "...",
    "status": "queued",
    "queuePosition": 5
  }
}
```

- `queuePosition` is an approximation (based on RabbitMQ message count at publish time).

### Generate (public)

POST /api/articles/generate

Protected by IP access control (must be WHITELIST status). Body includes optional `webhookUrl` and `webhookSecret`.

If `webhookUrl` is provided, the worker will POST the final article to the URL with JSON `{ success: true, jobId, data }` and include `X-Webhook-Signature` (HMAC-SHA256 hex) when `webhookSecret` is provided.

Response includes `queuePosition` as above.

### Webhook Test

POST /api/webhook/test

- A convenience endpoint to receive webhook POSTs and save them to `logs/webhooks/<timestamp>.json`.
- If you provide `?secret=...` or header `X-Webhook-Secret`, include header `X-Webhook-Signature` (HMAC-SHA256) and it will verify the signature and return `signatureVerified: true|false`.

### IP Access (Whitelist / Blacklist)

- POST /api/ip/request — request whitelist for your IP (body: `{ ip?: string, note?: string }`). New requests have `PENDING` status.
- GET /api/ip — admin (requires `X-Admin-Key` header matching `ADMIN_API_KEY`), lists entries.
- PATCH /api/ip/:id/status — admin updates status to `PENDING` / `WHITELIST` / `BLACKLIST`.

Behavior when hitting protected endpoints (e.g., public generate):
- **WHITELIST** — request proceeds.
- **PENDING** — 403 with message: "Your IP is waiting approval." (or ask to call /api/ip/request if not found).
- **BLACKLIST** — 403 and returns a short friendly quote ("kata-kata mutiara").

### Other endpoints

- GET /api/articles — list articles
- GET /api/articles/:id — get article by id
- PATCH /api/articles/:id/status — update status (DRAFT|PUBLISHED|ARCHIVED)
- GET /api/articles/queue/status — queue status (messageCount, consumerCount)
- POST /api/sessions/export — export a session
- GET /api/sessions — list available sessions

---

## Developer tools

- Postman collection: `postman/Scraper.postman_collection.json` (import into Postman). Environment: `postman/Scraper.environment.json`.
- Human docs: `GET /docs` (HTML page). Machine docs: `GET /` returns JSON summary.
- Rate limit middleware: `src/middleware/rate-limit.ts`
- Sanitizer middleware: `src/middleware/sanitize-payload.ts`
- IP access middleware: `src/middleware/ip-access.ts`

---

## Deployment

- GitHub Actions workflow: `.github/workflows/deploy-pm2.yml` bundles source on push and uploads to VPS.
- The VPS build step runs `npm ci --production`, `npm run prisma:generate`, `npm run prisma:migrate deploy`, `npm run build`, and starts the app with PM2.
- Ensure your VPS has Node, npm, PM2 (and optionally NVM) available and environment variables configured.

---

## Notes & Troubleshooting

- Slug collisions: if an article slug already exists, the service appends numeric suffixes (`slug-1`, `slug-2`, ...) up to 1000 attempts to generate a unique slug.
- Webhook delivery errors are logged but do not requeue the job.
- Webhook POST timeout is set to 10s by default.
- The queue position is an approximation (messageCount) and may vary during processing.

---

## Contributing

Happy to accept PRs — add tests and update docs when adding features.

## License

MIT


