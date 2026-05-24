# Rock Tumbler Remote

Monorepo for a Wi‑Fi rock tumbler project: mobile remote app, design assets, and hardware (KiCad).

## Repository layout

| Path | Description |
|------|-------------|
| [`tumbler-remote/`](tumbler-remote/) | **Expo SDK 55** web/PWA app — passcode gate, live video, start/stop; **Add to Home Screen** on iPhone |
| [`app assets/`](app%20assets/) | Logo and UI mockups |
| [`circuits/`](circuits/) | KiCad hardware files |
| [`gateway/`](gateway/) | Home backend (go2rtc + API + ESP32) — started by root `npm run start` |
| [`firmware/esp32-tumbler-relay/`](firmware/esp32-tumbler-relay/) | ESP32 sketch — **3V3**, **D5 (GPIO5)** → relay IN1 |
| [`docs/`](docs/) | Architecture, **[camera profiles](docs/CAMERA-PROFILES.md)** (Tapo, Eufy, …), backend API, ESP32 wiring |
| [`infrastructure/`](infrastructure/) | Example go2rtc config |

## Mobile app (`tumbler-remote`)

Windows XP–themed remote control UI:

1. **Splash** — loading window  
2. **Passcode** — 6-digit PIN (default `123456`)  
3. **Dashboard** — video feed, status, Start/Stop, settings  

### Quick start (PWA on iPhone — no Apple Developer account)

```bash
cd tumbler-remote
npm install
npm run web:build
```

Deploy `tumbler-remote/dist` to Vercel/Netlify (HTTPS), open in iPhone Safari → **Share → Add to Home Screen**.

See [`tumbler-remote/README.md`](tumbler-remote/README.md) for full steps.

### Development (one terminal)

From the repo root:

```bash
npm install
npm run start
```

That starts **go2rtc**, the **API gateway**, runs **connection checks**, then opens **Expo web**. Press **Ctrl+C once** to stop everything.

| Command | Use when |
|---------|----------|
| `npm run start` | Normal dev — backend + app |
| `npm run backend:only` | Backend only (no Expo) |
| `npm run test` | Re-run checks (backend must already be running) |

### Camera & backend

**RTSP camera** (Tapo, Eufy, etc.) → **go2rtc** → **API gateway** → Expo app (Play = on-demand stream only).

Setup: [`docs/CAMERA-PROFILES.md`](docs/CAMERA-PROFILES.md) · Tapo: [`docs/TAPO-RTSP.md`](docs/TAPO-RTSP.md) · verify: `npm run verify:camera`

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`gateway/README.md`](gateway/README.md) for **full remote viewing** setup (go2rtc + gateway + Cloudflare Tunnel).

Settings in the app:

- **API base URL** — gateway (HTTPS via Cloudflare Tunnel when remote)  
- **Stream format** — auto / WebRTC / HLS (playback URL from `POST /api/stream/start`)  
- **Device ID** and API key — tumbler + stream auth  

The app never stores camera IP or RTSP credentials. If the backend is unreachable, tumbler controls fall back to **demo mode**; live view shows an error until the gateway is up.

### Tech stack

- Expo SDK 55, React 19.2, React Native 0.83  
- `expo-router`, `expo-video`, `expo-secure-store`  
- TypeScript  

See [`tumbler-remote/README.md`](tumbler-remote/README.md) for more app-specific notes.

## License

Private project — all rights reserved unless otherwise noted.
