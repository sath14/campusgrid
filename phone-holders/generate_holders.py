#!/usr/bin/env python3
"""Generate three 3D-printable phone holder STL designs with charging access."""

from pathlib import Path

import numpy as np
import trimesh
from trimesh.creation import box, cylinder

OUT = Path(__file__).resolve().parent
OUT.mkdir(parents=True, exist_ok=True)

# Typical modern phone with case (mm)
PHONE_W = 78
PHONE_T = 12
PHONE_H = 160


def export(mesh: trimesh.Trimesh, name: str) -> Path:
    mesh = mesh.copy()
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    if not mesh.is_watertight:
        # Keep printable solids even if repair is imperfect
        trimesh.repair.fix_normals(mesh)
    path = OUT / name
    mesh.export(path)
    print(f"Wrote {path}  faces={len(mesh.faces)}  watertight={mesh.is_watertight}")
    return path


def union(parts):
    parts = [p for p in parts if p is not None and len(p.faces)]
    result = parts[0]
    for p in parts[1:]:
        result = result.union(p)
    return result


def difference(base, cutters):
    result = base
    for c in cutters:
        if c is None or not len(c.faces):
            continue
        result = result.difference(c)
    return result


# ---------------------------------------------------------------------------
# Design 1 — desk phone stand + dual pencil holders (redo of user's design)
# Base 180 mm wide; hollow rect + cylinder cups (170 mm tall) act as the
# phone backrest; front lip; simple top cable groove (not a plus cutout).
# Flaws: vertical lean only; tall cups can tip a light base; groove is
# center-only; cups take desk space; no wireless pad.
# ---------------------------------------------------------------------------
def design1_l_stand() -> trimesh.Trimesh:
    # User specs (cm → mm)
    base_w = 180  # 18 cm
    base_d = 100
    base_h = 10  # from original drawing callout
    holder_h = 170  # 17 cm
    wall = 2.5

    # Rectangular pencil holder (left)
    rect_w, rect_d = 55, 42
    # Cylindrical pencil holder (right)
    cyl_r_outer = 22
    cyl_r_inner = cyl_r_outer - wall

    lip_h = 9
    lip_t = 6
    # Simple cable groove — cable lies in this slot (not a plus)
    groove_w = 8
    groove_depth = 4
    groove_len = base_d - 18  # runs front→back under phone area

    margin = 8
    # Place both holders at the rear so phone can lean on their front faces
    rect_x = -(base_w / 2) + margin + rect_w / 2
    rect_y = -(base_d / 2) + margin + rect_d / 2
    cyl_x = base_w / 2 - margin - cyl_r_outer
    cyl_y = -(base_d / 2) + margin + cyl_r_outer

    # Align front faces of both holders so the phone rests evenly
    holder_front_y = max(rect_y + rect_d / 2, cyl_y + cyl_r_outer)
    rect_y = holder_front_y - rect_d / 2
    cyl_y = holder_front_y - cyl_r_outer

    base = box([base_w, base_d, base_h])
    base.apply_translation([0, 0, base_h / 2])

    # --- Rectangular pencil cup (hollow, open top) ---
    rect_outer = box([rect_w, rect_d, holder_h])
    rect_outer.apply_translation([rect_x, rect_y, base_h + holder_h / 2])
    rect_inner = box([rect_w - 2 * wall, rect_d - 2 * wall, holder_h])
    # Leave a floor in the cup
    rect_inner.apply_translation([rect_x, rect_y, base_h + wall + (holder_h - wall) / 2])

    # --- Cylindrical pencil cup (hollow, open top) ---
    cyl_outer = cylinder(radius=cyl_r_outer, height=holder_h, sections=64)
    cyl_outer.apply_translation([cyl_x, cyl_y, base_h + holder_h / 2])
    cyl_inner = cylinder(radius=cyl_r_inner, height=holder_h, sections=64)
    cyl_inner.apply_translation([cyl_x, cyl_y, base_h + wall + (holder_h - wall) / 2])

    # Front lip — stops phone from sliding off
    lip = box([base_w, lip_t, lip_h])
    lip.apply_translation([0, base_d / 2 - lip_t / 2, base_h + lip_h / 2])

    body = union([base, rect_outer, cyl_outer, lip])
    body = difference(body, [rect_inner, cyl_inner])

    # Top groove in the base: cable lies inside (open upward, not a through-plus)
    groove = box([groove_w, groove_len, groove_depth + 0.2])
    groove.apply_translation(
        [0, (base_d / 2 - lip_t) - groove_len / 2 - 2, base_h - groove_depth / 2]
    )

    # Small lip gap so the cable can rise to the phone port
    lip_gap = box([groove_w, lip_t + 2, lip_h + 2])
    lip_gap.apply_translation([0, base_d / 2 - lip_t / 2, base_h + lip_h / 2])

    return difference(body, [groove, lip_gap])


