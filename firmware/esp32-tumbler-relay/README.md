# ESP32 tumbler relay firmware

Controls the Lortone motor relay on **GPIO26** and exposes the same HTTP paths the **Tumbler Remote** app uses for start/stop.

## Requirements

- [Arduino IDE](https://www.arduino.cc/en/software) 2.x or [PlatformIO](https://platformio.org/)
- Board: **ESP32** (e.g. ESP32 Dev Module)
- Library: **ESP32 board support** by Espressif (Arduino core 2.x or 3.x)

No extra libraries — uses built-in `WiFi` and `WebServer`.

## Wiring

| ESP32 | 5V relay module |
|-------|-----------------|
| VIN | VCC |
| GND | GND |
| GPIO26 | IN |

Relay **COM** + **NO** on the tumbler **hot** line. See [`docs/esp32-relay.md`](../../docs/esp32-relay.md).

## Configure

1. Copy `config.h.example` → `config.h`
2. Set `WIFI_SSID`, `WIFI_PASSWORD`, and `DEVICE_ID` (must match app Settings, default `tumbler-01`)
3. Optional: set `API_KEY` and the same value in the app **API key** field

## Flash (Arduino IDE)

1. **File → Open** → `esp32-tumbler-relay.ino`
2. **Tools → Board** → your ESP32 board
3. **Tools → Port** → COM port
4. **Sketch → Upload**
5. Open **Serial Monitor** at **115200** — note the printed IP address

## App setup (LAN test)

In Tumbler Remote **Settings**:

| Field | Value |
|-------|--------|
| API base URL | `http://192.168.x.x` (IP from Serial Monitor) |
| Device ID | Same as `DEVICE_ID` in `config.h` |
| API key | Same as `API_KEY` if set |

Start/Stop on the dashboard calls:

```http
POST http://<esp32-ip>/api/tumbler/start
POST http://<esp32-ip>/api/tumbler/stop
Content-Type: application/json

{"deviceId":"tumbler-01"}
```

**Camera streaming** still needs a separate gateway + go2rtc; this firmware only drives the relay.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Status JSON + IP |
| POST | `/api/tumbler/start` | Relay on (motor run) |
| POST | `/api/tumbler/stop` | Relay off |

## Relay polarity

Default: **HIGH** = on, **LOW** = off. If your module clicks backwards, swap `RELAY_ON_LEVEL` / `RELAY_OFF_LEVEL` in `config.h`.

## Safety

- Test relay with **no AC** connected first (LED or multimeter on NO).
- Firmware starts with relay **off** after boot.
