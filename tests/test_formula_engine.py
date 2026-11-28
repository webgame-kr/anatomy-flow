# STEP 04-C 생리 계산 엔진 테스트
# 실행: python tests/test_formula_engine.py

import sys
sys.path.insert(0, 'py')

import biological_state as bs
import formula_engine as fe

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


def setup(modes=None):
    bs.clear()
    for spec in [
        {'variable_id': 'hr', 'name_ko': '심박수', 'data_type': 'number', 'unit': '회/분', 'baseline': 75, 'allowed_range': [20, 250]},
        {'variable_id': 'edv', 'name_ko': 'EDV', 'data_type': 'number', 'unit': 'mL', 'baseline': 120, 'allowed_range': [0, 400]},
        {'variable_id': 'esv', 'name_ko': 'ESV', 'data_type': 'number', 'unit': 'mL', 'baseline': 50, 'allowed_range': [0, 400]},
        {'variable_id': 'sbp', 'name_ko': 'SBP', 'data_type': 'number', 'unit': 'mmHg', 'baseline': 120, 'allowed_range': [40, 300]},
        {'variable_id': 'dbp', 'name_ko': 'DBP', 'data_type': 'number', 'unit': 'mmHg', 'baseline': 80, 'allowed_range': [20, 200]},
        {'variable_id': 'svr', 'name_ko': 'SVR', 'data_type': 'number', 'unit': 'mmHg·분/L', 'baseline': 17.78, 'allowed_range': [1, 80]},
        {'variable_id': 'sv', 'name_ko': 'SV', 'data_type': 'computed', 'unit': 'mL'},
        {'variable_id': 'ef', 'name_ko': 'EF', 'data_type': 'computed', 'unit': '%'},
        {'variable_id': 'co', 'name_ko': 'CO', 'data_type': 'computed', 'unit': 'L/분'},
        {'variable_id': 'pp', 'name_ko': 'PP', 'data_type': 'computed', 'unit': 'mmHg'},
        {'variable_id': 'map', 'name_ko': 'MAP', 'data_type': 'computed', 'unit': 'mmHg'},
    ]:
        bs.define(spec)
    defs = [
        {'formula_id': 'f.map_h', 'output': 'map', 'function': 'map_hemodynamic', 'mode_group': 'map', 'mode': 'hemodynamic',
         'inputs': {'co': 'co', 'svr': 'svr'}, 'input_units': {'co': 'L/분', 'svr': 'mmHg·분/L'}, 'round': 1},
        {'formula_id': 'f.co', 'output': 'co', 'function': 'cardiac_output', 'inputs': {'rate': 'hr', 'volume_ml': 'sv'},
         'input_units': {'rate': '회/분', 'volume_ml': 'mL'}, 'output_unit': 'L/분', 'round': 2},
        {'formula_id': 'f.ef', 'output': 'ef', 'function': 'ejection_fraction', 'inputs': {'sv': 'sv', 'edv': 'edv'}, 'round': 1},
        {'formula_id': 'f.sv', 'output': 'sv', 'function': 'stroke_volume', 'inputs': {'edv': 'edv', 'esv': 'esv'}, 'input_units': {'edv': 'mL', 'esv': 'mL'}},
        {'formula_id': 'f.pp', 'output': 'pp', 'function': 'pulse_pressure', 'inputs': {'sbp': 'sbp', 'dbp': 'dbp'}},
        {'formula_id': 'f.map_e', 'output': 'map', 'function': 'map_estimate', 'mode_group': 'map', 'mode': 'pressure_estimate',
         'inputs': {'sbp': 'sbp', 'dbp': 'dbp'}, 'round': 1},
    ]
    if modes == None:
        modes = {'map': 'pressure_estimate'}
    return fe.load(defs, modes)


r = setup()
check('공식 불러오기', r['ok'])
check('의존성 순서: SV → EF·CO → MAP(혈역학)', r['order'].index('f.sv') < r['order'].index('f.co') < r['order'].index('f.map_h')
      and r['order'].index('f.sv') < r['order'].index('f.ef'))
