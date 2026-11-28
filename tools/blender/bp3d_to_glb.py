# BodyParts3D OBJ → GLB 변환 (Blender 5.x 내장 Python, 개발 도구 — 수업 범위 밖)
#
# 실행 (bp3d_build.py convert가 대신 실행한다):
#   blender --background --factory-startup --python tools/blender/bp3d_to_glb.py -- tools/out/<system>/plan.json
#
# 좌표 원칙 (STEP 03-A)
#   - 원본: mm, +X = 환자 왼쪽, -Y = 앞, +Z = 위
#   - OBJ 불러오기: forward_axis='Y', up_axis='Z' → Blender 좌표 = OBJ 좌표 (축 변환 없음, 시작 시 자체 검사)
#   - 모든 메시에 같은 배율 0.001(mm → m)을 메시 데이터에 적용. 장기별 중심 정렬·크기 정규화 없음.
#   - glTF 내보내기 export_yup=True에서만 축 변환: glTF (x, y, z) = (X, Z, -Y) × 0.001
#   - 개별 GLB와 통합 GLB는 같은 원점·같은 좌표를 쓴다.
# 원본 OBJ 파일은 읽기만 한다. Decimate 등 형태 변경은 하지 않는다(측정만).

import json
import math
import os
import sys
import time

import bmesh
import bpy
from mathutils import Matrix, Vector

LOG = []


def log(msg):
    line = f'[bp3d] {msg}'
    print(line, flush=True)
    LOG.append(line)


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(coll):
            coll.remove(item)


def first_vertex_from_file(path):
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            if line.startswith('v '):
                return [float(x) for x in line.split()[1:4]]
    return None


def import_obj(path):
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=path, forward_axis='Y', up_axis='Z', global_scale=1.0,
                          use_split_objects=True, use_split_groups=False, validate_meshes=False)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    return new


def axis_self_check(sample_obj):
    """Blender로 불러온 첫 정점이 파일의 첫 정점과 같은지 확인 (축 변환 중복 방지)."""
    expected = first_vertex_from_file(sample_obj)
    objs = import_obj(sample_obj)
    ob = objs[0]
    got = list(ob.matrix_world @ ob.data.vertices[0].co)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    diff = max(abs(a - b) for a, b in zip(expected, got))
    log(f'axis self-check: file {expected} → blender {[round(v, 4) for v in got]} (max diff {diff:.6f})')
    if diff > 1e-3:
        raise SystemExit('OBJ 불러오기 축이 원본과 다릅니다. 변환을 중단합니다.')


def mesh_stats(ob):
    """정점·삼각형·비정상 메시 측정 (원본 단위 mm 기준, 수정하지 않음)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
    boundary = sum(1 for e in bm.edges if e.is_boundary)
    inconsistent = sum(1 for e in bm.edges if e.is_manifold and not e.is_contiguous)
    degenerate = sum(1 for f in bm.faces if f.calc_area() < 1e-6)
    loose = sum(1 for v in bm.verts if not v.link_edges)
    stats = {'vertices': len(bm.verts), 'faces': len(bm.faces), 'triangles': tris,
             'non_manifold_edges': non_manifold, 'boundary_edges': boundary,
             'inconsistent_winding_edges': inconsistent, 'degenerate_faces': degenerate, 'loose_vertices': loose}
    bm.free()
    return stats


def make_material(name, spec):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    h = spec['color'].lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    bsdf.inputs['Base Color'].default_value = (lin[0], lin[1], lin[2], 1.0)
    bsdf.inputs['Roughness'].default_value = spec.get('roughness', 0.5)
    bsdf.inputs['Metallic'].default_value = 0.0
    return mat


def gltf_bbox(obs):
    """Blender(=원본 축, m) 좌표의 경계 상자를 glTF 좌표 (X, Z, -Y)로 바꿔 돌려준다."""
    mn = [math.inf] * 3
    mx = [-math.inf] * 3
    for ob in obs:
        for v in ob.data.vertices:
            p = ob.matrix_world @ v.co
            g = (p.x, p.z, -p.y)
            for i in range(3):
                mn[i] = min(mn[i], g[i])
                mx[i] = max(mx[i], g[i])
    return {'min': [round(v, 5) for v in mn], 'max': [round(v, 5) for v in mx],
            'size': [round(mx[i] - mn[i], 5) for i in range(3)]}


def build_part(part, root, extracted_dir, materials, scale):
    objs = []
    for el in part['elements']:
        # STEP 04-B+: 다른 트리에서 온 element는 계획에 경로가 있다
        path = el.get('path') or os.path.join(extracted_dir, el['file_id'] + '.obj')
        if not os.path.exists(path):
            raise SystemExit(f'추출된 OBJ 없음: {path}')
        for ob in import_obj(path):
            ob.name = el['file_id']
            objs.append(ob)
    for ob in objs:
        if (ob.matrix_world - Matrix.Identity(4)).to_scale().length > 1e-9 or ob.location.length > 1e-9:
            raise SystemExit(f'{ob.name}: 불러온 객체 변환이 단위 행렬이 아님')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = part['id']
    ob.data.name = part['id'] + '_mesh'
    stats_mm = mesh_stats(ob)
    ob.data.transform(Matrix.Scale(scale, 4))        # 모든 메시에 같은 배율 (중심 이동 없음)
    ob.data.update()
    ob.data.materials.clear()
    ob.data.materials.append(materials[part['material']])
    ob.parent = root
    src = part['source']
    ob['concept_id'] = src['concept_id']
    ob['concept_name'] = src['name']
    ob['representation_id'] = src.get('representation_id') or ''
    ob['element_file_ids'] = ','.join(e['file_id'] for e in part['elements'])
    ob['source'] = 'BodyParts3D 4.0 partof (CC BY 4.0)'
    return ob, stats_mm


def export_glb(root, path):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for ch in root.children_recursive:
        ch.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_extras=True, export_normals=True,
                              export_materials='EXPORT', export_animations=False)


def roundtrip_bbox(path):
    """내보낸 GLB를 다시 불러와 경계 상자를 glTF 좌표로 확인 (내보내기 축 변환 검증)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    bpy.context.view_layer.update()
    box = gltf_bbox(meshes)
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    return box


