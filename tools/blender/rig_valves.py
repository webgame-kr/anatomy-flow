# BodyParts3D 판막 첨판 11개에 개폐 Shape Key와 GLB 클립을 붙인다 (개발 도구, 수업 범위 밖)
#
# 원본: BodyParts3D 4.0 PART-OF 첨판 OBJ(각각 독립 element), 심방·심실 내강, 유두근 5개
# 방법 (교육용 근사, 실제 조직 변형이 아니다):
#   - 혈류 축: 반월판은 첨판 정점 PCA의 가장 얇은 방향(상류 내강 → 판막 중심과 부호 맞춤).
#     방실판막은 첨판이 심실 쪽으로 늘어진 깔때기라 PCA가 맞지 않아 심방 내강 중심 → 심실 내강 중심을 쓴다.
#   - 부착부(가중치 0)는 고정, 자유연(가중치 1)일수록 많이 돌아간다.
#     반월판: 판막 중심에서 먼 바깥 테두리 = 부착부. 방실판막: 혈류 축에서 가장 상류(심방 쪽) = 판륜 부착부.
#     → 부착부는 남고 자유연이 하류·바깥쪽(벽 쪽)으로 젖혀진다.
#   - 회전축 = 법선 × 첨판 방사 방향, 경첩점 = 판륜 부착부. 정점마다 각도 = 최대각 × 가중치^1.2 (휘어지는 판 근사)
#     방실판막은 회전만 하면 자유연이 심방 쪽으로 올라가서, 가중치에 비례해 하류로 push_mm만큼 더 민다(교육용 값)
#   - 방실판막만: BodyParts3D 첨판 element에는 힘줄끈이 이미 들어 있다(유두근까지 이어짐, 렌더로 확인).
#     첨판 몸통(판륜에서 BODY_MM 깊이)은 경첩 회전, 유두근 표면 FADE_MM 안의 힘줄끈 끝은 유두근 변위를 따라 붙어 있게 한다.
#     별도 힘줄끈 모델은 만들지 않는다. 유두근(심실별)도 같은 판막 그룹에 넣는다. 유두근 'open' = 이완(조금 길어짐), 기본 = 수축.
#   - 모든 메시의 Morph 이름은 'open'. 판막 그룹(Empty) 하나에 Morph 애니메이션을 주면 첨판·힘줄끈·유두근이 함께 움직인다.
#   - 클립: <valve>_open, <valve>_close (NLA 트랙 이름 = glTF 클립 이름)
# 한계: 경첩 회전 근사다. 첨판의 실제 접힘·접합(coaptation)·혈류 압력을 재현하지 않는다. BodyParts3D 첨판이 닫힌 모양이라고 가정했다(확인 필요).
#
# 실행: blender --background --factory-startup --python tools/blender/rig_valves.py -- <extracted partof dir> <out.glb> <report.json>
import bpy
import bmesh
import sys
import os
import json
import math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT, REPORT = args[0], args[1], args[2]
FPS = 24

VALVES = {
    'tricuspid': {'kind': 'av', 'up': 'FJ2424', 'down': 'FJ2423', 'max_deg': 30, 'push_mm': 5,
                  'leaflets': {'heart_leaflet_tv_anterior': 'FJ2421', 'heart_leaflet_tv_posterior': 'FJ2433', 'heart_leaflet_tv_septal': 'FJ2436'}},
    'mitral': {'kind': 'av', 'up': 'FJ2425', 'down': 'FJ2422', 'max_deg': 30, 'push_mm': 5,
               'leaflets': {'heart_leaflet_mv_anterior': 'FJ2420', 'heart_leaflet_mv_posterior': 'FJ2432'}},
    'pulmonary': {'kind': 'sl', 'up': 'FJ2423', 'down': None, 'max_deg': 55,
                  'leaflets': {'heart_cusp_pv_left_anterior': 'FJ2417', 'heart_cusp_pv_right_anterior': 'FJ2434', 'heart_cusp_pv_posterior': 'FJ2427'}},
    'aortic': {'kind': 'sl', 'up': 'FJ2422', 'down': None, 'max_deg': 55,
               'leaflets': {'heart_cusp_av_anterior': 'FJ2435', 'heart_cusp_av_left_posterior': 'FJ2426', 'heart_cusp_av_right_posterior': 'FJ2431'}},
}
PAPILLARY = ['FJ2418', 'FJ2419', 'FJ2429', 'FJ2430', 'FJ2437']
PAP_STRETCH = 0.10          # 이완 때 길이 +10% (교육용 값)
BODY_MM = 14.0              # 방실판막 몸통 깊이(판륜 → 자유연 근사, 교육용 값)
FADE_MM = 10.0              # 유두근 표면에서 이 거리 안의 정점(힘줄끈 끝)은 유두근 변위를 따른다
OPEN_FRAMES = 8             # 24fps 기준 약 0.33초 (교육용)
CLOSE_FRAMES = 7

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = FPS


