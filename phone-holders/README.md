# Phone Holder Designs (STL)

Three 3D-printable phone holders with charging access. Units are millimeters.
Sized for a typical phone with case (~78 × 12 × 160 mm). Scale in your slicer if needed.

## Design 1 — L-stand redo (`design1_l_stand_redo.stl`)

Redo of your first design (front slab + tall back + front lip), with charging added.

**What changed from your sketch**
- Kept the **10 mm** base thickness and L-profile (vertical back + deck + lip)
- Added a **center cable slot** through the base and a **lip notch** for Lightning/USB-C
- Added a **rear cable exit** under the backrest
- Kept a **cylindrical accent** on the right (from your front view)

**Flaws (why this is not the best)**
1. Backrest is still **90° vertical** — awkward viewing angle, phone wants to tip forward against the lip only
2. Tall back + shallow mass distribution can feel **top-heavy** with a large phone
3. Cable path is **fixed to center** — bad for landscape or offset ports
4. **No wireless / MagSafe pad recess** — wired only
5. Right-side cylinder is mostly cosmetic (echoes your sketch) and adds print time without much function

## Design 2 — Upright cradle (`design2_upright_cradle.stl`)

Side-walled cradle with a slight shelf angle, floor cable slot, front lip notch, and underside channel.

**Charging**
- Slot through the deck under the phone for Lightning/USB-C
- Front lip notch so the plug clears the stop
- Underside channel routes the cable out the rear

**Flaws**
1. Mostly **portrait-only** — landscape does not sit well between the side walls
2. Cable slot is **fixed to center** — may miss some cases / port offsets
3. Narrower footprint than Design 3 — less anti-tip for heavy phones
4. **No wireless pad seat**
5. Side walls can scrape soft cases when inserting the phone
6. Near-vertical back — weaker viewing angle than Design 3

## Design 3 — Best angled stand (`design3_best_angled_stand.stl`)

Recommended daily-driver design.

**Why it is best**
- **~18° recline** for comfortable viewing / video
- **Wide base + rear ballast** to resist tipping
- **Side rails** keep the phone centered
- **Front lip + cable notch** for wired charging
- **Full-length underside tunnel** + rear exit for clean cable routing
- **Qi / MagSafe-sized recess (~72 mm)** on the back face for a slim wireless puck
- Foot recesses for optional rubber pads

**Print notes**
- Print Design 1 & 2 flat on the base (no supports if oriented carefully)
- Design 3: print on the base; add supports under the tilted backrest if your slicer needs them
- Suggested: PETG or PLA+, 15–20% infill, 3 walls; higher infill in the ballast for Design 3
- Check your phone width/thickness and scale XY if using a thick case

## Generate again

```bash
python3 generate_holders.py
```

Requires: `numpy`, `trimesh`, `numpy-stl`, `manifold3d`.
