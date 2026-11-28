# heart-v2 판막 리깅 모델용 애니메이션·구조 상태·경로 콘텐츠 생성기 (개발 도구, 수업 범위 밖)
# 입력: tools/content/heart-v2-valves-rig.report.json (tools/blender/rig_valves.py 결과 사본)
# 출력: content/animations/heart-v2-valves.json
# - 판막 개폐: 판막 그룹(Empty)에 Morph 'open' → 첨판(BodyParts3D 첨판에 포함된 힘줄끈 포함)·유두근이 함께 움직인다 (EDUCATIONAL_APPROXIMATION)
# - 심실 벽: 영역 모델(heart-v2-ventricle-regions)의 Morph 'contract' (GEOMETRY_DERIVED 영역 + 교육용 수축 값)
# - 경로: 내강 중심 → 판막 중심 → 내강 중심을 이은 APPROXIMATE 경로. 판막을 지나는 이동은 through로 막힌다.
# 실행: python tools/content/make_valve_rig_anim.py
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REP = json.load(open(os.path.join(ROOT, 'tools', 'content', 'heart-v2-valves-rig.report.json'), encoding='utf-8'))
RIG = 'bp3d-cv-heart-v2-valves-rig'
REG = 'bp3d-cv-heart-v2-regions'
NAMES = {'tricuspid': '삼첨판', 'mitral': '승모판', 'pulmonary': '폐동맥판', 'aortic': '대동맥판'}
COLORS = {'OPEN': '#3cb371', 'OPENING': '#9acd32', 'CLOSING': '#e0a040', 'CLOSED': '#d8cdb8'}


def g(p_mm):
    # BodyParts3D(Blender Z-up, mm) → glTF 장면 좌표(m): (X, Z, -Y) × 0.001
    return [round(p_mm[0] * 0.001, 5), round(p_mm[2] * 0.001, 5), round(-p_mm[1] * 0.001, 5)]


def gv(v):
    return [v[0], v[2], -v[1]]


cav = REP['cavity_centroids_mm']
VC = {k: v['center_mm'] for k, v in REP['valves'].items()}
VN = {k: v['normal'] for k, v in REP['valves'].items()}

anims = []
structs = []
for v, ko in NAMES.items():
    grp = '{}/valve_{}'.format(RIG, v)
    anims.append({'animation_id': 'hv2.{}.open'.format(v), 'target_id': grp, 'animation_type': 'morph', 'morph_target': 'open',
                  'duration_ms': 330, 'easing': 'ease_out', 'keyframes': [{'time': 0, 'value': 0}, {'time': 1, 'value': 1}],
                  'restore_on_cancel': True, 'verification_status': 'EDUCATIONAL_APPROXIMATION',
                  'notes': '첨판 경첩 회전 근사(Blender Shape Key). 실제 첨판 조직 변형·접합이 아니다. 시간은 교육용 값.'})
    anims.append({'animation_id': 'hv2.{}.close'.format(v), 'target_id': grp, 'animation_type': 'morph', 'morph_target': 'open',
                  'duration_ms': 290, 'easing': 'ease_in', 'keyframes': [{'time': 0, 'value': 1}, {'time': 1, 'value': 0}],
                  'restore_on_cancel': True, 'verification_status': 'EDUCATIONAL_APPROXIMATION'})
    anims.append({'animation_id': 'hv2.{}.clip_open'.format(v), 'target_id': RIG, 'animation_type': 'clip', 'clip_name': v + '_open',
                  'verification_status': 'EDUCATIONAL_APPROXIMATION', 'notes': 'GLB 내장 클립(같은 Shape Key). 클립 재생 확인용.'})
    structs.append({'structure_id': 'valve.' + v, 'name_ko': ko, 'kind': 'valve', 'states': ['CLOSED', 'OPENING', 'OPEN', 'CLOSING'],
                    'initial': 'CLOSED',
                    'transitions': {'CLOSED->OPEN': {'via': 'OPENING', 'animation': 'hv2.{}.open'.format(v)},
                                    'OPEN->CLOSED': {'via': 'CLOSING', 'animation': 'hv2.{}.close'.format(v)}},
                    'indicators': [],
                    'verification_status': 'EDUCATIONAL_APPROXIMATION',
                    'notes': 'BodyParts3D 첨판(첨판별 독립 Mesh)에 경첩 회전 Shape Key를 붙인 교육용 근사. 판막 상태가 OPEN이 아니면 through 이동이 막힌다.'})

