# ESP32 motor relay

Motor control is **separate** from the Tapo camera. Do not use ESP32-CAM for this project.

## Wiring

| ESP32 | Relay module (5V, low-trigger) |
|-------|--------------------------------|
| VIN | VCC |
| GND | GND |
| **GPIO26** | IN |

Relay output:

- **COM** + **NO** switch the tumbler **hot** AC line (Lortone QT-12 motor).
- Neutral stays continuous; only interrupt hot for safe remote stop.

## Behavior

- **Start**: GPIO26 HIGH → relay energized → hot through COM/NO → motor runs.
- **Stop**: GPIO26 LOW → relay off → motor off.

Firmware should expose an HTTP or MQTT endpoint on LAN only; the **API gateway** calls it from `POST /api/tumbler/start|stop`. The Expo app never talks to the ESP32 directly.

**Flashable sketch:** [`firmware/esp32-tumbler-relay/`](../firmware/esp32-tumbler-relay/) — implements `/api/tumbler/start` and `/stop` for LAN testing (or gateway proxy).

## Safety

- Use a relay rated for your line voltage/current.
- Enclosure, strain relief, and GFCI where required by local code.
- Fail-safe: prefer **stop** on boot and on watchdog timeout.
