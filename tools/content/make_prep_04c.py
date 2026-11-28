# STEP 04-C 준비 데이터 생성기 (개발 도구, 수업 범위 밖)
# 출력: content/anatomy/regulation/prep-04c.json
#   - structures: 04-C에서 쓸 구조와 모델 위치(자산·노드), 모델 상태(MODEL / Z-ANATOMY_SA / ANCHOR_ONLY / MISSING)
#   - anchors: 장면 좌표(m) Anchor. 원본 OBJ 정점에서 계산(GEOMETRY_DERIVED) 또는 위치 표시용 근사(APPROXIMATE/CONCEPTUAL)
#   - educational_paths: 신호 전달 "교육용 경로"(CONCEPTUAL). 혈류 경로가 아니며 신경 모델을 따라가지 않는다.
# 게임 로직(압력반사·RAAS 판정)은 넣지 않는다. 04-C에서 Python 콘텐츠 규칙이 이 데이터를 참조한다.
# 실행: python tools/content/make_prep_04c.py
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EX = os.path.join(ROOT, 'raw-models', 'bodyparts3d', 'extracted')
ZA = os.path.join(ROOT, 'tools', 'out', 'za-regulation.json')


def plan_elements(system):
    p = json.load(open(os.path.join(ROOT, 'tools', 'out', system, 'plan.json'), encoding='utf-8'))
    out = {}
    for a in p['assets']:
        for part in a['parts']:
            out[part['id']] = [(e.get('tree', p.get('tree', 'partof')), e['file_id']) for e in part['elements']]
    return out


def verts(elements):
    vs = []
    for tree, fj in elements:
        path = os.path.join(EX, tree, fj + '.obj')
        for line in open(path, encoding='utf-8', errors='replace'):
            if line.startswith('v '):
                x, y, z = (float(v) for v in line.split()[1:4])
                vs.append((x * 0.001, z * 0.001, -y * 0.001))     # glTF 장면 좌표 (m)
    return vs


def mean(vs):
    n = len(vs)
    return [round(sum(v[i] for v in vs) / n, 5) for i in range(3)]


def extreme(vs, axis, low=True, band=0.004):
    # axis 방향으로 가장 낮은(높은) 쪽 band(m) 안 정점의 평균
    key = [v[axis] for v in vs]
    lim = (min(key) + band) if low else (max(key) - band)
    sel = [v for v in vs if (v[axis] <= lim if low else v[axis] >= lim)]
    return mean(sel), len(sel)


cv = plan_elements('cardiovascular')
sv = plan_elements('systemic-vessels')
rg = plan_elements('regulation-prep')
za = json.load(open(ZA, encoding='utf-8'))

anchors = []


def anchor(aid, ko, pos, status, how, structure=None):
    anchors.append({'anchor_id': aid, 'name_ko': ko, 'position': pos, 'coordinate_space': 'scene', 'anatomical_id': structure,
                    'verification_status': status, 'method': how})


ica = verts(rg['right_internal_carotid_artery'])
p, n = extreme(ica, 1, low=True)
anchor('a.04c.carotid_sinus_r', '오른목동맥팽대 위치(근사)', p, 'APPROXIMATE',
       'BodyParts3D 오른속목동맥 가장 아래 4 mm 정점 {}개 평균(속목동맥 시작부). 목동맥팽대 구조는 모델에 없다. 온목동맥 element 위 끝(y 1.373 m)과 속목동맥 아래 끝(y 1.435 m) 사이 약 6 cm가 비어 있어 갈림 부위 자체는 없다.'.format(n),
       'reg.carotid_sinus')
arch = verts([e for e in cv['aorta'] if e[1] == 'FJ3411']) if any(e[1] == 'FJ3411' for e in cv['aorta']) else verts([('partof', 'FJ3411')])
p, n = extreme(arch, 1, low=False)
anchor('a.04c.aortic_arch_baroreceptor', '대동맥활 압력수용체 위치(근사)', p, 'APPROXIMATE',
       'BodyParts3D 대동맥활(FJ3411) 가장 위 4 mm 정점 {}개 평균. 압력수용체 자체는 모델에 없다.'.format(n), 'cv.aorta')
