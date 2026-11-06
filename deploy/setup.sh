#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VPS for Maasland & Partners. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/Shoaib-33/portfolio-prime/<branch>/deploy/setup.sh -o /tmp/setup.sh && BRANCH=<branch> bash /tmp/setup.sh
# Safe to run again: it keeps existing settings, secrets and data.
set -euo pipefail

DOMAIN="${DOMAIN:-maaslandpartner.nl}"
BRANCH="${BRANCH:-main}"
REPO="https://github.com/Shoaib-33/portfolio-prime.git"
APP=/opt/maasland
ENVF=/etc/maasland.env
BACKUPS=/var/backups/maasland
export DEBIAN_FRONTEND=noninteractive

[ "$(id -u)" = 0 ] || { echo 'Run this as root.'; exit 1; }
. /etc/os-release; [ "$VERSION_ID" = "24.04" ] || echo "Warning: written for Ubuntu 24.04, found $VERSION_ID."

echo '== 1/8 System updates and packages'
apt-get update -q
apt-get -yq -o Dpkg::Options::=--force-confold upgrade
apt-get -yq install ca-certificates curl git ufw fail2ban unattended-upgrades nginx certbot python3-certbot-nginx \
  postgresql postgresql-contrib python3.12 python3.12-venv build-essential libpq-dev openssl
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" != 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get -yq install nodejs
fi

echo '== 2/8 Firewall, brute-force protection and automatic security updates'
ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null
systemctl enable --now fail2ban
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades

echo '== 3/8 Swap (safety net for memory spikes)'
if [ -z "$(swapon --show)" ]; then
  fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap /swapfile >/dev/null; swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo '== 4/8 App user and code'
id maasland >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin maasland
if [ ! -d "$APP/.git" ]; then git clone --branch "$BRANCH" "$REPO" "$APP"; fi
chown -R maasland:maasland "$APP"
mkdir -p "$BACKUPS"; chown postgres:postgres "$BACKUPS"; chmod 750 "$BACKUPS"

echo '== 5/8 Database and settings'
if [ ! -f "$ENVF" ]; then
  DBPASS=$(openssl rand -hex 24)
  sudo -u postgres psql -qc "CREATE ROLE maasland LOGIN PASSWORD '$DBPASS'"
  sudo -u postgres createdb -O maasland maasland
  cat > "$ENVF" <<EOF
NODE_ENV=production
PORT=3000
WEB_HOST=127.0.0.1
WEB_HEAP_MB=768
DATABASE_URL=postgresql://maasland:$DBPASS@127.0.0.1:5432/maasland
PP_SECRET=$(openssl rand -hex 32)
PP_DEMO=1
SITE_URL=https://$DOMAIN
NEXT_TELEMETRY_DISABLED=1
EOF
  chown root:maasland "$ENVF"; chmod 640 "$ENVF"
fi

echo '== 6/8 Build the app (a few minutes)'
sudo -u maasland -H bash -c "cd $APP && python3.12 -m venv apps/api/.venv && apps/api/.venv/bin/pip install -q --upgrade pip && apps/api/.venv/bin/pip install -q -r apps/api/requirements.txt && npm ci --include=dev --no-audit --no-fund && npm run build"

echo '== 7/8 Service and web server'
install -m 644 "$APP/deploy/maasland.service" /etc/systemd/system/maasland.service
sed "s/__DOMAIN__/$DOMAIN/g" "$APP/deploy/nginx.conf" > /etc/nginx/sites-available/maasland
ln -sf /etc/nginx/sites-available/maasland /etc/nginx/sites-enabled/maasland
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl daemon-reload; systemctl enable --now nginx maasland; systemctl restart maasland; systemctl reload nginx

echo '== 8/8 Nightly database backup (14 days kept on this server)'
cat > /etc/cron.d/maasland-backup <<EOF
30 2 * * * postgres pg_dump -Fc maasland > $BACKUPS/maasland-\$(date +\%F).dump && find $BACKUPS -name '*.dump' -mtime +14 -delete
EOF
chmod 644 /etc/cron.d/maasland-backup

printf 'Waiting for the site to start'
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/api/health; then echo ' ok'; READY=1; break; fi
  printf '.'; sleep 3
done
if [ -z "${READY:-}" ]; then echo; echo 'The site did not start. See: journalctl -u maasland -n 50 --no-pager'; exit 1; fi

IP=$(curl -4 -fsS --max-time 5 https://ifconfig.me || hostname -I | awk '{print $1}')
echo
echo "Done. Test it now at: http://$IP"
echo "Next: point $DOMAIN to $IP, then run:  bash $APP/deploy/enable-https.sh"
