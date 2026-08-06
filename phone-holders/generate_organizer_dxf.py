#!/usr/bin/env python3
"""Generate orthographic DXF drawings for desk phone-holder concepts.

Reference phone (average modern smartphone with slim case):
  Width 78 mm | Height 160 mm | Thickness 12 mm

Outputs four designs:
  01 — Minimal wedge stand          (alternative; 2 drawbacks)
  02 — Vertical pocket dock         (alternative; 2 drawbacks)
  03 — Dual-peg cradle              (alternative; 2 drawbacks)
  04 — Multi-organizer phone stand  (primary design from reference photo)

Layers:
  OUTLINE, HIDDEN, CENTER, DIMS, ANNOTATIONS, TITLE, TEXT, PHONE_REF
"""

from __future__ import annotations

import math
from pathlib import Path

import ezdxf
from ezdxf import units
from ezdxf.enums import TextEntityAlignment

OUT = Path(__file__).resolve().parent

# Average phone with slim case (mm)
PHONE_W = 78.0
PHONE_H = 160.0
PHONE_T = 12.0


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------
def setup_doc():
    doc = ezdxf.new("R2010")
    doc.units = units.MM
    layers = [
        ("OUTLINE", 7),       # white/black — object geometry
        ("HIDDEN", 8),        # grey — hidden edges
        ("CENTER", 5),        # blue — centerlines
        ("DIMS", 1),          # red — dimension lines + values
        ("ANNOTATIONS", 3),   # green — feature callouts / notes
        ("TITLE", 2),         # yellow — titles / view names
        ("TEXT", 4),          # cyan — general labels
        ("PHONE_REF", 6),     # magenta — phone reference silhouette
    ]
    for name, color in layers:
        if name not in doc.layers:
            doc.layers.add(name, color=color)
    return doc


def text(msp, s, x, y, h=3.5, layer="TEXT", align="LEFT"):
    t = msp.add_text(str(s), dxfattribs={"height": h, "layer": layer})
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


def hdim(msp, x0, x1, y_ref, y_dim, label, above=True):
    """Horizontal dimension with extension lines, ticks, and label on DIMS layer."""
    line(msp, x0, y_ref, x0, y_dim, "DIMS")
    line(msp, x1, y_ref, x1, y_dim, "DIMS")
    line(msp, x0, y_dim, x1, y_dim, "DIMS")
    tick = 2.0
    line(msp, x0 - tick, y_dim - tick, x0 + tick, y_dim + tick, "DIMS")
    line(msp, x1 - tick, y_dim - tick, x1 + tick, y_dim + tick, "DIMS")
    ty = y_dim + 2.2 if above else y_dim - 5.5
    text(msp, label, (x0 + x1) / 2, ty, 3.0, "DIMS", "CENTER")


def vdim(msp, y0, y1, x_ref, x_dim, label, right=True):
    """Vertical dimension with extension lines, ticks, and label on DIMS layer."""
    line(msp, x_ref, y0, x_dim, y0, "DIMS")
    line(msp, x_ref, y1, x_dim, y1, "DIMS")
    line(msp, x_dim, y0, x_dim, y1, "DIMS")
    tick = 2.0
    line(msp, x_dim - tick, y0 - tick, x_dim + tick, y0 + tick, "DIMS")
    line(msp, x_dim - tick, y1 - tick, x_dim + tick, y1 + tick, "DIMS")
    tx = x_dim + 2.5 if right else x_dim - 2.5
    align = "LEFT" if right else "RIGHT"
    text(msp, label, tx, (y0 + y1) / 2 - 1.2, 3.0, "DIMS", align)


def leader(msp, x0, y0, x1, y1, label, h=2.8):
    """Simple leader callout on ANNOTATIONS layer."""
    line(msp, x0, y0, x1, y1, "ANNOTATIONS")
    # small arrow head
    ang = math.atan2(y0 - y1, x0 - x1)
    ah = 2.5
    line(
        msp,
        x0,
        y0,
        x0 - ah * math.cos(ang - 0.4),
        y0 - ah * math.sin(ang - 0.4),
        "ANNOTATIONS",
    )
    line(
        msp,
        x0,
        y0,
        x0 - ah * math.cos(ang + 0.4),
        y0 - ah * math.sin(ang + 0.4),
        "ANNOTATIONS",
    )
    # label offset from leader end
    lx = x1 + (4 if x1 >= x0 else -4)
    align = "LEFT" if x1 >= x0 else "RIGHT"
    text(msp, label, lx, y1 - 1.2, h, "ANNOTATIONS", align)


def title_block(msp, title, subtitle, ox=0, oy=0):
    text(msp, title, ox, oy, 7.5, "TITLE")
    text(msp, subtitle, ox, oy - 10, 3.2, "TEXT")
    text(
        msp,
        f"Ref. phone (avg w/ case): {PHONE_W:.0f} W × {PHONE_H:.0f} H × {PHONE_T:.0f} T mm"
        "  |  Units: mm  |  Scale 1:1  |  Do not scale drawing",
        ox,
        oy - 18,
        2.8,
        "TEXT",
    )


def drawbacks_block(msp, lines, ox, oy):
    text(msp, "DRAWBACKS (vs Design 04)", ox, oy, 4.0, "ANNOTATIONS")
    for i, line_s in enumerate(lines):
        text(msp, f"{i + 1}. {line_s}", ox, oy - 8 - i * 7, 3.0, "ANNOTATIONS")


def layer_legend(msp, ox, oy):
    text(msp, "LAYERS", ox, oy, 3.5, "TITLE")
    items = [
        ("OUTLINE", "Geometry"),
        ("HIDDEN", "Hidden edges"),
        ("CENTER", "Centerlines"),
        ("DIMS", "Dimensions"),
        ("ANNOTATIONS", "Callouts / notes"),
        ("TITLE", "Titles"),
        ("TEXT", "Labels"),
        ("PHONE_REF", "Phone silhouette"),
    ]
    for i, (name, desc) in enumerate(items):
        y = oy - 7 - i * 5.5
        line(msp, ox, y + 1.2, ox + 10, y + 1.2, name)
        text(msp, f"{name} — {desc}", ox + 14, y, 2.5, "TEXT")