med = verts(rg['medulla_oblongata'])
anchor('a.04c.medulla_cv_center', '숨뇌(심혈관 중추 위치 표시)', mean(med), 'CONCEPTUAL',
       'BodyParts3D 숨뇌 정점 평균. 심혈관 중추의 핵·영역은 모델에 없어 숨뇌 전체의 중심에 표시만 한다.', 'reg.medulla_oblongata')
cord = verts(rg['spinal_cord'])
# 가슴 위쪽 척수(교감신경 심장 가지가 나오는 높이 근사): 심장 위쪽 높이(y ≈ 1.30 m)의 척수 단면 평균
sl = [v for v in cord if abs(v[1] - 1.30) < 0.004]
if sl:
    anchor('a.04c.spinal_upper_thoracic', '척수 가슴 위쪽(교감 출력 높이, 근사)', mean(sl), 'APPROXIMATE',
           '척수 정점 중 y = 1.30 m ± 4 mm 단면 평균. 척수 분절(T1–T4) 경계는 모델에 없어 높이로만 근사했다.', 'reg.spinal_cord')
else:
    # BodyParts3D "spinal cord"(FMA7647) element는 숨뇌 바로 아래 3.5 cm뿐이다 → Z-Anatomy 척수 경계 상자로 위치만 근사
    # (Z-Anatomy "White matter of spinal cord"는 Readme의 출처 불명 "White matter"와 관계가 확인되지 않아 메시는 배포하지 않는다)
    inv = json.load(open(os.path.join(ROOT, 'tools', 'out', 'za_inventory.json'), encoding='utf-8'))
    wm = next(o for o in inv['objects'] if o['name'] == 'White matter of spinal cord')
    T = (0.0013, 0.0975, 0.0643)
    (x0, y0, z0), (x1, y1, z1) = wm['bbox']
    cx, cy = (x0 + x1) / 2 - T[0], (y0 + y1) / 2 - T[1]
    anchor('a.04c.spinal_upper_thoracic', '척수 가슴 위쪽(교감 출력 높이, 근사)', [round(cx, 5), 1.30, round(-cy, 5)], 'APPROXIMATE',
           'BodyParts3D 척수 element가 짧아(숨뇌 아래 3.5 cm) Z-Anatomy 척수 경계 상자 중심(x, 앞뒤)과 높이 y = 1.30 m로 위치만 근사했다. 척수는 등뼈를 따라 휘므로 실제 척수 위가 아닐 수 있다.',
           'reg.spinal_cord')
for side in ('right', 'left'):
    k = verts(rg[side + '_kidney'])
    anchor('a.04c.{}_kidney'.format(side), ('오른' if side == 'right' else '왼') + '콩팥 중심', mean(k), 'GEOMETRY_DERIVED', '콩팥 정점 평균', 'reg.{}_kidney'.format(side))
    a = verts(rg[side + '_adrenal_gland'])
    anchor('a.04c.{}_adrenal'.format(side), ('오른' if side == 'right' else '왼') + '부신 중심', mean(a), 'GEOMETRY_DERIVED', '부신 정점 평균', 'reg.{}_adrenal_gland'.format(side))
svc = verts(cv['superior_vena_cava'])
p, n = extreme(svc, 1, low=True)
anchor('a.04c.sa_node_display', '동방결절 위치 표시(개념)', p, 'CONCEPTUAL',
       '전도계 모델이 없다(BodyParts3D·Z-Anatomy 모두). 상대정맥 아래 끝(우심방과 만나는 곳) 정점 {}개 평균에 표시만 한다. 실제 동방결절 위치로 쓰지 않는다.'.format(n),
       'cv.right_atrium')