# ---------------------------------------------------------------------------
# Design 2 — upright cradle trough (side walls + angled shelf)
# Flaws: portrait-only; fixed center cable slot; less stable for heavy phones;
# no wireless charging pad seat; near-vertical viewing angle.
# ---------------------------------------------------------------------------
def design2_cradle() -> trimesh.Trimesh:
    wall_t = 5
    cradle_w = PHONE_W + 6
    outer_w = cradle_w + 2 * wall_t
    depth = 55
    base_h = 8
    back_h = 90
    shelf_angle = np.deg2rad(12)

    base = box([outer_w, depth + 25, base_h])
    base.apply_translation([0, 5, base_h / 2])

    # Back plate
    back = box([outer_w, wall_t, back_h])
    back.apply_translation([0, -(depth / 2), base_h + back_h / 2])

    # Low side guides — tall enough to center the phone, short enough not to cover the screen
    side_h = 22
    left = box([wall_t, depth, side_h])
    left.apply_translation([-(outer_w / 2 - wall_t / 2), 0, base_h + side_h / 2])
    right = left.copy()
    right.apply_translation([outer_w - wall_t, 0, 0])

    # Front stop bar (lip only — does not block the display)
    stop = box([cradle_w, 4, 10])
    stop.apply_translation([0, depth / 2 - 2, base_h + 5])

    # Angled resting wedge inside cradle
    wedge = box([cradle_w - 1, depth - 8, 10])
    # Tip wedge by rotating around X then seating it
    R = trimesh.transformations.rotation_matrix(-shelf_angle, [1, 0, 0])
    wedge.apply_transform(R)
    wedge.apply_translation([0, -2, base_h + 8])

    body = union([base, back, left, right, stop, wedge])

    # Bottom-port cable access: slot through the deck under the phone
    floor_slot = box([14, 30, base_h + 6])
    floor_slot.apply_translation([0, 8, base_h / 2])

    # Front lip notch so the plug/cable can clear the stop
    lip_notch = box([14, 8, 14])
    lip_notch.apply_translation([0, depth / 2 - 2, base_h + 5])

    # Underside channel to route cable out the back
    channel = box([14, depth + 40, 5])
    channel.apply_translation([0, -5, 2.5])

    return difference(body, [floor_slot, lip_notch, channel])