# ---------------------------------------------------------------------------
# Design 01 — Minimal wedge stand (alternative)
# ---------------------------------------------------------------------------
def draw_design01(path: Path) -> Path:
    """Simple angled wedge — phone lean only, no organizer features."""
    # Fits average phone width with side clearance
    base_w = 90.0
    base_d = 95.0
    base_h = 6.0
    angle_deg = 60.0  # backrest from horizontal
    angle = math.radians(angle_deg)
    rest_len = 95.0  # along incline
    rest_t = 5.0
    lip_d = 12.0
    lip_h = 8.0
    # wedge height at rear
    rear_h = base_h + rest_len * math.sin(angle)

    doc = setup_doc()
    msp = doc.modelspace()
    title_block(
        msp,
        "DESIGN 01 — Minimal Wedge Phone Stand (ALTERNATIVE)",
        "Single-purpose angled wedge. Orthographic: Front / Top / Left Side.",
        0,
        320,
    )
    drawbacks_block(
        msp,
        [
            "No storage trays, card slots, or pen bin — poor desk organization.",
            "Narrow 90 mm base can tip under a tall/heavy phone when bumped.",
        ],
        0,
        280,
    )
    layer_legend(msp, 520, 300)

    # ---- FRONT VIEW ----
    fx, fy = 40.0, 40.0
    text(msp, "FRONT VIEW", fx, fy + rear_h + 28, 5, "TITLE")
    # Base
    rect(msp, fx, fy, base_w, base_h)
    # Backrest face as rectangle (apparent height)
    rest_h_app = rest_len * math.sin(angle)
    rect(msp, fx, fy + base_h, base_w, rest_h_app)
    # Lip across front
    rect(msp, fx, fy + base_h, base_w, lip_h)
    # Phone ref (portrait silhouette outline)
    phone_x = fx + (base_w - PHONE_W) / 2
    rect(msp, phone_x, fy + base_h + lip_h, PHONE_W, PHONE_H * 0.55, "PHONE_REF")
    text(msp, "PHONE REF", phone_x + 4, fy + base_h + lip_h + 4, 2.5, "PHONE_REF")

    hdim(msp, fx, fx + base_w, fy, fy - 16, f"{base_w:.0f}")
    hdim(msp, phone_x, phone_x + PHONE_W, fy + base_h + lip_h + PHONE_H * 0.55,
         fy + base_h + lip_h + PHONE_H * 0.55 + 12, f"{PHONE_W:.0f} phone W")
    vdim(msp, fy, fy + base_h, fx, fx - 14, f"{base_h:.0f}")
    vdim(msp, fy + base_h, fy + base_h + lip_h, fx, fx - 14, f"{lip_h:.0f} lip")
    vdim(msp, fy + base_h, fy + base_h + rest_h_app, fx + base_w, fx + base_w + 16,
         f"{rest_h_app:.0f}")
    leader(
        msp,
        fx + base_w * 0.7,
        fy + base_h + rest_h_app * 0.6,
        fx + base_w + 35,
        fy + base_h + rest_h_app * 0.6 + 20,
        "angled backrest",
    )

    # ---- TOP VIEW ----
    tx, ty = 40.0, -160.0
    text(msp, "TOP VIEW", tx, ty + base_d + 24, 5, "TITLE")
    rect(msp, tx, ty, base_w, base_d)
    # Lip at front (bottom of top view)
    rect(msp, tx, ty, base_w, lip_d)
    text(msp, "LIP", tx + 3, ty + 3, 2.5, "ANNOTATIONS")
    # Backrest top edge (projected) near rear
    # Horizontal projection of incline length
    rest_horiz = rest_len * math.cos(angle)
    # Backrest starts after lip
    rest_front = ty + lip_d
    rest_rear = rest_front + rest_horiz
    line(msp, tx, rest_rear, tx + base_w, rest_rear, "OUTLINE")
    # Phone footprint on stand
    px = tx + (base_w - PHONE_W) / 2
    rect(msp, px, rest_front + 5, PHONE_W, PHONE_T + 4, "PHONE_REF")
    text(msp, "PHONE FOOTPRINT", px + 2, rest_front + 7, 2.4, "PHONE_REF")

    hdim(msp, tx, tx + base_w, ty, ty - 16, f"{base_w:.0f}")
    vdim(msp, ty, ty + base_d, tx + base_w, tx + base_w + 16, f"{base_d:.0f}")
    vdim(msp, ty, ty + lip_d, tx, tx - 14, f"{lip_d:.0f}")
    vdim(msp, rest_front, rest_rear, tx, tx - 32, f"{rest_horiz:.0f} rest proj.")
    leader(msp, tx + base_w * 0.5, rest_rear, tx + base_w + 30, rest_rear + 15,
           "top edge of backrest")

    # ---- LEFT SIDE VIEW ----
    sx, sy = 280.0, 40.0
    text(msp, "LEFT SIDE VIEW", sx, sy + rear_h + 28, 5, "TITLE")
    # Base rectangle
    rect(msp, sx, sy, base_d, base_h)
    # Lip at front (right side of this view: front = +X)
    rect(msp, sx + base_d - lip_d, sy + base_h, lip_d, lip_h)
    # Inclined backrest profile
    # Front of incline at lip inner corner
    ix0 = sx + base_d - lip_d
    iy0 = sy + base_h + lip_h
    ix1 = ix0 - rest_horiz
    iy1 = iy0 + rest_h_app
    # Outer face of plate
    nx = rest_t * math.sin(angle)
    ny = -rest_t * math.cos(angle)
    pts = [
        (ix0, iy0),
        (ix1, iy1),
        (ix1 + nx, iy1 + ny),
        (ix0 + nx, iy0 + ny),
    ]
    # Clamp plate bottom to base top if needed — draw as polyline
    msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "OUTLINE"})
    # Fill wedge body under incline (solid support)
    msp.add_lwpolyline(
        [
            (sx, sy + base_h),
            (ix0, sy + base_h),
            (ix0, iy0),
            (ix1, iy1),
            (sx, iy1),
        ],
        close=True,
        dxfattribs={"layer": "HIDDEN"},
    )
    # Angle annotation
    text(msp, f"{angle_deg:.0f}° FROM HORIZ.", sx + 8, sy + base_h + rest_h_app * 0.45, 3.0, "ANNOTATIONS")
    arc_r = 28
    msp.add_arc(
        (ix0, iy0),
        arc_r,
        180 - angle_deg,
        180,
        dxfattribs={"layer": "ANNOTATIONS"},
    )

    hdim(msp, sx, sx + base_d, sy, sy - 16, f"{base_d:.0f}")
    hdim(msp, sx + base_d - lip_d, sx + base_d, sy, sy - 34, f"{lip_d:.0f}")
    vdim(msp, sy, sy + base_h, sx, sx - 14, f"{base_h:.0f}")
    vdim(msp, sy + base_h, sy + base_h + lip_h, sx + base_d, sx + base_d + 14, f"{lip_h:.0f}")
    vdim(msp, sy, iy1, sx, sx - 32, f"{rear_h:.0f} overall H")
    leader(msp, (ix0 + ix1) / 2, (iy0 + iy1) / 2, sx + base_d + 40, iy1,
           f"backrest {rest_len:.0f} × {rest_t:.0f} thk")

    # Notes
    text(msp, "NOTES", 280, -40, 4, "TITLE")
    text(msp, "• Material: PLA / PETG recommended, 3 walls, 15% infill", 280, -50, 2.8, "TEXT")
    text(msp, "• Phone rests in landscape or portrait against incline", 280, -58, 2.8, "TEXT")
    text(msp, "• No cable management features in this concept", 280, -66, 2.8, "TEXT")

    path.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(path)
    print(f"Wrote {path}")
    return path


