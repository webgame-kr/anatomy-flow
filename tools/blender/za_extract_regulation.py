# Z-Anatomy에서 STEP 04-C 준비 구조를 꺼내 별도 CC BY-SA 4.0 GLB로 만든다 (개발 도구, 수업 범위 밖)
# - 반드시 내장 스크립트 자동 실행을 끄고 연다:
#   blender --background --factory-startup --disable-autoexec <Startup.blend> --python tools/blender/za_extract_regulation.py -- <out.glb> <report.json> <bp3d isa dir>
# - 대상: Thyroid gland, Vagus nerve (X).l/.r, Sympathetic trunk.l/.r, Ganglia of sympathetic trunk.l/.r
#   (NC 조건 모델 — Inner Ear, Kidney by Lissie Cowley — 은 쓰지 않는다)
# - 수정자(Mirror·Solidify·Subsurf)를 적용한 평가 메시를 쓰고, 곡선(신경)은 굵기를 주어 관 메시로 만든다.
# - 좌표: Z-Anatomy = BodyParts3D(m) + T 로 측정됐다(STEP 04-B+ 심장 정렬). BodyParts3D 좌표로 옮기려고 −T 를 더한다.
#   그 뒤 glTF export_yup 한 번 → 다른 자산과 같은 장면 좌표. 정렬 검사: 미주신경과 오른온목동맥(BodyParts3D) 거리.
import bpy
import bmesh
import sys
import os
import json
from mathutils import Vector
from mathutils.kdtree import KDTree

args = sys.argv[sys.argv.index('--') + 1:]
OUT, REPORT, ISA = args[0], args[1], args[2]
T = Vector((0.0013, 0.0975, 0.0643))     # m, Blender Z-up (STEP 04-B+ 측정값)
NERVE_R = 0.0012                         # 곡선에 굵기가 없을 때 줄 반지름(m) — 표시용
WANT = {
    'Thyroid gland': ('thyroid_gland', (0.80, 0.45, 0.45, 1)),
    'Vagus nerve (X).l': ('left_vagus_nerve', (0.98, 0.85, 0.30, 1)),
    'Vagus nerve (X).r': ('right_vagus_nerve', (0.98, 0.85, 0.30, 1)),
    'Sympathetic trunk.l': ('left_sympathetic_trunk', (0.55, 0.85, 0.55, 1)),
    'Sympathetic trunk.r': ('right_sympathetic_trunk', (0.55, 0.85, 0.55, 1)),
    'Ganglia of sympathetic trunk.l': ('left_sympathetic_ganglia', (0.40, 0.75, 0.45, 1)),
    'Ganglia of sympathetic trunk.r': ('right_sympathetic_ganglia', (0.40, 0.75, 0.45, 1)),
}
rep = {'source': bpy.data.filepath, 'autoexec': 'disabled by --disable-autoexec on the command line (required)',
       'translation_removed_m': list(T), 'objects': {}}
src = {}
for name in WANT:
    o = bpy.data.objects.get(name)
    if not o:
        rep['objects'][name] = 'MISSING'
        continue
    if o.type == 'CURVE':
        rep['objects'][name] = {'type': 'CURVE', 'bevel_depth_original': o.data.bevel_depth}
        if o.data.bevel_depth <= 0:
            o.data.bevel_depth = NERVE_R
            o.data.bevel_resolution = 2
            o.data.use_fill_caps = True
    else:
        rep['objects'][name] = {'type': o.type, 'modifiers': [m.type for m in o.modifiers]}
    src[name] = o

dg = bpy.context.evaluated_depsgraph_get()
new_scene = bpy.data.scenes.new('nf_export')
made = []
for name, o in src.items():
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=dg)
    me.transform(o.matrix_world)
    me.transform(__import__('mathutils').Matrix.Translation(-T))
    nid, col = WANT[name]
    me.name = nid
    me.materials.clear()
    mat = bpy.data.materials.new('za_' + nid)
    mat.diffuse_color = col
    mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = col
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    no = bpy.data.objects.new(nid, me)
    new_scene.collection.objects.link(no)
    made.append(no)
    me.calc_loop_triangles()
    vs = [v.co for v in me.vertices]
    mn = [min(v[i] for v in vs) for i in range(3)]
    mx = [max(v[i] for v in vs) for i in range(3)]
    rep['objects'][name].update({'node': nid, 'verts': len(me.vertices), 'triangles': len(me.loop_triangles),
                                 'bbox_bp3d_m': [[round(x, 4) for x in mn], [round(x, 4) for x in mx]]})

# 정렬 검사: 오른미주신경 ↔ 오른온목동맥(BodyParts3D FJ3564) 표면 거리 (목 부위, 온목동맥 높이 범위)
bpy.context.window.scene = new_scene
before = set(bpy.data.objects)
bpy.ops.wm.obj_import(filepath=os.path.join(ISA, 'FJ3564.obj'), forward_axis='Y', up_axis='Z', global_scale=0.001)
cca = [o for o in bpy.data.objects if o not in before and o.type == 'MESH'][0]
cv = [cca.matrix_world @ v.co for v in cca.data.vertices]
kd = KDTree(len(cv))
for i, v in enumerate(cv):
    kd.insert(v, i)
kd.balance()
zmin, zmax = min(v.z for v in cv), max(v.z for v in cv)
vag = next((o for o in made if o.name == 'right_vagus_nerve'), None)
if vag:
    ds = sorted(kd.find(v.co)[2] * 1000 for v in vag.data.vertices if zmin <= v.co.z <= zmax)
    rep['alignment_check'] = {'pair': 'right vagus (Z-Anatomy, translated) vs right common carotid artery surface (BodyParts3D FJ3564)',
                              'samples': len(ds), 'median_mm': round(ds[len(ds) // 2], 1) if ds else None,
                              'min_mm': round(ds[0], 1) if ds else None, 'max_mm': round(ds[-1], 1) if ds else None,
                              'expectation': '미주신경은 목동맥집 안에서 온목동맥 바로 뒤·옆을 지난다(일반 해부 지식) → 수 mm~1 cm대면 정렬이 맞는 것으로 본다. 해부학 검증이 아니다.'}
bpy.data.objects.remove(cca, do_unlink=True)

root = bpy.data.objects.new('za_regulation_structures', None)
new_scene.collection.objects.link(root)
for o in made:
    o.parent = root
for o in new_scene.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False, use_selection=True,
                          export_animations=False)
rep['file'] = OUT
rep['bytes'] = os.path.getsize(OUT)
rep['license'] = 'CC BY-SA 4.0 (Z-Anatomy). Vagus nerve may be adapted from "Cranial Nerves and Foramina - University of Dundee, CAHID - CC-BY 4.0" (compatible, attributed).'
json.dump(rep, open(REPORT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('[za]', json.dumps({k: (v if isinstance(v, str) else v.get('triangles')) for k, v in rep['objects'].items()}), rep.get('alignment_check', {}).get('median_mm'), rep['bytes'])
