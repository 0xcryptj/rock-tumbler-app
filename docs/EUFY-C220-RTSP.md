# Eufy Indoor Cam C220 — RTSP (official + project)

Sources:

- [eufy Support — About NAS / RTSP](https://support.eufy.com/s/article/About-NAS-RTSP)
- [eufy NZ — About NAS / RTSP](https://support.nz.eufy.com/support/solutions/articles/154000241651-about-nas-rtsp) (Dec 2025)
- Community path matrix: [iSpy Eufy camera list](https://www.ispyconnect.com/camera/eufy) — **C220** → `rtsp://…/live0`

## Enable RTSP in the Eufy app

1. Open **eufy Security** → select **Indoor Cam C220**.
2. **Settings** → **General** → **Storage** → **RTSP/NAS**.
3. Turn **RTSP** on and set a dedicated **RTSP username + password** (not your eufy account login).
4. Open the in-app **Setup Guide** and copy the full RTSP link.

Official note: during NAS/RTSP connection testing, **only the live feed works**; motion clips to NAS are disabled until testing finishes.

## URL format (C220)

| Field | Typical value |
|-------|----------------|
| Path | `/live0` (main stream). Also try `/live1`, `/live2` if `live0` returns 404. |
| Port | RTSP defaults to **554**. The Setup Guide link often **omits** `:554` — both forms are valid. |
| Transport | **TCP** (`-rtsp_transport tcp` in ffmpeg / `#rtsp_transport=tcp` in go2rtc). |

Examples:

```text
rtsp://10.0.0.89/live0
rtsp://USERNAME:PASSWORD@10.0.0.89/live0
```

## Configure this project (one file)

Edit **[`gateway/.env`](../gateway/.env)** only:

```env
RTSP_URL=rtsp://USERNAME:PASSWORD@10.0.0.89/live0
RTSP_USER=USERNAME
RTSP_PASS=PASSWORD
RTSP_PATH=live0
RTSP_USE_FFMPEG=false
GO2RTC_AUDIO=none

With **RTSP Security → Digest**, keep `RTSP_USE_FFMPEG=false` (go2rtc native RTSP). ffmpeg often returns **401** on Eufy because the camera sends both MD5 and SHA-256 digest headers. If nothing works, switch RTSP Security authentication to **Basic** in the Eufy app and set `RTSP_USE_FFMPEG=true`.
GO2RTC_AUDIO=aac
DEFAULT_STREAM_PROTOCOL=mse
```

Or set `CAMERA_IP`, optional `RTSP_USER` / `RTSP_PASS`, and `RTSP_PATH` instead of `RTSP_URL`.

## Verify and start (from repo root)

```powershell
npm run verify:camera
npm run reset:stream
npm run gateway
```

Or full stack:

```powershell
npm run stream
```

## If go2rtc shows `exec/rtsp` / `Output file does not contain any stream`

That means **ffmpeg connected to the camera but got no video track** — almost always the same as **404**: RTSP is enabled but the **live stream is not active**. Fix the 404 steps below first; do not add `#audio=aac` on Eufy unless you know the camera sends audio (use `GO2RTC_AUDIO=none` in `gateway/.env`).

## If go2rtc log says `wrong user/pass`

The camera **rejected** the username/password in `gateway/.env` (not an Expo bug).

1. Eufy app → **RTSP/NAS** → open **Setup Guide** → **Copy link** (do this again after switching Digest ↔ Basic — credentials change).
2. From repo root:
   ```powershell
   npm run apply:rtsp -- "rtsp://PASTE_FULL_LINK_FROM_EUFY"
   npm run reset:stream
   npm run start
   ```
3. Open **live view** in the Eufy app for 10–30 seconds.
4. On the PC, test the same URL in **VLC**. VLC must play before the Tumbler app can.

Health checks that only say “frame OK” without a byte size were misleading; use `npm run verify:camera` or `GET http://127.0.0.1:1984/api/log` and confirm no `wrong user/pass` lines.

## If you see `404 Stream Not Found`

The camera is reachable but **no RTSP stream is published** at that path. This is **not** the same as wrong password (that usually returns **401 Unauthorized**). Per eufy support and NAS setup guides:

1. Confirm **RTSP/NAS is enabled** (step above).
2. **Wake the stream**: open the camera **live view** in the Eufy app, or wave in front of the camera while running the in-app NAS/RTSP connection test (only the live feed is active during that test).
3. Phone, camera, and **gateway PC must be on the same LAN**; confirm the camera IP in the app matches `gateway/.env`.
4. Copy the **Setup Guide** URL into `gateway/.env` exactly (path is usually `/live0` for C220).
5. Run `npm run verify:camera` — it tries `live0`, `live1`, `live2` with and without `:554`.
6. Test the **same** URL in **VLC** on the gateway PC (Media → Open Network Stream). If VLC also gets 404, fix RTSP/stream activation in the app before debugging go2rtc or Expo.

## go2rtc on Windows

- With RTSP security **off**, use **native RTSP** (`RTSP_USE_FFMPEG=false`) — same MSE path as the go2rtc web UI.
- If you see `wrong response on DESCRIBE`, set `RTSP_USE_FFMPEG=true` and keep `bin/ffmpeg.exe`.
- In go2rtc use **one** audio option only, e.g. `#video=copy#audio=aac` — never `#audio=copy#audio=aac` (breaks ffmpeg map).
- Run `npm run reset:stream` or `gateway/scripts/sync-go2rtc-yaml.ps1` after every `.env` change, then restart go2rtc.

## What the app uses

| Component | Role |
|-----------|------|
| [`gateway/`](../gateway/) | Reads `.env`, go2rtc MSE WebSocket proxy + player page |
| [`tumbler-remote/`](../tumbler-remote/) | API URL only — never stores RTSP URL on device |

See also [`docs/camera-streaming.md`](camera-streaming.md) and [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).
