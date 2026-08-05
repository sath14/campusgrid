#!/usr/bin/env python3
"""Export phone-holder designs as DXF, then convert to DWG (AutoCAD R2000).

Uses only LINE / LWPOLYLINE / CIRCLE / TEXT so LibreDWG can write .dwg.
"""

from __future__ import annotations

import math
import subprocess
import sys
from pathlib import Path

import ezdxf
from ezdxf import units
from ezdxf.enums import TextEntityAlignment

OUT = Path(__file__).resolve().parent
DWGWRITE = Path.home() / ".local" / "bin" / "dwgwrite"


def setup_doc():
    doc = ezdxf.new("R2000")
    doc.units = units.MM
    # Avoid fancy default dimstyles that LibreDWG rejects
    for name, color in [
        ("OUTLINE", 7),
        ("HIDDEN", 8),
        ("DIMS", 1),
        ("TEXT", 3),
        ("GROOVE", 4),
    ]:
        doc.layers.add(name, color=color)
    return doc


def label(msp, text: str, x: float, y: float, h: float = 5.0, layer="TEXT"):
    t = msp.add_text(text, dxfattribs={"height": h, "layer": layer})
    t.set_placement((x, y), align=TextEntityAlignment.LEFT)


def rect(msp, x, y, w, h, layer="OUTLINE"):
    msp.add_lwpolyline(
        [(x, y), (x + w, y), (x + w, y + h), (x, y + h)],
        close=True,
        dxfattribs={"layer": layer},
    )


def hdim(msp, x0, x1, y, y_dim, text: str):
    """Horizontal dimension with ticks (no DIMENSION entity)."""
    msp.add_line((x0, y), (x0, y_dim), dxfattribs={"layer": "DIMS"})
    msp.add_line((x1, y), (x1, y_dim), dxfattribs={"layer": "DIMS"})
    msp.add_line((x0, y_dim), (x1, y_dim), dxfattribs={"layer": "DIMS"})
    # end ticks
    tick = 2.5
    msp.add_line((x0 - tick, y_dim - tick), (x0 + tick, y_dim + tick), dxfattribs={"layer": "DIMS"})
    msp.add_line((x1 - tick, y_dim - tick), (x1 + tick, y_dim + tick), dxfattribs={"layer": "DIMS"})
    label(msp, text, (x0 + x1) / 2 - len(text) * 1.2, y_dim + 2, 3.5, "DIMS")


def vdim(msp, y0, y1, x, x_dim, text: str):
    """Vertical dimension with ticks."""
    msp.add_line((x, y0), (x_dim, y0), dxfattribs={"layer": "DIMS"})
    msp.add_line((x, y1), (x_dim, y1), dxfattribs={"layer": "DIMS"})
    msp.add_line((x_dim, y0), (x_dim, y1), dxfattribs={"layer": "DIMS"})
    tick = 2.5
    msp.add_line((x_dim - tick, y0 - tick), (x_dim + tick, y0 + tick), dxfattribs={"layer": "DIMS"})
    msp.add_line((x_dim - tick, y1 - tick), (x_dim + tick, y1 + tick), dxfattribs={"layer": "DIMS"})
    label(msp, text, x_dim + 3, (y0 + y1) / 2, 3.5, "DIMS")


