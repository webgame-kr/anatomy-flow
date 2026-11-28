# 생리 조절 개념 장면 생성기 (STEP 04-C, 개발 도구 — 수업 범위 밖)
# 출력: content/animations/physiology-concept.json
# - 혈압 조절(압력수용체 반사·RAAS)을 한 화면에서 보이는 교육용 개념 배치다. 실제 해부학 위치·크기가 아니다(CONCEPTUAL).
# - 심장은 심장주기 개념 모델(content/animations/cardiac-concept.json)의 방·실·판막·대혈관 도형을 그대로 쓴다.
# - 신경 신호와 호르몬은 개념 경로(Anchor 대신 장면 좌표)를 따라 움직이는 신호 Actor로 보인다.
#   실제 신경 모델(Z-Anatomy 미주신경 등)은 기관 장면(Sandbox RP)에 있고, 이 개념 장면은 그 주행을 따르지 않는다.
# 실행: python tools/content/make_physiology_concept.py
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
O = [100.0, 0.0, 0.0]


def W(p):
    return [round(O[0] + p[0], 4), round(O[1] + p[1], 4), round(O[2] + p[2], 4)]


cardiac = json.load(open(os.path.join(ROOT, 'content', 'animations', 'cardiac-concept.json'), encoding='utf-8'))
heart_objects = []
for o in cardiac['groups'][0]['objects']:
    heart_objects.append(dict(o))

P = {
    'medulla': [0.0, 2.3, -0.35], 'pituitary': [-0.38, 2.42, -0.1], 'carotid_sinus': [0.31, 1.85, 0.05], 'aortic_sinus': [0.08, 0.32, 0.04],
    'heart_lv': [0.3, -0.27, 0.0], 'heart_ra': [-0.36, 0.42, 0.02], 'arteriole': [1.6, 0.25, 0.1], 'jg': [1.2, -0.9, -0.08],
    'kidney': [1.38, -1.05, -0.25], 'tubule': [1.55, -0.95, -0.02], 'adrenal': [1.32, -0.6, -0.3], 'liver': [-1.3, -0.95, 0.1],
    'lung': [-1.45, 0.75, -0.1], 'blood_pool': [-0.85, -1.62, 0.2],
}

objects = list(heart_objects)


def add(o):
    objects.append(o)


add({'id': 'phy.medulla', 'name_ko': '숨뇌(연수) — 심혈관 중추 (개념)', 'shape': 'sphere', 'center': P['medulla'], 'radius': 0.17, 'color': '#f1e3b5', 'opacity': 0.9})
add({'id': 'phy.pituitary', 'name_ko': '시상하부·뇌하수체 후엽 (개념)', 'shape': 'sphere', 'center': P['pituitary'], 'radius': 0.08, 'color': '#e9c9e0', 'opacity': 0.9})
add({'id': 'phy.spinal_cord', 'name_ko': '척수 (개념)', 'shape': 'tube', 'points': [[0.0, 2.15, -0.45], [0.0, 1.2, -0.52], [0.0, 0.0, -0.55], [0.0, -1.4, -0.55]],
     'radius': 0.05, 'color': '#f1e3b5', 'opacity': 0.7})
add({'id': 'phy.carotid', 'name_ko': '온목동맥 (개념)', 'shape': 'tube', 'points': [[0.15, 0.85, 0.0], [0.28, 1.45, 0.05], [0.32, 2.1, 0.05]], 'radius': 0.045,
     'color': '#c05a5a', 'opacity': 0.55})
add({'id': 'phy.carotid_sinus', 'name_ko': '목동맥팽대 압력수용체 (개념)', 'shape': 'sphere', 'center': P['carotid_sinus'], 'radius': 0.065, 'color': '#4fc3f7', 'opacity': 0.95})
add({'id': 'phy.aortic_sinus', 'name_ko': '대동맥동 압력수용체 (대동맥판 바로 위, 개념)', 'shape': 'sphere', 'center': P['aortic_sinus'], 'radius': 0.05, 'color': '#4fc3f7', 'opacity': 0.95})
add({'id': 'phy.arteriole', 'name_ko': '세동맥 (개념, 지름 변형)', 'shape': 'tube', 'points': [[1.2, 0.3, 0.1], [1.6, 0.25, 0.1], [2.0, 0.3, 0.1]], 'radius': 0.09,
     'color': '#d0605a', 'opacity': 0.6})
