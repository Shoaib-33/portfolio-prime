#!/usr/bin/env bash
# Run as root once the domain's DNS points to this server. Adds the free https certificate (it renews automatically)
# and switches login cookies to https-only.
set -euo pipefail
DOMAIN="${DOMAIN:-maaslandpartner.nl}"
IP=$(curl -4 -fsS --max-time 5 https://ifconfig.me)
for name in "$DOMAIN" "www.$DOMAIN"; do
  found=$(getent ahostsv4 "$name" | awk 'NR==1{print $1}')
  if [ "$found" != "$IP" ]; then echo "$name points to '${found:-nothing}', not $IP yet. Wait for DNS and try again."; exit 1; fi
done
certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d "$DOMAIN" -d "www.$DOMAIN"
grep -q '^PP_SECURE_COOKIE=' /etc/maasland.env || echo 'PP_SECURE_COOKIE=1' >> /etc/maasland.env
systemctl restart maasland
echo "Done: https://$DOMAIN"
