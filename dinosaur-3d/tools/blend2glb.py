"""Headless .blend -> decimated .glb converter (bpy module).
Usage: python blend2glb.py <in.blend> <out.glb> [target_tris]
- Removes cameras/lights, keeps meshes.
- Rebuilds each material as a single Principled BSDF using the color found in
  its legacy BSDF_DIFFUSE node (old Cycles mix-shader graphs don't map to glTF
  and export white otherwise).
- Decimates every mesh proportionally so the scene total is ~target_tris.
"""
import sys
import bpy

src, dst = sys.argv[1], sys.argv[2]
target_tris = int(sys.argv[3]) if len(sys.argv) > 3 else 20000

bpy.ops.wm.open_mainfile(filepath=src)

for obj in list(bpy.data.objects):
    if obj.type in {"CAMERA", "LIGHT", "SPEAKER", "CURVE", "EMPTY"}:
        bpy.data.objects.remove(obj, do_unlink=True)

# Rebuild materials: legacy diffuse color -> Principled base color.
for mat in bpy.data.materials:
    color = None
    if mat.use_nodes:
        for n in mat.node_tree.nodes:
            if n.type == "BSDF_DIFFUSE":
                color = tuple(n.inputs["Color"].default_value)
                break
    if color is None:
        color = tuple(mat.diffuse_color)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.85
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    print(f"material {mat.name}: color={tuple(round(c,3) for c in color)}")

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
def tri_count():
    total = 0
    for o in meshes:
        m = o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
        m.calc_loop_triangles()
        total += len(m.loop_triangles)
    return total

before = tri_count()
print(f"meshes={len(meshes)} tris_before={before}")

if before > target_tris:
    ratio = target_tris / before
    for o in meshes:
        mod = o.modifiers.new("dec", "DECIMATE")
        mod.ratio = ratio
    print(f"decimate ratio={ratio:.4f}")

bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    export_apply=True,
    export_animations=False,
    export_skins=False,
    export_yup=True,
)
print("exported", dst)

# ---------------------------------------------------------------------------
# OPERATIONAL NOTES (2026-07-17, first used for spinosaurus + pteranodon):
# - Env: /opt/anaconda3/envs/bpy311 (python 3.11 + `pip install bpy`, Blender
#   5.0.1 as a module). Recreate with:
#     /opt/anaconda3/bin/conda create -n bpy311 python=3.11 -y
#     /opt/anaconda3/envs/bpy311/bin/pip install bpy
# - Usage: /opt/anaconda3/envs/bpy311/bin/python blend2glb.py in.blend out.glb [target_tris]
# - Legacy Cycles mix-shader materials export WHITE in glTF; this script
#   rebuilds each as a Principled BSDF from its BSDF_DIFFUSE color. For
#   image-textured/emission sources (e.g. the pteranodon), wire the texture to
#   a fresh Principled base color instead (see the pteranodon CREDITS note),
#   and reload images if the zip layout broke relative paths (img.reload()).
# - Rigged models export in bind pose; pick a display pose by assigning an
#   action + frame_set() before export (pteranodon: fly_glide frame 14).
# - ALWAYS render-prove the GLB headlessly against the real page camera before
#   vendoring, and record license/credit in sources.json + licenses/CREDITS.txt.
# ---------------------------------------------------------------------------
