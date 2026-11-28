# STEP 04-B+ 미세 구조 개념 모델 3종 (CONCEPTUAL, 직접 제작) — 개발 도구, 수업 범위 밖
#   1) alveolus-concept.glb       폐포 주머니(잘라 본 모습) · 폐포 벽 · 모세혈관 그물 · 교환 부위 확대판 · 적혈구 · O₂/CO₂
#   2) tissue-capillary-concept.glb 세동맥(민무늬근 고리) · 모세혈관 그물 · 세정맥 · 조직 세포 · 적혈구 · O₂/영양소 · CO₂/노폐물
#   3) vessel-wall-concept.glb    동맥 벽 단면(270°): 내막 · 내탄력판 · 중막(민무늬근 세포) · 외막 · 내강, Shape Key constrict/dilate
# 모양과 크기는 교육용 단순화다. 실제 비율·개수·배치를 재현하지 않는다. 의학적 검증 전이다.
# 단위: 장면 m (모델마다 meta에 축척 메모). 좌표: Blender Z-up → glTF Y-up(export_yup)
# 실행: blender --background --factory-startup --python tools/blender/make_micro_concepts.py -- <out_dir> <report.json>
import bpy
import bmesh
import sys
import os
import json
import math
import random
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
OUT_DIR, REPORT = args[0], args[1]
FPS = 24
random.seed(7)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def material(name, rgba, alpha=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = rgba
    b.inputs['Roughness'].default_value = 0.6
    if alpha is not None:
        b.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED' if hasattr(m, 'surface_render_method') else m.blend_method
    m.diffuse_color = rgba
    return m


def link(o, parent=None):
    if o.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(o)
    if parent:
        o.parent = parent
    return o


def empty(name, parent=None):
    return link(bpy.data.objects.new(name, None), parent)


def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def uv_sphere(name, r, loc, seg=24, rings=12):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.location = loc
    return o


def ico(name, r, loc, sub=2):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.location = loc
    return o


def rbc_mesh(name, d=0.06):
    # 적혈구: 가운데가 오목한 원반 (구를 납작하게 하고 중심부를 더 얇게)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        r2 = min(1.0, x * x + y * y)
        v.co = Vector((x, y, z * (0.18 + 0.62 * r2) * 0.55)) * (d / 2)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return me


def tube_from_polylines(name, lines, radius, res=8):
    # 여러 폴리라인을 굵기 있는 관 메시 하나로 (곡선 bevel → mesh)
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 2
    cu.use_fill_caps = True
    for pts in lines:
        sp = cu.splines.new('POLY')
        sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts):
            sp.points[i].co = (p[0], p[1], p[2], 1)
    o = link(bpy.data.objects.new(name, cu))
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    mo = link(bpy.data.objects.new(name, me))
    bpy.data.objects.remove(o, do_unlink=True)
    for p in mo.data.polygons:
        p.use_smooth = True
    return mo


def torus_mesh(name, R, r, seg=32, sides=10):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        row = []
        for j in range(sides):
            b = 2 * math.pi * j / sides
            row.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        vs.append(row)
    for i in range(seg):
        for j in range(sides):
            bm.faces.new([vs[i][j], vs[(i + 1) % seg][j], vs[(i + 1) % seg][(j + 1) % sides], vs[i][(j + 1) % sides]])
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return me


def polyline_length(pts):
    return sum((Vector(pts[i]) - Vector(pts[i - 1])).length for i in range(1, len(pts)))


def point_on(pts, t):
    # 폴리라인 위 호 길이 비율 t의 점
    L = polyline_length(pts)
    target = L * (t % 1.0)
    acc = 0.0
    for i in range(1, len(pts)):
        a, b = Vector(pts[i - 1]), Vector(pts[i])
        l = (b - a).length
        if acc + l >= target:
            return a.lerp(b, (target - acc) / max(l, 1e-9))
        acc += l
    return Vector(pts[-1])


