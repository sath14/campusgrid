# Pathway IR / ultrasonic sensors

Yes — you can use these to estimate:

- **Movement** (beam breaks / distance dips)
- **Speed** (two sensors a fixed distance apart → m/s)
- **Busy pathway** (crossings per minute → congested / busy / clear)

Posts to `POST /api/edge/pathway`, which updates CampusGrid **walkways** pace used by the AI leave-time guidance.

## Sensors

| Sensor | Good for |
|--------|----------|
| **IR beam-break** | People crossing a line (hallway choke points) |
| **HC-SR04 ultrasonic** | Presence + rough speed with a pair |
| PIR | Motion only (weaker for counting / speed) |

## Setup

1. Edit `config.h`
2. Place sensor A then B along the walk direction (`SENSOR_GAP_M`)
3. Flash any ESP32 / C3 / S3
4. Server walkway slug should match (default `block-a-c`)
