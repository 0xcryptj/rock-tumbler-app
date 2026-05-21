# Rock tumbler monitoring — architecture

Local-first remote monitoring for a **Lortone QT-12** rock tumbler with **Tapo C120** camera and **ESP32** motor relay. The mobile app never talks to Tapo cloud APIs and never receives raw RTSP URLs.

## Components

| Layer | Role |
|-------|------|
| **Tapo C120** | H.264 RTSP on LAN (`rtsp://user:pass@CAMERA_IP:554/stream1`) |
| **go2rtc** | Ingest RTSP, expose WebRTC / HLS to trusted clients on LAN or via tunnel |
| **API gateway** | Token auth, `POST /api/stream/start|stop`, `POST /api/tumbler/start|stop` |
| **ESP32** | GPIO26 → 5V low-trigger relay → tumbler hot line (COM/NO) |
| **Expo PWA** | Passcode, on-demand live view, start/stop motor |
| **Cloudflare Tunnel** (optional) | HTTPS to gateway without exposing RTSP or ESP32 to the public internet |

## Stream flow (on demand)

```
Tapo C120 (LAN RTSP, port 554)
    ↓  rtsp://…:554/stream1  — only on home network / go2rtc host
go2rtc (RTSP → WebRTC / HLS)
    ↓  short-lived, tokenized playback URL
API gateway (/api/stream/start)
    ↓  WebRTC or HLS URL (HTTPS)
Expo app (Play → expo-video; Stop → teardown + /api/stream/stop)
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

- **WebRTC in Expo**: today `expo-video` is used with HLS URLs; WebRTC URLs work when the backend returns a compatible endpoint (e.g. go2rtc WHEP). Native WebRTC may later use `react-native-webrtc`.
- **Home Assistant**: optional; can call the same go2rtc streams or proxy the relay API.
- **Cloudflare Tunnel**: point `apiBaseUrl` at `https://tumbler.yourdomain.com` — tunnel terminates at the gateway, not at the camera.

## Repository map

- `tumbler-remote/` — Expo PWA (`lib/stream.ts`, `components/VideoFeed.tsx`)
- `docs/camera-streaming.md` — Tapo + go2rtc setup
- `docs/backend-api.md` — HTTP contract for gateway implementers
- `docs/esp32-relay.md` — GPIO26 / relay wiring
- `infrastructure/go2rtc.example.yaml` — example go2rtc config
