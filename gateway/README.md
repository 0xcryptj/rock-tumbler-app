# Tumbler unified backend (RTSP camera + ESP32)

**One program** (`node index.mjs`): starts **go2rtc**, then the **API gateway** (camera stream + ESP32 relay).

## Install on a home server (one-liner)

**Linux** (Node 18+, git, curl):

```bash
curl -fsSL https://raw.githubusercontent.com/0xcryptj/rock-tumbler-app/main/gateway/scripts/install-backend.sh | bash
```

Boot service (systemd user unit):

```bash
curl -fsSL https://raw.githubusercontent.com/0xcryptj/rock-tumbler-app/main/gateway/scripts/install-backend.sh | ENABLE_SERVICE=1 bash
```

**Windows** (PowerShell — installs Node via winget if missing):

```powershell
iwr -useb https://raw.githubusercontent.com/0xcryptj/rock-tumbler-app/main/gateway/scripts/install-backend.ps1 | iex
```

Run at logon (after install):

```powershell
& "$env:LOCALAPPDATA\rock-tumbler-app\gateway\scripts\install-backend.ps1" -Service
```

Default install dirs: `~/rock-tumbler-app` (Linux), `%LOCALAPPDATA%\rock-tumbler-app` (Windows). Override with `INSTALL_DIR` before the pipe.

After install: edit `gateway/.env`, then start with `start-backend.sh` / `start-backend.ps1`.

## Quick start (repo root — one terminal)

```powershell
# 1. Configure gateway/.env (ESP32_BASE, RTSP_URL, PUBLIC_BASE_URL)
# 2. Flash firmware/esp32-tumbler-relay.ino (3V3, GND, D5/GPIO5 → relay)
# 3. From repo root:
npm install
npm run start
```

`npm run start` runs **go2rtc + gateway + connection checks + Expo web** in a single terminal (`scripts/dev.mjs`). Ctrl+C stops all of it.

| Command | What it does |
|---------|----------------|
| `npm run start` | Full stack (backend + Expo web) |
| `npm run backend:only` | go2rtc + gateway only |
| `npm run test` | Re-run checks (optional; start already runs them) |
| `npm run test:relay` | Skip camera probe |
| `npm run find:esp32` | Scan LAN for `/health` |
| `npm run reset:stream` | Regenerate go2rtc.yaml (then `npm run start` again) |

## Relay path

```
Expo app  →  POST :8080/api/tumbler/start|stop
Gateway   →  POST :ESP32/start|stop
ESP32     →  D5 / GPIO5 (active-LOW by default in sketch)
```

**App Settings** must use the **gateway** URL (`http://<pc-lan-ip>:8080`), not the ESP32 IP.

If the API reports `running` but the relay never clicks:

1. Run `npm run test` — look for **GPIO mismatch** (flashed pin ≠ wiring).
2. Reflash `firmware/esp32-tumbler-relay.ino` after any pin change.
3. If pin is correct but silent, set `RELAY_ACTIVE_LOW = 1` in the sketch (typical 5V relay boards).

## Layout

| Path | Role |
|------|------|
| [`lib/camera.mjs`](lib/camera.mjs) | Multi-vendor RTSP profiles + probe |
| [`lib/esp32.mjs`](lib/esp32.mjs) | ESP32 HTTP client |
| [`server.js`](server.js) | HTTP API |
| [`start.ps1`](start.ps1) | Start go2rtc + gateway |
| [`scripts/diagnostics.mjs`](scripts/diagnostics.mjs) | Stack tests |

## Env (`.env`)

See [`.env.example`](.env.example) and [`docs/TAILSCALE.md`](../docs/TAILSCALE.md) for remote access.

- `LOCAL_API_URL` — home WiFi URL for phones (e.g. `http://<your-pc-lan-ip>:8080`, auto-filled by `npm run sync:lan`)
- `REMOTE_API_URL` — Tailscale URL (set via `npm run sync:tailscale` from repo root)
- `PUBLIC_BASE_URL` — optional; leave empty to auto-match LAN vs Tailscale clients
- `API_KEY` — required when Tailscale is active (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and mirror into `tumbler-remote/.env` as `EXPO_PUBLIC_API_KEY`)
- `ESP32_BASE` — ESP32 HTTP on **LAN only** (e.g. `http://<your-esp32-lan-ip>`)
- `ESP32_EXPECTED_RELAY_PIN` — `5` (D5 on board; must match flashed sketch)
- `CAMERA_TYPE` — `tapo`, `eufy`, `reolink`, `generic`, or `auto`
- `RTSP_URL` — full `rtsp://` URL from camera app or VLC
- `GO2RTC_BASE` — keep `http://127.0.0.1:1984` (localhost only)