def key_location_loop(o, func, frames, clip):
    # 매 프레임 위치를 키로 (CONSTANT 보간: 반복 때 되돌아가는 미끄러짐 없이 순간 이동)
    o.animation_data_create()
    act = bpy.data.actions.new('{}__{}'.format(clip, o.name))
    o.animation_data.action = act
    for f in range(1, frames + 2):
        o.location = func((f - 1) / frames)
        o.keyframe_insert('location', frame=f)
    for fc in getattr(act, 'fcurves', []):
        for kp in fc.keyframe_points:
            kp.interpolation = 'CONSTANT'
    # Blender 5: 채널백(layers/strips) 구조일 수 있다
    try:
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    for fc in cb.fcurves:
                        for kp in fc.keyframe_points:
                            kp.interpolation = 'CONSTANT'
    except AttributeError:
        pass
    tr = o.animation_data.nla_tracks.new()
    tr.name = clip
    st = tr.strips.new(clip, 1, act)
    st.name = clip
    o.animation_data.action = None


def shape_key_clip(o, key, clip, a, b, frames):
    kd = o.data.shape_keys
    kd.animation_data_create()
    act = bpy.data.actions.new('{}__{}'.format(clip, o.name))
    kd.animation_data.action = act
    kb = kd.key_blocks[key]
    kb.value = a
    kb.keyframe_insert('value', frame=1)
    kb.value = b
    kb.keyframe_insert('value', frame=1 + frames)
    tr = kd.animation_data.nla_tracks.new()
    tr.name = clip
    st = tr.strips.new(clip, 1, act)
    st.name = clip
    kd.animation_data.action = None
    kb.value = 0.0


def export(path, frame_end):
    sc = bpy.context.scene
    sc.frame_start = 1
    sc.frame_end = frame_end
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=False, export_morph=True,
                              export_morph_normal=False, export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_skins=False, use_selection=False)
    zero_weights(path)


