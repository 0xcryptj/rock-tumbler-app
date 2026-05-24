# Camera streaming (multi-vendor)

The **Expo app** only uses the home **gateway** API — never raw RTSP. Camera brand and credentials live in `gateway/.env` on your PC.

## Guides

| Camera | Setup doc |
|--------|-----------|
| All profiles | [`CAMERA-PROFILES.md`](CAMERA-PROFILES.md) |
| TP-Link Tapo | [`TAPO-RTSP.md`](TAPO-RTSP.md) |
| Eufy C220 | [`EUFY-C220-RTSP.md`](EUFY-C220-RTSP.md) |

## Stack

| Layer | Path |
|-------|------|
| Config | [`gateway/.env`](../gateway/.env) (`CAMERA_TYPE`, `RTSP_URL`, …) |
| Profiles + RTSP | [`gateway/lib/camera.mjs`](../gateway/lib/camera.mjs) |
| API + playback proxy | [`gateway/server.js`](../gateway/server.js) |
| go2rtc | [`gateway/go2rtc.yaml`](../gateway/go2rtc.yaml) (generated) |
| Mobile app | [`tumbler-remote/`](../tumbler-remote/) |

## Local vs remote

| Mode | App API base URL |
|------|------------------|
| Home Wi‑Fi | `http://<gateway-pc>:8080` (`PUBLIC_BASE_URL`) |
| Away | HTTPS via Cloudflare Tunnel to the same gateway |

## Tapo quick start

```bash
npm run apply:rtsp -- "rtsp://USER:PASS@CAMERA_IP:554/stream1"
npm run reset:stream
npm run start
```