for side, ko in (('lv_free', '좌심실 자유벽'), ('rv_free', '우심실 자유벽'), ('septum', '심실중격 영역')):
    tid = '{}/heart_wall_{}'.format(REG, side)
    anims.append({'animation_id': 'hv2.{}.contract'.format(side), 'target_id': tid, 'animation_type': 'morph', 'morph_target': 'contract',
                  'duration_ms': 300, 'easing': 'ease_in_out', 'keyframes': [{'time': 0, 'value': 0}, {'time': 1, 'value': 1}],
                  'restore_on_cancel': True, 'verification_status': 'EDUCATIONAL_APPROXIMATION',
                  'notes': ko + ': 내강 중심 쪽으로 당기는 교육용 근사. 실제 심근 수축 모양·양이 아니다. 영역 경계는 기하 분할(GEOMETRY_DERIVED).'})
    anims.append({'animation_id': 'hv2.{}.relax'.format(side), 'target_id': tid, 'animation_type': 'morph', 'morph_target': 'contract',
                  'duration_ms': 450, 'easing': 'ease_in_out', 'keyframes': [{'time': 0, 'value': 1}, {'time': 1, 'value': 0}],
                  'restore_on_cancel': True, 'verification_status': 'EDUCATIONAL_APPROXIMATION'})


def through_path(pid, ko, a_mm, valve, b_mm, ext_mm=0):
    pts = [g(a_mm), g(VC[valve])]
    if b_mm is None:
        n = VN[valve]
        b_mm = [VC[valve][i] + n[i] * ext_mm for i in range(3)]
    pts.append(g(b_mm))
    return {'path_id': pid, 'name_ko': ko, 'curve_type': 'catmull_rom', 'verification_status': 'APPROXIMATE',
            'points': [{'space': 'scene', 'position': p} for p in pts],
            'checkpoints': [{'checkpoint_id': pid.replace('hv2.', 'cp.hv2.') + '.start', 'path_progress': 0, 'stop_on_arrival': False, 'label': '시작'},
                            {'checkpoint_id': pid.replace('hv2.', 'cp.hv2.') + '.end', 'path_progress': 1, 'stop_on_arrival': True, 'label': '도착'}],
            'notes': '내강 중심 → 판막 중심(첨판 정점 평균) → 다음 공간을 이은 근사 경로. 내강 중심선 추적·기하 검사를 하지 않았다.'}


paths = [
    through_path('hv2.ra_rv', '우심방 → 삼첨판 → 우심실 (근사)', cav['FJ2424'], 'tricuspid', cav['FJ2423']),
    through_path('hv2.la_lv', '좌심방 → 승모판 → 좌심실 (근사)', cav['FJ2425'], 'mitral', cav['FJ2422']),
    through_path('hv2.rv_pa', '우심실 → 폐동맥판 → 폐동맥줄기 (근사)', cav['FJ2423'], 'pulmonary', None, 18),
    through_path('hv2.lv_ao', '좌심실 → 대동맥판 → 오름대동맥 (근사)', cav['FJ2422'], 'aortic', None, 18),
]
actors = [
    {'actor_id': 'hv2_rbc_r', 'actor_type': 'red_blood_cell', 'model_id': 'rbc', 'name': '적혈구 (표시용 확대)', 'display_size': 0.006,
     'path_id': 'hv2.ra_rv', 'speed': 0.03, 'rotation_mode': 'tangent', 'biological_state': {'oxygenation': 'deoxygenated'}},
    {'actor_id': 'hv2_rbc_l', 'actor_type': 'red_blood_cell', 'model_id': 'rbc', 'name': '적혈구 (표시용 확대)', 'display_size': 0.006,
     'path_id': 'hv2.la_lv', 'speed': 0.03, 'rotation_mode': 'tangent', 'biological_state': {'oxygenation': 'oxygenated'}},
]


