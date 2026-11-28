# STEP 03-C 이동 명령 검사와 규칙 엔진 연결 테스트
# 실행: 프로젝트 폴더에서  python tests/test_motion_commands.py

import sys
sys.path.insert(0, 'py')

import scene_commands as sc
import motion_link as ml

passed = 0
failed = 0


def check(name, result):
    global passed, failed
    if result:
        passed += 1
        print('[통과] ' + name)
    else:
        failed += 1
        print('[실패] ' + name)


objects = [
    {'id': 'rbc_01', 'type': 'actor', 'visible': True},
    {'id': 'rbc_02', 'type': 'actor', 'visible': True},
    {'id': 'cube_01', 'type': 'primitive', 'visible': True},
]
sc.set_snapshot(objects, ['motion_f'], 'motion_f')
r = sc.set_paths([
    {'id': 'path_001', 'checkpoints': ['checkpoint_01', 'checkpoint_02']},
    {'id': 'path_002', 'checkpoints': []},
])
check('경로 목록 저장', r['paths'] == 2 and r['checkpoints'] == 2)

# 요구서 예시 형식
example = [
    {'action': 'actor_set_path', 'target': 'rbc_01', 'path_id': 'path_001'},
    {'action': 'actor_move_to_checkpoint', 'target': 'rbc_01', 'checkpoint_id': 'checkpoint_02', 'duration': 2000},
]
r = sc.build(example)
check('요구서 예시 명령 통과', r['ok'] and len(r['commands']) == 2)

check('없는 Actor', sc.validate({'action': 'actor_move', 'target': 'ghost'}) != '')
check('Actor가 아닌 객체', sc.validate({'action': 'actor_pause', 'target': 'cube_01'}) != '')
check('없는 경로', sc.validate({'action': 'actor_set_path', 'target': 'rbc_01', 'path_id': 'zz'}) != '')
check('없는 Checkpoint', sc.validate({'action': 'actor_move_to_checkpoint', 'target': 'rbc_01', 'checkpoint_id': 'zz'}) != '')
check('진행률 범위', sc.validate({'action': 'actor_seek', 'target': 'rbc_01', 'value': 1.2}) != '')
check('진행률 정상', sc.validate({'action': 'actor_seek', 'target': 'rbc_01', 'value': 0.5}) == '')
check('음수 속도', sc.validate({'action': 'actor_set_speed', 'target': 'rbc_01', 'value': -1}) != '')
check('잘못된 until', sc.validate({'action': 'actor_move', 'target': 'rbc_01', 'until': 'moon'}) != '')
check('until next_stop', sc.validate({'action': 'actor_move', 'target': 'rbc_01', 'until': 'next_stop'}) == '')
check('route 검사', sc.validate({'action': 'actor_move', 'target': 'rbc_01', 'route': ['path_002', 'zz']}) != '')
check('direction 검사', sc.validate({'action': 'actor_set_path', 'target': 'rbc_01', 'path_id': 'path_001', 'direction': 2}) != '')
check('Actor 생성 정상', sc.validate({'action': 'actor_create', 'target': 'rbc_09', 'value': {'actor_type': 'red_blood_cell'}}) == '')
check('Actor 생성 ID 중복', sc.validate({'action': 'actor_create', 'target': 'rbc_01', 'value': {}}) != '')
check('경로 표시 정상', sc.validate({'action': 'path_show', 'target': 'path_002'}) == '')
check('경로 표시 없는 경로', sc.validate({'action': 'path_hide', 'target': 'zz'}) != '')
check('카메라 추적 해제 (대상 없음)', sc.validate({'action': 'camera_unfollow'}) == '')
check('기존 STEP 02 명령 유지', sc.validate({'action': 'set_opacity', 'target': 'cube_01', 'value': 0.5}) == '')

