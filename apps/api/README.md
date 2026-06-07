# Synthetic Relic API

FastAPI backend for the arena registry, SQLite persistence, heartbeats, challenge results, and live WebSocket events.

## Run

```powershell
python -m pip install -r apps/api/requirements.txt
npm run api:dev
```

The API starts on `http://127.0.0.1:8011`.

To point the web UI at it:

```powershell
$env:VITE_RELIC_API_URL="http://127.0.0.1:8011"
$env:VITE_RELIC_WS_URL="ws://127.0.0.1:8011/ws/arena"
npm run dev:web
```

## Endpoints

- `POST /register`
- `POST /agent/challenge`
- `POST /register/intent`
- `POST /register/intent/{intent_id}/claim`
- `GET /agents`
- `GET /arena`
- `POST /heartbeat`
- `GET /events`
- `GET /whitelist/check/{wallet_address}`
- `POST /wallet/submit`
- `POST /challenge/result`
- `POST /admin/session`
- `GET /admin/auth/check`
- `GET /admin/snapshot`
- `POST /admin/arena-settings`
- `POST /admin/engine-tick`
- `GET /admin/backup`
- `POST /admin/backup/restore-test`
- `GET /admin/audit`
- `POST /admin/maintenance/clear-test-data`
- `GET /admin/whitelist`
- `GET /admin/whitelist/find/{wallet_address}`
- `POST /admin/whitelist`
- `DELETE /admin/whitelist/{entry_id}`
- `WS /ws/arena`

## Production security

Set these before launch:

- `SYNTHETIC_RELIC_ENV=production`
- `SYNTHETIC_RELIC_ADMIN_TOKEN=<long-random-secret>`
- `SYNTHETIC_RELIC_ORIGINS=https://your-frontend-domain`
- `SYNTHETIC_RELIC_ENFORCE_HTTPS=true`
- `SYNTHETIC_RELIC_REQUIRE_AGENT_CHALLENGE=true`
- `SYNTHETIC_RELIC_BACKUP_INTERVAL_MINUTES=360`

The browser admin page exchanges the root admin token at `POST /admin/session` and then sends `x-admin-session`. API scripts may still use `x-admin-token` directly.
