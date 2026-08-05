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
# Design 1 — redo of the user's L-stand (front slab + backrest + lip)
# Flaws (documented in README): still 90° viewing angle; tall back can tip;
# cable slot is fixed to center; no wireless pad recess.
# ---------------------------------------------------------------------------
def design1_l_stand() -> trimesh.Trimesh:
    base_w = 95
    base_d = 85
    base_h = 10  # matches user's "10" thickness callout
    back_h = 115
    back_t = 8
    lip_h = 10
    lip_t = 6
    slot_w = 14  # charging cable / connector clearance
    slot_d = 28

    base = box([base_w, base_d, base_h])
    base.apply_translation([0, 0, base_h / 2])

    # Rectangular backrest (left portion of user's front-view pair)
    back_w = base_w - 28
    back = box([back_w, back_t, back_h])
    back.apply_translation(
        [-(base_w - back_w) / 2, -(base_d / 2 - back_t / 2), base_h + back_h / 2]
    )

    # Vertical cylindrical pillar on the right (matches user's front view)
    # Kept behind the phone plane so it does not block the resting face
    accent_r = 13
    accent = cylinder(radius=accent_r, height=back_h, sections=48)
    accent.apply_translation(
        [
            base_w / 2 - accent_r,
            -(base_d / 2 - accent_r),
            base_h + back_h / 2,
        ]
    )

    lip = box([base_w, lip_t, lip_h])
    lip.apply_translation([0, base_d / 2 - lip_t / 2, base_h + lip_h / 2])

    body = union([base, back, accent, lip])

    # Cable passthrough in base (front-to-back under phone resting area)
    slot = box([slot_w, slot_d + 20, base_h + 4])
    slot.apply_translation([0, 8, base_h / 2])

    # Vertical notch in lip so Lightning/USB-C cable can sit while phone rests
    lip_notch = box([slot_w, lip_t + 4, lip_h + 4])
    lip_notch.apply_translation([0, base_d / 2 - lip_t / 2, base_h + lip_h / 2])

    # Rear exit under backrest for cable routing off the desk edge
    rear_exit = box([slot_w, back_t + 8, 6])
    rear_exit.apply_translation([0, -(base_d / 2 - back_t / 2), 3])

    return difference(body, [slot, lip_notch, rear_exit])


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