def imp(fj, name):
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=os.path.join(SRC, fj + '.obj'), forward_axis='Y', up_axis='Z', global_scale=1.0)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    if len(new) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in new:
            o.select_set(True)
        bpy.context.view_layer.objects.active = new[0]
        bpy.ops.object.join()
    o = new[0]
    o.name = name
    o.data.name = name
    return o


def verts_world(o):
    return np.array([list(o.matrix_world @ v.co) for v in o.data.vertices])


def centroid_of(fj):
    o = imp(fj, 'tmp_' + fj)
    c = verts_world(o).mean(axis=0)
    bpy.data.objects.remove(o, do_unlink=True)
    return c


def rot(axis, ang):
    return Matrix.Rotation(ang, 3, Vector(axis))


cav = {fj: centroid_of(fj) for fj in ['FJ2422', 'FJ2423', 'FJ2424', 'FJ2425']}
report = {'source': 'BodyParts3D 4.0 PART-OF leaflet/cusp OBJs, cavities, papillary muscles', 'fps': FPS, 'valves': {},
          'cavity_centroids_mm': {fj: [round(float(x), 2) for x in c] for fj, c in cav.items()}}
groups = {}
leaf_objs = {}
for vname in VALVES:
    g = bpy.data.objects.new('valve_' + vname, None)
    sc.collection.objects.link(g)
    groups[vname] = g

# ---------- 유두근: 심실별 (먼저 만든다: 방실판막 첨판에 붙은 힘줄끈의 고정점) ----------
pap = {}
report['papillary'] = {}
for fj in PAPILLARY:
    o = imp(fj, 'pap_' + fj)
    P = verts_world(o)
    c = P.mean(axis=0)
    side = 'lv' if np.linalg.norm(c - cav['FJ2422']) < np.linalg.norm(c - cav['FJ2423']) else 'rv'
    vname = 'mitral' if side == 'lv' else 'tricuspid'
    atrium = cav['FJ2425'] if side == 'lv' else cav['FJ2424']
    w, vecs = np.linalg.eigh(np.cov((P - c).T))
    ax = vecs[:, 2]
    if np.dot(ax, atrium - c) < 0:
        ax = -ax                                     # 판막(심방) 쪽 끝 방향
    t = (P - c) @ ax
    base_t = t.min()
    o.name = 'heart_papillary_{}_{}'.format(side, fj)
    o.shape_key_add(name='Basis')
    sk = o.shape_key_add(name='open')
    sk.value = 0.0
    disp = np.outer((t - base_t) * PAP_STRETCH, ax)  # 기저부 고정, 끝으로 갈수록 길어짐(이완)
    for i in range(len(P)):
        sk.data[i].co = Vector(P[i] + disp[i])
    pap[fj] = (o, P, side, disp)
    o.parent = groups[vname]
    report['papillary'][o.name] = {'side': side, 'length_mm': round(float(t.max() - t.min()), 2), 'valve_group': 'valve_' + vname}


def pap_tree(side):
    pts = []
    dsp = []
    for fj, (o, P, s, disp) in pap.items():
        if s == side:
            pts.extend(P)
            dsp.extend(disp)
    kd = KDTree(len(pts))
    for i, p in enumerate(pts):
        kd.insert(Vector(p), i)
    kd.balance()
    return kd, np.array(dsp)