def zero_weights(path):
    import struct
    b = open(path, 'rb').read()
    jlen = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jlen])
    changed = False
    for m in j.get('meshes', []):
        if 'weights' in m:
            m['weights'] = [0 for _ in m['weights']]
            changed = True
    if not changed:
        return
    js = json.dumps(j, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    rest = b[20 + jlen:]
    open(path, 'wb').write(b[:8] + struct.pack('<I', 12 + 8 + len(js) + len(rest)) + struct.pack('<I', len(js)) + b'JSON' + js + rest)


def stats():
    tris = 0
    meshes = 0
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            meshes += 1
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    return meshes, tris


report = {'verification_status': 'CONCEPTUAL; project-made educational shapes; NOT anatomical models; NOT medically verified', 'models': {}}


# =====================================================================
# 1) 폐포 주머니
# =====================================================================
def build_alveolus():
    reset()
    root = empty('alveolus_concept')
    M = {
        'wall': material('alveolar_wall', (0.93, 0.72, 0.76, 1), 0.55),
        'cap': material('capillary', (0.80, 0.22, 0.22, 1)),
        'duct': material('alveolar_duct', (0.95, 0.80, 0.82, 1), 0.5),
        'rbc': material('rbc', (0.78, 0.08, 0.10, 1)),
        'o2': material('o2', (0.25, 0.70, 0.98, 1)),
        'co2': material('co2', (1.0, 0.68, 0.25, 1)),
        'epi': material('alveolar_epithelium', (0.96, 0.80, 0.84, 1)),
        'bm': material('basement_membrane', (0.98, 0.88, 0.45, 1)),
        'endo': material('capillary_endothelium', (0.86, 0.45, 0.45, 1)),
        'air': material('alveolar_air', (0.75, 0.88, 1.0, 1), 0.25),
        'plasma': material('plasma', (0.95, 0.75, 0.70, 1), 0.35),
    }
    # 폐포 중심: 폐포관 끝을 둘러싼 7개 (교육용 배치)
    R = 0.26
    centers = [Vector((0, 0, 0.30)), Vector((0.34, 0, 0.10)), Vector((-0.34, 0, 0.10)), Vector((0.17, 0.30, 0.10)),
               Vector((-0.17, 0.30, 0.10)), Vector((0.17, -0.30, 0.10)), Vector((-0.17, -0.30, 0.10))]
    parts = [uv_sphere('a{}'.format(i), R, c, 40, 20) for i, c in enumerate(centers)]
    parts.append(uv_sphere('duct', 0.14, (0, 0, -0.25), 32, 16))
    cyl = bpy.data.meshes.new('ductc')
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.13, radius2=0.13, depth=0.5)
    bm.to_mesh(cyl)
    bm.free()
    co = link(bpy.data.objects.new('ductc', cyl))
    co.location = (0, 0, -0.45)
    parts.append(co)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    sac = bpy.context.view_layer.objects.active
    sac.name = 'alveolar_sac_wall'
    sac.data.name = 'alveolar_sac_wall'
    rm = sac.modifiers.new('rm', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = 0.018
    apply_mods(sac)
    sm = sac.modifiers.new('sm', 'SMOOTH')
    sm.iterations = 6
    so = sac.modifiers.new('so', 'SOLIDIFY')
    so.thickness = 0.025
    apply_mods(sac)
    # 잘라 본 모습: 앞쪽(-Y) 절반을 상자로 빼서 속(공기 공간)을 보이게
    cut = bpy.data.meshes.new('cut')
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(cut)
    bm.free()
    cbox = link(bpy.data.objects.new('cutbox', cut))
    cbox.scale = (1.0, 1.0, 2.0)
    cbox.location = (0.5 + 0.02, -0.5 - 0.02, 0.2)
    bo = sac.modifiers.new('cut', 'BOOLEAN')
    bo.operation = 'DIFFERENCE'
    bo.object = cbox
    bo.solver = 'EXACT'
    apply_mods(sac)
    bpy.data.objects.remove(cbox, do_unlink=True)
    for p in sac.data.polygons:
        p.use_smooth = True
    dec = sac.modifiers.new('dec', 'DECIMATE')
    dec.ratio = 0.35
    apply_mods(sac)
    sac.data.materials.clear()
    sac.data.materials.append(M['wall'])
    sac.parent = root

    # 모세혈관 그물: 각 폐포 표면 바로 바깥의 피보나치 점을 가까운 이웃끼리 잇는다 (뒤쪽 절반 +Y에만, 잘린 면 앞쪽은 비움)
    nodes = []
    for c in centers:
        n = 46
        for k in range(n):
            y = 1 - 2 * (k + 0.5) / n
            r = math.sqrt(1 - y * y)
            th = k * math.pi * (3 - math.sqrt(5))
            d = Vector((math.cos(th) * r, y, math.sin(th) * r))
            p = c + d * (R + 0.035)
            if p.x > -0.02 and p.y < 0.02:
                continue                     # 잘라 낸 사분면에는 그물을 두지 않는다
            if any((p - c2).length < R + 0.02 for c2 in centers if c2 != c):
                continue
            if p.z < -0.05 and abs(p.x) < 0.2:
                continue
            nodes.append(p)
    edges = set()
    for i, p in enumerate(nodes):
        ds = sorted(((p - q).length, j) for j, q in enumerate(nodes) if j != i)
        for d, j in ds[:3]:
            if d < 0.16:
                edges.add((min(i, j), max(i, j)))
    lines = []
    for i, j in edges:
        a, b = nodes[i], nodes[j]
        mid = (a + b) / 2
        # 표면을 따라 살짝 휘게: 가장 가까운 폐포 중심에서 바깥으로 밀기
        c = min(centers, key=lambda cc: (mid - cc).length)
        mid = c + (mid - c).normalized() * (R + 0.035)
        lines.append([tuple(a), tuple(mid), tuple(b)])
    net = tube_from_polylines('pulmonary_capillary_network', lines, 0.011)
    net.data.materials.append(M['cap'])
    net.parent = root
    # 들어오는 세동맥 쪽·나가는 세정맥 쪽 굵은 관
    feed = [(-0.55, 0.32, -0.20), (-0.42, 0.30, 0.0), (-0.36, 0.28, 0.12)]
    drain = [(0.36, 0.28, 0.12), (0.42, 0.30, 0.0), (0.55, 0.32, -0.20)]
    fo = tube_from_polylines('capillary_inflow_from_pulmonary_arteriole', [feed], 0.022)
    fo.data.materials.append(material('deoxy_inflow', (0.45, 0.30, 0.65, 1)))
    fo.parent = root
    do = tube_from_polylines('capillary_outflow_to_pulmonary_venule', [drain], 0.022)
    do.data.materials.append(material('oxy_outflow', (0.92, 0.25, 0.30, 1)))
    do.parent = root

    # 적혈구가 지나는 길: 그물 위 한 줄(폐포 a0의 뒤쪽 위 둘레)
    c0 = centers[2]
    route = []
    for k in range(25):
        a = math.radians(160 - 140 * k / 24)
        route.append(tuple(c0 + Vector((math.cos(a) * 0.6 - 0.4, -0.7, math.sin(a))).normalized() * (R + 0.035)))
    route = [feed[-1]] + route + [drain[0]]
    rme = rbc_mesh('rbc', 0.05)
    rb = empty('red_blood_cells', root)
    for i in range(4):
        o = link(bpy.data.objects.new('rbc_{}'.format(i + 1), rme), rb)
        o.data.materials.append(M['rbc']) if not o.data.materials else None
        ph = i / 4
        key_location_loop(o, lambda t, ph=ph: point_on(route, t + ph), 96, 'rbc_flow')
    # 기체 입자: 폐포 공기 → 벽 → 모세혈관 (O₂), 반대 (CO₂)
    g = empty('gas_particles', root)
    o2me = bpy.data.meshes.new('o2p')
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.012)
    bm.to_mesh(o2me)
    bm.free()
    o2me.materials.append(M['o2'])
    co2me = o2me.copy()
    co2me.materials[0] = M['co2']
    for i in range(14):
        c = centers[i % 7]
        ang = random.uniform(0.2, 2.9)
        d = Vector((-abs(math.cos(ang)) * 0.9, random.uniform(-0.9, 0.9), math.sin(ang) * 0.9)).normalized()
        a_in = c + d * (R * 0.55)
        a_out = c + d * (R + 0.04)
        ph = random.random()
        o = link(bpy.data.objects.new('o2_{}'.format(i + 1), o2me), g)
        key_location_loop(o, lambda t, a=a_in, b=a_out, ph=ph: a.lerp(b, (t + ph) % 1.0), 48, 'gas_exchange')
        o = link(bpy.data.objects.new('co2_{}'.format(i + 1), co2me), g)
        key_location_loop(o, lambda t, a=a_out + d * 0.01, b=a_in + d * 0.03, ph=ph: a.lerp(b, (t + ph + 0.5) % 1.0), 48, 'gas_exchange')

    # 교환 부위 확대판(호흡막): 폐포 공기 | 폐포 상피 | 기저막 | 모세혈관 내피 | 혈장 + 적혈구 — 옆에 따로 둔다
    ins = empty('exchange_zone_inset', root)
    ins.location = (1.05, 0.0, 0.05)
    layers = [('inset_alveolar_air', 0.30, M['air']), ('inset_alveolar_epithelium', 0.035, M['epi']),
              ('inset_basement_membrane', 0.02, M['bm']), ('inset_capillary_endothelium', 0.035, M['endo']),
              ('inset_plasma', 0.30, M['plasma'])]
    x = -0.35
    for name, w, mt in layers:
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bm.to_mesh(me)
        bm.free()
        o = link(bpy.data.objects.new(name, me), ins)
        o.scale = (w, 0.40, 0.55)
        o.location = (x + w / 2, 0, 0)
        o.data.materials.append(mt)
        x += w
    ri = link(bpy.data.objects.new('inset_rbc', rbc_mesh('inset_rbc_me', 0.16)), ins)
    ri.data.materials.append(M['rbc'])
    ri.location = (0.25, 0, -0.05)
    ri.rotation_euler = (0, math.radians(90), 0)
    for i in range(6):
        z = -0.2 + i * 0.08
        o = link(bpy.data.objects.new('inset_o2_{}'.format(i + 1), o2me), ins)
        key_location_loop(o, lambda t, z=z, ph=i / 6: Vector((-0.30, 0.0, z)).lerp(Vector((0.22, 0.0, z)), (t + ph) % 1.0), 48, 'gas_exchange')
        o = link(bpy.data.objects.new('inset_co2_{}'.format(i + 1), co2me), ins)
        key_location_loop(o, lambda t, z=z + 0.04, ph=i / 6: Vector((0.22, 0.02, z)).lerp(Vector((-0.30, 0.02, z)), (t + ph + 0.5) % 1.0), 48, 'gas_exchange')
    path = os.path.join(OUT_DIR, 'alveolus-concept.glb')
    m, t = stats()
    export(path, 97)
    report['models']['alveolus-concept'] = {'file': path, 'bytes': os.path.getsize(path), 'meshes': m, 'triangles': t,
                                            'clips': ['rbc_flow (96 f, loop)', 'gas_exchange (48 f, loop)'],
                                            'capillary_segments': len(lines),
                                            'scale_note': '폐포 반지름 0.26 m 표시. 실제 폐포 지름 약 200~300 µm(일반 참고값, 강의자료 미확인) → 1 m ≈ 0.5 mm. 적혈구·기체 입자는 보이게 키웠다.'}


