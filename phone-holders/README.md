# Phone Holder Orthographic DXF Set

Desk phone-holder concepts drawn in millimetres, sized for an **average modern smartphone with slim case**:

| Dimension | Value |
|-----------|------:|
| Width     | 78 mm |
| Height    | 160 mm |
| Thickness | 12 mm |

All sheets use **orthographic views** (front / top / side) with full dimensions and callouts.

## Layer convention

| Layer | Color | Purpose |
|-------|------:|---------|
| `OUTLINE` | 7 | Object geometry |
| `HIDDEN` | 8 | Hidden edges |
| `CENTER` | 5 | Centerlines |
| `DIMS` | 1 | Dimension lines and values |
| `ANNOTATIONS` | 3 | Feature callouts, leaders, drawback notes |
| `TITLE` | 2 | Sheet / view titles |
| `TEXT` | 4 | General labels and notes |
| `PHONE_REF` | 6 | Phone silhouette / footprint reference |

Annotations and dimensions are kept on dedicated layers so they can be toggled independently of geometry.

## Designs

### Alternatives (with drawbacks vs Design 04)

#### Design 01 — Minimal wedge stand (`design01_minimal_wedge.dxf`)
Simple angled wedge + front lip. Phone-only support.

**Drawbacks**
1. No trays, card slots, or pen bin — poor desk organization.
2. Narrow 90 mm base can tip under a tall/heavy phone when bumped.

#### Design 02 — Vertical pocket dock (`design02_vertical_pocket.dxf`)
Drop-in near-vertical pocket with cable notch.

**Drawbacks**
1. Viewing angle is nearly 90° — uncomfortable for video / media.
2. Portrait-only pocket; no trays or pen storage for desk clutter.

#### Design 03 — Dual-peg cradle (`design03_dual_peg_cradle.dxf`)
Two leaning pegs + front stop bar.

**Drawbacks**
1. Open cradle can scuff soft cases; phone may rattle between pegs.
2. No accessory tray / card tiers / pen cup — limited everyday utility.

### Primary design (from reference organizer)

#### Design 04 — Multi-organizer phone stand (`design04_multi_organizer.dxf`)
Integrated unit matching the reference desk organizer:

- **Left:** angled phone stand (~65° from horizontal) with lip and support
- **Front-right:** shallow accessory tray
- **Mid-right:** two tiered card / sticky-note pockets
- **Rear-right:** tall pen / marker bin

**Key envelope:** 200 × 155 mm footprint · stand width 88 mm · pen bin height 72 mm

**Why primary:** wide stable base, comfortable viewing angle, and multi-function storage in one footprint.

## Files

| File | Contents |
|------|----------|
| `phone_holders_index.dxf` | Index sheet, layer legend, drawback summary |
| `design01_minimal_wedge.dxf` | Alt 01 orthographic + dims |
| `design02_vertical_pocket.dxf` | Alt 02 orthographic + dims |
| `design03_dual_peg_cradle.dxf` | Alt 03 orthographic + dims |
| `design04_multi_organizer.dxf` | Primary design orthographic + dims |
| `generate_organizer_dxf.py` | Regenerator script |

## Regenerate

```bash
python3 phone-holders/generate_organizer_dxf.py
```

Requires: `ezdxf`