def main():
    plan_path = sys.argv[sys.argv.index('--') + 1]
    plan = json.load(open(plan_path, encoding='utf-8'))
    t0 = time.time()
    log(f'Blender {bpy.app.version_string} · plan {plan_path}')
    clear_scene()
    scale = plan['transform']['scale']
    extracted = plan['extracted_dir']
    out_dir = plan['output_dir']
    os.makedirs(out_dir, exist_ok=True)

    first = plan['assets'][0]['parts'][0]['elements'][0]['file_id']
    axis_self_check(os.path.join(extracted, first + '.obj'))

    materials = {}
    for key, spec in plan['materials'].items():
        materials[key] = make_material('mat_' + key, spec)

    report = {'blender': bpy.app.version_string, 'transform': plan['transform'], 'assets': []}
    roots = []
    for asset in plan['assets']:
        root = bpy.data.objects.new(asset['asset_id'], None)
        bpy.context.scene.collection.objects.link(root)
        parts_out = []
        for part in asset['parts']:
            ob, stats = build_part(part, root, extracted, materials, scale)
            parts_out.append({'id': part['id'], 'name': part['name'], 'material': part['material'],
                              'concept_id': part['source']['concept_id'], 'concept_name': part['source']['name'],
                              'representation_id': part['source'].get('representation_id'),
                              'element_file_ids': [e['file_id'] for e in part['elements']],
                              'mesh': stats, 'bbox_gltf_m': gltf_bbox([ob])})
        meshes = [c for c in root.children if c.type == 'MESH']
        path = os.path.join(out_dir, asset['file'])
        export_glb(root, path)
        rt = roundtrip_bbox(path)
        own = gltf_bbox(meshes)
        drift = max(abs(a - b) for a, b in zip(own['min'] + own['max'], rt['min'] + rt['max']))
        entry = {'asset_id': asset['asset_id'], 'file': asset['file'], 'display_name': asset['display_name'],
                 'note': asset.get('note', ''), 'file_size': os.path.getsize(path),
                 'mesh_count': len(meshes), 'material_count': len({p['material'] for p in parts_out}),
                 'vertex_count': sum(p['mesh']['vertices'] for p in parts_out),
                 'triangle_count': sum(p['mesh']['triangles'] for p in parts_out),
                 'bbox_gltf_m': own, 'roundtrip_bbox_gltf_m': rt, 'roundtrip_max_diff_m': round(drift, 7),
                 'parts': parts_out}
        report['assets'].append(entry)
        roots.append(root)
        log(f"{asset['file']}: meshes {entry['mesh_count']} · tris {entry['triangle_count']} · "
            f"{entry['file_size']} bytes · roundtrip diff {drift:.6f} m")

    preview = plan.get('preview')
    if preview:
        top = bpy.data.objects.new(preview['asset_id'], None)
        bpy.context.scene.collection.objects.link(top)
        for r in roots:
            r.parent = top
        path = os.path.join(out_dir, preview['file'])
        export_glb(top, path)
        meshes = [o for o in top.children_recursive if o.type == 'MESH']
        own = gltf_bbox(meshes)
        rt = roundtrip_bbox(path)
        drift = max(abs(a - b) for a, b in zip(own['min'] + own['max'], rt['min'] + rt['max']))
        report['preview'] = {'asset_id': preview['asset_id'], 'file': preview['file'],
                             'display_name': preview['display_name'], 'file_size': os.path.getsize(path),
                             'mesh_count': len(meshes),
                             'triangle_count': sum(a['triangle_count'] for a in report['assets']),
                             'bbox_gltf_m': own, 'roundtrip_max_diff_m': round(drift, 7)}
        log(f"{preview['file']}: meshes {len(meshes)} · {report['preview']['file_size']} bytes · roundtrip diff {drift:.6f} m")

    report['seconds'] = round(time.time() - t0, 1)
    report['log'] = LOG
    out = os.path.join(os.path.dirname(plan_path), 'convert-report.json')
    json.dump(report, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    log(f'report → {out} ({report["seconds"]} s)')


main()
