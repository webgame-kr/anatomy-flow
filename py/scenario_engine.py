# 시나리오 엔진 (STEP 04-C): 생리적 초기 상태와 상황(trigger)을 정한다
# - 시나리오: scenario_id, initial_state, trigger, available_mechanisms, expected_response,
#   learning_objectives, completion_condition, source, limitations
# - 정량 근거가 부족하면 상대 단계로만 정한다. 실제 환자 예후·처치·약물 용량을 정하는 데 쓰지 않는다.

import biological_state as bs
import causal_engine

scenarios = []
by_id = {}
current = {'id': ''}


def clear():
    del scenarios[:]
    by_id.clear()
    current['id'] = ''


def load(defs):
    clear()
    errors = []
    for sc in defs:
        sid = sc.get('scenario_id', '')
        if sid == '':
            errors.append('시나리오에 scenario_id가 없습니다')
            continue
        if sid in by_id:
            errors.append('시나리오 id 중복: {}'.format(sid))
            continue
        for item in sc.get('initial_state', []):
            if not bs.has(item.get('var', '')):
                errors.append('{}: 없는 변수 {}'.format(sid, item.get('var')))
        for item in sc.get('trigger', []):
            if not bs.has(item.get('var', '')):
                errors.append('{}: trigger의 없는 변수 {}'.format(sid, item.get('var')))
        for var_id in sc.get('expected_response', {}):
            if not bs.has(var_id):
                errors.append('{}: expected_response의 없는 변수 {}'.format(sid, var_id))
        scenarios.append(sc)
        by_id[sid] = sc
    return {'ok': len(errors) == 0, 'errors': errors, 'count': len(scenarios)}


def start(scenario_id):
    # 상태를 기준으로 되돌린 뒤 초기 상태 → trigger 순서로 적용. 결과 {'ok', 'changes', 'errors'}
    if scenario_id not in by_id:
        return {'ok': False, 'errors': ['없는 시나리오: {}'.format(scenario_id)], 'changes': []}
    sc = by_id[scenario_id]
    bs.reset()
    causal_engine.applied_events.clear()
    errors = []
    for item in sc.get('initial_state', []):
        if 'value' in item:
            r = bs.set_value(item['var'], item['value'], '시나리오 초기값')
        else:
            r = bs.shift(item['var'], item.get('level', 0) - 0, '시나리오 초기 단계')
        if not r['ok']:
            errors.append(r['error'])
    changes = []
    if len(sc.get('trigger', [])) > 0:
        out = causal_engine.apply(sc['trigger'], 'scenario:' + scenario_id, sc.get('available_mechanisms'), bs.clock['t'])
        for e in out['errors']:
            errors.append(e)
        changes = out['changes']
    current['id'] = scenario_id
    bs.record('시나리오 ' + scenario_id)
    return {'ok': len(errors) == 0, 'errors': errors, 'changes': changes}


def compare_expected(scenario_id):
    # 기대 반응(방향)과 지금 상태 비교. 학습 확인용
    sc = by_id.get(scenario_id)
    if sc == None:
        return []
    out = []
    for var_id in sc.get('expected_response', {}):
        want = sc['expected_response'][var_id]
        have = bs.level_of(var_id)
        ok = False
        if want == 'increase' and have not in bs.SPECIAL and have > 0:
            ok = True
        if want == 'decrease' and have not in bs.SPECIAL and have < 0:
            ok = True
        if want == 'baseline' and have == 0:
            ok = True
        out.append({'var': var_id, 'expected': want, 'level': have, 'match': ok})
    return out


def complete(scenario_id):
    sc = by_id.get(scenario_id)
    if sc == None:
        return False
    for cond in sc.get('completion_condition', []):
        if not causal_engine.condition_ok(cond):
            return False
    return True


def info():
    items = []
    for sc in scenarios:
        items.append({'scenario_id': sc['scenario_id'], 'name_ko': sc.get('name_ko', ''),
                      'available_mechanisms': sc.get('available_mechanisms'), 'limitations': sc.get('limitations', ''),
                      'learning_objectives': sc.get('learning_objectives', []), 'source': sc.get('source', '')})
    return {'scenarios': items, 'current': current['id']}
