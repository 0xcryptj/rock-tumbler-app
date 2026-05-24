# Infrastructure

Example configs for the home stack. Deploy on a machine on the same LAN as the Tapo C120 and ESP32.

1. Copy [`go2rtc.example.yaml`](go2rtc.example.yaml) and set camera credentials/IP.
2. Run go2rtc (`docker run` or binary).
3. Run [`gateway/`](../gateway/) — implements stream + tumbler APIs for full remote viewing.
4. Optional: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) → HTTPS `apiBaseUrl` for the PWA.

The mobile app only needs the gateway URL and API key — see [`gateway/README.md`](../gateway/README.md).
