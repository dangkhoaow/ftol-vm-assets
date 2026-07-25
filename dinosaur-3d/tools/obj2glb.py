"""Headless bare-.obj -> decimated .glb converter (Blender bpy, no material).

Usage: blender --background --python obj2glb.py -- <in.obj> <out.glb> \
           <rot_x_deg> <rot_y_deg> <rot_z_deg> [target_tris] [r] [g] [b]

Mirrors stl2glb.py's doctrine for a bare, printable OBJ export (no UV/texture/
material baked in): the print-file's "up axis" is whatever orientation
minimized support material at slicing time, NOT a 3D-scene convention, so the
correct standing rotation MUST be solved empirically per-model (render a few
candidate axis views, eyeball which one stands the animal up correctly - feet
down, dorsal up, head forward/up - then pass that rotation in degrees).

- Imports via bpy.ops.wm.obj_import (Blender 4.x native OBJ importer).
- Applies the given rotation, then decimates to ~target_tris (default 20000).
- Assigns ONE flat Principled BSDF using the given RGB (a bare OBJ carries no
  color) - the honest "artistic, not fossil-accurate skin/color"
  reconstruction default; tune per-species to the published reconstruction's
  skin tone.
- Grounds the mesh (min-Z of final bbox -> Z=0) and centers X/Y at origin.
- Exports Y-up GLB (export_yup=True) so no manifest pitch/yaw correction is
  needed downstream, PROVIDED the chosen rotation was verified correct.

ALWAYS render-prove the exported GLB headlessly before vendoring.
"""
import sys
import math
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
src, dst = argv[0], argv[1]
rot_x, rot_y, rot_z = (float(argv[2]), float(argv[3]), float(argv[4]))
target_tris = int(argv[5]) if len(argv) > 5 else 20000
r = float(argv[6]) if len(argv) > 6 else 0.45
g = float(argv[7]) if len(argv) > 7 else 0.40
b = float(argv[8]) if len(argv) > 8 else 0.35

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=src)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
if len(meshes) > 1:
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
obj = meshes[0]

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
