# ESP32 Remote Rock Tumbler Switch - KiCad Project

This KiCad project contains a functional wiring schematic for a remote-controlled Lortone QT-12 rock tumbler using:

- ESP32 dev board powered by USB-C
- 5V single-channel relay module
- Cut grounded extension cord used as a switched outlet
- Separate Wi-Fi/RTSP camera feed

## Main idea

The tumbler has no switch. If plugged in, it runs. If unplugged, it stops. The relay-controlled box acts like a remote-controlled outlet.

## ESP32 to relay wiring

| ESP32 | Relay Module |
|---|---|
| VIN / 5V | VCC |
| GND | GND |
| GPIO26 | IN |

## AC wiring

Only the black/hot wire is switched by the relay.

| Wire | Connection |
|---|---|
| Plug-side black/hot | Relay COM |
| Relay NO | Socket-side black/hot |
| Plug-side white/neutral | Socket-side white/neutral via WAGO |
| Plug-side green/ground | Socket-side green/ground via WAGO |

Use NO, not NC, so the tumbler fails OFF if ESP32 power is lost.

## Important safety notes

- Use a GFCI outlet or GFCI extension cord upstream.
- Keep mains AC physically separated from low-voltage ESP32 wiring inside the enclosure.
- Use strain relief/cable glands on all cords entering/exiting the box.
- Test with a lamp before plugging in the tumbler.
- This is a wiring schematic, not a PCB design for mains AC.
