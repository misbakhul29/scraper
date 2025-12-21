# ChatGPT Scraper

A TypeScript/Express-based scraper for generating articles using ChatGPT with Chrome remote debugging support and RabbitMQ queue system.

## Features

- 🤖 Automated article generation using ChatGPT
- 🔌 Chrome remote debugging support (port 9222)
- 🎭 Bot detection evasion using puppeteer-extra-stealth
- 💾 Session management (export/import for dev/production)
- 📊 Full SEO schema with Prisma
- 🐧 xvfb support for headless Chrome on Linux
- 📝 RESTful API for article generation
- 🐰 RabbitMQ queue system for handling multiple article generation requests
- 👷 Integrated queue consumer for processing queued jobs

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- RabbitMQ server (for queue system)
- Google Chrome/Chromium installed
- (Linux only) xvfb for headless Chrome

## Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` and configure:
- `DATABASE_URL`: PostgreSQL connection string
- `PORT`: Server port (default: 3000)
- `CHROME_DEBUG_PORT`: Chrome debugging port (default: 9222)
- `CHROME_USER_DATA_DIR`: Chrome user data directory (optional)
- `RABBITMQ_HOST`: RabbitMQ host (default: localhost)
- `RABBITMQ_PORT`: RabbitMQ port (default: 5672)
- `RABBITMQ_USER`: RabbitMQ username (default: guest)
- `RABBITMQ_PASSWORD`: RabbitMQ password (default: guest)
- `DEFAULT_SESSION`: Default session name to import (optional)

3. Set up Prisma:

```bash
npm run prisma:generate
npm run prisma:migrate
```

## Usage

### Starting Chrome with Remote Debugging

#### Linux (with xvfb):

```bash
chmod +x scripts/start-chrome.sh
./scripts/start-chrome.sh
```

#### Windows:

```powershell
.\scripts\start-chrome.ps1
```

#### Manual:

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=./chrome-data
```

### Running the Server

#### Development:

```bash
npm run dev
```

#### Production:

```bash
npm run build
npm start
```

**Note**: The server automatically starts the queue consumer after initialization. Both API server and queue worker run in the same process.

### Session Management

#### Export Session (Development):

```bash
npm run export-session <session-name>
```

This will:
1. Navigate to Gemini
2. Export cookies, localStorage, and sessionStorage
3. Save to `sessions/<session-name>.json`

#### Import Session (Production):

When starting the server, the session will be automatically imported if you provide `sessionName` in the API request.

### API Endpoints

#### Generate Article (Queued)

```bash
POST /api/articles/generate
Content-Type: application/json

{
  "topic": "Artificial Intelligence",
  "keywords": ["AI", "machine learning", "neural networks"],
  "category": "Technology",
  "author": "John Doe",
  "sessionName": "default" // optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Article generation job queued",
  "data": {
    "jobId": "article-1234567890-abc123",
    "topic": "Artificial Intelligence",
    "status": "queued"
  }
}
```

**Note**: The article generation is now asynchronous. The job is queued and processed automatically by the server's queue consumer. Check the article status using the GET endpoints.

#### Get Queue Status

```bash
GET /api/articles/queue/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "queue": "article_generation",
    "messageCount": 5,
    "consumerCount": 1
  }
}
```

#### Get All Articles

```bash
GET /api/articles?status=PUBLISHED&limit=10&offset=0
```

#### Get Article by ID

```bash
GET /api/articles/:id
```

#### Update Article Status

```bash
PATCH /api/articles/:id/status
Content-Type: application/json

{
  "status": "PUBLISHED" // DRAFT, PUBLISHED, or ARCHIVED
}
```

#### Export Session

```bash
POST /api/sessions/export
Content-Type: application/json

{
  "sessionName": "production-session"
}
```

#### List Sessions

```bash
GET /api/sessions
```

## Database Schema

The project uses Prisma with a comprehensive SEO schema:

- **Article**: Main article table with SEO metadata
- **ArticleSEO**: Detailed SEO data (keywords, links, readability)
- **ArticleContent**: Structured content (introduction, body, conclusion)

## Project Structure

```
├── src/
│   ├── bin/              # CLI scripts
│   │   ├── export-session.ts
│   │   ├── import-session.ts
│   │   └── convert-session.ts
│   ├── config/           # Configuration
│   │   ├── browser-manager.ts
│   │   ├── chrome.ts
│   │   └── local-browser-launcher.ts
│   ├── routes/           # API routes
│   │   └── article.routes.ts
│   ├── services/         # Business logic
│   │   ├── article-service.ts
│   │   ├── chatgpt-scraper.ts
│   │   └── queue-service.ts
│   ├── utils/            # Utilities
│   │   ├── session-manager.ts
│   │   ├── session-binary.ts
│   │   └── stealth-helper.ts
│   └── index.ts          # Main entry point
├── prisma/
│   └── schema.prisma     # Database schema
├── scripts/              # Shell scripts
│   ├── start-chrome.sh
│   └── start-chrome.ps1
└── sessions/             # Exported sessions
```

## Bot Detection Evasion

The scraper uses:
- `puppeteer-extra` with `stealth-plugin`
- Custom user agent
- Realistic viewport settings
- Session persistence
- Natural typing delays

## Troubleshooting

### Chrome Connection Issues

If you get connection errors:
1. Ensure Chrome is running with `--remote-debugging-port=9222`
2. Check if port 9222 is available: `netstat -an | grep 9222`
3. Try restarting Chrome with the provided scripts

### Session Import Fails

- Ensure the session file exists in `sessions/` directory
- Check file permissions
- Verify the session was exported correctly

### ChatGPT Not Responding

- Check your internet connection
- Verify you're logged into ChatGPT in the browser
- Increase timeout values in `chatgpt-scraper.ts`

### Queue Not Processing

- Ensure RabbitMQ server is running: `rabbitmq-server` or `brew services start rabbitmq`
- Check server logs for queue consumer startup messages
- Verify RabbitMQ connection settings in `.env`
- Check queue status: `GET /api/articles/queue/status`
- Review server logs for errors

## License

MIT

