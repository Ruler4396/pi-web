#!/usr/bin/env bash
set -euo pipefail

SHA_FILE="/opt/pi/.last_deployed_sha"
RELEASE_TAG="latest-build"
REPO="Ruler4396/pi-web"
TMPDIR="/tmp/pi-web-deploy-$$"

# Check if there's a new release
echo "==> Checking for new release..."
RELEASE_TIME=$(gh release view "$RELEASE_TAG" --repo "$REPO" --json publishedAt --jq '.publishedAt' 2>/dev/null) || {
  echo "No latest-build release found (first build may still be running)"
  exit 0
}

if [ -z "$RELEASE_TIME" ]; then
  echo "Could not determine release time"
  exit 1
fi

# Compare with last deployed time
if [ -f "$SHA_FILE" ]; then
  LAST_TIME=$(cat "$SHA_FILE")
  if [ "$LAST_TIME" = "$RELEASE_TIME" ]; then
    echo "Already on latest release ($RELEASE_TIME)"
    exit 0
  fi
  echo "New release available: $LAST_TIME -> $RELEASE_TIME"
else
  echo "First deploy: $RELEASE_TIME"
fi

# Download asset
mkdir -p "$TMPDIR"
cd "$TMPDIR"

echo "==> Downloading release asset..."
gh release download "$RELEASE_TAG" --repo "$REPO" --pattern 'pi-web.tar.gz' 2>/dev/null || {
  echo "Download failed"
  exit 1
}

echo "==> Extracting..."
tar xzf pi-web.tar.gz

echo "==> Installing pi-web binary..."
cp pi-web/pi-web /opt/pi/pi-web.new
chmod +x /opt/pi/pi-web.new
mv /opt/pi/pi-web.new /opt/pi/pi-web

echo "==> Installing SPA dist..."
rm -rf /opt/pi/spa-dist.new
cp -r pi-web/spa-dist /opt/pi/spa-dist.new
rm -rf /opt/pi/spa-dist
mv /opt/pi/spa-dist.new /opt/pi/spa-dist

# Cleanup
cd /
rm -rf "$TMPDIR"

echo "==> Restarting pi-web service..."
systemctl restart pi-web
sleep 2

# Verify
if systemctl is-active --quiet pi-web; then
  echo "$RELEASE_TIME" > "$SHA_FILE"
  echo "==> Deploy successful: $RELEASE_TIME"
  systemctl status pi-web --no-pager | head -5
else
  echo "==> ERROR: pi-web service failed to start!"
  systemctl status pi-web --no-pager | head -10
  exit 1
fi