add({'id': 'phy.kidney', 'name_ko': '신장 (개념)', 'shape': 'ellipsoid', 'center': P['kidney'], 'radius': [0.22, 0.3, 0.15], 'color': '#9b4a3c', 'opacity': 0.55})
add({'id': 'phy.kidney_jg', 'name_ko': '사구체옆세포 (개념)', 'shape': 'sphere', 'center': P['jg'], 'radius': 0.06, 'color': '#c9ad63', 'opacity': 0.95})
add({'id': 'phy.tubule', 'name_ko': '원위세뇨관·집합관 (개념)', 'shape': 'tube', 'points': [[1.45, -1.25, -0.02], [1.62, -1.0, -0.02], [1.5, -0.8, -0.02]], 'radius': 0.035,
     'color': '#9fb4c9', 'opacity': 0.9})
add({'id': 'phy.adrenal', 'name_ko': '부신피질 (개념)', 'shape': 'ellipsoid', 'center': P['adrenal'], 'radius': [0.13, 0.07, 0.09], 'color': '#d9a845', 'opacity': 0.9})
add({'id': 'phy.liver', 'name_ko': '간 — 안지오텐시노겐 (개념)', 'shape': 'ellipsoid', 'center': P['liver'], 'radius': [0.4, 0.22, 0.25], 'color': '#8a4b3a', 'opacity': 0.6})
add({'id': 'phy.lung', 'name_ko': '폐 혈관 — ACE 풍부 (개념)', 'shape': 'ellipsoid', 'center': P['lung'], 'radius': [0.3, 0.42, 0.22], 'color': '#e8a0ac', 'opacity': 0.45})
add({'id': 'phy.blood_pool', 'name_ko': '혈액량 표시 (개념)', 'shape': 'sphere', 'center': P['blood_pool'], 'radius': 0.14, 'color': '#c04040', 'opacity': 0.9})
NERVES = {
    'phy.nerve_symp': ('교감신경 → 심장 (개념)', [[0.06, 2.15, -0.35], [0.06, 1.3, -0.5], [0.25, 0.2, -0.2], P['heart_lv']], '#c98a5a'),
    'phy.nerve_symp_v': ('교감신경 → 세동맥 (개념)', [[0.08, 2.15, -0.35], [0.06, 0.9, -0.5], [1.0, 0.4, -0.1], P['arteriole']], '#c98a5a'),
    'phy.nerve_symp_k': ('교감신경 → 신장 (개념)', [[0.08, 2.15, -0.35], [0.06, -0.6, -0.5], [0.9, -0.85, -0.2], P['jg']], '#c98a5a'),
    'phy.nerve_vagus': ('미주신경(부교감) → 심장 (개념)', [[-0.1, 2.15, -0.3], [-0.25, 1.2, -0.15], P['heart_ra']], '#5aa572'),
    'phy.nerve_glosso': ('목동맥팽대 → 숨뇌 구심 신경 (개념, 혀인두신경)', [P['carotid_sinus'], [0.2, 2.1, -0.15], [0.08, 2.25, -0.3]], '#3f86b3'),
    'phy.nerve_aortic_aff': ('대동맥동 → 숨뇌 구심 신경 (개념, 미주신경 구심)', [P['aortic_sinus'], [-0.05, 1.2, -0.1], [-0.06, 2.2, -0.3]], '#3f86b3'),
}
for nid in NERVES:
    ko, pts, col = NERVES[nid]
    add({'id': nid, 'name_ko': ko, 'shape': 'tube', 'points': pts, 'radius': 0.018, 'color': col, 'opacity': 0.85})