report['chordae_handling'] = ('BodyParts3D AV leaflet elements already include chordae tendineae running to the papillary muscles. '
                              'Leaflet body rotates (depth-weighted hinge); chordae displacement fades to the papillary displacement within '
                              '{} mm of the papillary surface so they stay attached. No separate chordae model was made.'.format(FADE_MM))

for vname, V in VALVES.items():
    objs = {pid: imp(fj, pid) for pid, fj in V['leaflets'].items()}
    allv = np.vstack([verts_world(o) for o in objs.values()])
    c = allv.mean(axis=0)
    w, vecs = np.linalg.eigh(np.cov((allv - c).T))
    if V['kind'] == 'av':
        # 방실판막 첨판(+힘줄끈)은 심실 쪽으로 늘어진 깔때기 모양이라 PCA 얇은 방향이 혈류 축이 아니다 → 심방 내강 중심 → 심실 내강 중심
        flow = cav[V['down']] - cav[V['up']]
        n = flow / np.linalg.norm(flow)
        kd, pdisp = pap_tree('lv' if vname == 'mitral' else 'rv')
    else:
        n = vecs[:, 0]                               # 반월판: 가장 얇은 방향 = 판막면 법선
        flow = c - cav[V['up']]                      # 상류 내강 → 판막 중심
        if np.dot(n, flow) < 0:
            n = -n
    angle_flow = math.degrees(math.acos(min(1, abs(np.dot(n, flow / np.linalg.norm(flow))))))
    rep = {'center_mm': [round(x, 2) for x in c], 'normal': [round(x, 4) for x in n], 'pca_eigen_mm2': [round(x, 2) for x in w],
           'normal_vs_flow_deg': round(angle_flow, 1), 'max_open_deg': V['max_deg'], 'leaflets': {}}
    g = groups[vname]
    for pid, o in objs.items():
        P = verts_world(o)
        d = P - c
        along = d @ n
        radial = d - np.outer(along, n)
        r = np.linalg.norm(radial, axis=1)
        rmin, rmax = float(r.min()), float(r.max())
        fade = np.ones(len(P))
        near_disp = np.zeros_like(P)
        depth = None
        if V['kind'] == 'av':
            # 방실판막: 상류(심방) 쪽 끝 = 판륜 부착부. 몸통 깊이(BODY_MM)까지 각도가 커지고, 그 아래(힘줄끈)는 같은 각도
            depth = along - float(along.min())
            wgt = np.clip(depth / BODY_MM, 0, 1)
            body = depth <= BODY_MM
            lc = radial[body].mean(axis=0)
            for i in range(len(P)):
                co, j, dist = kd.find(Vector(P[i]))
                fade[i] = min(1.0, dist / FADE_MM)
                near_disp[i] = pdisp[j]
        else:
            # 반월판: 바깥 테두리 = 벽 부착부, 중심 쪽 = 자유연
            wgt = 1.0 - (r - rmin) / max(rmax - rmin, 1e-6)
            lc = radial.mean(axis=0)
        u = lc / np.linalg.norm(lc)                  # 첨판 방사 방향(판막 중심 → 첨판)
        wgt = np.clip(wgt, 0, 1) ** 1.2
        k = np.cross(n, u)
        k = k / np.linalg.norm(k)
        # 경첩점: 부착부(가중치 하위 10%) 정점 평균
        rim = P[wgt <= np.quantile(wgt, 0.10)].mean(axis=0)
        o.shape_key_add(name='Basis')
        sk = o.shape_key_add(name='open')
        sk.value = 0.0
        disp = np.zeros_like(P)
        for i in range(len(P)):
            R = rot(k, math.radians(V['max_deg']) * wgt[i])
            q = np.array(Vector(rim) + R @ Vector(P[i] - rim) + Vector(n) * (V.get('push_mm', 0) * wgt[i]))
            # 힘줄끈: 유두근 가까이에서는 유두근 변위를 따르고, 멀어질수록 첨판 회전을 따른다
            disp[i] = (q - P[i]) * fade[i] + near_disp[i] * (1 - fade[i])
            sk.data[i].co = Vector(P[i] + disp[i])
        if depth is None:
            edge = wgt >= 0.9
        else:
            edge = np.abs(depth - BODY_MM) < 2.0
        down = float((disp[edge] @ n).mean()) if edge.any() else 0.0
        outw = float((disp[edge] @ u).mean()) if edge.any() else 0.0
        rep['leaflets'][pid] = {'verts': len(P), 'r_min_mm': round(rmin, 2), 'r_max_mm': round(rmax, 2),
                                'free_edge_move_downstream_mm': round(down, 2), 'free_edge_move_outward_mm': round(outw, 2),
                                'max_disp_mm': round(float(np.linalg.norm(disp, axis=1).max()), 2),
                                'anchored_near_papillary_verts': int((fade < 1).sum())}
        o.parent = g
        leaf_objs[pid] = (o, P, disp, wgt, vname)
    report['valves'][vname] = rep

