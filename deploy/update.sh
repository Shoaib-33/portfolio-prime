#!/usr/bin/env bash
# Updates the live site from GitHub. Run as root:  bash /opt/maasland/deploy/update.sh
# The new version is built first; if the build fails, the running site is left untouched.
set -euo pipefail
APP=/opt/maasland
sudo -u maasland -H bash -c "cd $APP && git pull --ff-only && apps/api/.venv/bin/pip install -q -r apps/api/requirements.txt && npm ci --include=dev --no-audit --no-fund && npm run build"
systemctl restart maasland
for i in $(seq 1 40); do curl -fsS -o /dev/null http://127.0.0.1:3000/api/health && { echo 'Updated and running.'; exit 0; }; sleep 3; done
echo 'The site did not come back. See: journalctl -u maasland -n 50 --no-pager'; exit 1
