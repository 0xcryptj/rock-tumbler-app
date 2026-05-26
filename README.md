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
| `npm run start` | Normal dev — backend + Expo dev server on :8081 |
| `npm run backend:only` | Backend only (no Expo) |
| `npm run build:web` | Build the Expo web bundle to `tumbler-remote/dist/` |
| `npm run start:remote` | Production gateway (serves the built web UI on :8080 — pair with Cloudflare Tunnel) |
| `npm run start:prod` | `build:web` + `start:remote` in one step |
| `npm run sync:lan` | Set LOCAL_API_URL from PC LAN IP |
| `npm run sync:tailscale` | Set REMOTE_API_URL from Tailscale IP/MagicDNS |
| `npm run test` | Re-run checks (backend must already be running) |

### Camera & backend

**RTSP camera** (Tapo, Eufy, etc.) → **go2rtc** → **API gateway** → Expo app (Play = on-demand stream only).

**Home server install** (Linux / Windows): [`gateway/README.md`](gateway/README.md#install-on-a-home-server-one-liner)

Setup: [`docs/CAMERA-PROFILES.md`](docs/CAMERA-PROFILES.md) · Tapo: [`docs/TAPO-RTSP.md`](docs/TAPO-RTSP.md) · verify: `npm run verify:camera`

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/TAILSCALE.md`](docs/TAILSCALE.md), [`docs/CLOUDFLARE_REMOTE_ACCESS.md`](docs/CLOUDFLARE_REMOTE_ACCESS.md), and [`gateway/README.md`](gateway/README.md) for **remote viewing** (Tailscale for VPN-style access; Cloudflare Tunnel for a browser-only login URL).

Settings in the app:

- **API base URL** — gateway on home WiFi or Tailscale (`EXPO_PUBLIC_LOCAL_API_URL` / `EXPO_PUBLIC_REMOTE_API_URL`)
- **API key** — required for Tailscale remote access; must match `gateway/.env` `API_KEY`
- **Device ID** — tumbler + stream sessions

The app never stores camera IP or RTSP credentials. If the backend is unreachable, tumbler controls fall back to **demo mode**; live view shows an error until the gateway is up.

### Tech stack

- Expo SDK 55, React 19.2, React Native 0.83  
- `expo-router`, `expo-video`, `expo-secure-store`  
- TypeScript  

See [`tumbler-remote/README.md`](tumbler-remote/README.md) for more app-specific notes.

## License

Private project — all rights reserved unless otherwise noted.
