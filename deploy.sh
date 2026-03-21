#!/bin/bash
# EP-Product Production Deploy Script
# Run this on the Cloudways server after git pull

set -e

APP_DIR="/home/1078258.cloudwaysapps.com/mvrnhpdntm/public_html"
WEB_DIR="$APP_DIR/apps/web"
API_DIR="$APP_DIR/apps/api"

echo "🚀 Starting deployment..."

# 1. Install dependencies
echo "📦 Installing dependencies..."
cd "$APP_DIR"
npm install

# 2. Build API
echo "🔧 Building API..."
cd "$API_DIR"
npm run build

# 3. Build Web
echo "🔧 Building Web..."
cd "$WEB_DIR"
rm -rf .next
npm run build

# 4. Copy Next.js static files to public_html so Nginx can serve them
echo "📂 Syncing Next.js static files for Nginx..."
rm -rf "$APP_DIR/_next"
mkdir -p "$APP_DIR/_next"
cp -r "$WEB_DIR/.next/static" "$APP_DIR/_next/static"

# 5. Restart PM2 processes
echo "🔄 Restarting services..."
pm2 restart ep-api
pm2 restart ep-web

echo "✅ Deployment complete!"
echo "   Test: curl -o /dev/null -w '%{http_code}\n' https://aiimagegenerator.design/"