def design1_dxf(path: Path) -> Path:
    base_w, base_d, base_h = 180.0, 100.0, 10.0
    holder_h = 170.0
    wall = 2.5
    rect_w, rect_d = 55.0, 42.0
    cyl_d = 44.0
    lip_h, lip_t = 9.0, 6.0
    groove_w, groove_depth = 8.0, 4.0
    margin = 8.0

    doc = setup_doc()
    msp = doc.modelspace()

    # ===== FRONT =====
    fx, fy = 0.0, 0.0
    label(msp, "DESIGN 1 - FRONT", fx, fy + base_h + holder_h + 28, 7)
    label(msp, "Phone leans on pencil holders. Units mm.", fx, fy + base_h + holder_h + 18, 3.5)

    rect(msp, fx, fy, base_w, base_h)
    rect(msp, fx, fy + base_h, base_w, lip_h)
    # lip cable gap
    gap_x = fx + base_w / 2 - groove_w / 2
    rect(msp, gap_x, fy + base_h, groove_w, lip_h, layer="GROOVE")

    # rect pencil cup
    rx = fx + margin
    rect(msp, rx, fy + base_h, rect_w, holder_h)
    rect(msp, rx + wall, fy + base_h + wall, rect_w - 2 * wall, holder_h - wall, layer="HIDDEN")
    label(msp, "rect pencil cup", rx, fy + base_h + holder_h + 4, 3.5)

    # cyl pencil cup (front silhouette)
    cx = fx + base_w - margin - cyl_d
    rect(msp, cx, fy + base_h, cyl_d, holder_h)
    rect(msp, cx + wall, fy + base_h + wall, cyl_d - 2 * wall, holder_h - wall, layer="HIDDEN")
    msp.add_line(
        (cx + cyl_d / 2, fy + base_h),
        (cx + cyl_d / 2, fy + base_h + holder_h),
        dxfattribs={"layer": "HIDDEN"},
    )
    label(msp, "cyl pencil cup", cx, fy + base_h + holder_h + 4, 3.5)
    label(msp, "cable groove gap", gap_x - 8, fy + base_h + lip_h + 3, 3)

    hdim(msp, fx, fx + base_w, fy, fy - 18, "180 (18 cm)")
    vdim(msp, fy, fy + base_h, fx, fx - 16, "10")
    vdim(msp, fy + base_h, fy + base_h + holder_h, fx, fx - 32, "170 (17 cm)")

    # ===== TOP =====
    tx, ty = 0.0, -170.0
    label(msp, "TOP", tx, ty + base_d + 14, 6)
    rect(msp, tx, ty, base_w, base_d)
    rect(msp, tx, ty, base_w, lip_t)  # front lip
    # groove
    gx = tx + base_w / 2 - groove_w / 2
    rect(msp, gx, ty + lip_t, groove_w, base_d - lip_t - margin, layer="GROOVE")
    label(msp, "cable lies in groove", gx + 14, ty + 45, 3)

    rtx, rty = tx + margin, ty + base_d - margin - rect_d
    rect(msp, rtx, rty, rect_w, rect_d)
    rect(msp, rtx + wall, rty + wall, rect_w - 2 * wall, rect_d - 2 * wall, layer="HIDDEN")

    ctx = tx + base_w - margin - cyl_d / 2
    cty = ty + base_d - margin - cyl_d / 2
    msp.add_circle((ctx, cty), cyl_d / 2, dxfattribs={"layer": "OUTLINE"})
    msp.add_circle((ctx, cty), cyl_d / 2 - wall, dxfattribs={"layer": "HIDDEN"})

    hdim(msp, tx, tx + base_w, ty, ty - 16, "180")
    vdim(msp, ty, ty + base_d, tx + base_w, tx + base_w + 16, "100")
    label(msp, "front lip", tx + 2, ty + lip_t + 2, 3)
    label(msp, "phone rests against front of cups", tx, ty - 28, 3.5)

    # ===== SIDE =====
    sx, sy = 250.0, 0.0
    label(msp, "SIDE (from right)", sx, sy + base_h + holder_h + 14, 6)
    rect(msp, sx, sy, base_d, base_h)
    rect(msp, sx + base_d - lip_t, sy + base_h, lip_t, lip_h)
    rect(msp, sx + margin, sy + base_h, cyl_d, holder_h)
    rect(
        msp,
        sx + margin + wall,
        sy + base_h + wall,
        cyl_d - 2 * wall,
        holder_h - wall,
        layer="HIDDEN",
    )
    rect(
        msp,
        sx + lip_t,
        sy + base_h - groove_depth,
        base_d - lip_t - margin,
        groove_depth,
        layer="GROOVE",
    )
    hdim(msp, sx, sx + base_d, sy, sy - 16, "100")
    vdim(msp, sy + base_h, sy + base_h + holder_h, sx, sx - 16, "170")
    label(msp, "rear", sx, sy - 28, 3)
    label(msp, "front+lip", sx + base_d - 35, sy - 28, 3)
    label(msp, "groove depth 4", sx + 25, sy + base_h + 3, 3)

    # Notes
    label(msp, "NOTES", 250, -90, 5)
    for i, n in enumerate(
        [
            "- Rect + cylinder = hollow pencil holders (open top)",
            "- Phone leans on front faces of holders",
            "- Front lip stops phone slipping",
            "- Cable lies in base groove (not a plus)",
            "- Base thickness = 10 mm",
        ]
    ):
        label(msp, n, 250, -105 - i * 10, 3.2)

    dxf_path = path.with_suffix(".dxf")
    doc.saveas(dxf_path)
    return dxf_path


