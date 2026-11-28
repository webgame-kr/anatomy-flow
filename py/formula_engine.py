# 생리 계산 엔진 (STEP 04-C)
# - 허용된 계산 함수만 쓴다. 문자열 수식을 실행(eval)하지 않는다.
# - 공식 정의: formula_id, output(결과 변수), function(허용 함수 이름), inputs({매개변수: 변수 id}),
#   input_units({매개변수: 단위}), output_unit, mode_group/mode(같은 결과를 내는 공식 중 하나만 켠다), source
# - 계산 순서는 의존성으로 정한다(위상 정렬, 반복문). 공식 사이 순환이 있으면 불러오지 않는다.
# - 단위가 정의와 다르면 계산하지 않는다(자동 변환하지 않음). mL→L 같은 변환은 함수 안에 명시한다.
# - 평균동맥압(MAP)은 두 방식을 구분한다: 혈압 추정(pressure_estimate: DBP + (SBP-DBP)/3) / 혈역학(hemodynamic: CO × SVR).
#   한 공식으로 수축기·이완기 혈압이 정해진다고 가정하지 않는다(MAP에서 SBP·DBP를 거꾸로 만들지 않는다).

import biological_state as bs

FUNCTIONS = {
    'cardiac_output': ('rate', 'volume_ml'),          # HR(회/분) × SV(mL) ÷ 1000 → L/분
    'stroke_volume': ('edv', 'esv'),                  # EDV - ESV (mL)
    'ejection_fraction': ('sv', 'edv'),               # SV ÷ EDV × 100 (%)
    'pulse_pressure': ('sbp', 'dbp'),                 # SBP - DBP (mmHg)
    'map_estimate': ('sbp', 'dbp'),                   # DBP + (SBP - DBP) ÷ 3 (mmHg)
    'map_hemodynamic': ('co', 'svr'),                 # CO × SVR (+ CVP) (mmHg). 교육용: CVP 무시 가능
    'svr_from_map_co': ('map', 'co'),                 # (MAP - CVP) ÷ CO (mmHg·min/L) — 기준값 유도용
}
OPTIONAL = {'map_hemodynamic': ('cvp',), 'svr_from_map_co': ('cvp',)}

formulas = []          # 정의 (불러온 순서)
by_id = {}
run_order = []         # 계산 순서 (formula_id)
active_mode = {}       # mode_group -> mode
calc_log = []          # 마지막 계산 기록
MAX_LOG = 100


def clear():
    del formulas[:]
    by_id.clear()
    del run_order[:]
    active_mode.clear()
    del calc_log[:]


def check_definition(f):
    errors = []
    for key in ('formula_id', 'output', 'function', 'inputs'):
        if key not in f:
            errors.append('공식 정의에 {}가 없습니다'.format(key))
    if len(errors) > 0:
        return errors
    fid = f['formula_id']
    if f['function'] not in FUNCTIONS:
        errors.append('{}: 허용되지 않은 계산 함수 {}'.format(fid, f['function']))
        return errors
    if type(f['inputs']) != dict:
        errors.append('{}: inputs는 {{매개변수: 변수 id}}'.format(fid))
        return errors
    for param in FUNCTIONS[f['function']]:
        if param not in f['inputs']:
            errors.append('{}: 입력 {}가 없습니다'.format(fid, param))
    for param in f['inputs']:
        allowed = list(FUNCTIONS[f['function']])
        for extra in OPTIONAL.get(f['function'], ()):
            allowed.append(extra)
        if param not in allowed:
            errors.append('{}: 알 수 없는 입력 {}'.format(fid, param))
        if not bs.has(f['inputs'][param]):
            errors.append('{}: 없는 변수 {}'.format(fid, f['inputs'][param]))
    if not bs.has(f['output']):
        errors.append('{}: 결과 변수 {}가 없습니다'.format(fid, f['output']))
    elif bs.variables[f['output']]['data_type'] != 'computed' and f.get('run', 'always') != 'baseline':
        # 기준값 유도 공식(run: baseline)만 입력 변수(number)의 기준값을 정할 수 있다
        errors.append('{}: 결과 변수 {}는 computed 자료형이어야 합니다'.format(fid, f['output']))
    return errors