# ---------- 신호 경로 (장면 좌표) ----------
ROUTES = {
    'phy.path.carotid_medulla': ('목동맥팽대 → 숨뇌 (구심)', NERVES['phy.nerve_glosso'][1]),
    'phy.path.aortic_medulla': ('대동맥동 → 숨뇌 (구심)', NERVES['phy.nerve_aortic_aff'][1]),
    'phy.path.symp_heart': ('숨뇌 → 척수 → 심장 (교감 원심)', NERVES['phy.nerve_symp'][1]),
    'phy.path.symp_vessel': ('숨뇌 → 척수 → 세동맥 (교감 원심)', NERVES['phy.nerve_symp_v'][1]),
    'phy.path.symp_kidney': ('숨뇌 → 척수 → 신장 사구체옆세포 (교감 원심)', NERVES['phy.nerve_symp_k'][1]),
    'phy.path.vagus_heart': ('숨뇌 → 미주신경 → 심장 (부교감 원심)', NERVES['phy.nerve_vagus'][1]),
    'phy.path.kidney_liver': ('신장(레닌) → 혈액 → 간 쪽 (효소)', [P['jg'], [0.0, -1.35, 0.15], P['liver']]),
    'phy.path.liver_lung': ('혈액 → 폐 혈관 (안지오텐신 I)', [P['liver'], [-1.7, 0.0, 0.1], P['lung']]),
    'phy.path.lung_vessel': ('혈액 → 세동맥 (안지오텐신 II)', [P['lung'], [-0.4, 1.15, 0.45], [0.9, 0.7, 0.35], P['arteriole']]),
    'phy.path.lung_adrenal': ('혈액 → 부신피질 (안지오텐신 II)', [P['lung'], [-0.6, 0.0, 0.5], [0.6, -0.5, 0.35], P['adrenal']]),
    'phy.path.adrenal_tubule': ('부신피질 → 혈액 → 세뇨관 (알도스테론)', [P['adrenal'], [1.6, -0.7, 0.05], P['tubule']]),
    'phy.path.pituitary_tubule': ('뇌하수체 후엽 → 혈액 → 집합관 (ADH)', [P['pituitary'], [-0.6, 1.6, 0.4], [0.9, 0.2, 0.4], P['tubule']]),
}
paths = []
for pid in ROUTES:
    ko, pts = ROUTES[pid]
    base = pid.replace('phy.path.', 'cp.phy.')
    paths.append({'path_id': pid, 'name_ko': ko, 'curve_type': 'catmull_rom', 'verification_status': 'CONCEPTUAL',
                  'points': [{'space': 'scene', 'position': W(p)} for p in pts],
                  'checkpoints': [{'checkpoint_id': base + '.from', 'path_progress': 0, 'stop_on_arrival': False, 'label': '출발'},
                                  {'checkpoint_id': base + '.to', 'path_progress': 1, 'stop_on_arrival': True, 'label': '도착'}],
                  'notes': '교육용 개념 경로. 실제 신경 주행·혈류 경로가 아니다.'})

SIGNAL_ACTORS = {
    'phy_sig_aff1': ('phy.path.carotid_medulla', 'nerve_signal', '구심 신호'), 'phy_sig_aff2': ('phy.path.aortic_medulla', 'nerve_signal', '구심 신호'),
    'phy_sig_sym1': ('phy.path.symp_heart', 'nerve_signal', '교감 신호'), 'phy_sig_sym2': ('phy.path.symp_vessel', 'nerve_signal', '교감 신호'),
    'phy_sig_sym3': ('phy.path.symp_kidney', 'nerve_signal', '교감 신호'), 'phy_sig_para': ('phy.path.vagus_heart', 'nerve_signal', '부교감 신호'),
    'phy_sig_renin': ('phy.path.kidney_liver', 'hormone', '레닌(효소)'), 'phy_sig_ang1': ('phy.path.liver_lung', 'hormone', '안지오텐신 I'),
    'phy_sig_ang2a': ('phy.path.lung_vessel', 'hormone', '안지오텐신 II'), 'phy_sig_ang2b': ('phy.path.lung_adrenal', 'hormone', '안지오텐신 II'),
    'phy_sig_aldo': ('phy.path.adrenal_tubule', 'hormone', '알도스테론'), 'phy_sig_adh': ('phy.path.pituitary_tubule', 'hormone', 'ADH'),
}
actors = []
for aid in SIGNAL_ACTORS:
    pid, kind, name = SIGNAL_ACTORS[aid]
    actors.append({'actor_id': aid, 'actor_type': kind, 'name': name + ' (표시용, 실제 크기·속도 아님)', 'display_size': 0.09, 'path_id': pid,
                   'speed': 0.8, 'rotation_mode': 'none', 'signal_actor': True})

anims = []
for vid, ch in (('lv', 'cc.lv'), ('rv', 'cc.rv')):
    anims.append({'animation_id': 'phy.beat.' + vid, 'target_id': ch, 'animation_type': 'procedural', 'procedure': 'morph_cycle', 'morph_target': 'contract',
                  'duration_ms': 800, 'params': {'period_ms': 800, 'min': 0, 'max': 1}, 'loop': True, 'verification_status': 'CONCEPTUAL',
                  'notes': '박동 표시. 기본 주기 800 ms = 75회/분. 재생 속도 = 심박수 배율, 가중치 = 수축력 단계(교육용). 실제 심실 용적 변화 아님'})