def design2_dxf(path: Path) -> Path:
    cradle_w, wall_t, depth, base_h, back_h = 84.0, 5.0, 55.0, 8.0, 90.0
    outer_w = cradle_w + 2 * wall_t
    side_h, stop_h = 22.0, 10.0

    doc = setup_doc()
    msp = doc.modelspace()
    label(msp, "DESIGN 2 - UPRIGHT CRADLE - FRONT", 0, base_h + back_h + 20, 6)
    rect(msp, 0, 0, outer_w, base_h)
    rect(msp, 0, base_h, outer_w, back_h)
    rect(msp, 0, base_h, wall_t, side_h)
    rect(msp, outer_w - wall_t, base_h, wall_t, side_h)
    rect(msp, wall_t, base_h, cradle_w, stop_h)
    rect(msp, outer_w / 2 - 7, 0, 14, base_h, layer="GROOVE")
    hdim(msp, 0, outer_w, 0, -16, f"{outer_w:.0f}")
    vdim(msp, 0, base_h + back_h, 0, -16, f"{base_h + back_h:.0f}")

    sx = outer_w + 40
    label(msp, "SIDE", sx, base_h + back_h + 12, 6)
    rect(msp, sx, 0, depth + 25, base_h)
    rect(msp, sx, base_h, 5, back_h)
    rect(msp, sx + depth - 4, base_h, 4, stop_h)
    label(msp, "cable slot in base", 0, -35, 3.5)

    dxf_path = path.with_suffix(".dxf")
    doc.saveas(dxf_path)
    return dxf_path


def design3_dxf(path: Path) -> Path:
    base_w, base_d, base_h = 110.0, 100.0, 12.0
    back_h, angle_deg = 130.0, 18.0
    ang = math.radians(angle_deg)

    doc = setup_doc()
    msp = doc.modelspace()
    label(msp, "DESIGN 3 - BEST ANGLED STAND - SIDE", 0, 165, 6)
    rect(msp, 0, 0, base_d, base_h)
    bx = 20.0
    top_x = bx - back_h * math.sin(ang)
    top_z = base_h + back_h * math.cos(ang)
    msp.add_lwpolyline(
        [
            (bx, base_h),
            (bx + 10, base_h),
            (top_x + 10, top_z),
            (top_x, top_z),
        ],
        close=True,
        dxfattribs={"layer": "OUTLINE"},
    )
    rect(msp, base_d - 15, base_h, 7, 12)
    rect(msp, 5, 0, base_d - 10, 7, layer="GROOVE")
    label(msp, f"backrest ~{angle_deg} deg", top_x, top_z + 8, 3.5)
    label(msp, "cable tunnel + MagSafe recess (3D in STL)", 0, -22, 3.5)
    hdim(msp, 0, base_d, 0, -16, "100")

    fx = base_d + 50
    label(msp, "FRONT", fx, 165, 6)
    rect(msp, fx, 0, base_w, base_h)
    rect(msp, fx + 5, base_h, base_w - 10, 100)
    rect(msp, fx + base_w / 2 - 8, 0, 16, base_h, layer="GROOVE")
    hdim(msp, fx, fx + base_w, 0, -16, "110")

    dxf_path = path.with_suffix(".dxf")
    doc.saveas(dxf_path)
    return dxf_path


def dxf_to_dwg(dxf_path: Path) -> Path:
    dwg_path = dxf_path.with_suffix(".dwg")
    cmd = [
        str(DWGWRITE),
        "-y",
        "--as",
        "r2000",
        "-I",
        "DXF",
        "-o",
        str(dwg_path),
        str(dxf_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not dwg_path.exists():
        raise RuntimeError(
            f"dwgwrite failed for {dxf_path.name}:\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
        )
    print(f"Wrote {dwg_path} ({dwg_path.stat().st_size} bytes)")
    return dwg_path


def main():
    jobs = [
        (OUT / "design1_l_stand_redo", design1_dxf),
        (OUT / "design2_upright_cradle", design2_dxf),
        (OUT / "design3_best_angled_stand", design3_dxf),
    ]
    for base, fn in jobs:
        dxf = fn(base)
        print(f"Wrote {dxf}")
        dxf_to_dwg(dxf)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