# ---------------------------------------------------------------------------
# Design 02 — Vertical pocket dock (alternative)
# ---------------------------------------------------------------------------
def draw_design02(path: Path) -> Path:
    """Upright pocket — phone drops into a near-vertical slot."""
    base_w = 100.0
    base_d = 70.0
    base_h = 8.0
    wall = 4.0
    pocket_w = PHONE_W + 4.0  # clearance
    pocket_d = PHONE_T + 3.0
    pocket_h = 55.0  # insert depth of phone
    outer_w = pocket_w + 2 * wall
    outer_d = pocket_d + 2 * wall
    # Center pocket on base
    ox_off = (base_w - outer_w) / 2
    oy_off = (base_d - outer_d) / 2
    lip_h = 6.0  # front stop above base inside pocket
    cable_slot_w = 10.0

    doc = setup_doc()
    msp = doc.modelspace()
    title_block(
        msp,
        "DESIGN 02 — Vertical Pocket Dock (ALTERNATIVE)",
        "Near-vertical drop-in pocket. Orthographic: Front / Top / Right Side.",
        0,
        300,
    )
    drawbacks_block(
        msp,
        [
            "Viewing angle is nearly 90° — uncomfortable for video / media.",
            "Portrait-only pocket; no trays or pen storage for desk clutter.",
        ],
        0,
        260,
    )
    layer_legend(msp, 500, 280)

    # ---- FRONT VIEW ----
    fx, fy = 40.0, 30.0
    text(msp, "FRONT VIEW", fx, fy + base_h + pocket_h + 40, 5, "TITLE")
    rect(msp, fx, fy, base_w, base_h)
    # Outer pocket walls
    px = fx + ox_off
    rect(msp, px, fy + base_h, outer_w, pocket_h)
    # Inner pocket opening (hidden/cut)
    rect(msp, px + wall, fy + base_h + lip_h, pocket_w, pocket_h - lip_h, "HIDDEN")
    # Cable notch at bottom center of front wall
    cx = fx + base_w / 2 - cable_slot_w / 2
    rect(msp, cx, fy + base_h, cable_slot_w, lip_h, "HIDDEN")
    # Phone sticking out
    phone_vis = PHONE_H - (pocket_h - lip_h) * 0.85
    rect(
        msp,
        px + wall + 2,
        fy + base_h + pocket_h,
        PHONE_W,
        max(40, phone_vis * 0.4),
        "PHONE_REF",
    )
    text(msp, "PHONE", px + wall + 6, fy + base_h + pocket_h + 4, 2.5, "PHONE_REF")

    hdim(msp, fx, fx + base_w, fy, fy - 16, f"{base_w:.0f}")
    hdim(msp, px, px + outer_w, fy, fy - 34, f"{outer_w:.0f} pocket OD")
    hdim(msp, px + wall, px + wall + pocket_w, fy + base_h + pocket_h,
         fy + base_h + pocket_h + 14, f"{pocket_w:.0f} ID (= phone W + 4)")
    hdim(msp, cx, cx + cable_slot_w, fy + base_h + lip_h, fy + base_h + lip_h + 12,
         f"{cable_slot_w:.0f} cable")
    vdim(msp, fy, fy + base_h, fx, fx - 14, f"{base_h:.0f}")
    vdim(msp, fy + base_h, fy + base_h + lip_h, fx, fx - 14, f"{lip_h:.0f}")
    vdim(msp, fy + base_h, fy + base_h + pocket_h, fx + base_w, fx + base_w + 16,
         f"{pocket_h:.0f}")
    leader(msp, px + outer_w, fy + base_h + pocket_h * 0.5,
           fx + base_w + 45, fy + base_h + pocket_h * 0.5 + 15,
           f"wall thk {wall:.0f}")

    # ---- TOP VIEW ----
    tx, ty = 40.0, -150.0
    text(msp, "TOP VIEW", tx, ty + base_d + 22, 5, "TITLE")
    rect(msp, tx, ty, base_w, base_d)
    ptx = tx + ox_off
    pty = ty + oy_off
    rect(msp, ptx, pty, outer_w, outer_d)
    rect(msp, ptx + wall, pty + wall, pocket_w, pocket_d, "HIDDEN")
    # Cable slot through front wall
    slot_y = pty
    rect(msp, tx + base_w / 2 - cable_slot_w / 2, slot_y, cable_slot_w, wall, "HIDDEN")
    text(msp, "POCKET ID", ptx + wall + 4, pty + wall + 2, 2.5, "ANNOTATIONS")
    # Centerlines
    line(msp, tx + base_w / 2, ty - 5, tx + base_w / 2, ty + base_d + 5, "CENTER")
    line(msp, tx - 5, ty + base_d / 2, tx + base_w + 5, ty + base_d / 2, "CENTER")

    hdim(msp, tx, tx + base_w, ty, ty - 16, f"{base_w:.0f}")
    hdim(msp, ptx, ptx + outer_w, ty, ty - 34, f"{outer_w:.0f}")
    hdim(msp, ptx + wall, ptx + wall + pocket_w, pty + outer_d,
         pty + outer_d + 12, f"{pocket_w:.0f}")
    vdim(msp, ty, ty + base_d, tx + base_w, tx + base_w + 16, f"{base_d:.0f}")
    vdim(msp, pty, pty + outer_d, tx + base_w, tx + base_w + 34, f"{outer_d:.0f}")
    vdim(msp, pty + wall, pty + wall + pocket_d, tx, tx - 14, f"{pocket_d:.0f} ID")

    # ---- RIGHT SIDE VIEW ----
    sx, sy = 280.0, 30.0
    text(msp, "RIGHT SIDE VIEW", sx, sy + base_h + pocket_h + 40, 5, "TITLE")
    rect(msp, sx, sy, base_d, base_h)
    # Pocket block
    sy_off = oy_off
    rect(msp, sx + sy_off, sy + base_h, outer_d, pocket_h)
    # Inner opening
    rect(msp, sx + sy_off + wall, sy + base_h + lip_h, pocket_d, pocket_h - lip_h, "HIDDEN")
    # Slight back lean hint (2°) — draw back face vertical (near 90°)
    text(msp, "~90° VIEWING ANGLE", sx + 4, sy + base_h + pocket_h + 8, 2.8, "ANNOTATIONS")

    hdim(msp, sx, sx + base_d, sy, sy - 16, f"{base_d:.0f}")
    hdim(msp, sx + sy_off, sx + sy_off + outer_d, sy, sy - 34, f"{outer_d:.0f}")
    vdim(msp, sy, sy + base_h, sx, sx - 14, f"{base_h:.0f}")
    vdim(msp, sy + base_h, sy + base_h + pocket_h, sx + base_d, sx + base_d + 16,
         f"{pocket_h:.0f}")
    leader(msp, sx + sy_off + outer_d / 2, sy + base_h + lip_h / 2,
           sx + base_d + 40, sy + base_h + 25, "front stop / lip")

    text(msp, "NOTES", 280, -40, 4, "TITLE")
    text(msp, "• Cable notch at front wall for USB-C / Lightning", 280, -50, 2.8, "TEXT")
    text(msp, f"• Pocket ID sized for {PHONE_W:.0f}×{PHONE_T:.0f} mm phone+case", 280, -58, 2.8, "TEXT")
    text(msp, "• Add rubber pad recesses underside (optional)", 280, -66, 2.8, "TEXT")

    path.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(path)
    print(f"Wrote {path}")
    return path