out = fe.compute_all()
check('일회박출량 SV = 120 - 50 = 70 mL', bs.get('sv') == 70)
check('박출률 EF = 70/120 = 58.3%', bs.get('ef') == 58.3)
check('심박출량 CO = 75 × 70 ÷ 1000 = 5.25 L/분 (mL→L)', bs.get('co') == 5.25)
check('맥압 PP = 40 mmHg', bs.get('pp') == 40)
check('MAP 추정 = 80 + 40/3 = 93.3 mmHg', bs.get('map') == 93.3)
check('계산 기록에 입력·단위·출처', out['records'][0]['inputs'] != {} and 'unit' in out['records'][0])
check('MAP 모드: 혈역학 공식은 꺼져 있음', not fe.is_active(fe.by_id['f.map_h']))
fe.set_mode('map', 'hemodynamic')
fe.compute_all()
check('MAP 혈역학 = CO × SVR = 5.25 × 17.78 = 93.3', bs.get('map') == 93.3)
bs.set_value('hr', 100)
fe.compute_all()
check('혈역학 모드: HR 100 → CO 7.0, MAP 124.5', bs.get('co') == 7.0 and bs.get('map') == 124.5)
fe.set_mode('map', 'pressure_estimate')
fe.compute_all()
check('추정 모드: HR이 바뀌어도 SBP·DBP가 같으면 MAP 추정은 그대로 (두 방식 구분)', bs.get('map') == 93.3)
check('없는 모드 거부', not fe.set_mode('map', 'magic')['ok'])

# ---------- 오류 처리 ----------
bs.set_value('esv', 150)
out = fe.compute_all()
check('음수 용적(ESV > EDV) → 오류, SV 계산 불가', not out['ok'] and bs.get('sv') == None and '음수' in out['errors'][0])
check('뒤따르는 공식도 입력 누락 오류', any('값이 없습니다' in e for e in out['errors']))
bs.set_value('esv', 50)
bs.set_value('edv', 0)
bs.set_value('esv', 0)
out = fe.compute_all()
check('0으로 나누기 방지 (EDV 0)', any('0으로 나누기' in e for e in out['errors']))
bs.set_value('edv', 120)
bs.set_value('esv', 50)
bs.set_value('sbp', 70)
out = fe.compute_all()
check('비정상 관계 (SBP < DBP) 오류', any('수축기 혈압이 이완기 혈압보다 낮' in e for e in out['errors']))
bs.set_value('sbp', 120)
bs.variables['hr']['unit'] = 'Hz'
out = fe.compute_all()
check('단위 불일치 오류 (자동 변환 안 함)', any('단위 불일치' in e for e in out['errors']))
bs.variables['hr']['unit'] = '회/분'
bs.variables['hr']['value'] = 'fast'
out = fe.compute_all()
check('잘못된 자료형 입력 오류', any('숫자가 아닙니다' in e for e in out['errors']))
bs.variables['hr']['value'] = float('nan')
out = fe.compute_all()
check('NaN 입력 오류', any('숫자가 아닙니다' in e for e in out['errors']))
bs.variables['hr']['value'] = 75

# ---------- 정의 검사 ----------
bs.clear()
bs.define({'variable_id': 'a', 'name_ko': 'a', 'data_type': 'computed', 'unit': 'mL'})
bs.define({'variable_id': 'b', 'name_ko': 'b', 'data_type': 'computed', 'unit': 'mL'})
bs.define({'variable_id': 'c', 'name_ko': 'c', 'data_type': 'number', 'unit': 'mL', 'baseline': 1})
r = fe.load([{'formula_id': 'x1', 'output': 'a', 'function': 'stroke_volume', 'inputs': {'edv': 'b', 'esv': 'c'}},
             {'formula_id': 'x2', 'output': 'b', 'function': 'stroke_volume', 'inputs': {'edv': 'a', 'esv': 'c'}}])
check('공식 사이 순환 의존성 검출', not r['ok'] and '순환' in r['errors'][0])
r = fe.load([{'formula_id': 'x3', 'output': 'a', 'function': 'eval', 'inputs': {}}])
check('허용되지 않은 함수(eval 등) 거부', not r['ok'])
r = fe.load([{'formula_id': 'x4', 'output': 'a', 'function': 'stroke_volume', 'inputs': {'edv': 'nope', 'esv': 'c'}}])
check('없는 입력 변수 거부', not r['ok'])
r = fe.load([{'formula_id': 'x5', 'output': 'c', 'function': 'stroke_volume', 'inputs': {'edv': 'c', 'esv': 'c'}}])
check('결과 변수는 computed여야 함', not r['ok'])
r = fe.load([{'formula_id': 'x6', 'output': 'a', 'function': 'stroke_volume', 'inputs': {'edv': 'c', 'esv': 'c'}},
             {'formula_id': 'x7', 'output': 'a', 'function': 'pulse_pressure', 'inputs': {'sbp': 'c', 'dbp': 'c'}}])
check('같은 결과를 내는 두 공식은 mode_group 필요', not r['ok'])
fe.clear()

print('\n통과 {}개, 실패 {}개'.format(passed, failed))
if failed > 0:
    sys.exit(1)