vg = za['objects']['Vagus nerve (X).r']['bbox_bp3d_m']
vmid = [round((vg[0][0] + vg[1][0]) / 2, 5), round((vg[0][2] + vg[1][2]) / 2, 5), round(-(vg[0][1] + vg[1][1]) / 2, 5)]
anchor('a.04c.right_vagus_mid', '오른미주신경 (경계 상자 중심, 표시용)', vmid, 'APPROXIMATE',
       'Z-Anatomy 오른미주신경(평행 이동 정렬) 경계 상자 중심. 신경 위의 점이 아닐 수 있다.', 'reg.right_vagus_nerve')

A = {a['anchor_id']: a['position'] for a in anchors}


def edu(pid, ko, ids, note):
    return {'path_id': pid, 'name_ko': ko, 'curve_type': 'catmull_rom', 'verification_status': 'CONCEPTUAL', 'kind': 'signal',
            'points': [{'space': 'scene', 'position': A[i], 'anchor_ref': i} for i in ids], 'notes': note}


paths = [
    edu('edu.04c.baro_afferent_carotid', '목동맥팽대 → 숨뇌 (구심 신호, 교육용)', ['a.04c.carotid_sinus_r', 'a.04c.medulla_cv_center'],
        '혀인두신경(IX) 모델이 없다. 두 Anchor를 이은 표시용 선이며 신경 주행이 아니다.'),
    edu('edu.04c.baro_afferent_aortic', '대동맥활 → 숨뇌 (구심 신호, 교육용)', ['a.04c.aortic_arch_baroreceptor', 'a.04c.right_vagus_mid', 'a.04c.medulla_cv_center'],
        '대동맥 압력수용체 신호는 미주신경으로 간다고 알려져 있으나 강의자료 대조 전이다. 표시용 선.'),
    edu('edu.04c.vagal_efferent', '숨뇌 → 미주신경 → 심장 (부교감 신호, 교육용)', ['a.04c.medulla_cv_center', 'a.04c.right_vagus_mid', 'a.04c.sa_node_display'],
        'Z-Anatomy 미주신경 메시가 있지만 경로는 그 위를 따르지 않는다(경계 상자 중심을 지나는 표시용 선).'),
    edu('edu.04c.sympathetic_efferent', '숨뇌 → 척수 → 교감신경 → 심장 (교감 신호, 교육용)', ['a.04c.medulla_cv_center', 'a.04c.spinal_upper_thoracic', 'a.04c.sa_node_display'],
        '교감신경줄기·심장신경 가지를 따르지 않는 표시용 선.'),
]

