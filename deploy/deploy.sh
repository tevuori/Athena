#!/usr/bin/env bash
# Athena — VPS deployment script.
# Run ON the VPS (tevuori@vps.tevuori.eu) from the repo root after cloning.
#
# What it does:
#   1. Generates a strong JWT_SECRET + SEED_PASSWORD into .env (if missing).
#   2. Builds + starts the Docker Compose stack (client on 127.0.0.1:8080,
#      server internal-only).
#   3. Runs prisma migrate deploy + seed inside the server container.
#   4. Installs the host nginx site for athena.tevuori.eu.
#   5. Runs certbot to obtain + install the TLS certificate.
#
# Prereqs on the VPS: git, docker, docker compose, nginx, certbot,
# python3-certbot-nginx. DNS for athena.tevuori.eu must already point here.

set -euo pipefail

DOMAIN="athena.tevuori.eu"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "==> Athena VPS deploy for $DOMAIN"

# --- 1. .env with strong secrets ---
if [ ! -f .env ]; then
  echo "==> Generating .env with strong secrets"
  JWT_SECRET="$(openssl rand -hex 32)"
  SEED_PW="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
  cp .env.example .env
  # Replace key values
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
  sed -i "s|^SEED_PASSWORD=.*|SEED_PASSWORD=$SEED_PW|" .env
  sed -i "s|^CLIENT_ORIGIN=.*|CLIENT_ORIGIN=https://$DOMAIN|" .env
  sed -i "s|^SANDBOX_ENABLED=.*|SANDBOX_ENABLED=false|" .env
  echo ""
  echo "============================================================"
  echo "  Generated seed admin credentials (SAVE THESE):"
  echo "    username: admin"
  echo "    password: $SEED_PW"
  echo "  Change the password from Settings → Account after first login."
  echo "============================================================"
  echo ""
else
  echo "==> .env already exists — leaving secrets as-is"
  SEED_PW="(see existing .env SEED_PASSWORD)"
fi

# --- 2. Build + start Docker stack ---
echo "==> Building + starting Docker Compose stack"
docker compose up --build -d

# --- 3. Run migrations + seed inside the server container ---
echo "==> Running prisma migrate deploy"
docker compose exec -T server bunx prisma migrate deploy
echo "==> Running seed (creates admin if none exist)"
docker compose exec -T server bun run src/db/seed.ts || true

# --- 4. Install host nginx site ---
echo "==> Installing nginx site for $DOMAIN"
NGINX_SITE="deploy/nginx/$DOMAIN.conf"
if [ -f "$NGINX_SITE" ]; then
  sudo cp "$NGINX_SITE" "/etc/nginx/sites-available/$DOMAIN"
  sudo ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
  sudo nginx -t
  sudo systemctl reload nginx
else
  echo "!! nginx site config not found at $NGINX_SITE — skipping nginx setup"
fi

# --- 5. Certbot TLS ---
echo "==> Requesting TLS certificate via certbot"
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || \
  echo "!! certbot failed — run manually: sudo certbot --nginx -d $DOMAIN"

echo ""
echo "==> Done. https://$DOMAIN should now serve Athena."
echo "    Login with admin / $SEED_PW"
