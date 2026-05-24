# Camera profiles (multi-vendor)

The **Expo app** only talks to your **gateway** (`/api/stream/start`, tokenized playback URLs). It never stores camera IP, RTSP paths, or passwords. Any RTSP camera you can feed through **go2rtc** on the home PC works with the same app.

## Choose a profile

Set in `gateway/.env`:

```env
CAMERA_TYPE=tapo
```

| `CAMERA_TYPE` | Typical stream paths | go2rtc default |
|---------------|----------------------|----------------|
| `tapo` | `stream1` (HD), `stream2` (SD) | ffmpeg + aac |
| `eufy` | `live0`, `live1`, `live2` | native RTSP (Digest) |
| `reolink` | `h264Preview_01_main`, `_sub` | ffmpeg |
| `wyze` | `live`, `substream` (RTSP-capable models) | ffmpeg |
| `generic` | tries common paths | ffmpeg |
| `auto` | infers from `RTSP_PATH` / URL | per inferred type |

Vendor-specific guides:

- Tapo: [`TAPO-RTSP.md`](TAPO-RTSP.md)
- Eufy C220: [`EUFY-C220-RTSP.md`](EUFY-C220-RTSP.md)

## Quick setup (any vendor)

1. Enable RTSP in the camera app and create a **camera-local** username/password (not your cloud login).
2. Build a URL (example Tapo): `rtsp://user:pass@10.0.0.50:554/stream1`
3. From repo root:

```bash
npm run apply:rtsp -- "rtsp://user:pass@10.0.0.50:554/stream1"
npm run reset:stream
npm run start
```

4. In the app **Settings → Connection tests**, camera should pass when go2rtc has frames.

## Configuration reference (`gateway/.env`)

| Variable | Purpose |
|----------|---------|
| `CAMERA_TYPE` | Profile id (`tapo`, `eufy`, …) or `auto` |
| `RTSP_URL` | Full URL (preferred) |
| `CAMERA_IP`, `RTSP_USER`, `RTSP_PASS`, `RTSP_PATH` | Optional parts if you omit `RTSP_URL` |
| `RTSP_USE_FFMPEG` | `true` / `false` — overrides profile default |
| `GO2RTC_AUDIO` | `none`, `copy`, or `aac` |
| `GO2RTC_STREAM` | go2rtc source name (default `tumbler_cam`) |

Shared logic: [`gateway/lib/camera.mjs`](../gateway/lib/camera.mjs)

## Reolink

Enable RTSP in the Reolink app or web UI. Main stream is usually:

`rtsp://user:pass@IP:554/h264Preview_01_main`

Set `CAMERA_TYPE=reolink` or use `apply:rtsp` with that URL.

## Wyze

Only models/firmware with RTSP support apply. Paths vary; use VLC to confirm, then `CAMERA_TYPE=wyze` or `generic`.

## Security (unchanged)

- RTSP stays on LAN + gateway PC only.
- Phones use short-lived tokens from `/api/stream/start`.
- Do not port-forward RTSP (554) to the internet.