structures = [
    {'id': 'reg.medulla_oblongata', 'ko': '숨뇌', 'model': 'bp3d-reg-brainstem-spinal:medulla_oblongata', 'status': 'MODEL'},
    {'id': 'reg.spinal_cord', 'ko': '척수', 'model': 'bp3d-reg-brainstem-spinal:spinal_cord', 'status': 'PARTIAL', 'note': 'BodyParts3D element는 숨뇌 바로 아래 3.5 cm뿐. 전체 척수 모델 없음(Z-Anatomy 척수는 출처 확인 전이라 배포하지 않음)'},
    {'id': 'reg.right_kidney', 'ko': '오른콩팥', 'model': 'bp3d-reg-kidneys-adrenals:right_kidney', 'status': 'MODEL'},
    {'id': 'reg.left_kidney', 'ko': '왼콩팥', 'model': 'bp3d-reg-kidneys-adrenals:left_kidney', 'status': 'MODEL'},
    {'id': 'reg.right_adrenal_gland', 'ko': '오른부신', 'model': 'bp3d-reg-kidneys-adrenals:right_adrenal_gland', 'status': 'MODEL'},
    {'id': 'reg.left_adrenal_gland', 'ko': '왼부신', 'model': 'bp3d-reg-kidneys-adrenals:left_adrenal_gland', 'status': 'MODEL'},
    {'id': 'reg.diaphragm', 'ko': '가로막', 'model': 'bp3d-reg-diaphragm:diaphragm', 'status': 'MODEL'},
    {'id': 'reg.pancreas', 'ko': '이자', 'model': 'bp3d-reg-pancreas:pancreas', 'status': 'MODEL'},
    {'id': 'reg.right_common_carotid', 'ko': '오른온목동맥', 'model': 'bp3d-cv-systemic-vessels:right_common_carotid_artery', 'status': 'MODEL',
     'note': 'element 길이 약 3.4 cm. 갈림 부위까지 이어지지 않는다.'},
    {'id': 'reg.right_internal_carotid', 'ko': '오른속목동맥', 'model': 'bp3d-reg-carotid-branch:right_internal_carotid_artery', 'status': 'MODEL'},
    {'id': 'reg.aortic_arch', 'ko': '대동맥활', 'model': 'bp3d-cv-aorta:aorta', 'status': 'MODEL', 'note': '대동맥 전체 메시의 일부'},
    {'id': 'reg.thyroid_gland', 'ko': '갑상샘', 'model': 'za-reg-nerves-thyroid:thyroid_gland', 'status': 'Z-ANATOMY_SA'},
    {'id': 'reg.right_vagus_nerve', 'ko': '오른미주신경', 'model': 'za-reg-nerves-thyroid:right_vagus_nerve', 'status': 'Z-ANATOMY_SA'},
    {'id': 'reg.left_vagus_nerve', 'ko': '왼미주신경', 'model': 'za-reg-nerves-thyroid:left_vagus_nerve', 'status': 'Z-ANATOMY_SA'},
    {'id': 'reg.sympathetic_trunk', 'ko': '교감신경줄기', 'model': 'za-reg-nerves-thyroid:right_sympathetic_trunk', 'status': 'Z-ANATOMY_SA'},
    {'id': 'reg.carotid_sinus', 'ko': '목동맥팽대', 'model': None, 'status': 'ANCHOR_ONLY', 'anchor': 'a.04c.carotid_sinus_r'},
    {'id': 'reg.aortic_baroreceptor', 'ko': '대동맥활 압력수용체', 'model': None, 'status': 'ANCHOR_ONLY', 'anchor': 'a.04c.aortic_arch_baroreceptor'},
    {'id': 'reg.cv_center', 'ko': '심혈관 중추(숨뇌)', 'model': None, 'status': 'ANCHOR_ONLY', 'anchor': 'a.04c.medulla_cv_center'},
    {'id': 'reg.sa_node', 'ko': '동방결절', 'model': None, 'status': 'MISSING', 'anchor': 'a.04c.sa_node_display', 'note': '전도계 모델 없음'},
    {'id': 'reg.juxtaglomerular_apparatus', 'ko': '사구체곁장치', 'model': None, 'status': 'MISSING', 'note': '미세 구조. 필요하면 CONCEPTUAL 장면으로 만든다'},
    {'id': 'reg.glossopharyngeal_nerve', 'ko': '혀인두신경', 'model': None, 'status': 'MISSING', 'note': '교육용 경로로만 표시'},
]

doc = {'version': 1, 'step': '04-C 준비 (STEP 04-B+)', 'verification_status': 'NOT medically verified',
       'description': 'STEP 04-C(혈압 조절·자율신경·RAAS)에서 쓸 구조·Anchor·교육용 신호 경로. 게임 로직 없음. 좌표는 장면 좌표(m, glTF Y-up, BodyParts3D 원점).',
       'sandbox_scene': 'prep_04c', 'structures': structures, 'anchors': anchors, 'educational_paths': paths,
       'generator': 'tools/content/make_prep_04c.py'}
out_dir = os.path.join(ROOT, 'content', 'anatomy', 'regulation')
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, 'prep-04c.json')
json.dump(doc, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('WROTE', out, len(structures), 'structures', len(anchors), 'anchors', len(paths), 'paths')
for a in anchors:
    print(' ', a['anchor_id'], a['position'], a['verification_status'])
