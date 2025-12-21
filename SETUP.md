# Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file (or copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` and configure:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/chatgpt_scraper?schema=public"

# Chrome Configuration
CHROME_DEBUG_PORT=9222
CHROME_USER_DATA_DIR=./chrome-data

# RabbitMQ Configuration
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest

# Session Management
DEFAULT_SESSION=default
```

### 3. Setup RabbitMQ

Install and start RabbitMQ server:

#### macOS (using Homebrew):
```bash
brew install rabbitmq
brew services start rabbitmq
```

#### Linux (Ubuntu/Debian):
```bash
sudo apt-get update
sudo apt-get install rabbitmq-server
sudo systemctl start rabbitmq-server
sudo systemctl enable rabbitmq-server
```

#### Windows:
Download and install from: https://www.rabbitmq.com/download.html

Or use Docker:
```bash
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

Verify RabbitMQ is running:
```bash
# Check status (Linux/macOS)
sudo rabbitmqctl status

# Or access management UI (if management plugin enabled)
# http://localhost:15672 (default: guest/guest)
```

### 4. Setup Database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

### 5. Start Chrome with Remote Debugging

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

### 6. Export Session (Development)

1. Open Chrome manually and log into Gemini
2. Run the export script:

```bash
npm run export-session default
```

This saves your session to `sessions/default.json`

### 7. Start the Server

The server automatically handles both API requests and queue processing:

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

**Note**: The server automatically starts the queue consumer after initialization, so both API and queue processing run in the same process.

## Using the API

### Generate an Article (Queued)

```bash
curl -X POST http://localhost:3000/api/articles/generate \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Artificial Intelligence",
    "keywords": ["AI", "machine learning"],
    "category": "Technology",
    "author": "John Doe",
    "sessionName": "default"
  }'
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

### Check Queue Status

```bash
curl http://localhost:3000/api/articles/queue/status
```

### Get Articles

```bash
# Get all articles
curl http://localhost:3000/api/articles

# Get published articles
curl http://localhost:3000/api/articles?status=PUBLISHED

# Get article by ID
curl http://localhost:3000/api/articles/{id}
```

## Troubleshooting

### Chrome Connection Issues

1. Check if Chrome is running:
   ```bash
   ./scripts/check-chrome.sh
   ```

2. Verify port 9222 is accessible:
   ```bash
   curl http://localhost:9222/json/version
   ```

3. Restart Chrome with debugging:
   ```bash
   ./scripts/start-chrome.sh
   ```

### Session Issues

- Ensure you're logged into ChatGPT in Chrome before exporting
- Check session file exists: `sessions/{session-name}.json` or `sessions/{session-name}.bin`
- Verify file permissions

### Database Issues

- Check PostgreSQL is running
- Verify DATABASE_URL in `.env`
- Run migrations: `npm run prisma:migrate`

### RabbitMQ Issues

- Ensure RabbitMQ server is running:
  ```bash
  # Linux/macOS
  sudo rabbitmqctl status
  
  # Or check service
  sudo systemctl status rabbitmq-server
  ```
- Verify connection settings in `.env`
- Check queue status: `GET /api/articles/queue/status`
- Review server logs for connection errors
- If using Docker, ensure container is running: `docker ps | grep rabbitmq`

### Queue Not Processing

- Check server logs for queue consumer startup messages
- Verify RabbitMQ connection in server logs
- Check if jobs are being published (check server logs)
- Ensure RabbitMQ server is running

## Production Deployment

1. Build the project:
   ```bash
   npm run build
   ```

2. Start Chrome with xvfb (Linux):
   ```bash
   xvfb-run -a --server-args="-screen 0 1920x1080x24" \
     google-chrome --remote-debugging-port=9222 \
     --user-data-dir=./chrome-data
   ```

3. Import production session:
   ```bash
   npm run import-session production
   ```

4. Start server:
   ```bash
   npm start
   ```

## Docker Deployment

```bash
# Build image
docker build -t gemini-scraper .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e CHROME_DEBUG_PORT=9222 \
  gemini-scraper
```