# ---------------------------------------------------------------------------
# Design 3 — best: ergonomic angled stand + wireless pad recess + cable tunnel
# Stable wide base, ~18° recline, front lip with cable notch, rear cable exit,
# Qi/MagSafe-sized recess in the back face, rounded-ish silhouette via cylinders.
# ---------------------------------------------------------------------------
def design3_best() -> trimesh.Trimesh:
    angle = np.deg2rad(18)
    base_w = 110
    base_d = 100
    base_h = 12
    back_h = 130
    back_t = 10
    lip_h = 12
    lip_t = 7
    pad_d = 72  # MagSafe / common Qi coil diameter
    pad_depth = 2.2

    base = box([base_w, base_d, base_h])
    base.apply_translation([0, 0, base_h / 2])

    # Angled backrest — build vertical then rotate about front edge of back
    back = box([base_w - 10, back_t, back_h])
    # Pivot near bottom-front of back plate, then place on base rear
    pivot = trimesh.transformations.rotation_matrix(angle, [1, 0, 0])
    back.apply_translation([0, 0, back_h / 2])
    back.apply_transform(pivot)
    # After tilt, seat bottom of back on base, toward rear
    back.apply_translation([0, -(base_d / 2 - 22), base_h])

    # Side rails on backrest for phone edge guidance
    rail_h = 70
    rail = box([4, 6, rail_h])
    rail.apply_translation([0, 0, rail_h / 2])
    rail.apply_transform(pivot)
    left_rail = rail.copy()
    right_rail = rail.copy()
    left_rail.apply_translation([-(PHONE_W / 2 + 2), -(base_d / 2 - 18), base_h + 8])
    right_rail.apply_translation([PHONE_W / 2 + 2, -(base_d / 2 - 18), base_h + 8])

    # Front lip
    lip = box([base_w - 20, lip_t, lip_h])
    lip.apply_translation([0, base_d / 2 - lip_t / 2 - 8, base_h + lip_h / 2])

    # Soft front corners via cylinders blended as bumpers
    bumper_l = cylinder(radius=6, height=lip_h, sections=24)
    bumper_l.apply_translation(
        [-(base_w - 20) / 2, base_d / 2 - lip_t / 2 - 8, base_h + lip_h / 2]
    )
    bumper_r = bumper_l.copy()
    bumper_r.apply_translation([(base_w - 20), 0, 0])

    # Rear ballast block for anti-tip
    ballast = box([base_w, 28, 22])
    ballast.apply_translation([0, -(base_d / 2 - 14), base_h + 11])

    body = union([base, back, left_rail, right_rail, lip, bumper_l, bumper_r, ballast])

    # --- Charging features ---
    # 1) Cable notch in front lip (wired charging)
    lip_notch = box([16, lip_t + 8, lip_h + 6])
    lip_notch.apply_translation([0, base_d / 2 - lip_t / 2 - 8, base_h + lip_h / 2])

    # 2) Continuous tunnel under deck: front notch -> rear exit
    tunnel = box([16, base_d + 10, 7])
    tunnel.apply_translation([0, 0, 3.5])

    # 3) Wireless charger pad recess on the angled back face
    # Cut a shallow cylinder aligned with the back plane
    pad = cylinder(radius=pad_d / 2, height=pad_depth + 2, sections=64)
    # Orient pad normal to backrest (tilt same as back)
    pad.apply_transform(
        trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0])
    )
    pad.apply_transform(pivot)
    # Place roughly centered on phone body area of backrest
    pad.apply_translation([0, -(base_d / 2 - 18), base_h + 55])

    # 4) Cable exit slot at rear of ballast for pad lead or USB cable
    rear_slot = box([18, 20, 10])
    rear_slot.apply_translation([0, -(base_d / 2 - 6), 5])

    # 5) Small rubber-foot recesses (optional grip pads)
    feet = []
    for x, y in [
        (-base_w / 2 + 12, -base_d / 2 + 12),
        (base_w / 2 - 12, -base_d / 2 + 12),
        (-base_w / 2 + 12, base_d / 2 - 12),
        (base_w / 2 - 12, base_d / 2 - 12),
    ]:
        f = cylinder(radius=5, height=2.5, sections=24)
        f.apply_translation([x, y, 1.0])
        feet.append(f)

    return difference(body, [lip_notch, tunnel, pad, rear_slot, *feet])


def main():
    designs = [
        ("design1_l_stand_redo.stl", design1_l_stand),
        ("design2_upright_cradle.stl", design2_cradle),
        ("design3_best_angled_stand.stl", design3_best),
    ]
    for name, fn in designs:
        mesh = fn()
        export(mesh, name)


if __name__ == "__main__":
    main()
