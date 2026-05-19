#!/usr/bin/env bash
set -euo pipefail

# Manual deployment script for pi-web
# Usage: deploy/deploy.sh <pi-binary-path> <pi-web-binary-path> <spa-dist-path>
#
# Example:
#   deploy/deploy.sh \
#     /tmp/build/pi \
#     /tmp/build/pi-web \
#     /tmp/build/spa-dist

PI_BIN="${1:?Usage: $0 <pi-binary> <pi-web-binary> <spa-dist>}"
PI_WEB_BIN="${2:?}"
SPA_DIST="${3:?}"

echo "==> Creating /opt/pi/"
mkdir -p /opt/pi/

echo "==> Installing pi binary"
cp "$PI_BIN" /opt/pi/pi
chmod +x /opt/pi/pi

echo "==> Installing pi-web binary"
cp "$PI_WEB_BIN" /opt/pi/pi-web
chmod +x /opt/pi/pi-web

echo "==> Installing SPA dist"
rm -rf /opt/pi/spa-dist
cp -r "$SPA_DIST" /opt/pi/spa-dist

echo "==> Installing systemd service"
cp deploy/pi-web.service /etc/systemd/system/pi-web.service

echo "==> Installing nginx config"
cp deploy/nginx-snippet.conf /etc/nginx/snippets/pi-web-4443.conf

echo "==> Enabling and starting pi-web service"
systemctl daemon-reload
systemctl enable pi-web
systemctl restart pi-web

echo "==> Checking service status"
sleep 2
systemctl status pi-web --no-pager | head -10

echo ""
echo "=== Next steps ==="
echo "1. Update nginx to include pi-web-4443.conf"
echo "2. nginx -t && systemctl reload nginx"
echo "3. Verify: curl http://127.0.0.1:3000/api/health"