def load(defs, modes=None):
    # 공식 등록과 계산 순서 정하기. 결과 {'ok', 'errors', 'order'}
    clear()
    errors = []
    for f in defs:
        problems = check_definition(f)
        if len(problems) > 0:
            for p in problems:
                errors.append(p)
            continue
        if f['formula_id'] in by_id:
            errors.append('공식 id 중복: {}'.format(f['formula_id']))
            continue
        formulas.append(f)
        by_id[f['formula_id']] = f
    if modes != None:
        for group in modes:
            active_mode[group] = modes[group]
    # 같은 결과 변수를 내는 공식은 mode_group으로 구분해야 한다 (한 번에 하나만 켠다)
    producer = {}
    for f in formulas:
        if f.get('run', 'always') != 'always':
            continue
        out = f['output']
        if out in producer:
            other = by_id[producer[out]]
            if f.get('mode_group', '') == '' or f.get('mode_group') != other.get('mode_group'):
                errors.append('{}와 {}가 같은 결과 {}를 냅니다 (mode_group 필요)'.format(producer[out], f['formula_id'], out))
        producer[out] = f['formula_id']
    result = sort_formulas()
    for e in result['errors']:
        errors.append(e)
    return {'ok': len(errors) == 0, 'errors': errors, 'order': list(run_order)}


def is_active(f):
    group = f.get('mode_group', '')
    if group == '':
        return True
    return active_mode.get(group, '') == f.get('mode', '')


def sort_formulas():
    # 위상 정렬 (Kahn). 결과 변수 → 그 변수를 입력으로 쓰는 공식. 순서는 정의 순서로 고정(결정적)
    del run_order[:]
    makes = {}
    for f in formulas:
        if f.get('run', 'always') == 'always':
            makes.setdefault(f['output'], []).append(f['formula_id'])
    needs = {}
    users = {}
    for f in formulas:
        fid = f['formula_id']
        needs[fid] = set()
        users.setdefault(fid, [])
    for f in formulas:
        if f.get('run', 'always') != 'always':
            continue
        for param in f['inputs']:
            var_id = f['inputs'][param]
            for maker in makes.get(var_id, []):
                if maker != f['formula_id']:
                    needs[f['formula_id']].add(maker)
                    users[maker].append(f['formula_id'])
                else:
                    return {'errors': ['{}: 결과를 자기 입력으로 씁니다'.format(maker)]}
    ready = []
    for f in formulas:
        if len(needs[f['formula_id']]) == 0:
            ready.append(f['formula_id'])
    while len(ready) > 0:
        fid = ready.pop(0)
        run_order.append(fid)
        for user in users[fid]:
            needs[user].discard(fid)
            if len(needs[user]) == 0 and user not in run_order and user not in ready:
                ready.append(user)
    if len(run_order) < len(formulas):
        left = []
        for f in formulas:
            if f['formula_id'] not in run_order:
                left.append(f['formula_id'])
        return {'errors': ['공식 사이 순환 의존성: {}'.format(', '.join(left))]}
    return {'errors': []}


def set_mode(group, mode):
    found = False
    for f in formulas:
        if f.get('mode_group') == group and f.get('mode') == mode:
            found = True
    if not found:
        return {'ok': False, 'error': '{}: 없는 계산 모드 {}'.format(group, mode)}
    active_mode[group] = mode
    return {'ok': True, 'error': ''}


def finite(x):
    return bs.is_number(x)


def evaluate(name, args):
    # 허용 함수 계산. 결과 (값, 오류)
    if name == 'cardiac_output':
        return (args['rate'] * args['volume_ml'] / 1000.0, '')
    if name == 'stroke_volume':
        value = args['edv'] - args['esv']
        if value < 0:
            return (None, '일회박출량이 음수입니다: 수축기말 용적({})이 이완기말 용적({})보다 큽니다'.format(args['esv'], args['edv']))
        return (value, '')
    if name == 'ejection_fraction':
        if args['edv'] == 0:
            return (None, '0으로 나누기: 이완기말 용적이 0입니다')
        if args['sv'] > args['edv']:
            return (None, '비정상 관계: 일회박출량이 이완기말 용적보다 큽니다')
        return (args['sv'] / args['edv'] * 100.0, '')
    if name == 'pulse_pressure':
        if args['sbp'] < args['dbp']:
            return (None, '비정상 관계: 수축기 혈압이 이완기 혈압보다 낮습니다')
        return (args['sbp'] - args['dbp'], '')
    if name == 'map_estimate':
        if args['sbp'] < args['dbp']:
            return (None, '비정상 관계: 수축기 혈압이 이완기 혈압보다 낮습니다')
        return (args['dbp'] + (args['sbp'] - args['dbp']) / 3.0, '')
    if name == 'map_hemodynamic':
        return (args['co'] * args['svr'] + args.get('cvp', 0), '')
    if name == 'svr_from_map_co':
        if args['co'] == 0:
            return (None, '0으로 나누기: 심박출량이 0입니다')
        return ((args['map'] - args.get('cvp', 0)) / args['co'], '')
    return (None, '허용되지 않은 함수 {}'.format(name))


