# 3D Sandbox 게임 로직 단위 테스트
# 실행: 프로젝트 폴더에서  python tests/test_sandbox3d.py

import sys
sys.path.insert(0, 'py')

import sandbox3d

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


def ops(result):
    names = []
    for cmd in result['commands']:
        names.append(cmd['op'])
    return names


# ---------- 연결 확인 ----------
info = sandbox3d.ping()
check('ping은 딕셔너리 반환', type(info) == dict and 'python' in info)
check('ping 안에 리스트', type(info['kinds']) == list and len(info['kinds']) == 3)

# ---------- 초기화 ----------
r = sandbox3d.reset()
check('초기화 성공', r['ok'])
check('초기화 명령: clear 후 create 3개', ops(r) == ['clear', 'create', 'create', 'create'])
check('기본 객체 3개', len(r['objects']) == 3)
ids = []
for obj in r['objects']:
    ids.append(obj['id'])
check('객체 ID 고유', len(ids) == len(set(ids)))
check('기본 ID 이름', ids == ['box-1', 'sphere-1', 'cylinder-1'])
check('좌표는 x, y, z 3개', len(r['objects'][0]['position']) == 3)

# ---------- 생성과 제거 ----------
r = sandbox3d.create('box', 1, 2, 3)
check('정육면체 추가 생성', r['ok'] and r['commands'][0]['target'] == 'box-2')
check('생성 명령에 객체 정보', r['commands'][0]['object']['position'] == [1, 2, 3])
check('알 수 없는 종류는 실패', not sandbox3d.create('pyramid')['ok'])
check('좌표가 문자면 실패', not sandbox3d.create('box', 'a', 0, 0)['ok'])
r = sandbox3d.create('sphere', 99, -99, 0)
check('좌표 범위 제한', r['commands'][0]['object']['position'] == [10, -10, 0])
r = sandbox3d.remove('box-2')
check('제거 성공', r['ok'] and ops(r) == ['remove'])
check('제거하면 목록에서 빠짐', 'box-2' not in sandbox3d.objects)
check('없는 객체 제거는 실패', not sandbox3d.remove('box-2')['ok'])
r = sandbox3d.create('box')
check('제거된 번호는 다시 쓰지 않음', r['commands'][0]['target'] == 'box-3')

# ---------- 이동 명령 ----------
r = sandbox3d.move('sphere-1', 1, 0, -0.5)
cmd = r['commands'][0]
check('이동 명령 생성', cmd['op'] == 'update' and cmd['position'] == [1, 0.5, -0.5])
check('이동 시간 포함', cmd['duration'] == 400)
check('상태에도 반영', sandbox3d.objects['sphere-1']['position'] == [1, 0.5, -0.5])
r = sandbox3d.move('sphere-1', 100, 0, 0)
check('이동도 범위 제한', r['commands'][0]['position'][0] == 10)
check('없는 객체 이동은 실패', not sandbox3d.move('ghost', 1, 0, 0)['ok'])

# 반환한 명령을 바꿔도 내부 상태는 그대로 (복사본)
r = sandbox3d.move('box-1', 0, 1, 0)
r['commands'][0]['position'][1] = 999
check('명령은 상태의 복사본', sandbox3d.objects['box-1']['position'][1] == 1.5)

# ---------- 색상 명령 ----------
r = sandbox3d.set_color('box-1', '#00FF88')
check('색상 명령 생성', r['ok'] and r['commands'][0]['color'] == '#00ff88')
check('잘못된 색상은 실패', not sandbox3d.set_color('box-1', 'green')['ok'])
check('7자리가 아닌 색상 실패', not sandbox3d.set_color('box-1', '#fff')['ok'])
r = sandbox3d.set_color('box-1', sandbox3d.PALETTE[-1])
r = sandbox3d.next_color('box-1')
check('팔레트 다음 색(처음으로 순환)', r['commands'][0]['color'] == sandbox3d.PALETTE[0])

# ---------- 회전, 크기, 표시 ----------
r = sandbox3d.rotate('cylinder-1', 0, 450, 0)
check('회전 360도 넘으면 되돌림', r['commands'][0]['rotation'] == [0, 90, 0])
r = sandbox3d.resize('cylinder-1', 10)
check('크기 최대 5배 제한', r['commands'][0]['scale'] == 5.0)
check('크기 0 이하 실패', not sandbox3d.resize('cylinder-1', 0)['ok'])
r = sandbox3d.toggle_visible('cylinder-1')
check('숨기기 명령', r['commands'][0]['visible'] == False)
r = sandbox3d.toggle_visible('cylinder-1')
check('다시 보이기', r['commands'][0]['visible'] == True)

# ---------- 원형 배치 데모 ----------
count = len(sandbox3d.order)
r = sandbox3d.arrange_circle(3)
check('원형 배치: 객체 수만큼 명령', len(r['commands']) == count)
ok = True
for cmd in r['commands']:
    x = cmd['position'][0]
    z = cmd['position'][2]
    if abs((x * x + z * z) ** 0.5 - 3) > 0.02:
        ok = False
check('원형 배치: 모두 반지름 3 위', ok)

# ---------- 명령 번호 ----------
all_ids = []
for name in ['box', 'sphere']:
    for cmd in sandbox3d.create(name)['commands']:
        all_ids.append(cmd['id'])
for cmd in sandbox3d.arrange_circle()['commands']:
    all_ids.append(cmd['id'])
check('명령 번호 중복 없음', len(all_ids) == len(set(all_ids)))

# ---------- 초기화 후 복원 ----------
r = sandbox3d.reset()
check('초기화 후 기본 3개로 복원', len(r['objects']) == 3 and r['objects'][1]['position'] == [0, 0.5, 0])
check('초기화 후 번호 다시 1부터', r['objects'][0]['id'] == 'box-1' and r['commands'][0]['id'] == 1)
check('빈 장면 배치는 실패', sandbox3d.remove('box-1')['ok'] and sandbox3d.remove('sphere-1')['ok']
      and sandbox3d.remove('cylinder-1')['ok'] and not sandbox3d.arrange_circle()['ok'])

print()
print('통과 {}개, 실패 {}개'.format(passed, failed))
if failed > 0:
    sys.exit(1)
