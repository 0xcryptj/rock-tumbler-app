# Cloudflare remote access (dad-friendly browser URL)

Give a remote user a single HTTPS URL (e.g. `https://tumbler.YOURDOMAIN.com`)
that loads the **existing Expo web app** and controls the tumbler — without
opening any ports, without VPN clients, and without exposing the camera or
ESP32 to the internet.

## Architecture

```
Dad's browser
    │  https://tumbler.YOURDOMAIN.com
    ▼
Cloudflare Access  ←  Google / email login policy (the actual auth wall)
    │
    ▼
Cloudflare Tunnel  ←  outbound-only WireGuard-style connection from home
    │
    ▼
Home machine (cloudflared → http://localhost:8080)
    │
    ▼
Express gateway (npm run start:remote)
    │  • Serves the Expo web build from tumbler-remote/dist
    │  • Serves /api/* control + stream endpoints
    │  • Holds the only credentials for the camera / ESP32
    │
    ├─► go2rtc (127.0.0.1:1984) — RTSP → MSE / HLS / MP4
    ├─► IP camera (LAN, e.g. 192.0.2.50:554)            ← never on the public internet
    └─► ESP32 relay (LAN, e.g. 192.0.2.100)             ← never on the public internet
```

| Device | Public? | Notes |
|--------|---------|-------|
| Cloudflare edge | Yes (HTTPS, gated by Access) | Terminates TLS, enforces login |
| `cloudflared` on home machine | Outbound only | No inbound ports opened |
| Express gateway `:8080` | Localhost only | Reached only via the tunnel |
| Expo web build | Served by gateway | Same origin as `/api/*` |
| go2rtc `127.0.0.1:1984` | LAN/loopback only | Never exposed |
| IP camera RTSP | LAN only | Stays on home Wi-Fi |
| ESP32 relay | LAN only | Stays on home Wi-Fi |

## What ships in this repo

| Path | Purpose |
|------|---------|
| `tumbler-remote/` | The existing Expo SDK 55 app (web/PWA + native). **No new web UI is added** — Cloudflare just exposes the Expo web build. |
| `gateway/server.js` | Express server. Now also serves `tumbler-remote/dist/` when present, so the browser hits one origin for both the UI and the API. |
| `gateway/.env.remote.example` | Template `.env` for the home machine. |
| `docs/cloudflared-config.example.yml` | Template `~/.cloudflared/config.yml`. |
| `scripts/dev.mjs` | Unchanged — local development still runs Expo dev server on `:8081`. |

## How the app reaches the gateway

The Expo web client picks its API base URL in this order
(`tumbler-remote/lib/network.ts → getApiEndpointConfig`):

1. `EXPO_PUBLIC_LOCAL_API_URL` / `EXPO_PUBLIC_API_BASE_URL` (build-time env)
2. `EXPO_PUBLIC_REMOTE_API_URL`
3. **`window.location.origin`** when running on the web — the new fallback
   that makes the app self-host correctly behind Cloudflare Tunnel.

When the gateway serves `tumbler-remote/dist/index.html` from
`https://tumbler.YOURDOMAIN.com`, the bundle has no LAN IP hardcoded into it,
so `fetch('/api/tumbler/start')` simply hits the same hostname back through
Cloudflare → the tunnel → the gateway.

Stream URLs returned by `POST /api/stream/start` are also built from the
public hostname: `gateway/lib/network.mjs → resolvePublicBaseUrl` uses the
incoming `Host` / `X-Forwarded-Host` headers and, when the request is
HTTPS-proxied, drops the local `:8080` port so playback URLs are valid
public HTTPS URLs.

## One-time setup on the home machine

### 1. Install prerequisites

- Node.js 18+
- `ffmpeg` (already required by go2rtc / the gateway)
- `cloudflared` — https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

### 2. Configure the gateway for remote access