def compute_one(f):
    # 공식 하나 계산 → 결과 변수에 쓴다. 결과 {'ok', 'error', 'record'}
    args = {}
    used = {}
    units = f.get('input_units', {})
    for param in f['inputs']:
        var_id = f['inputs'][param]
        var = bs.variables[var_id]
        value = var['value']
        if value == None:
            return {'ok': False, 'error': '{}: 입력 {} 값이 없습니다'.format(f['formula_id'], var_id)}
        if not finite(value):
            return {'ok': False, 'error': '{}: 입력 {}가 숫자가 아닙니다 ({})'.format(f['formula_id'], var_id, value)}
        want = units.get(param, '')
        if want != '' and var.get('unit', '') != want:
            return {'ok': False, 'error': '{}: 단위 불일치 {} ({} ≠ {})'.format(f['formula_id'], var_id, var.get('unit', ''), want)}
        args[param] = value
        used[var_id] = value
    pair = evaluate(f['function'], args)
    value = pair[0]
    if pair[1] != '':
        return {'ok': False, 'error': '{}: {}'.format(f['formula_id'], pair[1])}
    if not finite(value):
        return {'ok': False, 'error': '{}: 결과가 숫자가 아닙니다 (NaN 또는 무한대)'.format(f['formula_id'])}
    out_var = bs.variables[f['output']]
    if f.get('output_unit', '') != '' and out_var.get('unit', '') != f['output_unit']:
        return {'ok': False, 'error': '{}: 결과 단위 불일치 ({} ≠ {})'.format(f['formula_id'], out_var.get('unit', ''), f['output_unit'])}
    digits = f.get('round', 2)
    value = round(value, digits)
    done = bs.set_computed(f['output'], value, '계산: ' + f['formula_id'])
    if not done['ok']:
        return {'ok': False, 'error': done['error']}
    record = {'formula_id': f['formula_id'], 'output': f['output'], 'value': value, 'unit': out_var.get('unit', ''),
              'inputs': used, 'source': f.get('source', ''), 'mode': f.get('mode', '')}
    return {'ok': True, 'error': '', 'record': record}


def compute_all(phase='always'):
    # 켜진 공식을 순서대로 계산. 실패한 공식의 결과는 None(계산 불가)으로 둔다
    errors = []
    records = []
    ids = run_order
    if phase != 'always':
        ids = []
        for f in formulas:
            if f.get('run') == phase:
                ids.append(f['formula_id'])
    for fid in ids:
        f = by_id[fid]
        if not is_active(f):
            continue
        if phase == 'always' and f.get('run', 'always') != 'always':
            continue
        result = compute_one(f)
        if result['ok']:
            records.append(result['record'])
        else:
            errors.append(result['error'])
            bs.variables[f['output']]['value'] = None
            bs.variables[f['output']]['note'] = '계산 불가: ' + result['error']
    for r in records:
        calc_log.append(r)
    while len(calc_log) > MAX_LOG:
        calc_log.pop(0)
    return {'ok': len(errors) == 0, 'errors': errors, 'records': records}


def derive_baselines():
    # 기준값 유도 공식(run: baseline)을 계산한 뒤, 그 결과를 해당 변수의 기준값으로 삼는다
    # 예: SVR 기준값 = 기준 MAP(추정) ÷ 기준 CO. 측정값이 아니라 다른 기준값에서 유도한 값이다.
    out = compute_all('baseline')
    for r in out['records']:
        var = bs.variables[r['output']]
        var['baseline'] = r['value']
        var['value'] = r['value']
        var['trend'] = 0                 # 기준값을 새로 정했으므로 변화 방향 없음
        var['value_kind'] = 'derived'
        var['note'] = '기준값 유도: ' + r['formula_id']
    return out


def info():
    items = []
    for f in formulas:
        items.append({'formula_id': f['formula_id'], 'output': f['output'], 'function': f['function'],
                      'inputs': f['inputs'], 'mode_group': f.get('mode_group', ''), 'mode': f.get('mode', ''),
                      'active': is_active(f), 'run': f.get('run', 'always'), 'source': f.get('source', ''),
                      'notes': f.get('notes', '')})
    return {'formulas': items, 'order': list(run_order), 'modes': dict(active_mode)}
