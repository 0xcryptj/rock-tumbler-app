# Rock Tumbler Remote

Monorepo for a Wi‑Fi rock tumbler project: mobile remote app, design assets, and hardware (KiCad).

## Repository layout

| Path | Description |
|------|-------------|
| [`tumbler-remote/`](tumbler-remote/) | **Expo SDK 55** web/PWA app — passcode gate, live video, start/stop; **Add to Home Screen** on iPhone |
| [`app assets/`](app%20assets/) | Logo and UI mockups |
| [`circuits/`](circuits/) | KiCad hardware files |
| [`firmware/esp32-tumbler-relay/`](firmware/esp32-tumbler-relay/) | ESP32 Arduino sketch — GPIO26 relay, HTTP API for the app |
| [`docs/`](docs/) | Architecture, Tapo/go2rtc, backend API, ESP32 wiring |
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

### Development

```bash
cd tumbler-remote
npm install
npx expo start --web
```

### Camera & backend

**Tapo C120** → RTSP on LAN → **go2rtc** → WebRTC/HLS → **API gateway** → Expo app (Play = on-demand stream only).

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/camera-streaming.md`](docs/camera-streaming.md), and [`docs/backend-api.md`](docs/backend-api.md).

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