def move(actor, cp, through, dur=1400):
    return {'type': 'command', 'command': {'action': 'actor_move_to_checkpoint', 'target': actor, 'checkpoint_id': cp, 'duration': dur},
            'wait': True, 'through': through}


def place(actor, cp):
    return {'type': 'command', 'command': {'action': 'actor_place_at_checkpoint', 'target': actor, 'checkpoint_id': cp}, 'wait': True}


timelines = [
    {'timeline_id': 'hv2.filling', 'blocking': True, 'name_ko': '심실 충만 (방실판막 열림)', 'steps': [
        {'type': 'parallel', 'steps': [
            {'type': 'state', 'set': {'valve.pulmonary': 'CLOSED', 'valve.aortic': 'CLOSED'}, 'wait': True},
            {'type': 'animation', 'animation_id': 'hv2.lv_free.relax', 'wait': True},
            {'type': 'animation', 'animation_id': 'hv2.rv_free.relax', 'wait': True},
            {'type': 'animation', 'animation_id': 'hv2.septum.relax', 'wait': True}]},
        {'type': 'state', 'set': {'valve.tricuspid': 'OPEN', 'valve.mitral': 'OPEN'}, 'wait': True},
        place('hv2_rbc_r', 'cp.hv2.ra_rv.start'), place('hv2_rbc_l', 'cp.hv2.la_lv.start'),
        {'type': 'parallel', 'steps': [move('hv2_rbc_r', 'cp.hv2.ra_rv.end', ['valve.tricuspid']),
                                       move('hv2_rbc_l', 'cp.hv2.la_lv.end', ['valve.mitral'])]}]},
    {'timeline_id': 'hv2.ejection', 'blocking': True, 'name_ko': '심실 박출 (방실판막 닫힘, 반월판 열림)', 'steps': [
        {'type': 'state', 'set': {'valve.tricuspid': 'CLOSED', 'valve.mitral': 'CLOSED'}, 'wait': True},
        {'type': 'parallel', 'steps': [
            {'type': 'animation', 'animation_id': 'hv2.lv_free.contract', 'wait': True},
            {'type': 'animation', 'animation_id': 'hv2.rv_free.contract', 'wait': True},
            {'type': 'animation', 'animation_id': 'hv2.septum.contract', 'wait': True},
            {'type': 'state', 'set': {'valve.pulmonary': 'OPEN', 'valve.aortic': 'OPEN'}, 'wait': True}]}]},
    {'timeline_id': 'hv2.blocked_test', 'blocking': True, 'name_ko': '닫힌 판막 통과 시도 (실패해야 정상)', 'steps': [
        {'type': 'state', 'set': {'valve.mitral': 'CLOSED'}, 'wait': True},
        place('hv2_rbc_l', 'cp.hv2.la_lv.start'),
        move('hv2_rbc_l', 'cp.hv2.la_lv.end', ['valve.mitral'])]},
]

doc = {
    'version': 1, 'scene_id': 'heart_valves', 'verification_status': 'EDUCATIONAL_APPROXIMATION',
    'description': 'heart-v2 판막 리깅(첨판 11개 경첩 회전 Shape Key, 방실판막 힘줄끈(원본 첨판 element에 포함)·유두근 연결)과 심실 벽 영역 수축. 교육용 근사이며 의학적 검증 전이다.',
    'units': {'time': 'ms', 'morph': '0~1'},
    'groups': [], 'animations': anims, 'structures': structs, 'timelines': timelines,
    'motion': {'scene_id': 'heart_valves', 'marker_size': 0.002, 'paths': paths, 'actors': actors},
    'generator': 'tools/content/make_valve_rig_anim.py',
}
out = os.path.join(ROOT, 'content', 'animations', 'heart-v2-valves.json')
json.dump(doc, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('WROTE', out, len(anims), 'animations', len(structs), 'structures', len(paths), 'paths')