# ---------------------------------------------------------------------------
# Design 03 — Dual-peg cradle (alternative)
# ---------------------------------------------------------------------------
def draw_design03(path: Path) -> Path:
    """Two upright pegs / posts with a front bar — phone leans in cradle."""
    base_w = 110.0
    base_d = 85.0
    base_h = 6.0
    peg_w = 12.0
    peg_d = 14.0
    peg_h = 70.0
    peg_gap = PHONE_W + 2.0  # clear between inner faces
    # Outer span of pegs
    peg_span = peg_gap + 2 * peg_w
    peg_x0 = (base_w - peg_span) / 2
    peg_y0 = 28.0  # from front of base
    bar_h = 10.0
    bar_d = 8.0
    bar_y = 8.0  # front bar from front edge
    lean = 12.0  # mm setback of peg tops (creates slight lean)

    doc = setup_doc()
    msp = doc.modelspace()
    title_block(
        msp,
        "DESIGN 03 — Dual-Peg Cradle (ALTERNATIVE)",
        "Two posts + front stop bar. Orthographic: Front / Top / Left Side.",
        0,
        300,
    )
    drawbacks_block(
        msp,
        [
            "Open cradle scratches soft cases; phone can rattle between pegs.",
            "No accessory tray / card tiers / pen cup — limited everyday utility.",
        ],
        0,
        260,
    )
    layer_legend(msp, 520, 280)

    # ---- FRONT VIEW ----
    fx, fy = 40.0, 30.0
    text(msp, "FRONT VIEW", fx, fy + peg_h + 40, 5, "TITLE")
    rect(msp, fx, fy, base_w, base_h)
    # Front bar
    rect(msp, fx + peg_x0, fy + base_h, peg_span, bar_h)
    # Pegs
    rect(msp, fx + peg_x0, fy + base_h, peg_w, peg_h)
    rect(msp, fx + peg_x0 + peg_w + peg_gap, fy + base_h, peg_w, peg_h)
    # Phone between pegs
    rect(
        msp,
        fx + peg_x0 + peg_w,
        fy + base_h + bar_h,
        peg_gap,
        PHONE_H * 0.45,
        "PHONE_REF",
    )
    text(msp, "PHONE", fx + peg_x0 + peg_w + 8, fy + base_h + bar_h + 6, 2.5, "PHONE_REF")

    hdim(msp, fx, fx + base_w, fy, fy - 16, f"{base_w:.0f}")
    hdim(msp, fx + peg_x0, fx + peg_x0 + peg_span, fy, fy - 34, f"{peg_span:.0f} peg span")
    hdim(msp, fx + peg_x0 + peg_w, fx + peg_x0 + peg_w + peg_gap,
         fy + base_h + peg_h, fy + base_h + peg_h + 14,
         f"{peg_gap:.0f} clear (= phone W + 2)")
    hdim(msp, fx + peg_x0, fx + peg_x0 + peg_w, fy + base_h + peg_h,
         fy + base_h + peg_h + 30, f"{peg_w:.0f}")
    vdim(msp, fy, fy + base_h, fx, fx - 14, f"{base_h:.0f}")
    vdim(msp, fy + base_h, fy + base_h + bar_h, fx, fx - 14, f"{bar_h:.0f} bar")
    vdim(msp, fy + base_h, fy + base_h + peg_h, fx + base_w, fx + base_w + 16,
         f"{peg_h:.0f}")
    leader(msp, fx + peg_x0 + peg_span, fy + base_h + peg_h * 0.7,
           fx + base_w + 40, fy + base_h + peg_h * 0.7 + 10, "left/right pegs")

    # ---- TOP VIEW ----
    tx, ty = 40.0, -150.0
    text(msp, "TOP VIEW", tx, ty + base_d + 22, 5, "TITLE")
    rect(msp, tx, ty, base_w, base_d)
    # Front bar
    rect(msp, tx + peg_x0, ty + bar_y, peg_span, bar_d)
    text(msp, "STOP BAR", tx + peg_x0 + 4, ty + bar_y + 2, 2.4, "ANNOTATIONS")
    # Peg footprints (with lean shown as offset rectangles — top vs bottom)
    # Bottom of pegs
    rect(msp, tx + peg_x0, ty + peg_y0, peg_w, peg_d)
    rect(msp, tx + peg_x0 + peg_w + peg_gap, ty + peg_y0, peg_w, peg_d)
    # Top of pegs shifted rearward (lean)
    rect(msp, tx + peg_x0, ty + peg_y0 + lean, peg_w, peg_d, "HIDDEN")
    rect(msp, tx + peg_x0 + peg_w + peg_gap, ty + peg_y0 + lean, peg_w, peg_d, "HIDDEN")
    text(msp, "PEG TOP (lean)", tx + peg_x0 + peg_span + 4, ty + peg_y0 + lean + 2, 2.4, "ANNOTATIONS")

    hdim(msp, tx, tx + base_w, ty, ty - 16, f"{base_w:.0f}")
    vdim(msp, ty, ty + base_d, tx + base_w, tx + base_w + 16, f"{base_d:.0f}")
    vdim(msp, ty, ty + bar_y, tx, tx - 14, f"{bar_y:.0f}")
    vdim(msp, ty + bar_y, ty + bar_y + bar_d, tx, tx - 14, f"{bar_d:.0f}")
    vdim(msp, ty + peg_y0, ty + peg_y0 + peg_d, tx + base_w, tx + base_w + 34, f"{peg_d:.0f}")
    hdim(msp, tx + peg_x0, tx + peg_x0 + peg_w, ty + peg_y0 + peg_d,
         ty + peg_y0 + peg_d + 14, f"{peg_w:.0f}")
    leader(msp, tx + peg_x0 + peg_w / 2, ty + peg_y0 + peg_d,
           tx - 30, ty + peg_y0 + peg_d + 25, f"lean offset {lean:.0f}")

    # ---- LEFT SIDE VIEW ----
    sx, sy = 300.0, 30.0
    text(msp, "LEFT SIDE VIEW", sx, sy + peg_h + 40, 5, "TITLE")
    rect(msp, sx, sy, base_d, base_h)
    # Front bar
    rect(msp, sx + bar_y, sy + base_h, bar_d, bar_h)
    # Peg profile with lean (parallelogram)
    peg_front = sx + peg_y0
    pts = [
        (peg_front, sy + base_h),
        (peg_front + peg_d, sy + base_h),
        (peg_front + peg_d + lean, sy + base_h + peg_h),
        (peg_front + lean, sy + base_h + peg_h),
    ]
    msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "OUTLINE"})
    # Phone lean line
    line(
        msp,
        sx + bar_y + bar_d,
        sy + base_h + bar_h,
        peg_front + lean,
        sy + base_h + peg_h,
        "PHONE_REF",
    )
    text(msp, "PHONE LEAN", sx + bar_y + bar_d + 4, sy + base_h + peg_h * 0.5, 2.5, "PHONE_REF")

    hdim(msp, sx, sx + base_d, sy, sy - 16, f"{base_d:.0f}")
    hdim(msp, peg_front, peg_front + peg_d, sy, sy - 34, f"{peg_d:.0f}")
    hdim(msp, peg_front + peg_d, peg_front + peg_d + lean, sy + base_h + peg_h,
         sy + base_h + peg_h + 12, f"{lean:.0f} lean")
    vdim(msp, sy, sy + base_h, sx, sx - 14, f"{base_h:.0f}")
    vdim(msp, sy + base_h, sy + base_h + peg_h, sx + base_d, sx + base_d + 16,
         f"{peg_h:.0f}")

    text(msp, "NOTES", 300, -40, 4, "TITLE")
    text(msp, "• Peg tops lean rearward ~10° for light recline", 300, -50, 2.8, "TEXT")
    text(msp, f"• Clear gap {peg_gap:.0f} mm for average phone width {PHONE_W:.0f} mm", 300, -58, 2.8, "TEXT")
    text(msp, "• Open sides — not secure in a bag / travel use", 300, -66, 2.8, "TEXT")

    path.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(path)
    print(f"Wrote {path}")
    return path


