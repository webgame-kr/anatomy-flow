# Z-Anatomy Startup.blend 목록 만들기 (개발 도구, 수업 범위 밖)
# 실행 (내장 스크립트 자동 실행 끔):
#   blender --background --factory-startup --disable-autoexec <Startup.blend> --python tools/blender/za_inventory.py -- <out.json>
# 결과: 객체마다 이름, 종류, 컬렉션 경로, 정점·면 수, 월드 경계 상자(m), 부모, 수정자, Shape Key, 뼈대 여부
import bpy
import sys
import json
from mathutils import Vector

out = sys.argv[sys.argv.index('--') + 1]


def coll_paths():
    paths = {}

    def walk(c, prefix):
        p = prefix + [c.name]
        for o in c.objects:
            paths.setdefault(o.name, []).append('/'.join(p))
        for ch in c.children:
            walk(ch, p)
    walk(bpy.context.scene.collection, [])
    return paths


cp = coll_paths()
rows = []
for o in bpy.data.objects:
    r = {'name': o.name, 'type': o.type, 'collections': cp.get(o.name, []), 'parent': o.parent.name if o.parent else None,
         'hidden': o.hide_get() if o.name in bpy.context.view_layer.objects else None}
    if o.type == 'MESH':
        me = o.data
        r['verts'] = len(me.vertices)
        r['faces'] = len(me.polygons)
        corners = [o.matrix_world @ Vector(c) for c in o.bound_box]
        mn = [min(v[i] for v in corners) for i in range(3)]
        mx = [max(v[i] for v in corners) for i in range(3)]
        r['bbox'] = [[round(x, 4) for x in mn], [round(x, 4) for x in mx]]
        r['modifiers'] = [m.type for m in o.modifiers]
        r['shape_keys'] = [k.name for k in me.shape_keys.key_blocks] if me.shape_keys else []
        r['materials'] = [m.name for m in me.materials if m]
    if o.type == 'ARMATURE':
        r['bones'] = len(o.data.bones)
    rows.append(r)
meta = {'blend': bpy.data.filepath, 'objects': len(rows), 'scene_unit_scale': bpy.context.scene.unit_settings.scale_length,
        'unit_system': bpy.context.scene.unit_settings.system, 'texts': [t.name for t in bpy.data.texts]}
json.dump({'meta': meta, 'objects': rows}, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print('WROTE', out, len(rows))
