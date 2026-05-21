# Tapo C120 + go2rtc

## Camera

- **Model**: TP-Link Tapo C120 (2K, indoor/outdoor)
- **Stream**: H.264 over RTSP
- **Expected URI** (on LAN only):

  ```text
  rtsp://username:password@CAMERA_IP:554/stream1
  ```

Enable RTSP in the Tapo app (Advanced / RTSP). Use a **dedicated camera account** — not your Tapo cloud login in production configs.

Do **not** put this URL in the mobile app. Configure it only in go2rtc (or Home Assistant) on the home server.

## go2rtc

Install [go2rtc](https://github.com/AlexxIT/go2rtc) on the same machine that can reach the camera (Raspberry Pi, NUC, HA host).

Example stream name: `tapo_c120` — see [`infrastructure/go2rtc.example.yaml`](../infrastructure/go2rtc.example.yaml).

After go2rtc is running:

| Output | Typical use |
|--------|-------------|
| WebRTC | Low latency; gateway issues WHEP/WebRTC URL to app |
| HLS | `http://go2rtc:1984/api/stream.m3u8?src=tapo_c120` — best compatibility with **expo-video** / Safari PWA |

Your **API gateway** should:

1. On `POST /api/stream/start`, ensure go2rtc has an active consumer (or rely on go2rtc on-demand).
2. Return a **tokenized** `playbackUrl` pointing at the gateway (not `192.168.x.x:554`).
3. On `POST /api/stream/stop`, drop the viewer session.

## Local vs remote

| Mode | App `apiBaseUrl` | Camera |
|------|------------------|--------|
| Home Wi‑Fi | `http://gateway.local:8080` or tunnel URL | RTSP direct to go2rtc |
| Away | `https://tumbler.yourdomain.com` (Cloudflare Tunnel) | Still LAN-only; tunnel hits gateway only |

## What we do not use

- Tapo cloud APIs for streaming
- Public RTSP port forwarding
- Always-on streaming in the app (player idle until Play)