# ---------------------------------------------------------------------------
# Design 04 — Multi-organizer phone stand (PRIMARY — from reference photo)
# ---------------------------------------------------------------------------
def draw_design04(path: Path) -> Path:
    """Integrated desk organizer matching the reference product photo.

    Layout (plan):
      LEFT  : angled phone stand + triangular side support + front lip
      FRONT : shallow accessory tray
      MID   : two tiered card / sticky-note pockets
      REAR  : tall pen / marker bin
    """
    # Overall envelope sized around average phone + organizer zones
    W = 200.0   # overall width
    D = 155.0   # overall depth
    base_h = 6.0
    wall = 3.0

    # Phone stand zone (left)
    stand_w = 88.0          # > PHONE_W
    angle_deg = 65.0        # from horizontal (matches photo ~60–70°)
    angle = math.radians(angle_deg)
    rest_len = 100.0        # along incline — supports phone body
    rest_t = 4.0
    lip_d = 12.0
    lip_h = 8.0
    rest_h = rest_len * math.sin(angle)
    rest_horiz = rest_len * math.cos(angle)

    # Right organizer zone
    right_w = W - stand_w
    # Pen bin (rear right)
    bin_w = 48.0
    bin_d = 42.0
    bin_h = 72.0
    # Tiered card holders (in front of bin)
    tier1_h = 28.0   # front tier wall
    tier2_h = 42.0   # rear tier wall
    tier_d = 22.0    # depth of each pocket step
    # Shallow tray (front of right zone)
    tray_d = D - bin_d - 2 * tier_d - wall  # remaining front depth
    tray_depth_recess = 12.0  # how deep the tray floor sinks

    doc = setup_doc()
    msp = doc.modelspace()
    title_block(
        msp,
        "DESIGN 04 — Multi-Organizer Phone Stand (PRIMARY)",
        "Angled stand + tray + card tiers + pen bin. Orthographic: Front / Top / Left / Right.",
        0,
        420,
    )
    text(msp, "PRIMARY DESIGN — based on reference desk organizer photo", 0, 385, 3.2, "ANNOTATIONS")
    text(
        msp,
        "Advantages: stable wide base, comfortable viewing angle, multi-function storage for pens/cards/small parts.",
        0,
        376,
        2.8,
        "TEXT",
    )
    layer_legend(msp, 620, 400)

    # =====================================================================
    # FRONT VIEW  (looking from front; left = phone stand, right = organizer)
    # =====================================================================
    fx, fy = 40.0, 80.0
    text(msp, "FRONT VIEW", fx, fy + bin_h + 36, 5, "TITLE")

    # Base
    rect(msp, fx, fy, W, base_h)

    # Phone stand lip + backrest apparent height
    rect(msp, fx, fy + base_h, stand_w, lip_h)  # lip face
    rect(msp, fx, fy + base_h, stand_w, rest_h)  # stand body silhouette
    # Triangular side wall hint as diagonal on left edge
    line(msp, fx, fy + base_h, fx, fy + base_h + rest_h, "OUTLINE")

    # Shallow tray front wall (low)
    tray_front_h = base_h  # tray floor recess shown separately
    # Tray visible as low front edge of right zone
    rect(msp, fx + stand_w, fy + base_h, right_w, 4.0)

    # Tier fronts (stepped heights)
    # Front tier sits behind tray — visible as mid-height wall
    tier_front_x = fx + stand_w
    rect(msp, tier_front_x, fy + base_h, right_w, tier1_h)
    # Rear tier taller
    rect(msp, tier_front_x, fy + base_h, right_w, tier2_h)
    # Pen bin tallest on far right
    bin_x = fx + W - bin_w - wall
    # Actually bin is full right-rear; from front we see its front face full height
    # Simplify: pen bin occupies rightmost portion
    bin_front_x = fx + W - bin_w
    rect(msp, bin_front_x, fy + base_h, bin_w, bin_h)
    # Inner bin
    rect(
        msp,
        bin_front_x + wall,
        fy + base_h + wall,
        bin_w - 2 * wall,
        bin_h - wall,
        "HIDDEN",
    )

    # Phone reference on stand
    phone_vis_h = PHONE_H * 0.5
    rect(
        msp,
        fx + (stand_w - PHONE_W) / 2,
        fy + base_h + lip_h,
        PHONE_W,
        phone_vis_h,
        "PHONE_REF",
    )
    text(msp, "PHONE", fx + 10, fy + base_h + lip_h + 6, 2.5, "PHONE_REF")

    # Front dimensions
    hdim(msp, fx, fx + W, fy, fy - 18, f"{W:.0f} OVERALL W")
    hdim(msp, fx, fx + stand_w, fy, fy - 36, f"{stand_w:.0f} stand")
    hdim(msp, fx + stand_w, fx + W, fy, fy - 36, f"{right_w:.0f} organizer")
    hdim(msp, bin_front_x, bin_front_x + bin_w, fy + base_h + bin_h,
         fy + base_h + bin_h + 14, f"{bin_w:.0f} pen bin")
    hdim(
        msp,
        fx + (stand_w - PHONE_W) / 2,
        fx + (stand_w - PHONE_W) / 2 + PHONE_W,
        fy + base_h + lip_h + phone_vis_h,
        fy + base_h + lip_h + phone_vis_h + 12,
        f"{PHONE_W:.0f} phone",
    )
    vdim(msp, fy, fy + base_h, fx, fx - 16, f"{base_h:.0f}")
    vdim(msp, fy + base_h, fy + base_h + lip_h, fx, fx - 16, f"{lip_h:.0f} lip")
    vdim(msp, fy + base_h, fy + base_h + rest_h, fx, fx - 34, f"{rest_h:.0f} stand H")
    vdim(msp, fy + base_h, fy + base_h + tier1_h, fx + stand_w + 20, fx + stand_w + 36,
         f"{tier1_h:.0f} tier1")
    vdim(msp, fy + base_h, fy + base_h + tier2_h, fx + stand_w + 20, fx + stand_w + 54,
         f"{tier2_h:.0f} tier2")
    vdim(msp, fy + base_h, fy + base_h + bin_h, fx + W, fx + W + 18, f"{bin_h:.0f} bin H")

    leader(msp, fx + stand_w / 2, fy + base_h + rest_h * 0.75,
           fx - 10, fy + base_h + rest_h + 25, "phone backrest")
    leader(msp, bin_front_x + bin_w / 2, fy + base_h + bin_h * 0.85,
           fx + W + 50, fy + base_h + bin_h + 5, "pen / marker bin")
    leader(msp, fx + stand_w + right_w * 0.35, fy + base_h + tier1_h,
           fx + W + 50, fy + base_h + tier1_h - 10, "tiered card pockets")

    # =====================================================================
    # TOP VIEW
    # =====================================================================
    tx, ty = 40.0, -220.0
    text(msp, "TOP VIEW", tx, ty + D + 28, 5, "TITLE")

    # Outer footprint
    rect(msp, tx, ty, W, D)

    # --- Left: phone stand ---
    # Lip at front
    rect(msp, tx, ty, stand_w, lip_d)
    text(msp, "LIP", tx + 4, ty + 3, 2.5, "ANNOTATIONS")
    # Inclined plate projection
    plate_front = ty + lip_d
    plate_rear = plate_front + rest_horiz
    # Clamp plate_rear within stand depth
    plate_rear = min(plate_rear, ty + D - wall)
    rect(msp, tx, plate_front, stand_w, plate_rear - plate_front)
    # Side support triangle (plan): wall along left and a diagonal support zone
    line(msp, tx + stand_w, ty, tx + stand_w, ty + D, "OUTLINE")  # divider
    # Support wall along rear of stand zone connecting to organizer
    # Phone footprint
    pfx = tx + (stand_w - PHONE_W) / 2
    rect(msp, pfx, plate_front + 8, PHONE_W, PHONE_T + 2, "PHONE_REF")
    text(msp, "PHONE", pfx + 4, plate_front + 10, 2.4, "PHONE_REF")

    # --- Right: tray / tiers / bin ---
    rx = tx + stand_w
    # Shallow tray (front)
    tray_h_plan = max(tray_d, 35.0)
    # Recompute zones from rear for clarity:
    # Rear: pen bin
    bin_y = ty + D - bin_d
    rect(msp, rx + right_w - bin_w, bin_y, bin_w, bin_d)
    rect(
        msp,
        rx + right_w - bin_w + wall,
        bin_y + wall,
        bin_w - 2 * wall,
        bin_d - 2 * wall,
        "HIDDEN",
    )
    text(msp, "PEN BIN", rx + right_w - bin_w + 4, bin_y + bin_d / 2 - 2, 2.6, "ANNOTATIONS")

    # Extend bin wall to full right-zone width at rear? Photo shows bin on back-right;
    # card tiers occupy left portion of right zone behind tray.
    # Tier 2 (rear tier pocket) in front of bin
    tier2_y = bin_y - tier_d
    rect(msp, rx, tier2_y, right_w - bin_w, tier_d)  # left of bin
    # Also a pocket strip across if bin doesn't span full width — draw pocket floor
    rect(msp, rx, tier2_y, right_w, tier_d, "HIDDEN")
    text(msp, "CARD TIER 2", rx + 4, tier2_y + 6, 2.4, "ANNOTATIONS")

    # Tier 1 (front tier)
    tier1_y = tier2_y - tier_d
    rect(msp, rx, tier1_y, right_w, tier_d)
    text(msp, "CARD TIER 1", rx + 4, tier1_y + 6, 2.4, "ANNOTATIONS")

    # Shallow tray
    tray_y1 = ty
    tray_y2 = tier1_y
    rect(msp, rx, tray_y1, right_w, tray_y2 - tray_y1)
    # Recessed floor inset
    inset = wall
    if tray_y2 - tray_y1 > 2 * inset:
        rect(
            msp,
            rx + inset,
            tray_y1 + inset,
            right_w - 2 * inset,
            tray_y2 - tray_y1 - 2 * inset,
            "HIDDEN",
        )
    text(msp, "SHALLOW TRAY", rx + 8, (tray_y1 + tray_y2) / 2 - 2, 2.6, "ANNOTATIONS")

    # Top dims
    hdim(msp, tx, tx + W, ty, ty - 18, f"{W:.0f}")
    hdim(msp, tx, tx + stand_w, ty, ty - 36, f"{stand_w:.0f}")
    hdim(msp, rx, rx + right_w, ty, ty - 36, f"{right_w:.0f}")
    hdim(msp, rx + right_w - bin_w, rx + right_w, ty + D, ty + D + 14, f"{bin_w:.0f}")
    vdim(msp, ty, ty + D, tx + W, tx + W + 18, f"{D:.0f} OVERALL D")
    vdim(msp, ty, ty + lip_d, tx, tx - 16, f"{lip_d:.0f} lip")
    vdim(msp, plate_front, plate_rear, tx, tx - 34, f"{plate_rear - plate_front:.0f} rest proj.")
    vdim(msp, tray_y1, tray_y2, tx + W, tx + W + 36, f"{tray_y2 - tray_y1:.0f} tray D")
    vdim(msp, tier1_y, tier1_y + tier_d, tx + W, tx + W + 54, f"{tier_d:.0f} tier")
    vdim(msp, bin_y, bin_y + bin_d, tx + W, tx + W + 72, f"{bin_d:.0f} bin D")

    leader(msp, pfx + PHONE_W / 2, plate_front + 8, tx - 25, ty + D + 10,
           "phone seat on incline")
    leader(msp, rx + right_w / 2, (tray_y1 + tray_y2) / 2,
           tx + W + 90, ty + 20, f"tray recess {tray_depth_recess:.0f} deep")

    # =====================================================================
    # LEFT SIDE VIEW  (phone stand angle clearly visible)
    # =====================================================================
    sx, sy = 420.0, 80.0
    text(msp, "LEFT SIDE VIEW", sx, sy + max(rest_h, bin_h) + 36, 5, "TITLE")

    # Base
    rect(msp, sx, sy, D, base_h)

    # Lip at front (+X = front)
    rect(msp, sx + D - lip_d, sy + base_h, lip_d, lip_h)

    # Inclined backrest
    ix0 = sx + D - lip_d
    iy0 = sy + base_h + lip_h
    ix1 = ix0 - rest_horiz
    iy1 = iy0 + rest_h - lip_h  # rest_h measured from base top in front view;
    # Keep consistent: plate rises rest_h from base top along sin
    iy1 = sy + base_h + rest_h
    nx = rest_t * math.sin(angle)
    ny = -rest_t * math.cos(angle)
    msp.add_lwpolyline(
        [(ix0, iy0), (ix1, iy1), (ix1 + nx, iy1 + ny), (ix0 + nx, iy0 + ny)],
        close=True,
        dxfattribs={"layer": "OUTLINE"},
    )
    # Triangular support under plate
    msp.add_lwpolyline(
        [
            (sx + D - lip_d, sy + base_h),
            (ix0, iy0),
            (ix1, iy1),
            (ix1, sy + base_h),
        ],
        close=True,
        dxfattribs={"layer": "HIDDEN"},
    )
    # Angle arc
    msp.add_arc((ix0, sy + base_h), 30, 180 - angle_deg, 180, dxfattribs={"layer": "ANNOTATIONS"})
    text(msp, f"{angle_deg:.0f}°", ix0 - 38, sy + base_h + 8, 3.2, "ANNOTATIONS")

    # Rear organizer silhouette (bin / tiers visible behind stand in side view)
    # From left side, organizer is mostly hidden behind stand width — show as hidden outline
    # Pen bin at rear
    rect(msp, sx, sy + base_h, bin_d, bin_h, "HIDDEN")
    # Tier steps
    t2x = sx + bin_d
    rect(msp, t2x, sy + base_h, tier_d, tier2_h, "HIDDEN")
    t1x = t2x + tier_d
    rect(msp, t1x, sy + base_h, tier_d, tier1_h, "HIDDEN")

    hdim(msp, sx, sx + D, sy, sy - 18, f"{D:.0f}")
    hdim(msp, sx + D - lip_d, sx + D, sy, sy - 36, f"{lip_d:.0f}")
    hdim(msp, ix1, ix0, sy + base_h + rest_h, sy + base_h + rest_h + 14,
         f"{rest_horiz:.0f} horiz. proj.")
    vdim(msp, sy, sy + base_h, sx, sx - 16, f"{base_h:.0f}")
    vdim(msp, sy + base_h, sy + base_h + lip_h, sx + D, sx + D + 16, f"{lip_h:.0f}")
    vdim(msp, sy, iy1, sx, sx - 34, f"{base_h + rest_h:.0f} stand H")
    leader(msp, (ix0 + ix1) / 2 + 2, (iy0 + iy1) / 2,
           sx + D + 45, iy1 + 5, f"backrest {rest_len:.0f} lg × {rest_t:.0f} thk")
    leader(msp, sx + bin_d / 2, sy + base_h + bin_h,
           sx - 20, sy + base_h + bin_h + 20, "pen bin (hidden)")

    # =====================================================================
    # RIGHT SIDE VIEW  (tiers + pen bin profile)
    # =====================================================================
    rxv, ry = 700.0, 80.0
    text(msp, "RIGHT SIDE VIEW", rxv, ry + bin_h + 36, 5, "TITLE")

    rect(msp, rxv, ry, D, base_h)

    # From right side: front is +X
    # Tray at front
    tray_len = tray_y2 - tray_y1  # same as plan
    # Use computed zones from rear:
    # rear bin
    rect(msp, rxv, ry + base_h, bin_d, bin_h)
    rect(msp, rxv + wall, ry + base_h + wall, bin_d - 2 * wall, bin_h - wall, "HIDDEN")
    # tier 2
    rect(msp, rxv + bin_d, ry + base_h, tier_d, tier2_h)
    # tier 1
    rect(msp, rxv + bin_d + tier_d, ry + base_h, tier_d, tier1_h)
    # Shallow tray at front — low front wall + recessed floor indication
    tray_start = rxv + bin_d + 2 * tier_d
    tray_len = D - bin_d - 2 * tier_d
    rect(msp, tray_start, ry + base_h, tray_len, 4.0)
    # Recess shown as hidden rectangle below the tray top edge
    rect(
        msp,
        tray_start + wall,
        ry + base_h - tray_depth_recess,
        max(tray_len - 2 * wall, 10),
        tray_depth_recess,
        "HIDDEN",
    )
    text(msp, "TRAY", tray_start + 6, ry + base_h + 6, 2.5, "ANNOTATIONS")
    text(msp, "TIER1", rxv + bin_d + tier_d + 2, ry + base_h + tier1_h + 3, 2.4, "ANNOTATIONS")
    text(msp, "TIER2", rxv + bin_d + 2, ry + base_h + tier2_h + 3, 2.4, "ANNOTATIONS")
    text(msp, "BIN", rxv + 8, ry + base_h + bin_h + 4, 2.6, "ANNOTATIONS")

    # Phone stand hidden behind (dashed)
    ix0r = rxv + D - lip_d
    iy0r = ry + base_h + lip_h
    ix1r = ix0r - rest_horiz
    iy1r = ry + base_h + rest_h
    line(msp, ix0r, iy0r, ix1r, iy1r, "HIDDEN")
    rect(msp, rxv + D - lip_d, ry + base_h, lip_d, lip_h, "HIDDEN")

    hdim(msp, rxv, rxv + D, ry, ry - 18, f"{D:.0f}")
    hdim(msp, rxv, rxv + bin_d, ry, ry - 36, f"{bin_d:.0f}")
    hdim(msp, rxv + bin_d, rxv + bin_d + tier_d, ry, ry - 36, f"{tier_d:.0f}")
    hdim(msp, rxv + bin_d + tier_d, rxv + bin_d + 2 * tier_d, ry, ry - 54, f"{tier_d:.0f}")
    hdim(msp, tray_start, tray_start + tray_len, ry, ry - 36, f"{tray_len:.0f} tray")
    vdim(msp, ry, ry + base_h, rxv, rxv - 16, f"{base_h:.0f}")
    vdim(msp, ry + base_h, ry + base_h + tier1_h, rxv + D, rxv + D + 16, f"{tier1_h:.0f}")
    vdim(msp, ry + base_h, ry + base_h + tier2_h, rxv + D, rxv + D + 34, f"{tier2_h:.0f}")
    vdim(msp, ry + base_h, ry + base_h + bin_h, rxv, rxv - 34, f"{bin_h:.0f}")
    leader(msp, rxv + bin_d / 2, ry + base_h + bin_h * 0.6,
           rxv - 40, ry + base_h + bin_h * 0.6 + 20, f"inner wall {wall:.0f}")
    leader(
        msp,
        tray_start + tray_len / 2,
        ry + base_h + 2,
        rxv + D + 40,
        ry + 40,
        f"recess ≈ {tray_depth_recess:.0f} deep",
    )

    # Bill of key dimensions / notes
    text(msp, "KEY DIMENSIONS / FIT", 40, -280, 4, "TITLE")
    notes = [
        f"• Designed for average phone + slim case: {PHONE_W:.0f} × {PHONE_H:.0f} × {PHONE_T:.0f} mm",
        f"• Phone stand clear width {stand_w:.0f} mm (>+{stand_w - PHONE_W:.0f} mm side clearance)",
        f"• Backrest angle {angle_deg:.0f}° from horizontal (~{90 - angle_deg:.0f}° from vertical) for viewing / video",
        f"• Lip {lip_d:.0f} × {lip_h:.0f} mm prevents slide-off; works in portrait (primary) or landscape",
        f"• Pen bin ID ≈ {bin_w - 2 * wall:.0f} × {bin_d - 2 * wall:.0f} × {bin_h - wall:.0f} mm (5–8 pens)",
        f"• Card tiers pocket depth {tier_d:.0f} mm each — business cards / sticky notes",
        f"• Shallow tray recess {tray_depth_recess:.0f} mm — coins, clips, USB drives",
        "• Suggested print: PETG or PLA+, 3 walls, 15–20% infill; print on base",
        "• Optional: add cable notch in lip center (10 mm) for charging while docked",
    ]
    for i, n in enumerate(notes):
        text(msp, n, 40, -292 - i * 7, 2.7, "TEXT")

    path.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(path)
    print(f"Wrote {path}")
    return path


