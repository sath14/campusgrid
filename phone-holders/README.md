# Phone Holder Designs (STL)

Three 3D-printable phone holders with charging access. Units are millimeters.
Sized for a typical phone with case (~78 × 12 × 160 mm). Scale in your slicer if needed.

## Design 1 — Dual pencil-holder stand (`design1_l_stand_redo.stl`)

Redo of your first design with corrected intent.

**Your layout (as clarified)**
- Base **18 cm** wide, **10 mm** thick
- **Rectangular hollow cup** + **cylindrical hollow cup** — both pencil holders, **17 cm** tall
- Phone **leans against the pencil holders**
- Front **lip** stops the phone from slipping
- **Simple cable groove** in the base top — the cable lies in the slot (not a plus-shaped cutout); small gap in the lip so the cable can reach the port

**Flaws (why this is not the best)**
1. Phone leans on **vertical** cups — viewing angle is steep / near 90°
2. Tall 17 cm holders on a thin base can feel **top-heavy** when the phone pushes forward
3. Cable groove is **center-only** — awkward for landscape or offset ports
4. Cups take desk space; gap between rect and cylinder means the phone may only touch one holder cleanly depending on width
5. **No wireless / MagSafe pad** — wired groove only

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
- Design 1: print on the base; cups are open-top hollow (no supports inside if printed upright)
- Design 2: print on the base
- Design 3: print on the base; add supports under the tilted backrest if needed
- Suggested: PETG or PLA+, 15–20% infill, 3 walls; more infill in Design 3 ballast
- Check your phone width/thickness and scale XY if using a thick case

## Generate again

```bash
python3 generate_holders.py
```

Requires: `numpy`, `trimesh`, `numpy-stl`, `manifold3d`.
