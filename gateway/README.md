# Tumbler unified backend (RTSP camera + ESP32)

**One program** (`node index.mjs`): starts **go2rtc**, then the **API gateway** (camera stream + ESP32 relay).

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

- `PUBLIC_BASE_URL` — LAN IP for phones (e.g. `http://10.0.0.30:8080`)
- `ESP32_BASE` — ESP32 HTTP (e.g. `http://10.0.0.100`)
- `ESP32_EXPECTED_RELAY_PIN` — `5` (D5 on board; must match flashed sketch)
- `CAMERA_TYPE` — `tapo`, `eufy`, `reolink`, `generic`, or `auto`
- `RTSP_URL` — full `rtsp://` URL from camera app or VLC