r = sc.route_demo('rbc_01', 'path_001', 'checkpoint_02')
check('route_demo 명령 3개', r['ok'] and len(r['commands']) == 3)
r = sc.motion_error_test('rbc_01')
check('오류 테스트: 6개 중 5개 오류', len(r['errors']) == 5 and len(r['commands']) == 6)

# 규칙 엔진 연결
r = ml.setup('rbc_01', {'e1': {'path_id': 'path_001', 'checkpoint_id': 'checkpoint_01'}, 'e2': {'path_id': 'path_002'}})
check('연결 설정', r['edges'] == 2)
r = ml.to_motion([{'id': 3, 'type': 'move', 'edge': 'e1', 'duration': 1500}, {'id': 4, 'type': 'arrive', 'node': 'x'}])
check('move → actor_move_to_checkpoint', len(r['commands']) == 1 and r['commands'][0]['checkpoint_id'] == 'checkpoint_01')
check('변환 명령이 Python 검사 통과', sc.build(r['commands'])['ok'])
r2 = ml.motion_done('arrived')
check('도착 → arrive Edge', r2['result'] == 'arrive' and r2['edge'] == 'e1')
check('같은 결과 두 번째는 무시', ml.motion_done('arrived')['result'] == 'ignored')
r = ml.to_motion([{'type': 'move', 'edge': 'e2', 'reverse': True, 'duration': 800}])
check('Checkpoint 없는 Edge → set_path + move', len(r['commands']) == 2 and r['commands'][0]['direction'] == -1)
check('취소 결과 전달', ml.motion_done('cancelled')['result'] == 'cancelled')
r = ml.to_motion([{'type': 'move', 'edge': 'e9'}])
check('연결 안 된 Edge 오류', not r['ok'] and len(r['commands']) == 0)

# STEP 04-A 스케일 전환 명령
check('scale_change 정상', sc.validate({'action': 'scale_change', 'target': 'rbc_01', 'level': 'TISSUE', 'scene_id': 'micro.x', 'checkpoint_id': 'checkpoint_01'}) == '')
check('scale_change 수준 오류', sc.validate({'action': 'scale_change', 'target': 'rbc_01', 'level': 'GALAXY', 'scene_id': 'micro.x'}) != '')
check('scale_change 장면 ID 없음', sc.validate({'action': 'scale_change', 'target': 'rbc_01', 'level': 'ORGAN', 'scene_id': ''}) != '')
check('scale_change 없는 Checkpoint', sc.validate({'action': 'scale_change', 'target': 'rbc_01', 'level': 'ORGAN', 'scene_id': 'o', 'checkpoint_id': 'zz'}) != '')
check('scale_change 없는 Actor', sc.validate({'action': 'scale_change', 'target': 'nobody', 'level': 'ORGAN', 'scene_id': 'o'}) != '')
r = ml.to_motion([{'type': 'move', 'edge': 'e5', 'transition': 'scene', 'checkpoint': 'checkpoint_02', 'pre_checkpoint': 'checkpoint_01',
                   'scale': {'level': 'TISSUE', 'scene_id': 'micro.x', 'checkpoint_id': 'checkpoint_01'}, 'duration': 900}])
check('scene 전환 → 이동, scale_change, 이동', [c['action'] for c in r['commands']] == ['actor_move_to_checkpoint', 'scale_change', 'actor_move_to_checkpoint'])
check('scene 전환 명령이 Python 검사 통과', sc.build(r['commands'])['ok'])
ml.motion_done('arrived')
r = ml.to_motion([{'type': 'move', 'edge': 'e6', 'transition': 'scene', 'checkpoint': 'checkpoint_01',
                   'scale': {'level': 'ORGAN', 'scene_id': 'o', 'checkpoint_id': 'checkpoint_01'}}])
check('도착 Checkpoint가 전환 위치와 같으면 추가 이동 없음', [c['action'] for c in r['commands']] == ['scale_change'])
ml.motion_done('arrived')

print('')
print('결과: {}개 통과, {}개 실패'.format(passed, failed))
if failed > 0:
    sys.exit(1)
