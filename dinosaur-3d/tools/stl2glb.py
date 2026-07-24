"""Headless bare-.stl -> decimated .glb converter (Blender bpy, no material).

Usage: blender --background --python stl2glb.py -- <in.stl> <out.glb> \
           <rot_x_deg> <rot_y_deg> <rot_z_deg> [target_tris] [r] [g] [b]

For a bare STL with NO material/UV/texture baked in (unlike the .blend or
textured-OBJ sources blend2glb.py handles) - 3D-print STL exports carry no
"up axis" convention (their length axis is whatever orientation minimized
support material at print time), so orientation MUST be solved empirically
per-model: render the raw import from 3-4 candidate axis views (a quick,
heavily-decimated preview pass is enough), eyeball which one stands the
animal up correctly (feet down, dorsal up, head forward), and pass that
rotation in degrees as rot_x/rot_y/rot_z. See the elasmotherium vendoring
notes in licenses/CREDITS.txt for a full worked example (a +90deg rotation
about X was the fix for that specific uploader's convention - this is NOT
a universal constant per print-STL, re-derive it visually every time).

- Imports via bpy.ops.wm.stl_import (Blender 4.x STL importer).
- Applies the given rotation, then decimates to ~target_tris (default 20000).
- Assigns ONE flat Principled BSDF using the given RGB (default a neutral
  grey-brown, since a bare STL carries no color) - this is the honest-
  reconstruction "artistic, not fossil-accurate skin/color" default; tune
  per-species to match the published reconstruction's skin tone.
- Grounds the mesh (min-Z of the final bounding box -> Z=0) and centers X/Y
  at the origin, matching what blend2glb.py leaves to the d3dLoadModel
  runtime normalization pass - grounding here is a convenience, not load-
  bearing (the loader re-normalizes scale/position at runtime regardless).
- Exports Y-up GLB (export_yup=True) so no manifest pitch/yaw correction is
  needed downstream, PROVIDED the chosen rotation was verified correct.

ALWAYS render-prove the exported GLB headlessly (reimport + Eevee
screenshot, eyeball a recognizable, correctly-standing silhouette) before
vendoring - the rotation above is a guess until that render confirms it.
"""
import sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
src, dst = argv[0], argv[1]
rot_x, rot_y, rot_z = (float(argv[2]), float(argv[3]), float(argv[4]))
target_tris = int(argv[5]) if len(argv) > 5 else 20000
r = float(argv[6]) if len(argv) > 6 else 0.45
g = float(argv[7]) if len(argv) > 7 else 0.40
b = float(argv[8]) if len(argv) > 8 else 0.35

import math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=src)
obj = [o for o in bpy.data.objects if o.type == "MESH"][0]

obj.rotation_euler = (math.radians(rot_x), math.radians(rot_y), math.radians(rot_z))
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

before = len(obj.data.polygons)
print(f"tris_before={before}")
if before > target_tris:
    ratio = target_tris / before
    mod = obj.modifiers.new("dec", "DECIMATE")
    mod.ratio = ratio
    bpy.ops.object.modifier_apply(modifier="dec")
    print(f"decimate ratio={ratio:.6f} tris_after={len(obj.data.polygons)}")

mat = bpy.data.materials.new("flat_skin")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
bsdf.inputs["Roughness"].default_value = 0.9
obj.data.materials.clear()
obj.data.materials.append(mat)

bpy.context.view_layer.objects.active = obj
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
minz = min((obj.matrix_world @ v.co).z for v in obj.data.vertices)
obj.location = (0, 0, -minz)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

print("final dims:", tuple(round(d, 3) for d in obj.dimensions))

bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    export_apply=True,
    export_animations=False,
    export_skins=False,
    export_yup=True,
)
print("exported", dst)
