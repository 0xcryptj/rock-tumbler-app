# Tumbler Remote (Expo)

Expo PWA to remotely monitor a **Lortone QT-12** tumbler (Tapo C120 camera + ESP32 relay). Install on iPhone via Safari **Add to Home Screen** — no TestFlight required.

## Install on iPhone (Add to Home Screen)

1. Build the web app:

   ```bash
   npm install
   npm run web:build
   ```

2. Deploy the `dist/` folder to **Vercel**, **Netlify**, or any static host over **HTTPS**.

3. On your iPhone, open the **HTTPS** URL in **Safari** → **Share** → **Add to Home Screen**.

**Default passcode:** `123456`

## Settings

| Field | Purpose |
|-------|---------|
| API base URL | Home gateway (go2rtc + relay). Use Cloudflare Tunnel HTTPS when away. |
| Stream format | `auto` (WebRTC then HLS), `webrtc`, or `hls` |
| Device ID | Passed to `/api/tumbler/*` and `/api/stream/*` |
| API key | `Authorization: Bearer …` |

The app does **not** store camera IP or RTSP URLs. Live video starts only when you press **Play**; **Stop** ends playback and calls `/api/stream/stop`.

## Backend API

See repo [`docs/backend-api.md`](../docs/backend-api.md).

```http
POST {baseUrl}/api/tumbler/start|stop
POST {baseUrl}/api/stream/start|stop
Authorization: Bearer <apiKey>
```

**Full remote viewing:** run [`gateway/`](../gateway/) + go2rtc at home; set API base URL to the gateway. Tapo → go2rtc → gateway HLS → `expo-video` on Play.

## Local PWA testing

```bash
npm run web:build
npm run web:serve
```

Dev on LAN (phone on same Wi‑Fi): `npm run web` → open **http://10.0.0.30:8081** (see `npm run lan-urls`)

Settings → API base URL: **http://10.0.0.30:8080** (gateway, not port 8081)

Dev localhost only: `npm run web:localhost`

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run web` | Dev server |
| `npm run web:icons` | Regenerate PWA icons |
| `npm run web:build` | Static export + Workbox SW |
| `npm run web:serve` | Serve `dist/` |

## Tech

- Expo SDK 55, expo-router, `expo-video`
- `lib/stream.ts` — on-demand stream sessions
- XP-themed UI

Hardware docs: [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md), [`docs/camera-streaming.md`](../docs/camera-streaming.md), [`docs/esp32-relay.md`](../docs/esp32-relay.md).
