# Rock tumbler monitoring — architecture

Local-first remote monitoring for a **Lortone QT-12** rock tumbler with an **RTSP IP camera** (Tapo, Eufy, Reolink, etc.) and **ESP32** motor relay. The mobile app never talks to camera cloud APIs and never receives raw RTSP URLs.

## Components

| Layer | Role |
|-------|------|
| **IP camera** | H.264 RTSP on LAN — see [`CAMERA-PROFILES.md`](CAMERA-PROFILES.md), [`TAPO-RTSP.md`](TAPO-RTSP.md), [`EUFY-C220-RTSP.md`](EUFY-C220-RTSP.md) |
| **go2rtc** | Ingest RTSP (native or ffmpeg per `CAMERA_TYPE`), expose HLS/MP4/MSE to gateway |
| **API gateway** | Token auth, `POST /api/stream/start|stop`, `POST /api/tumbler/start|stop` |
| **ESP32** | 3V3 + D5 (GPIO5) → relay IN1 → tumbler hot line (COM/NO) |
| **Expo PWA** | Passcode, on-demand live view, start/stop motor |
| **Tailscale** (recommended) | Private mesh VPN — phone → gateway only; no port forwarding |
| **Cloudflare Tunnel** (optional) | HTTPS to gateway without exposing RTSP or ESP32 to the public internet |

## Stream flow (on demand)

```
IP camera (LAN RTSP, vendor-specific path e.g. /stream1 or /live0)
    ↓  rtsp://…/live0  — home LAN + gateway PC only
go2rtc (RTSP → HLS)
    ↓  short-lived, tokenized playback URL
API gateway (/api/stream/start)
    ↓  WebRTC or HLS URL (HTTPS)
Expo app (idle thumbnail → Play → MSE on web / MP4 or HLS on phone via expo-video; Stop → teardown)
```

**Rules**

- Stream starts only when the user presses **Play** in the app.
- RTSP is **not** published to the internet.
- The app stores **API base URL** only — not camera IP or RTSP credentials.
- Motor control is **independent** of the camera path (ESP32 firmware ≠ camera).

## Security boundaries

| Asset | Exposure |
|-------|----------|
| Camera RTSP | LAN + go2rtc host only |
| go2rtc admin | LAN / tunnel with auth |
| Playback URLs | Short-lived tokens via `/api/stream/start` |
| ESP32 relay API | Authenticated `Bearer` token; same gateway as stream |
| PWA | HTTPS; passcode in secure storage (native) / AsyncStorage (web) |

## Future options

- **Native playback**: phones use go2rtc fragmented MP4 (`stream.mp4`) via `expo-video`; HLS uses fMP4 (`stream.m3u8&mp4`). Web uses go2rtc MSE over WebSocket. WebRTC is optional in settings.
- **Home Assistant**: optional; can call the same go2rtc streams or proxy the relay API.
- **Tailscale**: install on the **gateway PC only**; phones use `EXPO_PUBLIC_REMOTE_API_URL`. See [`TAILSCALE.md`](TAILSCALE.md).
- **Cloudflare Tunnel**: run `npm run start:remote` so the Express gateway serves the Expo web build, then point a tunnel at `http://localhost:8080`. The browser opens `https://tumbler.yourdomain.com`, gated by Cloudflare Access — see [`CLOUDFLARE_REMOTE_ACCESS.md`](CLOUDFLARE_REMOTE_ACCESS.md). The tunnel terminates at the gateway; camera and ESP32 stay LAN-only.

## Repository map

- `tumbler-remote/` — Expo PWA (`lib/stream.ts`, `components/VideoFeed.tsx`)
- `gateway/` — **Reference Node gateway** (HLS proxy + ESP32 forward) — [`gateway/README.md`](../gateway/README.md)
- `docs/camera-streaming.md` — Tapo + go2rtc setup
- `docs/backend-api.md` — HTTP contract (implemented by `gateway/`)
- `docs/esp32-relay.md` — 3V3 / D5 (GPIO5) relay wiring
- `docs/TAILSCALE.md` — private remote access (no port forwarding)
