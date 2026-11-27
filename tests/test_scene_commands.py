# STEP 02 장면 명령 테스트
# 실행: 프로젝트 폴더에서  python tests/test_scene_commands.py

import sys
sys.path.insert(0, 'py')

import scene_commands as sc

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
    {'id': 'sphere_01', 'type': 'primitive', 'visible': True},
    {'id': 'cube_01', 'type': 'primitive', 'visible': True},
    {'id': 'cylinder_01', 'type': 'primitive', 'visible': True},
    {'id': 'group_a', 'type': 'group', 'visible': True},
]
r = sc.set_snapshot(objects, ['scene_a', 'scene_d'], 'scene_d')
check('스냅샷 저장', r['count'] == 4 and r['scene'] == 'scene_d')
check('종류별 집계', r['types'] == {'primitive': 3, 'group': 1})

# 값 검사
check('위치 정상', sc.validate(sc.make('set_position', 'sphere_01', [1, 2, 3])) == '')
check('위치 숫자 2개는 오류', sc.validate(sc.make('set_position', 'sphere_01', [1, 2])) != '')
check('위치에 문자 섞이면 오류', sc.validate(sc.make('set_position', 'sphere_01', [1, 'a', 3])) != '')
check('크기 숫자 하나 허용', sc.validate(sc.make('set_scale', 'cube_01', 2)) == '')
check('크기 0 오류', sc.validate(sc.make('set_scale', 'cube_01', 0)) != '')
check('크기 [x,y,z] 허용', sc.validate(sc.make('set_scale', 'cube_01', [1, 2, 0.5])) == '')
check('색상 정상', sc.validate(sc.make('set_color', 'cube_01', '#A0b1C2')) == '')
check('색상 이름은 오류', sc.validate(sc.make('set_color', 'cube_01', 'blue')) != '')
check('표시 여부 bool', sc.validate(sc.make('set_visibility', 'cube_01', False)) == '')
check('표시 여부 숫자는 오류', sc.validate(sc.make('set_visibility', 'cube_01', 1)) != '')
check('투명도 범위', sc.validate(sc.make('set_opacity', 'cube_01', 0.5)) == '')
check('투명도 2는 오류', sc.validate(sc.make('set_opacity', 'cube_01', 2.0)) != '')
check('없는 객체 오류', '없는 객체' in sc.validate(sc.make('set_opacity', 'ghost', 0.5)))
check('지원하지 않는 명령 오류', '지원하지 않는' in sc.validate(sc.make('explode', 'cube_01', True)))
check('카메라 전체보기는 대상 불필요', sc.validate(sc.make('camera_overview')) == '')
check('장면 전환 정상', sc.validate(sc.make('scene_change', None, 'scene_a')) == '')
check('없는 장면 오류', sc.validate(sc.make('scene_change', None, 'zz')) != '')
check('딕셔너리가 아니면 오류', sc.validate(['set_opacity']) != '')

# build
r = sc.build([sc.make('highlight', 'sphere_01', True), sc.make('set_opacity', 'nope', 0.2)])
check('build: 통과한 것만 전송', len(r['commands']) == 1 and len(r['errors']) == 1 and not r['ok'])
check('build: 오류에 번호와 명령', r['errors'][0].startswith('#2 set_opacity'))

# 데모
r = sc.demo()
actions = []
for cmd in r['commands']:
    actions.append(cmd['action'])
check('데모 명령 모두 통과', r['ok'] and len(r['errors']) == 0)
check('데모에 위치·색·투명도·카메라', 'set_position' in actions and 'set_color' in actions
      and 'set_opacity' in actions and actions[-1] == 'camera_focus')
check('데모 이동 시간 포함', r['commands'][0]['duration'] == 600)

r = sc.restore_demo()
check('되돌리기 명령', r['ok'] and r['commands'][-1]['action'] == 'camera_overview')

# 오류 테스트
r = sc.error_test()
check('오류 테스트: 원본 7개 그대로', len(r['commands']) == 7)
check('오류 테스트: Python이 6개 오류 발견', len(r['errors']) == 6)

# 스냅샷이 다르면 다른 객체를 고른다
sc.set_snapshot([{'id': 'ball', 'type': 'primitive'}], ['scene_d'], 'scene_d')
r = sc.demo()
check('ID가 달라도 같은 종류 객체 선택', r['ok'] and r['commands'][0]['target'] == 'ball')
sc.set_snapshot([], ['scene_d'], 'scene_d')
check('빈 스냅샷 데모는 실패', not sc.demo()['ok'])

print()
print('통과 {}개, 실패 {}개'.format(passed, failed))
if failed > 0:
    sys.exit(1)