# =====================================================================
# 2) 조직 모세혈관
# =====================================================================
def build_tissue():
    reset()
    root = empty('tissue_capillary_concept')
    M = {
        'art': material('arteriole', (0.85, 0.20, 0.20, 1)),
        'smc': material('smooth_muscle_ring', (0.62, 0.20, 0.25, 1)),
        'cap': material('capillary', (0.75, 0.30, 0.40, 1), 0.7),
        'ven': material('venule', (0.35, 0.40, 0.80, 1)),
        'cell': material('tissue_cell', (0.98, 0.86, 0.70, 1), 0.6),
        'nuc': material('nucleus', (0.45, 0.30, 0.55, 1)),
        'rbc': material('rbc', (0.78, 0.08, 0.10, 1)),
        'o2': material('o2', (0.25, 0.70, 0.98, 1)),
        'nutr': material('nutrient', (0.35, 0.85, 0.40, 1)),
        'co2': material('co2', (1.0, 0.68, 0.25, 1)),
        'waste': material('waste', (0.70, 0.45, 0.85, 1)),
    }
    art = [(-1.3, 0, 0.05), (-0.95, 0, 0.02), (-0.70, 0, 0.0)]
    ven = [(0.70, 0, 0.0), (0.95, 0, 0.03), (1.3, 0, 0.08)]
    ao = tube_from_polylines('arteriole', [art], 0.055)
    ao.data.materials.append(M['art'])
    ao.parent = root
    vo = tube_from_polylines('venule', [ven], 0.065)
    vo.data.materials.append(M['ven'])
    vo.parent = root
    # 민무늬근 고리(모세혈관앞 조임근 표시)
    for i in range(6):
        x = -1.2 + i * 0.09
        t = i / 5
        z = 0.05 * (1 - t) + 0.02 * t
        me = torus_mesh('ring', 0.060, 0.010)
        o = link(bpy.data.objects.new('arteriole_smooth_muscle_{}'.format(i + 1), me), root)
        o.rotation_euler = (0, math.radians(90), 0)
        o.location = (x, 0, z)
        o.data.materials.append(M['smc'])
    # 모세혈관 그물: 세동맥 끝 → 세정맥 시작 사이 5줄 + 가로 연결
    chans = []
    for k in range(5):
        yy = (k - 2) * 0.16
        zz = 0.08 * math.sin(k * 1.7)
        pts = [(-0.70, 0, 0)]
        for s in range(1, 12):
            x = -0.70 + 1.40 * s / 12
            pts.append((x, yy * math.sin(math.pi * s / 12) + 0.02 * math.sin(s * 2.1 + k), zz * math.sin(math.pi * s / 12)))
        pts.append((0.70, 0, 0))
        chans.append(pts)
    cross = []
    for k in range(4):
        for s in (4, 8):
            cross.append([chans[k][s], chans[k + 1][s]])
    cap = tube_from_polylines('capillary_network', chans + cross, 0.022)
    cap.data.materials.append(M['cap'])
    cap.parent = root
    # 조직 세포
    cells = empty('tissue_cells', root)
    k = 0
    for gx in range(-3, 4):
        for gy in (-1, 1):
            for gz in (-1, 1):
                if random.random() < 0.25:
                    continue
                k += 1
                c = Vector((gx * 0.19 + random.uniform(-0.03, 0.03), gy * random.uniform(0.25, 0.42), gz * random.uniform(0.14, 0.24)))
                o = ico('tissue_cell_{}'.format(k), 0.08, c, 3)
                for v in o.data.vertices:
                    v.co *= 1 + 0.08 * math.sin(v.co.x * 60 + k) * math.cos(v.co.y * 50)
                for p in o.data.polygons:
                    p.use_smooth = True
                o.scale = (1.2, 1.0, 0.75)
                o.data.materials.append(M['cell'])
                o.parent = cells
                n = uv_sphere('tissue_cell_{}_nucleus'.format(k), 0.028, c, 16, 8)
                n.data.materials.append(M['nuc'])
                n.parent = cells
    # 적혈구 흐름(가운데 통로)
    rme = rbc_mesh('rbc', 0.04)
    rme.materials.append(M['rbc'])
    route = list(art) + chans[2] + list(ven)
    rb = empty('red_blood_cells', root)
    for i in range(6):
        o = link(bpy.data.objects.new('rbc_{}'.format(i + 1), rme), rb)
        key_location_loop(o, lambda t, ph=i / 6: point_on(route, t + ph), 120, 'rbc_flow')
    # 물질 이동: 모세혈관 → 세포 (O₂, 영양소), 세포 → 모세혈관 (CO₂, 노폐물)
    g = empty('exchange_particles', root)
    meshes = {}
    for key in ('o2', 'nutr', 'co2', 'waste'):
        me = bpy.data.meshes.new(key + 'p')
        bm = bmesh.new()
        if key in ('nutr', 'waste'):
            bmesh.ops.create_cube(bm, size=0.02)
        else:
            bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.011)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(M[key])
        meshes[key] = me
    cell_objs = [o for o in cells.children if 'nucleus' not in o.name]
    for i in range(16):
        ch = chans[i % 5]
        s = 3 + (i * 5) % 7
        a = Vector(ch[s])
        cell = min(cell_objs, key=lambda o: (o.location - a).length + random.random() * 0.15)
        b = cell.location
        ph = random.random()
        kind_out = 'o2' if i % 2 == 0 else 'nutr'
        kind_in = 'co2' if i % 2 == 0 else 'waste'
        o = link(bpy.data.objects.new('{}_{}'.format(kind_out, i + 1), meshes[kind_out]), g)
        key_location_loop(o, lambda t, a=a, b=b, ph=ph: a.lerp(b, (t + ph) % 1.0), 60, 'tissue_exchange')
        o = link(bpy.data.objects.new('{}_{}'.format(kind_in, i + 1), meshes[kind_in]), g)
        key_location_loop(o, lambda t, a=b, b=a, ph=ph: a.lerp(b, (t + ph + 0.5) % 1.0), 60, 'tissue_exchange')
    path = os.path.join(OUT_DIR, 'tissue-capillary-concept.glb')
    m, t = stats()
    export(path, 121)
    report['models']['tissue-capillary-concept'] = {'file': path, 'bytes': os.path.getsize(path), 'meshes': m, 'triangles': t,
                                                    'clips': ['rbc_flow (120 f, loop)', 'tissue_exchange (60 f, loop)'],
                                                    'tissue_cells': len(cell_objs),
                                                    'scale_note': '모세혈관 반지름 0.022 m 표시. 실제 모세혈관 지름 약 5~10 µm(일반 참고값, 강의자료 미확인) → 1 m ≈ 0.2 mm. 세포·입자 크기는 교육용.'}


