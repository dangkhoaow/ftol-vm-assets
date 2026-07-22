#!/usr/bin/env python3
"""GLB up-axis audit for the dinosaur-3d manifest (2026-07-22).

Flags models whose transform-aware bounding box has Y (world up) as the
dominant extent - the signature of a Y-forward / Z-up STL->glTF conversion
that renders standing on its tail in the viewer (forcing examples:
corythosaurus, daspletosaurus, maiasaura - fixed with manifest pitch=+pi/2).

Usage: python3 glb-orientation-audit.py [manifest-dir]   # default: parent dir
Exit 0 = clean, 1 = suspects found (fix: set "pitch": 1.5707963267948966 on
the manifest entry, then VERIFY with a viewer screenshot - the sign can be
wrong per model; -pi/2 renders belly-up).

NOTE: the viewer applies yaw/pitch to the OBJECT BEFORE the scale/centre/
ground pass (rotate-before-normalize, shipped 2026-07-22). This audit checks
RAW geometry, so a model already corrected via manifest pitch still flags
here - cross-check `pitch_set` in the output before re-flagging.
"""
import json, struct, os, sys, itertools

D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..")
models = json.load(open(os.path.join(D, "manifest.json")))["models"]

def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]

def node_matrix(n):
    if "matrix" in n:
        m = n["matrix"]
        return [[m[j * 4 + i] for j in range(4)] for i in range(4)]
    t = n.get("translation", [0, 0, 0]); q = n.get("rotation", [0, 0, 0, 1]); s = n.get("scale", [1, 1, 1])
    x, y, z, w = q
    R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[R[i][j] * s[j] for j in range(3)] + [t[i]] for i in range(3)] + [[0, 0, 0, 1]]

suspects = []
for name, entry in sorted(models.items()):
    f = os.path.join(D, entry["file"])
    if not os.path.exists(f):
        print(f"MISSING-FILE {name}"); continue
    with open(f, "rb") as fh:
        fh.read(12); ln = struct.unpack("<I", fh.read(4))[0]; fh.read(4)
        js = json.loads(fh.read(ln))
    lo = [1e18] * 3; hi = [-1e18] * 3
    def visit(ni, M):
        n = js["nodes"][ni]
        M2 = mat_mul(M, node_matrix(n))
        if "mesh" in n:
            for p in js["meshes"][n["mesh"]]["primitives"]:
                ai = p.get("attributes", {}).get("POSITION")
                if ai is None: continue
                a = js["accessors"][ai]
                if "min" not in a: continue
                for c in itertools.product(*zip(a["min"], a["max"])):
                    v = [M2[i][0] * c[0] + M2[i][1] * c[1] + M2[i][2] * c[2] + M2[i][3] for i in range(3)]
                    for i in range(3):
                        lo[i] = min(lo[i], v[i]); hi[i] = max(hi[i], v[i])
        for ch in n.get("children", []): visit(ch, M2)
    I = [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]
    for sc in js.get("scenes", [{}]):
        for ni in sc.get("nodes", []): visit(ni, I)
    ext = [hi[i] - lo[i] for i in range(3)]
    x, y, z = ext
    if y >= 1.15 * max(x, z):
        pitch_set = "pitch" in entry or "yaw" in entry
        suspects.append((name, [round(v, 2) for v in ext], pitch_set))

print(f"{len(suspects)} suspect(s) of {len(models)} models")
for n, e, p in suspects:
    print(f"  {'OK(pitched)' if p else 'WRONG-UP  '} {n} ext(x,y,z)={e} pitch_set={p}")
sys.exit(1 if any(not p for _, _, p in suspects) else 0)