for aid, a, b in (('constrict', 1.0, 0.65), ('dilate', 1.0, 1.35), ('c_to_base', 0.65, 1.0), ('d_to_base', 1.35, 1.0), ('c_to_d', 0.65, 1.35), ('d_to_c', 1.35, 0.65)):
    anims.append({'animation_id': 'phy.arteriole.' + aid, 'target_id': 'phy.arteriole', 'animation_type': 'deform', 'duration_ms': 800, 'easing': 'ease_in_out',
                  'keyframes': [{'time': 0, 'value': a}, {'time': 1, 'value': b}], 'restore_on_cancel': True, 'verification_status': 'CONCEPTUAL',
                  'notes': '지름 배율은 교육용 값. 혈관 지름만으로 혈압 전체를 설명하지 않는다'})
structures = [{'structure_id': 'vessel.phy_arteriole', 'name_ko': '세동맥 긴장도 (개념)', 'kind': 'vessel',
               'states': ['BASELINE', 'VASOCONSTRICTION', 'VASODILATION'], 'initial': 'BASELINE',
               'transitions': {'BASELINE->VASOCONSTRICTION': {'animation': 'phy.arteriole.constrict'}, 'BASELINE->VASODILATION': {'animation': 'phy.arteriole.dilate'},
                               'VASOCONSTRICTION->BASELINE': {'animation': 'phy.arteriole.c_to_base'}, 'VASODILATION->BASELINE': {'animation': 'phy.arteriole.d_to_base'},
                               'VASOCONSTRICTION->VASODILATION': {'animation': 'phy.arteriole.c_to_d'}, 'VASODILATION->VASOCONSTRICTION': {'animation': 'phy.arteriole.d_to_c'}},
               'indicators': [], 'verification_status': 'CONCEPTUAL'}]
LABELS = [('숨뇌(연수) 심혈관 중추', P['medulla'], 0.22), ('시상하부·뇌하수체 후엽', P['pituitary'], 0.12), ('목동맥팽대', P['carotid_sinus'], 0.1),
          ('대동맥동', P['aortic_sinus'], 0.09), ('세동맥', P['arteriole'], 0.15), ('사구체옆세포', P['jg'], 0.1), ('신장', P['kidney'], -0.36),
          ('세뇨관', P['tubule'], 0.12), ('부신피질', P['adrenal'], 0.12), ('간(안지오텐시노겐)', P['liver'], 0.28), ('폐 혈관(ACE 풍부)', P['lung'], 0.48),
          ('혈액량', P['blood_pool'], 0.2), ('심장', [0.0, -0.75, 0.2], 0.0)]
DX = {'시상하부·뇌하수체 후엽': -0.45}     # 숨뇌 라벨과 겹치지 않게 옆으로
labels = []
for text, p, dy in LABELS:
    labels.append({'text': text, 'position': W([p[0] + DX.get(text, 0), p[1] + dy, p[2]])})

doc = {
    'version': 1, 'scene_id': 'concept.physiology', 'verification_status': 'CONCEPTUAL',
    'description': '혈압 조절 개념 장면: 심장(심장주기 개념 모델), 압력수용체, 숨뇌, 교감·부교감 신경, 세동맥, 신장·사구체옆세포·세뇨관, 부신피질, 간, 폐, 뇌하수체 후엽. 배치·크기·신호 속도는 교육용이다.',
    'units': {'time': 'ms', 'morph': '0~1'},
    'scale_scene': {'scene_id': 'concept.physiology', 'level': 'ORGAN', 'title_ko': '혈압 조절 개념 장면',
                    'unit_note': '기관 배치와 크기는 교육용 개념 배치 (실제 위치·비율 아님)',
                    'magnification_note': '신경 신호·호르몬은 보이도록 크게 그린 표시이며, 실제 속도·크기·개수가 아니다. 물리 시간은 압축했다.',
                    'actor_display_size': 0.09, 'follow': {'distance': 1.4, 'height': 0.4, 'side': 0.3, 'smooth': 4}, 'view_direction': [0.1, 0.15, 1]},
    'groups': [{'group_id': 'concept.physiology', 'name_ko': '혈압 조절 개념 장면', 'origin': O, 'backdrop': {'radius': 9, 'color': '#1d2130'},
                'verification_status': 'CONCEPTUAL', 'objects': objects}],
    'animations': anims, 'structures': structures, 'timelines': [],
    'motion': {'scene_id': 'concept.physiology', 'marker_size': 0.02, 'paths': paths, 'actors': actors},
    'labels': labels,
    'generator': 'tools/content/make_physiology_concept.py',
}
out = os.path.join(ROOT, 'content', 'animations', 'physiology-concept.json')
json.dump(doc, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('WROTE', out, len(objects), 'objects', len(paths), 'paths', len(actors), 'signal actors', len(anims), 'animations')
