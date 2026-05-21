#!/bin/bash
# CI Auto-Deploy Cron Script
# Place at /opt/pi/auto-deploy.sh, add to cron:
#   * * * * * /opt/pi/auto-deploy.sh >> /var/log/pi-web-auto-deploy.log 2>&1

STATE_FILE="/opt/pi/.last_deployed_sha"
REPO="Ruler4396/pi-web"
WORK_DIR="/opt/pi"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Check last deployed SHA
if [ -f "$STATE_FILE" ]; then
    LAST_SHA=$(cat "$STATE_FILE")
else
    LAST_SHA=""
fi

# Get latest successful CI run
LATEST_RUN=$(gh run list -R "$REPO" -w "Build and Deploy" -L 1 --json databaseId,headSha,status,conclusion 2>/dev/null)
if [ -z "$LATEST_RUN" ]; then
    exit 0
fi

RUN_ID=$(echo "$LATEST_RUN" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['databaseId'])")
SHA=$(echo "$LATEST_RUN" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['headSha'])" | cut -c1-7)
STATUS=$(echo "$LATEST_RUN" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['status'])")
CONCLUSION=$(echo "$LATEST_RUN" | python3 -c "import sys,json; d=json.load(sys.stdin)[0]; print(d.get('conclusion',''))")

# Skip if not completed or not successful
if [ "$STATUS" != "completed" ] || [ "$CONCLUSION" != "success" ]; then
    exit 0
fi

# Skip if same SHA already deployed
if [ "$SHA" = "$LAST_SHA" ]; then
    exit 0
fi

log "New CI build detected: run=$RUN_ID sha=$SHA"

# Download artifact
cd /tmp
rm -rf pi-web-auto pi-web-auto.tar.gz
gh run download "$RUN_ID" -R "$REPO" -n pi-web -D pi-web-auto 2>/dev/null

if [ ! -f "pi-web-auto/pi-web.tar.gz" ]; then
    log "ERROR: Failed to download artifact"
    exit 1
fi

cd pi-web-auto
tar xzf pi-web.tar.gz 2>/dev/null

if [ ! -f "pi-web/pi-web" ]; then
    log "ERROR: Invalid artifact structure"
    exit 1
fi

# Deploy
log "Deploying binary..."
systemctl stop pi-web
cp pi-web/pi-web /opt/pi/pi-web
chmod +x /opt/pi/pi-web

if [ -d "pi-web/spa-dist" ]; then
    log "Deploying SPA..."
    rm -rf /opt/pi/spa-dist
    cp -r pi-web/spa-dist /opt/pi/spa-dist
fi

systemctl start pi-web
sleep 2

# Verify
if systemctl is-active --quiet pi-web; then
    echo "$SHA" > "$STATE_FILE"
    log "Deploy SUCCESS: sha=$SHA run=$RUN_ID"
else
    log "ERROR: pi-web failed to start"
    exit 1
fi

# Cleanup
rm -rf /tmp/pi-web-auto /tmp/pi-web-auto.tar.gz