```bash
cp gateway/.env.remote.example gateway/.env
# edit gateway/.env — set PUBLIC_BASE_URL, ALLOWED_PUBLIC_HOSTS, API_KEY,
# camera RTSP credentials, ESP32_BASE, etc.
```

Important values:

| Variable | Value |
|----------|-------|
| `PUBLIC_BASE_URL` | `https://tumbler.YOURDOMAIN.com` |
| `ALLOWED_PUBLIC_HOSTS` | `tumbler.YOURDOMAIN.com` |
| `REQUIRE_API_KEY` | `true` |
| `API_KEY` | 32+ random hex chars (PowerShell: `[guid]::NewGuid().ToString("N")`) |
| `RTSP_*`, `ESP32_BASE` | Your home LAN values |

The Expo `.env` can usually stay empty for the production build — the web app
will use `window.location.origin` automatically. If you still want the same
build to work over LAN, fill in `EXPO_PUBLIC_LOCAL_API_URL` per
`tumbler-remote/.env.example`.

### 3. Build the Expo web bundle

```bash
npm install
npm run build:web     # → tumbler-remote/dist/
```

`npm run build:web` runs the existing Expo pipeline
(`generate-pwa-icons` → `expo export -p web` → `workbox-cli generateSW`).

### 4. Create the Cloudflare Tunnel

```bash
cloudflared tunnel login                       # opens browser, picks zone
cloudflared tunnel create rock-tumbler         # writes credentials JSON
cloudflared tunnel route dns rock-tumbler tumbler.YOURDOMAIN.com

cp docs/cloudflared-config.example.yml ~/.cloudflared/config.yml
# edit ~/.cloudflared/config.yml — set the tunnel ID, credentials path,
# and replace tumbler.YOURDOMAIN.com with your real hostname.
```

Then run the tunnel:

```bash
cloudflared tunnel run rock-tumbler
# or install as an OS service:
#   Linux  : sudo cloudflared service install
#   Windows: cloudflared service install --config %USERPROFILE%\.cloudflared\config.yml
```

`cloudflared` makes only outbound HTTPS connections to Cloudflare. **No port
forwarding is required**, and your router's firewall stays closed.

### 5. Lock down with Cloudflare Access (this is the real "dad login")

In the Cloudflare dashboard:

1. **Zero Trust → Access → Applications → Add an application →
   Self-hosted**.