# =====================================================================
# 3) 혈관 벽 단면
# =====================================================================
def build_vessel_wall():
    reset()
    root = empty('vessel_wall_concept')
    M = {
        'intima': material('tunica_intima', (0.98, 0.93, 0.85, 1)),
        'iel': material('internal_elastic_lamina', (0.98, 0.85, 0.35, 1)),
        'media': material('tunica_media', (0.80, 0.35, 0.38, 1), 0.4),
        'smc': material('smooth_muscle_cell', (0.62, 0.15, 0.22, 1)),
        'eel': material('external_elastic_lamina', (0.95, 0.80, 0.35, 1)),
        'adv': material('tunica_adventitia', (0.88, 0.78, 0.62, 1)),
        'lumen': material('lumen_blood', (0.80, 0.10, 0.12, 1), 0.25),
        'vv': material('vasa_vasorum', (0.75, 0.15, 0.15, 1)),
    }
    L = 0.6
    SWEEP = 270

    # 반지름 사상: constrict / dilate (교육용 값)
    def f_con(r):
        if r <= 0.33:
            return r - 0.10
        if r <= 0.50:
            return 0.23 + (r - 0.33) * (0.24 / 0.17)
        return 0.47 + (r - 0.50) * (0.14 / 0.15)

    def f_dil(r):
        if r <= 0.33:
            return r + 0.10
        if r <= 0.50:
            return 0.43 + (r - 0.33) * (0.11 / 0.17)
        return 0.54 + (r - 0.50) * (0.13 / 0.15)

    def shell(name, r_in, r_out, mat, seg=72, wavy=0.0):
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        rings = []
        nz = 8
        for zi in range(nz + 1):
            z = -L / 2 + L * zi / nz
            ring_in, ring_out = [], []
            for s in range(seg + 1):
                a = math.radians(SWEEP * s / seg)
                w = 1 + wavy * math.sin(s * 1.2)
                ring_in.append(bm.verts.new((math.cos(a) * r_in * w, math.sin(a) * r_in * w, z)))
                ring_out.append(bm.verts.new((math.cos(a) * r_out * w, math.sin(a) * r_out * w, z)))
            rings.append((ring_in, ring_out))
        for zi in range(nz):
            a_in, a_out = rings[zi]
            b_in, b_out = rings[zi + 1]
            for s in range(seg):
                bm.faces.new([a_in[s], b_in[s], b_in[s + 1], a_in[s + 1]])
                bm.faces.new([a_out[s], a_out[s + 1], b_out[s + 1], b_out[s]])
        for zi in (0, nz):
            ri, ro = rings[zi]
            for s in range(seg):
                f = [ri[s], ri[s + 1], ro[s + 1], ro[s]] if zi == 0 else [ri[s], ro[s], ro[s + 1], ri[s + 1]]
                bm.faces.new(f)
        for zi in range(nz):
            for s in (0, seg):
                a_in, a_out = rings[zi]
                b_in, b_out = rings[zi + 1]
                f = [a_in[s], a_out[s], b_out[s], b_in[s]] if s == 0 else [a_in[s], b_in[s], b_out[s], a_out[s]]
                bm.faces.new(f)
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        o = link(bpy.data.objects.new(name, me), root)
        o.data.materials.append(mat)
        return o

    objs = [shell('tunica_intima', 0.30, 0.32, M['intima']),
            shell('internal_elastic_lamina', 0.32, 0.33, M['iel'], wavy=0.01),
            shell('tunica_media', 0.33, 0.50, M['media']),
            shell('external_elastic_lamina', 0.50, 0.51, M['eel'], wavy=0.006),
            shell('tunica_adventitia', 0.51, 0.65, M['adv'])]
    # 내강(혈액): 반투명, 벽과 같은 270° 단면
    objs.append(shell('lumen', 0.002, 0.299, M['lumen']))
    # 중막 민무늬근 세포: 둘레 방향 방추형
    smc_me = bpy.data.meshes.new('smc')
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=1.0)
    bm.to_mesh(smc_me)
    bm.free()
    k = 0
    cells_list = []
    for zi in range(5):
        z = -L / 2 + 0.06 + zi * 0.12
        for ri, rr in enumerate((0.37, 0.42, 0.46)):
            n = int(SWEEP / 360 * 2 * math.pi * rr / 0.075)
            for s in range(n):
                a = math.radians(SWEEP * (s + 0.5 + 0.5 * (ri % 2)) / (n + 1))
                k += 1
                me = smc_me.copy()
                o = link(bpy.data.objects.new('smooth_muscle_cell_{}'.format(k), me), root)
                tang = Vector((-math.sin(a), math.cos(a), 0))
                pos = Vector((math.cos(a) * rr, math.sin(a) * rr, z))
                # 정점 좌표에 직접 방추형 + 위치를 넣는다(Shape Key 반지름 사상을 같은 방식으로 적용하려고)
                rot = tang.to_track_quat('X', 'Z').to_matrix().to_4x4()
                for v in me.vertices:
                    lv = Vector((v.co.x * 0.040, v.co.y * 0.012, v.co.z * 0.014))
                    v.co = pos + (rot @ lv)
                o.data.materials.append(M['smc'])
                cells_list.append(o)
    # 민무늬근 세포를 메시 하나로 합친다 (객체마다 Shape Key·클립이 붙으면 파일이 10 MB를 넘었다)
    bpy.ops.object.select_all(action='DESELECT')
    for o in cells_list:
        o.select_set(True)
    bpy.context.view_layer.objects.active = cells_list[0]
    bpy.ops.object.join()
    smc_obj = bpy.context.view_layer.objects.active
    smc_obj.name = 'smooth_muscle_cells'
    smc_obj.data.name = 'smooth_muscle_cells'
    objs.append(smc_obj)
    for o in objs:
        if o.type == 'MESH' and o.name != 'lumen':
            for p in o.data.polygons:
                p.use_smooth = o.name == 'smooth_muscle_cells'
    # 외막 영양혈관
    vv = tube_from_polylines('vasa_vasorum', [[(math.cos(math.radians(a)) * 0.6, math.sin(math.radians(a)) * 0.6, z) for a, z in ((20, -0.28), (40, -0.1), (55, 0.1), (70, 0.28))],
                                              [(math.cos(math.radians(a)) * 0.6, math.sin(math.radians(a)) * 0.6, z) for a, z in ((150, -0.28), (170, 0.0), (200, 0.28))]], 0.012)
    vv.data.materials.append(M['vv'])
    vv.parent = root
    objs.append(vv)
    # Shape Key: 모든 벽 메시를 같은 반지름 사상으로 (축 = Z)
    for o in objs:
        o.shape_key_add(name='Basis')
        for key, fn in (('constrict', f_con), ('dilate', f_dil)):
            sk = o.shape_key_add(name=key)
            sk.value = 0.0
            for i, v in enumerate(o.data.vertices):
                x, y, z = v.co
                r = math.hypot(x, y)
                if r < 1e-6:
                    continue
                if o.name == 'lumen':
                    nr = (f_con(0.30) if key == 'constrict' else f_dil(0.30)) * (r / 0.299)
                else:
                    nr = fn(r)
                sk.data[i].co = Vector((x * nr / r, y * nr / r, z))
        shape_key_clip(o, 'constrict', 'vasoconstriction', 0.0, 1.0, 18)
        shape_key_clip(o, 'dilate', 'vasodilation', 0.0, 1.0, 18)
    root.rotation_euler = (math.radians(90), 0, 0)
    path = os.path.join(OUT_DIR, 'vessel-wall-concept.glb')
    m, t = stats()
    export(path, 19)
    report['models']['vessel-wall-concept'] = {'file': path, 'bytes': os.path.getsize(path), 'meshes': m, 'triangles': t,
                                               'shape_keys': ['constrict', 'dilate'], 'clips': ['vasoconstriction (18 f)', 'vasodilation (18 f)'],
                                               'smooth_muscle_cells': k,
                                               'radii_baseline_m': {'lumen': 0.30, 'intima': [0.30, 0.32], 'media': [0.33, 0.50], 'adventitia': [0.51, 0.65]},
                                               'radii_constrict_m': {'lumen': round(f_con(0.30), 3), 'media': [round(f_con(0.33), 3), round(f_con(0.50), 3)]},
                                               'radii_dilate_m': {'lumen': round(f_dil(0.30), 3), 'media': [round(f_dil(0.33), 3), round(f_dil(0.50), 3)]},
                                               'scale_note': '중간 크기 동맥 단면을 단순화. 층 두께 비율·민무늬근 세포 수는 교육용 값이며 실측이 아니다.'}


os.makedirs(OUT_DIR, exist_ok=True)
for fn in (build_alveolus, build_tissue, build_vessel_wall):
    fn()
    print('[micro] built', fn.__name__, flush=True)
json.dump(report, open(REPORT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('[micro]', json.dumps({k: [v['meshes'], v['triangles'], v['bytes']] for k, v in report['models'].items()}))
