# ESP32 motor relay

Motor control is **separate** from the camera stream.

## Wiring

| ESP32 (DevKit label) | Relay module |
|----------------------|--------------|
| **3V3** | VCC (use a 3.3V-compatible relay module) |
| **GND** | GND |
| **D5** (GPIO5) | IN1 |

Relay output:

- **COM** + **NO** switch the tumbler **hot** AC line.
- Neutral stays continuous; only interrupt hot for remote stop.

## Behavior

Default sketch (`RELAY_ACTIVE_LOW = 0`): **HIGH = ON**, **LOW = OFF** (many newer relay modules).

If Start/Stop feel swapped, or the API shows `running` but nothing clicks, set `RELAY_ACTIVE_LOW = 1` (typical blue boards) and reflash.

After flashing, run `npm run start` (or `npm run test`). Connection tests warn if firmware `relayPin` ≠ **GPIO5** in `gateway/.env`.

The **gateway** proxies `POST /api/tumbler/start|stop` → ESP32 `POST /start|stop`. The app uses **gateway URL only** (`http://<pc-lan-ip>:8080`), not the ESP32 IP.

If Play and Stop control the relay backwards, set `ESP32_RELAY_INVERT=true` in `gateway/.env` and restart the gateway (no reflash). Set back to `false` once you fix `RELAY_ACTIVE_LOW` in the sketch.

**Sketch:** [`firmware/esp32-tumbler-relay/`](../firmware/esp32-tumbler-relay/)

## Safety

- Use a relay rated for your line voltage/current.
- Enclosure, strain relief, and GFCI where required by local code.
- Boot defaults to relay **off**.