# ---------- 재질 ----------
mat_l = bpy.data.materials.new('valve_leaflet')
mat_l.diffuse_color = (0.93, 0.86, 0.72, 1)
mat_p = bpy.data.materials.new('papillary')
mat_p.diffuse_color = (0.70, 0.30, 0.30, 1)
for pid, (o, *_r) in leaf_objs.items():
    o.data.materials.clear()
    o.data.materials.append(mat_l)
for fj, v in pap.items():
    v[0].data.materials.clear()
    v[0].data.materials.append(mat_p)

# ---------- 클립 (NLA 트랙 이름 = glTF 클립 이름) ----------
def key_track(o, clip, frames):
    kd = o.data.shape_keys
    kd.animation_data_create()
    act = bpy.data.actions.new('{}__{}'.format(clip, o.name))
    kd.animation_data.action = act
    kb = kd.key_blocks['open']
    for f, val in frames:
        kb.value = val
        kb.keyframe_insert('value', frame=f)
    tr = kd.animation_data.nla_tracks.new()
    tr.name = clip
    st = tr.strips.new(clip, frames[0][0], act)
    st.name = clip
    kd.animation_data.action = None
    kb.value = 0.0


clips = {}
for vname, g in groups.items():
    members = [o for o in g.children if o.data.shape_keys]
    for o in members:
        key_track(o, vname + '_open', [(1, 0.0), (1 + OPEN_FRAMES, 1.0)])
        key_track(o, vname + '_close', [(1, 1.0), (1 + CLOSE_FRAMES, 0.0)])
    clips[vname + '_open'] = {'frames': OPEN_FRAMES, 'seconds': round(OPEN_FRAMES / FPS, 3), 'meshes': len(members)}
    clips[vname + '_close'] = {'frames': CLOSE_FRAMES, 'seconds': round(CLOSE_FRAMES / FPS, 3), 'meshes': len(members)}
report['clips'] = clips

# mm → m, glTF Y-up 변환 한 번 (heart-v2.glb와 같은 원점·배율)
root = bpy.data.objects.new('heart_valves_rig', None)
sc.collection.objects.link(root)
for g in groups.values():
    g.parent = root
root.scale = (0.001, 0.001, 0.001)
sc.frame_start = 1
sc.frame_end = 1 + OPEN_FRAMES
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False, export_morph=True,
                          export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=False, use_selection=False)


def zero_default_weights(path):
    # NLA 트랙을 평가한 프레임 값(1)이 mesh.weights 기본값으로 들어가서, 닫힌 상태(0)로 고친다
    import struct
    b = open(path, 'rb').read()
    jlen = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jlen])
    for m in j['meshes']:
        if 'weights' in m:
            m['weights'] = [0 for _ in m['weights']]
    js = json.dumps(j, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    rest = b[20 + jlen:]
    total = 12 + 8 + len(js) + len(rest)
    out = b[:8] + struct.pack('<I', total) + struct.pack('<I', len(js)) + b'JSON' + js + rest
    open(path, 'wb').write(out)


zero_default_weights(OUT)
report['file'] = OUT
report['bytes'] = os.path.getsize(OUT)
report['verification_status'] = 'EDUCATIONAL_APPROXIMATION; hinge-rotation shape keys; not tissue deformation; NOT medically verified'
json.dump(report, open(REPORT, 'w', encoding='utf-8'), indent=1)
print('[rig]', json.dumps({k: {'n_vs_flow': v['normal_vs_flow_deg']} for k, v in report['valves'].items()}), report['bytes'])
