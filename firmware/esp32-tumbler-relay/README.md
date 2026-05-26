# ESP32 relay firmware

**Open and flash this folder in Arduino IDE:** `firmware/esp32-tumbler-relay/`

Do not use `app/firmware/` (empty stub if present).

## Relay not clicking?

1. Reflash after editing `RELAY_ACTIVE_LOW` in `esp32-tumbler-relay.ino`.
2. Sketch default is `RELAY_ACTIVE_LOW = 0` (HIGH turns relay on) for newer active-HIGH boards.
3. Typical blue relay (LOW = ON): set `RELAY_ACTIVE_LOW = 1` and reflash.
4. Test: `POST http://<your-esp32-lan-ip>/relay/pulse` or `npm run test:relay` from `gateway/`.
5. Serial Monitor 115200 — confirm `POST /start` and GPIO level when ON.

Wiring: **3V3** → relay VCC, **GND** → relay GND, **D5 (GPIO5)** → IN1.

Gateway `.env`: `ESP32_BASE=http://<your-esp32-lan-ip>`, `ESP32_EXPECTED_RELAY_PIN=5`.
