# STEP 04-C 생리 상태 변수 테스트
# 실행: python tests/test_biological_state.py

import sys
sys.path.insert(0, 'py')

import biological_state as bs

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


bs.clear()
check('수치 변수 등록', bs.define({'variable_id': 'hr', 'name_ko': '심박수', 'data_type': 'number', 'unit': '회/분', 'baseline': 75,
                                   'allowed_range': [20, 250], 'verification_status': 'PUBLIC_REFERENCE'})['ok'])
check('상대 변수 등록 (기준 0)', bs.define({'variable_id': 'symp', 'name_ko': '교감', 'data_type': 'relative'})['ok'] and bs.get('symp') == 0)
check('활성화 변수 등록 (기준 INACTIVE)', bs.define({'variable_id': 'b1', 'name_ko': 'β1', 'data_type': 'activation'})['ok'] and bs.get('b1') == 'INACTIVE')
check('범주 변수 등록', bs.define({'variable_id': 'mode', 'name_ko': '모드', 'data_type': 'category', 'categories': ['rest', 'exercise']})['ok'])
check('불리언 변수 등록', bs.define({'variable_id': 'flag', 'name_ko': '표시', 'data_type': 'boolean'})['ok'])
check('계산 변수 등록 (값 없음)', bs.define({'variable_id': 'co', 'name_ko': '심박출량', 'data_type': 'computed', 'unit': 'L/분'})['ok'] and bs.get('co') == None)
check('id 중복 거부', not bs.define({'variable_id': 'hr', 'name_ko': 'x', 'data_type': 'number', 'baseline': 1})['ok'])
check('알 수 없는 자료형 거부', not bs.define({'variable_id': 'z', 'name_ko': 'z', 'data_type': 'vector'})['ok'])
check('알 수 없는 검증 상태 거부', not bs.define({'variable_id': 'z2', 'name_ko': 'z', 'data_type': 'relative', 'verification_status': 'VERIFIED'})['ok'])
check('기준값이 범위 밖이면 거부', not bs.define({'variable_id': 'z3', 'name_ko': 'z', 'data_type': 'number', 'baseline': 999, 'allowed_range': [0, 10]})['ok'])

# ---------- 값 변경과 검증 ----------
check('수치 설정', bs.set_value('hr', 90)['ok'] and bs.get('hr') == 90)
check('수치 증가 → trend +1', bs.variables['hr']['trend'] == 1 and bs.label_of('hr') == 'INCREASED')
check('문자열 거부', not bs.set_value('hr', '빠름')['ok'])
check('NaN 거부', not bs.set_value('hr', float('nan'))['ok'])
check('무한대 거부', not bs.set_value('hr', float('inf'))['ok'])
check('허용 범위 밖 거부', not bs.set_value('hr', 400)['ok'] and bs.get('hr') == 90)
check('계산 변수 직접 설정 거부', not bs.set_value('co', 5.0)['ok'])
check('범주 밖 값 거부', not bs.set_value('mode', 'sleep')['ok'])
check('불리언 자료형 검사', not bs.set_value('flag', 1)['ok'] and bs.set_value('flag', True)['ok'])
check('없는 변수', not bs.set_value('nope', 1)['ok'])

# ---------- 상대 단계 ----------
bs.shift('symp', 1)
check('상대 단계 증가', bs.get('symp') == 1 and bs.label_of('symp') == 'INCREASED')
bs.shift('symp', 5)
check('단계는 +2를 넘지 않음', bs.get('symp') == 2)
bs.shift('symp', -9)
check('단계는 -2 아래로 가지 않음', bs.get('symp') == -2 and bs.label_of('symp') == 'MARKEDLY_DECREASED')
bs.shift('symp', 'MIXED')
check('MIXED 표시', bs.get('symp') == 'MIXED' and bs.label_of('symp') == 'MIXED')
bs.shift('b1', 1)
check('활성화 → ACTIVE', bs.get('b1') == 'ACTIVE' and bs.level_of('b1') == 1)
bs.shift('hr', -1)
check('수치 변수의 단계 변화는 값이 아니라 trend만', bs.get('hr') == 90 and bs.variables['hr']['trend'] == 0)
check('잘못된 단계 값 거부', bs.check_value(bs.variables['symp'], 3) != '')

# ---------- 스냅샷·복원·초기화 ----------
snap = bs.snapshot()
bs.set_value('hr', 120)
bs.shift('b1', -1)
bs.record('a')
check('기록 추가', len(bs.history) == 1)
check('복원: 값·trend·기록 길이', bs.restore(snap)['ok'] and bs.get('hr') == 90 and bs.get('b1') == 'ACTIVE' and len(bs.history) == 0)
check('잘못된 스냅샷 거부', not bs.restore({'x': 1})['ok'])
bs.reset()
check('초기화: 기준값으로', bs.get('hr') == 75 and bs.get('symp') == 0 and bs.get('b1') == 'INACTIVE' and bs.variables['hr']['trend'] == 0)
for i in range(bs.MAX_HISTORY + 20):
    bs.record('r')
check('기록 크기 제한', len(bs.history) == bs.MAX_HISTORY)
v = bs.view(['hr', 'symp'])
check('화면용 요약은 요청한 변수만', len(v) == 2 and v[0]['variable_id'] == 'hr' and v[0]['unit'] == '회/분')
check('기준값 ±5% 안은 BASELINE', bs.set_value('hr', 77)['ok'] and bs.set_value('hr', 77)['ok'] and bs.level_of('hr') == 0)

print('\n통과 {}개, 실패 {}개'.format(passed, failed))
if failed > 0:
    sys.exit(1)