# ---------------------------------------------------------------------------
# Combined overview sheet
# ---------------------------------------------------------------------------
def draw_combined(path: Path) -> Path:
    """Single DXF with all four designs summarized + sheet index."""
    doc = setup_doc()
    msp = doc.modelspace()

    text(msp, "PHONE HOLDER CONCEPTS — ORTHOGRAPHIC DXF SET", 0, 200, 9, "TITLE")
    text(
        msp,
        f"Reference phone (average with slim case): {PHONE_W:.0f} W × {PHONE_H:.0f} H × {PHONE_T:.0f} T mm",
        0,
        186,
        3.5,
        "TEXT",
    )
    text(msp, "Units: millimetres  |  Scale 1:1 on each detail sheet  |  Layers separate geometry from annotations", 0, 176, 3.0, "TEXT")

    layer_legend(msp, 520, 190)

    # Index table
    text(msp, "SHEET INDEX", 0, 150, 5, "TITLE")
    rows = [
        ("01", "design01_minimal_wedge.dxf", "Minimal wedge stand", "ALTERNATIVE"),
        ("02", "design02_vertical_pocket.dxf", "Vertical pocket dock", "ALTERNATIVE"),
        ("03", "design03_dual_peg_cradle.dxf", "Dual-peg cradle", "ALTERNATIVE"),
        ("04", "design04_multi_organizer.dxf", "Multi-organizer phone stand", "PRIMARY"),
    ]
    y = 138
    text(msp, "No.", 0, y, 3.2, "ANNOTATIONS")
    text(msp, "File", 30, y, 3.2, "ANNOTATIONS")
    text(msp, "Concept", 230, y, 3.2, "ANNOTATIONS")
    text(msp, "Role", 430, y, 3.2, "ANNOTATIONS")
    line(msp, 0, y - 3, 500, y - 3, "OUTLINE")
    for i, (num, fn, concept, role) in enumerate(rows):
        yy = y - 14 - i * 12
        text(msp, num, 0, yy, 3.0, "TEXT")
        text(msp, fn, 30, yy, 3.0, "TEXT")
        text(msp, concept, 230, yy, 3.0, "TEXT")
        text(msp, role, 430, yy, 3.0, "ANNOTATIONS" if role == "PRIMARY" else "TEXT")

    text(msp, "DRAWBACKS OF ALTERNATIVES (2 each)", 0, 60, 5, "TITLE")
    drows = [
        ("01 Minimal wedge", "1) No trays/pen/card storage — weak desk utility.",
         "2) Narrow base can tip with tall/heavy phones."),
        ("02 Vertical pocket", "1) Near-90° viewing angle — poor for video.",
         "2) Portrait-only; no organizer compartments."),
        ("03 Dual-peg cradle", "1) Soft cases can scuff / phone may rattle.",
         "2) No accessory tray, card tiers, or pen bin."),
    ]
    yy = 45
    for title, d1, d2 in drows:
        text(msp, title, 0, yy, 3.3, "ANNOTATIONS")
        text(msp, d1, 10, yy - 8, 2.8, "TEXT")
        text(msp, d2, 10, yy - 16, 2.8, "TEXT")
        yy -= 36

    text(msp, "WHY DESIGN 04 IS PRIMARY", 0, yy - 5, 5, "TITLE")
    pros = [
        "• Wide integrated base resists tipping when phone is docked",
        "• ~65° backrest gives a comfortable media / video viewing angle",
        "• Combines phone stand + shallow tray + card tiers + pen bin in one footprint",
        "• Sized around average phone width 78 mm with side clearance on an 88 mm stand",
    ]
    for i, p in enumerate(pros):
        text(msp, p, 0, yy - 18 - i * 8, 2.8, "TEXT")

    # Small plan thumbnails (schematic footprints)
    text(msp, "FOOTPRINT SCHEMATICS (not to detail-sheet scale)", 0, -80, 4, "TITLE")

    def thumb(x, y0, w, d, label):
        rect(msp, x, y0, w, d)
        text(msp, label, x, y0 + d + 4, 2.8, "TEXT")

    thumb(0, -200, 45, 48, "01 Wedge")
    thumb(70, -185, 50, 35, "02 Pocket")
    thumb(150, -195, 55, 42, "03 Pegs")
    # 04 more detailed mini plan
    x0, y0 = 240, -220
    rect(msp, x0, y0, 100, 78)
    rect(msp, x0, y0, 44, 78)  # stand
    rect(msp, x0, y0, 44, 8)   # lip
    rect(msp, x0 + 44, y0, 56, 28)  # tray
    rect(msp, x0 + 44, y0 + 28, 56, 12)  # tier1
    rect(msp, x0 + 44, y0 + 40, 56, 12)  # tier2
    rect(msp, x0 + 72, y0 + 52, 28, 26)  # bin
    text(msp, "04 Multi-organizer (PRIMARY)", x0, y0 + 82, 2.8, "ANNOTATIONS")

    path.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(path)
    print(f"Wrote {path}")
    return path


def main():
    files = [
        draw_design01(OUT / "design01_minimal_wedge.dxf"),
        draw_design02(OUT / "design02_vertical_pocket.dxf"),
        draw_design03(OUT / "design03_dual_peg_cradle.dxf"),
        draw_design04(OUT / "design04_multi_organizer.dxf"),
        draw_combined(OUT / "phone_holders_index.dxf"),
    ]
    print("\nGenerated DXF files:")
    for f in files:
        print(f"  {f} ({f.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
