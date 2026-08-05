#!/usr/bin/env python3
"""Create new orthographic DWG/DXF files with complete dimensions.

Output (per design):
  designN_orthographic.dxf
  designN_orthographic.dwg   (AutoCAD 2000 via LibreDWG)
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


# ---------------------------------------------------------------------------
# Drawing helpers (LINE / LWPOLYLINE / CIRCLE / TEXT only — LibreDWG-safe)
# ---------------------------------------------------------------------------
def setup_doc():
    doc = ezdxf.new("R2000")
    doc.units = units.MM
    for name, color in [
        ("OUTLINE", 7),
        ("HIDDEN", 8),
        ("DIMS", 1),
        ("TEXT", 3),
        ("GROOVE", 4),
        ("CENTER", 5),
        ("TITLE", 2),
    ]:
        doc.layers.add(name, color=color)
    return doc


def text(msp, s, x, y, h=3.5, layer="TEXT", align="LEFT"):
    t = msp.add_text(s, dxfattribs={"height": h, "layer": layer})
    align_map = {
        "LEFT": TextEntityAlignment.LEFT,
        "CENTER": TextEntityAlignment.CENTER,
        "RIGHT": TextEntityAlignment.RIGHT,
        "MIDDLE": TextEntityAlignment.MIDDLE_CENTER,
    }
    t.set_placement((x, y), align=align_map.get(align, TextEntityAlignment.LEFT))


def rect(msp, x, y, w, h, layer="OUTLINE"):
    msp.add_lwpolyline(
        [(x, y), (x + w, y), (x + w, y + h), (x, y + h)],
        close=True,
        dxfattribs={"layer": layer},
    )


def line(msp, x0, y0, x1, y1, layer="OUTLINE"):
    msp.add_line((x0, y0), (x1, y1), dxfattribs={"layer": layer})


def circle(msp, cx, cy, r, layer="OUTLINE"):
    msp.add_circle((cx, cy), r, dxfattribs={"layer": layer})


def hdim(msp, x0, x1, y_ref, y_dim, label, above=True):
    """Horizontal overall / feature dimension."""
    line(msp, x0, y_ref, x0, y_dim, "DIMS")
    line(msp, x1, y_ref, x1, y_dim, "DIMS")
    line(msp, x0, y_dim, x1, y_dim, "DIMS")
    tick = 2.2
    line(msp, x0 - tick, y_dim - tick, x0 + tick, y_dim + tick, "DIMS")
    line(msp, x1 - tick, y_dim - tick, x1 + tick, y_dim + tick, "DIMS")
    ty = y_dim + 2.5 if above else y_dim - 6
    text(msp, label, (x0 + x1) / 2, ty, 3.2, "DIMS", "CENTER")


def vdim(msp, y0, y1, x_ref, x_dim, label, right=True):
    """Vertical overall / feature dimension."""
    line(msp, x_ref, y0, x_dim, y0, "DIMS")
    line(msp, x_ref, y1, x_dim, y1, "DIMS")
    line(msp, x_dim, y0, x_dim, y1, "DIMS")
    tick = 2.2
    line(msp, x_dim - tick, y0 - tick, x_dim + tick, y0 + tick, "DIMS")
    line(msp, x_dim - tick, y1 - tick, x_dim + tick, y1 + tick, "DIMS")
    tx = x_dim + 3 if right else x_dim - 3
    align = "LEFT" if right else "RIGHT"
    text(msp, label, tx, (y0 + y1) / 2 - 1.5, 3.2, "DIMS", align)


def title_block(msp, title, ox, oy, sheet_w=420, sheet_h=40):
    text(msp, title, ox, oy + 22, 8, "TITLE")
    text(msp, "Orthographic projection  |  Units: millimetres (mm)  |  Scale 1:1", ox, oy + 12, 3.5)
    text(msp, "Do not scale drawing — use written dimensions", ox, oy + 5, 3)


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
            f"dwgwrite failed for {dxf_path.name}:\n{proc.stdout}\n{proc.stderr}"
        )
    print(f"Wrote {dwg_path} ({dwg_path.stat().st_size} bytes)")
    return dwg_path


# ---------------------------------------------------------------------------
# Design 1 — complete orthographic
# ---------------------------------------------------------------------------
def draw_design1(path: Path) -> Path:
    # Specs matching generate_holders.py
    base_w, base_d, base_h = 180.0, 100.0, 10.0
    holder_h = 170.0
    wall = 2.5
    rect_w, rect_d = 55.0, 42.0
    cyl_d = 44.0
    cyl_r = cyl_d / 2
    lip_h, lip_t = 9.0, 6.0
    groove_w, groove_depth = 8.0, 4.0
    margin = 8.0
    # Aligned front faces of holders (distance from rear edge of base)
    holder_front_from_rear = margin + max(rect_d, cyl_d)  # 52

    doc = setup_doc()
    msp = doc.modelspace()
    title_block(msp, "DESIGN 1 — Dual Pencil-Holder Phone Stand", 0, 250)

    # ========== FRONT VIEW ==========
    # Origin at lower-left of base. Front face of base toward viewer.
    fx, fy = 20.0, 0.0
    text(msp, "FRONT VIEW", fx, fy + base_h + holder_h + 35, 5, "TITLE")

    # Base + lip
    rect(msp, fx, fy, base_w, base_h)
    rect(msp, fx, fy + base_h, base_w, lip_h)
    gap_x = fx + base_w / 2 - groove_w / 2
    rect(msp, gap_x, fy + base_h, groove_w, lip_h, "GROOVE")

    # Rect cup (left)
    rx = fx + margin
    rect(msp, rx, fy + base_h, rect_w, holder_h)
    rect(msp, rx + wall, fy + base_h + wall, rect_w - 2 * wall, holder_h - wall, "HIDDEN")
    text(msp, "RECT CUP", rx + 4, fy + base_h + holder_h + 4, 3)

    # Cyl cup (right) — rectangular silhouette + centerline
    cx0 = fx + base_w - margin - cyl_d
    rect(msp, cx0, fy + base_h, cyl_d, holder_h)
    rect(msp, cx0 + wall, fy + base_h + wall, cyl_d - 2 * wall, holder_h - wall, "HIDDEN")
    line(msp, cx0 + cyl_r, fy + base_h, cx0 + cyl_r, fy + base_h + holder_h, "CENTER")
    text(msp, "CYL CUP", cx0 + 4, fy + base_h + holder_h + 4, 3)

    # Front dims — stacked below / left / right
    hdim(msp, fx, fx + base_w, fy, fy - 18, "180 (18 cm)")  # overall width
    hdim(msp, fx, rx, fy, fy - 36, "8")  # left margin
    hdim(msp, rx, rx + rect_w, fy, fy - 36, "55")  # rect width
    hdim(msp, rx + rect_w, cx0, fy, fy - 54, f"{cx0 - (rx + rect_w):.0f} gap")  # between cups
    hdim(msp, cx0, cx0 + cyl_d, fy, fy - 36, "44 OD")  # cyl OD
    hdim(msp, cx0 + cyl_d, fx + base_w, fy, fy - 36, "8")  # right margin
    hdim(msp, gap_x, gap_x + groove_w, fy + base_h + lip_h, fy + base_h + lip_h + 14, "8 groove")

    vdim(msp, fy, fy + base_h, fx, fx - 16, "10")  # base thick
    vdim(msp, fy + base_h, fy + base_h + lip_h, fx, fx - 16, "9 lip H")
    vdim(msp, fy + base_h, fy + base_h + holder_h, fx, fx - 34, "170 (17 cm)")
    vdim(msp, fy + base_h + wall, fy + base_h + holder_h, fx + base_w, fx + base_w + 18, "wall 2.5 / open top")
    # Inner rect width
    hdim(
        msp,
        rx + wall,
        rx + rect_w - wall,
        fy + base_h + holder_h,
        fy + base_h + holder_h + 18,
        f"{rect_w - 2 * wall:.1f} ID",
    )
    hdim(
        msp,
        cx0 + wall,
        cx0 + cyl_d - wall,
        fy + base_h + holder_h,
        fy + base_h + holder_h + 18,
        f"{cyl_d - 2 * wall:.1f} ID",
    )

    # ========== TOP VIEW ==========
    tx, ty = 20.0, -220.0
    text(msp, "TOP VIEW", tx, ty + base_d + 40, 5, "TITLE")
    # Rear at top of drawing (+Y), front at bottom
    rect(msp, tx, ty, base_w, base_d)
    # Front lip strip
    rect(msp, tx, ty, base_w, lip_t)
    text(msp, "LIP", tx + 2, ty + 1, 2.8)
    # Groove from lip toward rear
    groove_len = base_d - 18
    gx = tx + base_w / 2 - groove_w / 2
    rect(msp, gx, ty + lip_t, groove_w, groove_len - 2, "GROOVE")
    text(msp, "CABLE GROOVE", gx + groove_w + 3, ty + 35, 3)

    # Rect footprint — rear UP, front DOWN in this view
    rect_front = ty + base_d - holder_front_from_rear
    rtx = tx + margin
    rect(msp, rtx, rect_front, rect_w, rect_d)
    rect(msp, rtx + wall, rect_front + wall, rect_w - 2 * wall, rect_d - 2 * wall, "HIDDEN")

    cyl_front = ty + base_d - holder_front_from_rear
    cyl_cx = tx + base_w - margin - cyl_r
    cyl_cy = cyl_front + cyl_r
    circle(msp, cyl_cx, cyl_cy, cyl_r)
    circle(msp, cyl_cx, cyl_cy, cyl_r - wall, "HIDDEN")
    line(msp, cyl_cx - cyl_r - 4, cyl_cy, cyl_cx + cyl_r + 4, cyl_cy, "CENTER")
    line(msp, cyl_cx, cyl_cy - cyl_r - 4, cyl_cx, cyl_cy + cyl_r + 4, "CENTER")

    # Phone bay arrow note
    text(msp, "PHONE BAY (leans on cups)", tx + 55, ty + 20, 3)

    # Top dims
    hdim(msp, tx, tx + base_w, ty, ty - 18, "180")
    hdim(msp, tx, rtx, ty, ty - 36, "8")
    hdim(msp, rtx, rtx + rect_w, ty, ty - 36, "55")
    hdim(msp, gx, gx + groove_w, ty + lip_t, ty + lip_t + groove_len + 8, "8")
    vdim(msp, ty, ty + lip_t, tx + base_w, tx + base_w + 16, "6 lip T")
    vdim(msp, ty, ty + base_d, tx + base_w, tx + base_w + 34, "100 depth")
    vdim(msp, rect_front, rect_front + rect_d, tx, tx - 16, "42")
    vdim(msp, cyl_front, cyl_front + cyl_d, tx, tx - 34, "44")
    # margin rear
    vdim(msp, ty + base_d - margin, ty + base_d, tx + base_w, tx + base_w + 52, "8")
    # phone bay depth (lip inner to holder front)
    vdim(msp, ty + lip_t, rect_front, rtx + rect_w, rtx + rect_w + 20, f"{rect_front - (ty + lip_t):.0f} bay")

    # ========== SIDE VIEW (from right) ==========
    # Left = rear, right = front
    sx, sy = 280.0, 0.0
    text(msp, "RIGHT SIDE VIEW", sx, sy + base_h + holder_h + 35, 5, "TITLE")
    rect(msp, sx, sy, base_d, base_h)
    # Lip at front (right)
    rect(msp, sx + base_d - lip_t, sy + base_h, lip_t, lip_h)
    # Cylinder (visible on right side) — from rear margin
    # rear of cyl at sx + (holder_front_from_rear - cyl_d) = sx + (52-44) = sx+8 = margin
    cyl_x = sx + (holder_front_from_rear - cyl_d)
    rect(msp, cyl_x, sy + base_h, cyl_d, holder_h)
    rect(msp, cyl_x + wall, sy + base_h + wall, cyl_d - 2 * wall, holder_h - wall, "HIDDEN")
    # Groove along top of base
    rect(msp, sx + lip_t, sy + base_h - groove_depth, groove_len - 2, groove_depth, "GROOVE")
    # Hidden rect cup behind (dashed outline of depth)
    # Rect would show as different depth — show dashed rear extent
    rect_x = sx + (holder_front_from_rear - rect_d)
    line(msp, rect_x, sy + base_h, rect_x, sy + base_h + holder_h, "HIDDEN")
    line(msp, rect_x + rect_d, sy + base_h, rect_x + rect_d, sy + base_h + holder_h, "HIDDEN")
    text(msp, "rect cup (hidden)", rect_x, sy + base_h + holder_h + 4, 3)

    hdim(msp, sx, sx + base_d, sy, sy - 18, "100")
    hdim(msp, sx, cyl_x, sy, sy - 36, "8")
    hdim(msp, cyl_x, cyl_x + cyl_d, sy, sy - 36, "44")
    hdim(msp, sx + base_d - lip_t, sx + base_d, sy, sy - 36, "6")
    hdim(msp, sx + lip_t, sx + lip_t + groove_len - 2, sy + base_h, sy + base_h + 14, f"{groove_len - 2:.0f} groove L")
    vdim(msp, sy, sy + base_h, sx, sx - 16, "10")
    vdim(msp, sy + base_h - groove_depth, sy + base_h, sx, sx - 34, "4 groove")
    vdim(msp, sy + base_h, sy + base_h + lip_h, sx + base_d, sx + base_d + 16, "9")
    vdim(msp, sy + base_h, sy + base_h + holder_h, sx, sx - 52, "170")
    vdim(msp, sy + base_h, sy + base_h + wall, sx + base_d, sx + base_d + 34, "2.5 floor")

    text(msp, "REAR", sx, sy - 50, 3)
    text(msp, "FRONT", sx + base_d - 25, sy - 50, 3)

    # Parts / notes table
    nx, ny = 280.0, -200.0
    text(msp, "COMPLETE DIMENSION LIST", nx, ny + 80, 5, "TITLE")
    notes = [
        "Base W x D x H ........ 180 x 100 x 10",
        "Holder height ......... 170",
        "Rect cup outer ........ 55 x 42",
        "Rect cup inner ........ 50 x 37 (wall 2.5)",
        "Cyl cup outer dia ..... 44",
        "Cyl cup inner dia ..... 39",
        "Cup wall / floor ...... 2.5",
        "Side / rear margin .... 8",
        "Front lip T x H ....... 6 x 9",
        "Cable groove W x D .... 8 x 4",
        "Groove length ......... 82",
        "Lip cable gap W ....... 8",
        "Material .............. 3D print (PLA/PETG)",
    ]
    for i, n in enumerate(notes):
        text(msp, n, nx, ny + 65 - i * 9, 3.2)

    dxf_path = path.with_suffix(".dxf")
    doc.saveas(dxf_path)
    return dxf_path


# ---------------------------------------------------------------------------
# Design 2 — complete orthographic
# ---------------------------------------------------------------------------
def draw_design2(path: Path) -> Path:
    PHONE_W = 78.0
    wall_t = 5.0
    cradle_w = PHONE_W + 6.0  # 84
    outer_w = cradle_w + 2 * wall_t  # 94
    depth = 55.0
    base_extra = 25.0
    base_d = depth + base_extra  # 80
    base_h = 8.0
    back_h = 90.0
    side_h = 22.0
    stop_h, stop_t = 10.0, 4.0
    slot_w = 14.0
    channel_h = 5.0

    doc = setup_doc()
    msp = doc.modelspace()
    title_block(msp, "DESIGN 2 — Upright Cradle Phone Stand", 0, 160)

    # FRONT
    fx, fy = 20.0, 0.0
    text(msp, "FRONT VIEW", fx, fy + base_h + back_h + 25, 5, "TITLE")
    rect(msp, fx, fy, outer_w, base_h)
    rect(msp, fx, fy + base_h, outer_w, back_h)
    rect(msp, fx, fy + base_h, wall_t, side_h)
    rect(msp, fx + outer_w - wall_t, fy + base_h, wall_t, side_h)
    rect(msp, fx + wall_t, fy + base_h, cradle_w, stop_h)
    rect(msp, fx + outer_w / 2 - slot_w / 2, fy, slot_w, base_h, "GROOVE")

    hdim(msp, fx, fx + outer_w, fy, fy - 18, "94 overall")
    hdim(msp, fx, fx + wall_t, fy, fy - 36, "5")
    hdim(msp, fx + wall_t, fx + wall_t + cradle_w, fy, fy - 36, "84 cradle")
    hdim(msp, fx + outer_w - wall_t, fx + outer_w, fy, fy - 36, "5")
    hdim(msp, fx + outer_w / 2 - slot_w / 2, fx + outer_w / 2 + slot_w / 2, fy + base_h, fy + base_h + 12, "14 slot")
    vdim(msp, fy, fy + base_h, fx, fx - 16, "8")
    vdim(msp, fy + base_h, fy + base_h + stop_h, fx, fx - 16, "10 stop")
    vdim(msp, fy + base_h, fy + base_h + side_h, fx + outer_w, fx + outer_w + 16, "22 side")
    vdim(msp, fy + base_h, fy + base_h + back_h, fx, fx - 34, "90 back")

    # TOP
    tx, ty = 20.0, -160.0
    text(msp, "TOP VIEW", tx, ty + base_d + 30, 5, "TITLE")
    rect(msp, tx, ty, outer_w, base_d)
    # back wall at rear (top)
    rect(msp, tx, ty + base_d - wall_t, outer_w, wall_t)
    # sides
    rect(msp, tx, ty + base_extra, wall_t, depth)
    rect(msp, tx + outer_w - wall_t, ty + base_extra, wall_t, depth)
    # front stop
    rect(msp, tx + wall_t, ty + base_extra + depth - stop_t, cradle_w, stop_t)
    # cable slot
    rect(msp, tx + outer_w / 2 - slot_w / 2, ty + 10, slot_w, 30, "GROOVE")

    hdim(msp, tx, tx + outer_w, ty, ty - 18, "94")
    vdim(msp, ty, ty + base_d, tx + outer_w, tx + outer_w + 16, "80")
    vdim(msp, ty + base_extra, ty + base_extra + depth, tx, tx - 16, "55 cradle D")
    vdim(msp, ty, ty + base_extra, tx, tx - 34, "25")

    # SIDE
    sx, sy = 200.0, 0.0
    text(msp, "RIGHT SIDE VIEW", sx, sy + base_h + back_h + 25, 5, "TITLE")
    rect(msp, sx, sy, base_d, base_h)
    rect(msp, sx, sy + base_h, wall_t, back_h)  # back at left/rear
    rect(msp, sx + wall_t, sy + base_h, depth, side_h)  # side wall extent
    rect(msp, sx + wall_t + depth - stop_t, sy + base_h, stop_t, stop_h)
    rect(msp, sx + 5, sy, base_d - 10, channel_h, "GROOVE")

    hdim(msp, sx, sx + base_d, sy, sy - 18, "80")
    hdim(msp, sx, sx + wall_t, sy, sy - 36, "5 back T")
    vdim(msp, sy, sy + base_h, sx, sx - 16, "8")
    vdim(msp, sy, sy + channel_h, sx + base_d, sx + base_d + 16, "5 ch.")
    vdim(msp, sy + base_h, sy + base_h + back_h, sx, sx - 34, "90")

    nx, ny = 200.0, -140.0
    text(msp, "COMPLETE DIMENSION LIST", nx, ny + 50, 5, "TITLE")
    for i, n in enumerate(
        [
            "Overall W x D x H ..... 94 x 80 x 98",
            "Base height ........... 8",
            "Back plate H x T ...... 90 x 5",
            "Cradle opening W ...... 84",
            "Side guide H .......... 22",
            "Front stop H x T ...... 10 x 4",
            "Cable slot W .......... 14",
            "Underside channel H ... 5",
        ]
    ):
        text(msp, n, nx, ny + 35 - i * 9, 3.2)

    dxf_path = path.with_suffix(".dxf")
    doc.saveas(dxf_path)
    return dxf_path


# ---------------------------------------------------------------------------
# Design 3 — complete orthographic
# ---------------------------------------------------------------------------
def draw_design3(path: Path) -> Path:
    base_w, base_d, base_h = 110.0, 100.0, 12.0
    back_h, back_t = 130.0, 10.0
    angle = 18.0
    ang = math.radians(angle)
    lip_h, lip_t = 12.0, 7.0
    tunnel_w, tunnel_h = 16.0, 7.0
    pad_d = 72.0
    rail_h = 70.0
    ballast_d, ballast_h = 28.0, 22.0

    doc = setup_doc()
    msp = doc.modelspace()
    title_block(msp, "DESIGN 3 — Best Angled Phone Stand", 0, 200)

    # SIDE (primary — shows angle)
    sx, sy = 20.0, 0.0
    text(msp, "RIGHT SIDE VIEW", sx, 175, 5, "TITLE")
    rect(msp, sx, sy, base_d, base_h)
    # Angled backrest
    bx = sx + 18
    top_x = bx - back_h * math.sin(ang)
    top_z = sy + base_h + back_h * math.cos(ang)
    msp.add_lwpolyline(
        [
            (bx, sy + base_h),
            (bx + back_t, sy + base_h),
            (top_x + back_t, top_z),
            (top_x, top_z),
        ],
        close=True,
        dxfattribs={"layer": "OUTLINE"},
    )
    # Lip at front
    rect(msp, sx + base_d - 8 - lip_t, sy + base_h, lip_t, lip_h)
    # Ballast at rear
    rect(msp, sx, sy + base_h, ballast_d, ballast_h)
    # Tunnel
    rect(msp, sx + 5, sy, base_d - 10, tunnel_h, "GROOVE")
    # Angle annotation
    arc_r = 35
    line(msp, bx, sy + base_h, bx, sy + base_h + arc_r, "DIMS")
    line(msp, bx, sy + base_h, bx - arc_r * math.sin(ang), sy + base_h + arc_r * math.cos(ang), "DIMS")
    text(msp, "18 DEG", bx - 28, sy + base_h + 28, 3.2, "DIMS")

    hdim(msp, sx, sx + base_d, sy, sy - 18, "100 depth")
    hdim(msp, sx, sx + ballast_d, sy, sy - 36, "28 ballast")
    hdim(msp, sx + base_d - 8 - lip_t, sx + base_d - 8, sy, sy - 36, "7 lip T")
    vdim(msp, sy, sy + base_h, sx, sx - 16, "12")
    vdim(msp, sy, sy + tunnel_h, sx + base_d, sx + base_d + 16, "7 tunnel")
    vdim(msp, sy + base_h, sy + base_h + lip_h, sx + base_d, sx + base_d + 34, "12 lip H")
    vdim(msp, sy + base_h, sy + base_h + ballast_h, sx, sx - 34, "22")
    vdim(msp, sy + base_h, top_z, sx, sx - 52, "130 back (along face)")
    text(msp, f"back T = {back_t:.0f}", top_x - 5, top_z + 6, 3)

    # FRONT
    fx, fy = 220.0, 0.0
    text(msp, "FRONT VIEW", fx, 175, 5, "TITLE")
    rect(msp, fx, fy, base_w, base_h)
    # Back face projected width
    back_w = base_w - 10
    rect(msp, fx + 5, fy + base_h, back_w, 110)
    # Rails
    phone_w = 78.0
    rail_t = 4.0
    lx = fx + base_w / 2 - phone_w / 2 - 2 - rail_t
    rx = fx + base_w / 2 + phone_w / 2 + 2
    rect(msp, lx, fy + base_h + 8, rail_t, 60)
    rect(msp, rx, fy + base_h + 8, rail_t, 60)
    # Lip
    rect(msp, fx + 10, fy + base_h, base_w - 20, lip_h)
    # Tunnel / notch
    rect(msp, fx + base_w / 2 - tunnel_w / 2, fy, tunnel_w, base_h, "GROOVE")
    # MagSafe recess circle (projected)
    circle(msp, fx + base_w / 2, fy + base_h + 55, pad_d / 2, "HIDDEN")
    text(msp, "72 MagSafe/Qi recess", fx + base_w / 2 - 30, fy + base_h + 55, 3, "HIDDEN")

    hdim(msp, fx, fx + base_w, fy, fy - 18, "110 width")
    hdim(msp, fx + 5, fx + 5 + back_w, fy, fy - 36, "100 back W")
    hdim(msp, fx + base_w / 2 - tunnel_w / 2, fx + base_w / 2 + tunnel_w / 2, fy + base_h, fy + base_h + lip_h + 8, "16 tunnel")
    hdim(msp, lx, rx + rail_t, fy + base_h + 70, fy + base_h + 78, f"{phone_w + 4 + 2 * rail_t:.0f} rail span")
    vdim(msp, fy, fy + base_h, fx, fx - 16, "12")
    vdim(msp, fy + base_h, fy + base_h + lip_h, fx, fx - 16, "12")

    # TOP
    tx, ty = 20.0, -180.0
    text(msp, "TOP VIEW", tx, ty + base_d + 30, 5, "TITLE")
    rect(msp, tx, ty, base_w, base_d)
    rect(msp, tx, ty + base_d - ballast_d, base_w, ballast_d)  # ballast footprint
    rect(msp, tx + 10, ty + 8, base_w - 20, lip_t)  # lip
    rect(msp, tx + base_w / 2 - tunnel_w / 2, ty + 5, tunnel_w, base_d - 10, "GROOVE")
    # backrest footprint (tilted — show as thick bar near rear)
    rect(msp, tx + 5, ty + base_d - 40, base_w - 10, back_t)
    circle(msp, tx + base_w / 2, ty + base_d - 35, pad_d / 2, "HIDDEN")

    hdim(msp, tx, tx + base_w, ty, ty - 18, "110")
    vdim(msp, ty, ty + base_d, tx + base_w, tx + base_w + 16, "100")
    vdim(msp, ty + base_d - ballast_d, ty + base_d, tx, tx - 16, "28")
    hdim(msp, tx + base_w / 2 - pad_d / 2, tx + base_w / 2 + pad_d / 2, ty + base_d - 35, ty + base_d + 12, "72 pad")

    nx, ny = 220.0, -160.0
    text(msp, "COMPLETE DIMENSION LIST", nx, ny + 60, 5, "TITLE")
    for i, n in enumerate(
        [
            "Base W x D x H ........ 110 x 100 x 12",
            "Backrest length ....... 130",
            "Backrest thickness .... 10",
            "Recline angle ......... 18 deg",
            "Front lip T x H ....... 7 x 12",
            "Cable tunnel W x H .... 16 x 7",
            "MagSafe/Qi recess ..... dia 72, depth 2.2",
            "Side rails H x T ...... 70 x 4",
            "Rear ballast D x H .... 28 x 22",
            "Foot recess ........... dia 10, depth 2.5 (x4)",
        ]
    ):
        text(msp, n, nx, ny + 45 - i * 9, 3.2)

    dxf_path = path.with_suffix(".dxf")
    doc.saveas(dxf_path)
    return dxf_path


def main():
    jobs = [
        (OUT / "design1_orthographic", draw_design1),
        (OUT / "design2_orthographic", draw_design2),
        (OUT / "design3_orthographic", draw_design3),
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
