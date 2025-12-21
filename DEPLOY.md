# Deployment Guide

## GitHub Actions Workflow untuk Deploy ke VPS

### Setup GitHub Secrets

Tambahkan secrets berikut di GitHub Repository Settings > Secrets and variables > Actions:

1. **VPS_HOST** - IP address atau domain VPS (contoh: `192.168.1.100` atau `vps.example.com`)
2. **VPS_USER** - Username SSH (contoh: `root` atau `deploy`)
3. **VPS_SSH_KEY** - Private SSH key untuk koneksi ke VPS
4. **VPS_SSH_PORT** - Port SSH (opsional, default: `22`)
5. **VPS_APP_DIR** - Directory aplikasi di VPS (opsional, default: `/opt/scraper`)
6. **VPS_APP_URL** - URL aplikasi untuk health check (opsional, contoh: `http://localhost:3000`)

### Generate SSH Key

```bash
# Generate SSH key pair
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/vps_deploy_key

# Copy public key ke VPS
ssh-copy-id -i ~/.ssh/vps_deploy_key.pub user@your-vps-ip

# Copy private key ke GitHub Secrets (VPS_SSH_KEY)
cat ~/.ssh/vps_deploy_key
```

### Setup VPS

#### 1. Install Dependencies

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Install RabbitMQ
sudo apt-get install -y rabbitmq-server
sudo systemctl enable rabbitmq-server
sudo systemctl start rabbitmq-server

# Install Google Chrome
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
sudo apt-get update
sudo apt-get install -y google-chrome-stable

# Install xvfb (untuk headless Chrome)
sudo apt-get install -y xvfb

# Install PM2 (optional, untuk process management)
sudo npm install -g pm2
```

#### 2. Setup Database

```bash
# Login ke PostgreSQL
sudo -u postgres psql

# Buat database dan user
CREATE DATABASE chatgpt_scraper;
CREATE USER scraper_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE chatgpt_scraper TO scraper_user;
\q
```

#### 3. Setup Application Directory

```bash
# Buat directory aplikasi
sudo mkdir -p /opt/scraper
sudo chown -R $USER:$USER /opt/scraper

# Buat directory untuk logs, articles, sessions
mkdir -p /opt/scraper/{logs,articles,sessions,tmp}
```

#### 4. Setup Environment Variables

```bash
# Buat file .env di /opt/scraper
cat > /opt/scraper/.env << EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://scraper_user:your_password@localhost:5432/chatgpt_scraper?schema=public
CHROME_DEBUG_PORT=9222
CHROME_USER_DATA_DIR=/opt/scraper/chrome-data
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest
DEFAULT_SESSION=default
EOF
```

#### 5. Setup PM2 (Recommended)

```bash
# Copy ecosystem file
cp .github/workflows/pm2-ecosystem.example.json /opt/scraper/ecosystem.config.json

# Edit ecosystem.config.json sesuai kebutuhan
nano /opt/scraper/ecosystem.config.json

# Setup PM2 startup script
pm2 startup systemd
# Follow instructions yang muncul
```

#### 6. Setup Systemd Service (Alternative)

```bash
# Copy service file
sudo cp .github/workflows/systemd-service.example /etc/systemd/system/scraper.service

# Edit service file
sudo nano /etc/systemd/system/scraper.service
# Update User, WorkingDirectory, dan environment variables

# Reload systemd
sudo systemctl daemon-reload
sudo systemctl enable scraper.service
```

### Deploy

#### Automatic Deploy (via GitHub Actions)

1. Push ke branch `main` atau `master`
2. Workflow akan otomatis trigger
3. Atau trigger manual via GitHub Actions > Deploy to VPS > Run workflow

#### Manual Deploy

```bash
# SSH ke VPS
ssh user@your-vps-ip

# Clone repository
cd /opt/scraper
git pull origin main

# Install dependencies
npm ci --production

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate deploy

# Build
npm run build

# Restart dengan PM2
pm2 restart scraper

# Atau restart dengan systemd
sudo systemctl restart scraper.service
```

### Monitoring

#### PM2 Commands

```bash
# Check status
pm2 status scraper

# View logs
pm2 logs scraper

# Monitor
pm2 monit

# Restart
pm2 restart scraper

# Stop
pm2 stop scraper
```

#### Systemd Commands

```bash
# Check status
sudo systemctl status scraper.service

# View logs
sudo journalctl -u scraper.service -f

# Restart
sudo systemctl restart scraper.service

# Stop
sudo systemctl stop scraper.service
```

### Troubleshooting

#### Check Application Logs

```bash
# PM2 logs
pm2 logs scraper --lines 100

# Systemd logs
sudo journalctl -u scraper.service -n 100 -f

# Application logs
tail -f /opt/scraper/logs/app.log
tail -f /opt/scraper/logs/error.log
```

#### Check Chrome Logs

```bash
tail -f /opt/scraper/logs/chrome-*.log
```

#### Check Database Connection

```bash
psql -U scraper_user -d chatgpt_scraper -h localhost
```

#### Check RabbitMQ

```bash
sudo rabbitmqctl status
sudo rabbitmqctl list_queues
```

#### Check Ports

```bash
# Check if port 3000 is listening
sudo netstat -tlnp | grep 3000

# Check if port 9222 (Chrome debug) is listening
sudo netstat -tlnp | grep 9222
```

### Backup

Backup otomatis dibuat di `/opt/scraper/backups/` setiap deployment. Untuk backup manual:

```bash
# Backup database
pg_dump -U scraper_user chatgpt_scraper > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup application
tar -czf app_backup_$(date +%Y%m%d_%H%M%S).tar.gz /opt/scraper/{dist,src/generated,package*.json}
```

### Rollback

```bash
# List backups
ls -lh /opt/scraper/backups/

# Restore from backup
cd /opt/scraper
tar -xzf backups/backup_YYYYMMDD_HHMMSS.tar.gz
pm2 restart scraper
```

