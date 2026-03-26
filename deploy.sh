#!/bin/bash
# EP-Product Production Deploy Script
# Run this on the Cloudways server after git pull

set -e

APP_DIR="/home/1078258.cloudwaysapps.com/mvrnhpdntm/public_html"
WEB_DIR="$APP_DIR/apps/web"
API_DIR="$APP_DIR/apps/api"
PM2="/home/master/.nvm/versions/node/v20.20.1/lib/node_modules/pm2/bin/pm2"

echo "🚀 Starting deployment..."

# 1. Install dependencies
echo "📦 Installing dependencies..."
cd "$APP_DIR"
npm install

# 2. Prisma: generate client + apply migrations
echo "🗄️ Running Prisma generate & migrate..."
cd "$API_DIR"
npx prisma generate
npx prisma migrate deploy

# 2.5 Build Shared Package
echo "🔧 Building Shared..."
cd "$APP_DIR/packages/shared"
npm run build

# 3. Build API
echo "🔧 Building API..."
npm run build

# 4. Build Web
echo "🔧 Building Web..."
cd "$WEB_DIR"
rm -rf .next
npm run build

# 5. Copy Next.js static files to public_html so Nginx can serve them
echo "📂 Syncing Next.js static files for Nginx..."
rm -rf "$APP_DIR/_next"
mkdir -p "$APP_DIR/_next"
cp -r "$WEB_DIR/.next/static" "$APP_DIR/_next/static"

# 6. Restart PM2 processes
echo "🔄 Restarting services..."
$PM2 restart ep-api
$PM2 restart ep-web

# Worker MUST start from apps/api/ directory so dotenv loads the correct .env
echo "🔄 Restarting worker (from $API_DIR)..."
$PM2 delete ep-worker 2>/dev/null || true
cd "$API_DIR"
$PM2 start npm --name ep-worker -- run worker:prod

# Save PM2 process list so it survives server reboots
$PM2 save

echo "✅ Deployment complete!"
echo "   Test: curl -o /dev/null -w '%{http_code}\n' https://aiimagegenerator.design/"
