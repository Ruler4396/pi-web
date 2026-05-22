#!/usr/bin/env bash
set -euo pipefail

SHA_FILE="/opt/pi/.last_deployed_sha"
RELEASE_TAG="latest-build"
REPO="Ruler4396/pi-web"
TMPDIR="/tmp/pi-web-deploy-$$"

# Check if there's a new release
echo "==> Checking for new release..."
RELEASE_JSON=$(curl -fsS "https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}" 2>/dev/null) || {
  echo "No latest-build release found (first build may still be running)"
  exit 0
}

RELEASE_SHA=$(echo "$RELEASE_JSON" | grep -o '"target_commitish": "[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"/\1/')

if [ -z "$RELEASE_SHA" ]; then
  echo "Could not determine release commit SHA"
  exit 1
fi

# Compare with last deployed SHA
if [ -f "$SHA_FILE" ]; then
  LAST_SHA=$(cat "$SHA_FILE")
  if [ "$LAST_SHA" = "$RELEASE_SHA" ]; then
    echo "Already on latest commit ($RELEASE_SHA)"
    exit 0
  fi
  echo "New release available: $LAST_SHA -> $RELEASE_SHA"
else
  echo "First deploy: $RELEASE_SHA"
fi

# Download asset
ASSET_URL=$(echo "$RELEASE_JSON" | python3 -c "import sys,json; assets=json.load(sys.stdin).get('assets',[]); print(assets[0]['browser_download_url'] if assets else '')")
if [ -z "$ASSET_URL" ]; then
  echo "No asset found in release"
  exit 1
fi

mkdir -p "$TMPDIR"
cd "$TMPDIR"

echo "==> Downloading $(basename "$ASSET_URL")..."
curl -fsSL -o pi-web.tar.gz "$ASSET_URL" || { echo "Download failed"; exit 1; }

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
  echo "$RELEASE_SHA" > "$SHA_FILE"
  echo "==> Deploy successful: $RELEASE_SHA"
  systemctl status pi-web --no-pager | head -5
else
  echo "==> ERROR: pi-web service failed to start!"
  systemctl status pi-web --no-pager | head -10
  exit 1
fi