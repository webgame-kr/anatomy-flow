# BodyParts3D 통합 심실 벽(FJ2428)을 좌심실 자유벽 / 우심실 자유벽 / 심실중격 영역으로 나누는 기하 분할 (개발 도구, 수업 범위 밖)
#
# 방법: 벽의 면마다 좌심실 내강(FJ2422)·우심실 내강(FJ2423)까지의 거리와 방향을 잰다.
#   - 두 내강 모두에 가깝고(둘 다 SEPTUM_MM 이내) 두 내강 사이에 있는 면 → 심실중격 영역
#     (거리만 쓰면 얇은 우심실 자유벽이 좌심실을 감싸는 곳까지 중격으로 잡혔다)
#   - 나머지는 더 가까운 내강 쪽 자유벽
# 한계: 해부학적 경계(앞·뒤 심실사이고랑)를 따른 분할이 아니라 거리 기준 근사다. GEOMETRY_DERIVED로 표시한다.
# 추가: 영역마다 Shape Key 'contract'(교육용 근사: 각 내강 중심 쪽으로 정점을 당김). 실제 심근 수축 모양이 아니다.
#
# 실행: blender --background --factory-startup --python tools/blender/split_ventricle_wall.py -- <extracted isa dir> <extracted partof dir> <out.glb> <report.json>
import bpy
import bmesh
import sys
import os
import json
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
ISA, PARTOF, OUT, REPORT = args[0], args[1], args[2], args[3]
SEPTUM_MM = 15.0
CONTRACT = {'lv_free': 0.12, 'rv_free': 0.15, 'septum': 0.05}   # 내강 중심 쪽으로 당기는 비율 (교육용 값)

bpy.ops.wm.read_factory_settings(use_empty=True)


def imp(path, name):
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=path, forward_axis='Y', up_axis='Z', global_scale=1.0)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    o = new[0]
    o.name = name
    return o


wall = imp(os.path.join(ISA, 'FJ2428.obj'), 'wall')
lv = imp(os.path.join(PARTOF, 'FJ2422.obj'), 'lv_cavity')
rv = imp(os.path.join(PARTOF, 'FJ2423.obj'), 'rv_cavity')


def bvh(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.transform(o.matrix_world)
    t = BVHTree.FromBMesh(bm)
    c = Vector()
    for v in bm.verts:
        c += v.co
    c /= len(bm.verts)
    bm.free()
    return t, c


tl, cl = bvh(lv)
tr, cr = bvh(rv)
bm = bmesh.new()
bm.from_mesh(wall.data)
bm.faces.ensure_lookup_table()
label = {}
counts = {'lv_free': 0, 'rv_free': 0, 'septum': 0}
for f in bm.faces:
    p = wall.matrix_world @ f.calc_center_median()
    nl = tl.find_nearest(p)[0] - p
    nr = tr.find_nearest(p)[0] - p
    dl = nl.length
    dr = nr.length
    # 중격: 두 내강이 모두 가깝고, 이 면이 두 내강 "사이"에 있다(가장 가까운 두 점의 방향이 반대)
    between = dl > 1e-6 and dr > 1e-6 and nl.normalized().dot(nr.normalized()) < -0.3
    if dl < SEPTUM_MM and dr < SEPTUM_MM and between:
        k = 'septum'
    else:
        k = 'lv_free' if dl < dr else 'rv_free'
    label[f.index] = k
    counts[k] += 1
total_area = sum(f.calc_area() for f in bm.faces)
areas = {k: sum(f.calc_area() for f in bm.faces if label[f.index] == k) for k in counts}
bm.free()

# 영역마다 새 객체로 복사
parts = {}
for k in counts:
    me = wall.data.copy()
    o = bpy.data.objects.new('heart_wall_' + k, me)
    bpy.context.scene.collection.objects.link(o)
    b = bmesh.new()
    b.from_mesh(me)
    b.faces.ensure_lookup_table()
    drop = [f for f in b.faces if label[f.index] != k]
    bmesh.ops.delete(b, geom=drop, context='FACES')
    loose = [v for v in b.verts if not v.link_faces]
    bmesh.ops.delete(b, geom=loose, context='VERTS')
    b.to_mesh(me)
    b.free()
    parts[k] = o
for o in (wall, lv, rv):
    bpy.data.objects.remove(o, do_unlink=True)

# Shape Key 'contract': 자유벽은 자기 내강 중심 쪽으로, 중격은 두 중심의 가운데 쪽으로 조금
mid = (cl + cr) / 2
for k, o in parts.items():
    target = cl if k == 'lv_free' else (cr if k == 'rv_free' else mid)
    o.shape_key_add(name='Basis')
    sk = o.shape_key_add(name='contract')
    sk.value = 0.0   # Blender 5.3은 새 Shape Key 값을 1로 두어 glTF 기본 가중치가 1이 된다
    for i, v in enumerate(o.data.vertices):
        w = o.matrix_world @ v.co
        sk.data[i].co = o.matrix_world.inverted() @ (w + (target - w) * CONTRACT[k])

# mm → m (파이프라인과 같은 배율), glTF 내보내기에서 Y-up 변환 한 번
root = bpy.data.objects.new('heart_ventricular_wall_regions', None)
bpy.context.scene.collection.objects.link(root)
for o in parts.values():
    o.parent = root
root.scale = (0.001, 0.001, 0.001)
mat = bpy.data.materials.new('heart_wall')
mat.diffuse_color = (0.72, 0.36, 0.36, 1)
for o in parts.values():
    o.data.materials.append(mat)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False, export_morph=True,
                          export_animations=False, use_selection=False)
rep = {'source': 'BodyParts3D 4.0 isa FJ2428 (FMA13884 wall of ventricle); cavities partof FJ2422, FJ2423',
       'method': f'face-to-cavity distance; septum = both cavities within {SEPTUM_MM} mm AND face lies between them (nearest-point directions opposite, dot < -0.3)', 'faces': counts,
       'area_mm2': {k: round(v, 1) for k, v in areas.items()}, 'total_area_mm2': round(total_area, 1),
       'contract_ratio': CONTRACT, 'lv_centroid_mm': list(cl), 'rv_centroid_mm': list(cr),
       'file': OUT, 'bytes': os.path.getsize(OUT), 'verification_status': 'GEOMETRY_DERIVED; not an anatomical segmentation'}
json.dump(rep, open(REPORT, 'w', encoding='utf-8'), indent=1)
print('[split]', json.dumps(rep['faces']), rep['bytes'])