2. Application domain: `tumbler.YOURDOMAIN.com`.
3. Identity providers: enable Google (or One-time PIN to dad's email).
4. Add a policy: **Allow** when `Emails ∈ { dad@example.com }`.
5. Save.

Now opening `https://tumbler.YOURDOMAIN.com` shows the Cloudflare Access
login first; only after dad signs in does Cloudflare forward the request
through the tunnel to the gateway.

### 6. Start the gateway

```bash
npm run start:remote
# or, if you change the Expo app and want a fresh web bundle in the same step:
npm run start:prod
```

`start:remote` is just `node gateway/index.mjs`. It starts go2rtc, then the
Express gateway on `localhost:8080`, which now serves both the API and the
Expo web build.

## What the user sees

1. Browser → `https://tumbler.YOURDOMAIN.com`
2. Cloudflare Access → Google / email login (one-tap if already signed in).
3. Cloudflare Tunnel → home machine → gateway → Expo web app loads.
4. App calls `GET /health`, `POST /api/stream/start`, `POST /api/tumbler/start`,
   `POST /api/tumbler/stop` against the **same** origin —
   `https://tumbler.YOURDOMAIN.com/api/...`.
5. The gateway's `POST /api/stream/start` returns playback URLs built from
   `https://tumbler.YOURDOMAIN.com`, so live MP4 / MSE / HLS all work through
   Cloudflare with no port number visible to the client.

## Security boundaries

| Asset | Reachable from internet? |
|-------|--------------------------|
| `tumbler.YOURDOMAIN.com` (Expo web + `/api/*`) | Yes — gated by Cloudflare Access |
| `/api/tumbler/start`, `/stop` | Cloudflare Access + Express `Bearer API_KEY` |
| `/api/stream/start`, stream session URLs | Cloudflare Access + short-lived per-session tokens |
| `/api/camera/snapshot.jpg` | Cloudflare Access + Express `Bearer API_KEY` (already protected in `server.js`) |
| Camera RTSP (`:554`) | **No** — LAN only, never in `ingress:` |
| ESP32 HTTP (`:80`) | **No** — LAN only, gateway is the only thing that talks to it |
| go2rtc admin (`127.0.0.1:1984`) | **No** — loopback only |

The cloudflared `ingress:` block in `docs/cloudflared-config.example.yml`
only routes `http://localhost:8080`. Nothing else on the home network is
exposed.

## Why no port forwarding?

Cloudflare Tunnel works by making an **outbound** connection from the home
machine to Cloudflare's edge. Cloudflare then routes inbound requests to
that long-lived tunnel. Your home router never accepts inbound connections
from the public internet, so:

- No NAT/UPnP/port-forwarding rules.
- No exposed RTSP / ESP32 / go2rtc.
- HTTPS certificate is managed automatically by Cloudflare.

## Combining with Tailscale (optional)

You can keep the Tailscale flow described in
[`docs/TAILSCALE.md`](TAILSCALE.md) for direct LAN/cellular access and
add Cloudflare Tunnel for the "any browser, no app install" use case. Both
hit the same gateway on `:8080`:

- LAN: `http://192.0.2.30:8080` (sync:lan)
- Tailscale: `http://gateway.tail12345.ts.net:8080`
- Cloudflare: `https://tumbler.YOURDOMAIN.com` (this doc)

`gateway/lib/network.mjs → resolvePublicBaseUrl` picks the right base for
stream URLs based on the inbound `Host` header, so all three work
simultaneously.

## Cloudflare MCP servers in this Cursor setup

This workspace already has the official Cloudflare MCP servers installed
(`plugin-cloudflare-cloudflare-docs`, `cloudflare-bindings`,
`cloudflare-builds`, `cloudflare-observability`). They're useful when you
want Cursor to look up the latest Cloudflare docs or build status, but
the Tunnel itself is created and managed with the `cloudflared` CLI and
the [Zero Trust dashboard](https://one.dash.cloudflare.com/) — no extra MCP
servers are required for this deployment.

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `502 Bad Gateway` from Cloudflare | `cloudflared` running but gateway is down — `npm run start:remote` |
| App loads but API calls 401 | `API_KEY` mismatch between `gateway/.env` and the Expo build (`EXPO_PUBLIC_API_KEY`) |
| Stream URL points at `localhost:8080` | Old gateway build — pull the latest `gateway/lib/network.mjs` (HTTPS-aware `resolvePublicBaseUrl`) and restart |
| Stream URL points at `https://...:8080` | `ALLOWED_PUBLIC_HOSTS` missing your Cloudflare hostname, or running an older gateway — set `ALLOWED_PUBLIC_HOSTS=tumbler.YOURDOMAIN.com` |
| Live video disconnects after ~100s | Enable WebSockets in Cloudflare dashboard (Network → WebSockets → ON); confirm `originRequest.connectTimeout: 30s` in the tunnel config |
| `Access Denied` after login | Add the user's email to the Cloudflare Access policy for `tumbler.YOURDOMAIN.com` |
| Browser shows the old `/dashboard` HTML directly (no JS) | Normal — Expo Router's static export produces real `dashboard.html`. The SPA fallback in `gateway/server.js` also serves `index.html` for any unknown path. |

## What this deployment deliberately avoids

- Public port forwarding / DMZ / UPnP.
- Exposing RTSP, ESP32, or go2rtc admin to the internet.
- Replacing the Expo app with a separate React/HTML page (the same Expo build
  serves browser, PWA, and native — Cloudflare just gives it a public URL).
- Storing real secrets in this repo. `gateway/.env.remote.example` and
  `docs/cloudflared-config.example.yml` contain only placeholders.
