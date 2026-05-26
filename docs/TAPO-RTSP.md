# TP-Link Tapo — RTSP for Tumbler Remote

Works with Tapo indoor/outdoor models that expose RTSP (C100, C110, C120, C200, C210, etc.). The Expo app does not change — only `gateway/.env`.

## Enable RTSP

1. Tapo app → select camera → **Settings (gear)** → **Advanced Settings** → **RTSP**.
2. Turn RTSP **On**.
3. Create a **camera account** (username/password used only for RTSP — not your main TP-Link login).

## RTSP URLs

| Stream | Path | Notes |
|--------|------|--------|
| HD | `/stream1` | Default for live view |
| SD | `/stream2` | Lower bandwidth |

Example:

```text
rtsp://CAMERA_USER:CAMERA_PASS@<camera-lan-ip>:554/stream1
```

Test in **VLC** on the same PC that runs the gateway (`Media → Open Network Stream`).

## Gateway config

From repo root:

```bash
npm run apply:rtsp -- "rtsp://USER:PASS@<camera-lan-ip>:554/stream1"
npm run reset:stream
npm run verify:camera
npm run start
```

`apply:rtsp` sets `CAMERA_TYPE=tapo`, `RTSP_USE_FFMPEG=true`, and regenerates `go2rtc.yaml`.

Manual `.env` (equivalent):

```env
CAMERA_TYPE=tapo
RTSP_URL=rtsp://USER:PASS@<camera-lan-ip>:554/stream1
RTSP_USE_FFMPEG=true
GO2RTC_AUDIO=aac
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| 401 / wrong user/pass | Use Tapo **camera account**, not cloud email; re-copy URL after password change |
| 404 / no stream | Open **live view** in Tapo app; confirm `stream1` in VLC |
| Black screen in app | `npm run reset:stream`, check http://127.0.0.1:1984 → stream `tumbler_cam` |
| Phone cannot connect | API URL = PC LAN IP `:8080`, same Wi‑Fi, `npm run start` running |

See also [`CAMERA-PROFILES.md`](CAMERA-PROFILES.md) and [`camera-streaming.md`](camera-streaming.md).
