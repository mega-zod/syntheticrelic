# Synthetic Relic VPS Deployment

Production target:

- `https://syntheticrelic.dev` -> Next.js web app
- `https://api.syntheticrelic.dev` -> FastAPI API and WebSocket server
- SQLite data and backups -> Docker volume `synthetic_relic_data`
- HTTPS -> Caddy with automatic Let's Encrypt certificates

## DNS

Point these records to your VPS public IP:

```txt
A syntheticrelic.dev      <VPS_IP>
A www.syntheticrelic.dev  <VPS_IP>
A api.syntheticrelic.dev  <VPS_IP>
```

If your provider uses IPv6, add matching `AAAA` records too.

## VPS Setup

Install Docker and the Compose plugin on the VPS, then clone or upload this repo.

Create a production env file:

```bash
cp .env.production.example .env.production
```

Set at minimum:

```env
SYNTHETIC_RELIC_ADMIN_TOKEN=generate-a-long-random-secret
SYNTHETIC_RELIC_ORIGINS=https://syntheticrelic.dev
NEXT_PUBLIC_RELIC_API_URL=https://api.syntheticrelic.dev
NEXT_PUBLIC_RELIC_WS_URL=wss://api.syntheticrelic.dev/ws/arena
VITE_RELIC_API_URL=https://api.syntheticrelic.dev
VITE_RELIC_WS_URL=wss://api.syntheticrelic.dev/ws/arena
```

Generate a token:

```bash
openssl rand -hex 48
```

Protect the admin page with a separate browser-level password:

```bash
docker run --rm caddy:2.8-alpine caddy hash-password --plaintext 'choose-a-strong-admin-page-password'
```

Put the result in `.env.production`:

```env
ADMIN_BASIC_AUTH_USER=admin
ADMIN_BASIC_AUTH_HASH='paste-caddy-hash-here'
```

This gates `https://syntheticrelic.dev/admin` before the Next.js app serves it. After passing this browser prompt, you still log in with `SYNTHETIC_RELIC_ADMIN_TOKEN` inside the admin panel.

## Launch

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

Check health:

```bash
docker compose -f docker-compose.production.yml ps
curl https://api.syntheticrelic.dev/health
```

Open:

```txt
https://syntheticrelic.dev
https://syntheticrelic.dev/admin
```

## Operations

View logs:

```bash
docker compose -f docker-compose.production.yml logs -f api
docker compose -f docker-compose.production.yml logs -f web
docker compose -f docker-compose.production.yml logs -f caddy
```

Create a manual DB backup from the admin page or API:

```bash
curl -H "x-admin-token: $SYNTHETIC_RELIC_ADMIN_TOKEN" \
  https://api.syntheticrelic.dev/admin/backup \
  -o synthetic-relic-backup.sqlite3
```

SQLite backups are also created on the schedule controlled by:

```env
SYNTHETIC_RELIC_BACKUP_INTERVAL_MINUTES=360
```

## Update Deploy

```bash
git pull
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```
