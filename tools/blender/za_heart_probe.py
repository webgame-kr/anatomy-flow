# Z-Anatomy 심실 메시가 벽(안·바깥 두 면)인지 내강(한 면)인지 검사 (개발 도구, 수업 범위 밖)
# 실행: blender --background --factory-startup --disable-autoexec <Startup.blend> --python tools/blender/za_heart_probe.py -- <out.json> <cx,cy,cz LV> <cx,cy,cz RV>
#   중심점은 BodyParts3D 내강 중심을 Z-Anatomy 좌표로 옮긴 값(m, Blender Z-up)
import bpy
import sys
import json
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]
centers = {'Left ventricle': Vector([float(x) for x in args[1].split(',')]), 'Right ventricle': Vector([float(x) for x in args[2].split(',')])}
dg = bpy.context.evaluated_depsgraph_get()
dirs = []
for x in (-1, 0, 1):
    for y in (-1, 0, 1):
        for z in (-1, 0, 1):
            if x or y or z:
                dirs.append(Vector((x + 0.013, y + 0.007, z + 0.011)).normalized())
res = {}
for name in ['Left ventricle', 'Right ventricle', 'Left atrium', 'Right atrium']:
    o = bpy.data.objects.get(name)
    if not o:
        res[name] = 'missing'
        continue
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(o.matrix_world)
    comps = 0
    seen = set()
    for v in bm.verts:
        if v.index in seen:
            continue
        comps += 1
        stack = [v]
        while stack:
            a = stack.pop()
            if a.index in seen:
                continue
            seen.add(a.index)
            for e in a.link_edges:
                stack.append(e.other_vert(a))
    boundary = sum(1 for e in bm.edges if e.is_boundary)
    vol = bm.calc_volume(signed=False)
    bvh = BVHTree.FromBMesh(bm)
    info = {'verts_eval': len(bm.verts), 'faces_eval': len(bm.faces), 'components': comps, 'boundary_edges': boundary, 'volume_ml': round(vol * 1e6, 1)}
    c = centers.get(name)
    if c is not None:
        hits = []
        thick = []
        for d in dirs:
            n = 0
            p = c.copy()
            first = None
            dists = []
            for _ in range(8):
                h = bvh.ray_cast(p, d, 0.3)
                if h[0] is None:
                    break
                n += 1
                dists.append((h[0] - c).length)
                p = h[0] + d * 1e-5
            hits.append(n)
            if len(dists) >= 2:
                thick.append(dists[1] - dists[0])
        info['center'] = list(c)
        info['inside_closed'] = bvh.find_nearest(c) is not None
        info['ray_hits'] = hits
        info['median_thickness_mm'] = round(sorted(thick)[len(thick) // 2] * 1000, 1) if thick else None
    res[name] = info
    bm.free()
    ev.to_mesh_clear()
json.dump(res, open(out, 'w', encoding='utf-8'), indent=1)
print('WROTE', out)
