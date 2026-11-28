# 되먹임(피드백) 엔진 (STEP 04-C)
# - 일반 인과관계(causal_engine)와 구분한다. 되먹임 고리는 "단계"로만 실행한다: 한 번 부를 때 한 단계.
#   순환 그래프를 한 번에(재귀로) 평가하지 않으므로 무한 반복이 생기지 않는다.
# - 한 단계: (1) 감지 변수(sensed)가 설정점(기준 단계 또는 범위)에서 벗어났는지 본다
#            (2) 수용체(sensor) 단계를 정한다 (3) causal_engine으로 그 기전의 관계만 전한다
#            (4) 감지 변수가 받은 "회복 방향의 작용"을 기록한다 (5) 제한(limits)이 있으면 그 단계까지만 움직인다
# - 같은 입력·초기 상태면 같은 결과: 고리 순서·물리 시간·관계 순서가 모두 정해져 있다.
# - 회복 "방향"으로 작용하는 것과 실제로 정상화되는 것은 다르다. 원인이 남아 있으면(limits) 기준까지 돌아가지 않는다.

import biological_state as bs
import causal_engine

loops = []
by_id = {}
running = {}          # loop_id -> {'iteration', 'next_t', 'status', 'log'}
MAX_LOG = 100


def clear():
    del loops[:]
    by_id.clear()
    running.clear()


def check_definition(loop):
    errors = []
    for key in ('loop_id', 'loop_type', 'sensed_variable', 'sensor_variable', 'setpoint'):
        if key not in loop:
            errors.append('되먹임 정의에 {}가 없습니다'.format(key))
    if len(errors) > 0:
        return errors
    lid = loop['loop_id']
    if loop['loop_type'] not in ('negative', 'positive'):
        errors.append('{}: loop_type은 negative 또는 positive'.format(lid))
    for key in ('sensed_variable', 'sensor_variable'):
        if not bs.has(loop[key]):
            errors.append('{}: 없는 변수 {}'.format(lid, loop[key]))
    sp = loop['setpoint']
    if type(sp) != dict or ('level' not in sp and 'range' not in sp):
        errors.append('{}: setpoint는 {{level}} 또는 {{range: [낮음, 높음]}}'.format(lid))
    mx = loop.get('max_iterations', 6)
    if type(mx) != int or mx < 1 or mx > 50:
        errors.append('{}: max_iterations는 1~50 정수'.format(lid))
    delay = loop.get('delay', 1)
    if type(delay) != int or delay < 1:
        errors.append('{}: delay는 1 이상 정수(물리 시간 단위)'.format(lid))
    if loop.get('sensor_direction', 'increase') not in ('increase', 'decrease'):
        errors.append('{}: sensor_direction은 increase 또는 decrease'.format(lid))
    return errors


def load(defs):
    clear()
    errors = []
    for loop in defs:
        problems = check_definition(loop)
        if len(problems) > 0:
            for p in problems:
                errors.append(p)
            continue
        if loop['loop_id'] in by_id:
            errors.append('되먹임 id 중복: {}'.format(loop['loop_id']))
            continue
        loops.append(loop)
        by_id[loop['loop_id']] = loop
    return {'ok': len(errors) == 0, 'errors': errors, 'count': len(loops)}


def error_of(loop):
    # 설정점과의 차이 단계: -1(낮음) 0(범위 안) 1(높음). 단계 설정점이면 단계 차이(-2~2)
    sp = loop['setpoint']
    var_id = loop['sensed_variable']
    if 'range' in sp:
        value = bs.get(var_id)
        var = bs.variables[var_id]
        level = bs.level_of(var_id)
        if var['data_type'] in ('number', 'computed') and var['trend'] == 0 and bs.is_number(value):
            if value < sp['range'][0]:
                return -1
            if value > sp['range'][1]:
                return 1
            return 0
        if level in bs.SPECIAL:
            return level
        return level
    level = bs.level_of(var_id)
    if level in bs.SPECIAL:
        return level
    return level - sp['level']


def start(loop_id, t=0):
    if loop_id not in by_id:
        return {'ok': False, 'error': '없는 되먹임 고리: {}'.format(loop_id)}
    running[loop_id] = {'iteration': 0, 'next_t': t + by_id[loop_id].get('delay', 1), 'status': 'running', 'log': []}
    return {'ok': True, 'error': '', 'status': 'running'}


def stop(loop_id, reason='stopped'):
    if loop_id not in running:
        return {'ok': False, 'error': '실행 중이 아닌 고리: {}'.format(loop_id)}
    running[loop_id]['status'] = reason
    return {'ok': True, 'error': '', 'status': reason}


def cap_for(loop, err):
    # 제한: 조건이 맞으면 감지 변수가 이 단계보다 기준 쪽으로 가지 못한다 (원인이 남아 있음)
    for lim in loop.get('limits', []):
        ok = True
        for cond in lim.get('when', []):
            if not causal_engine.condition_ok(cond):
                ok = False
        if ok:
            return lim
    return None


def step(loop_id):
    # 한 단계 실행. 결과 {'ok', 'status', 'iteration', 't', 'changes', 'note', 'error'}
    if loop_id not in running:
        return {'ok': False, 'error': '시작하지 않은 고리: {}'.format(loop_id), 'status': 'not_started', 'changes': []}
    run = running[loop_id]
    loop = by_id[loop_id]
    if run['status'] != 'running':
        return {'ok': True, 'error': '', 'status': run['status'], 'iteration': run['iteration'], 't': run['next_t'],
                'changes': [], 'note': '이미 끝난 고리'}
    if run['iteration'] >= loop.get('max_iterations', 6):
        run['status'] = 'max_iterations'
        return {'ok': True, 'error': '', 'status': 'max_iterations', 'iteration': run['iteration'], 't': run['next_t'],
                'changes': [], 'note': '최대 반복 횟수에 도달해 멈춤'}
    for cond in loop.get('stop', []):
        if causal_engine.condition_ok(cond):
            run['status'] = 'stop_condition'
            return {'ok': True, 'error': '', 'status': 'stop_condition', 'iteration': run['iteration'], 't': run['next_t'],
                    'changes': [], 'note': '종료 조건: {} {} {}'.format(cond['var'], cond['op'], cond.get('level', cond.get('value')))}
    err = error_of(loop)
    if err in bs.SPECIAL:
        run['status'] = 'undetermined'
        return {'ok': True, 'error': '', 'status': 'undetermined', 'iteration': run['iteration'], 't': run['next_t'],
                'changes': [], 'note': '감지 변수 상태를 판단할 수 없음 ({})'.format(err)}
    if err == 0 and loop['loop_type'] == 'negative':
        run['status'] = 'within_setpoint'
        return {'ok': True, 'error': '', 'status': 'within_setpoint', 'iteration': run['iteration'], 't': run['next_t'],
                'changes': [], 'note': '설정점(범위) 안: 더 조절하지 않음'}
    run['iteration'] += 1
    t = run['next_t']
    # 수용체 단계: 감지 변수 방향을 따름(increase) 또는 반대(decrease)
    sensor_level = err
    if loop.get('sensor_direction', 'increase') == 'decrease':
        sensor_level = -err
    if sensor_level > 2:
        sensor_level = 2
    if sensor_level < -2:
        sensor_level = -2
    sensed = loop['sensed_variable']
    before = bs.level_of(sensed)
    mechanisms = [loop.get('mechanism', loop_id)]
    for extra in loop.get('also_mechanisms', []):
        mechanisms.append(extra)
    # 오차가 남아 있는 동안 단계마다 조절 신호를 한 번 더 보낸다 (오차 방향으로 수용체 +1/-1 → 효과기 전파).
    # 수용체를 "새 단계"로 다시 맞추는 방식은 오차가 줄 때 반대 방향 변화로 전파되어 쓰지 않는다.
    push = 1
    if sensor_level < 0:
        push = -1
    result = causal_engine.apply([{'var': loop['sensor_variable'], 'delta': push}],
                                 '{}#{}'.format(loop_id, run['iteration']), mechanisms, t)
    # 화면 표시: 수용체 단계 = 지금 오차에 해당하는 발화 (전파 없이)
    sensor = bs.variables[loop['sensor_variable']]
    if sensor['data_type'] == 'relative':
        sensor['value'] = sensor_level
    note = ''
    after = bs.level_of(sensed)
    if before not in bs.SPECIAL and after not in bs.SPECIAL:
        lim = cap_for(loop, err)
        if lim != None:
            cap = lim.get('cap_level', 0)
            if err < 0 and after > cap:
                bs.shift(sensed, cap - after, '제한: ' + lim.get('reason', ''))
                note = '제한: ' + lim.get('reason', '')
            if err > 0 and after < cap:
                bs.shift(sensed, cap - after, '제한: ' + lim.get('reason', ''))
                note = '제한: ' + lim.get('reason', '')
        after = bs.level_of(sensed)
        if after == before and note == '':
            note = '감지 변수 변화 없음'
        if after == before:
            run['status'] = 'plateau'
    run['next_t'] = t + loop.get('delay', 1)
    entry = {'iteration': run['iteration'], 't': t, 'error': err, 'sensor_level': sensor_level, 'sensed_before': before,
             'sensed_after': after, 'note': note}
    run['log'].append(entry)
    if len(run['log']) > MAX_LOG:
        run['log'].pop(0)
    direction = '강화 방향'
    if loop['loop_type'] == 'negative':
        direction = '회복 방향'
    return {'ok': result['ok'], 'error': '; '.join(result['errors']), 'status': run['status'], 'iteration': run['iteration'],
            't': t, 'changes': result['changes'], 'skipped': result['skipped'], 'unresolved': result['unresolved'],
            'sensed': {'var': sensed, 'before': before, 'after': after}, 'note': note, 'direction': direction}


def due(t_now):
    # 지금 시간까지 실행할 차례인 고리 (정의 순서 → 결정적)
    out = []
    for loop in loops:
        lid = loop['loop_id']
        if lid in running and running[lid]['status'] == 'running' and running[lid]['next_t'] <= t_now:
            out.append(lid)
    return out


def run_until_settled(loop_ids, t_start, max_total=40):
    # 여러 고리를 물리 시간 순서대로 번갈아 실행한다. 반복 총수 제한(무한 반복 방지)
    for lid in loop_ids:
        if lid not in running or running[lid]['status'] != 'running':
            start(lid, t_start)
    steps = []
    count = 0
    while count < max_total:
        best = None
        for loop in loops:
            lid = loop['loop_id']
            if lid in loop_ids and lid in running and running[lid]['status'] == 'running':
                if best == None or running[lid]['next_t'] < running[best]['next_t']:
                    best = lid
        if best == None:
            break
        out = step(best)
        out['loop_id'] = best
        steps.append(out)
        count += 1
    if count >= max_total:
        for lid in loop_ids:
            if lid in running and running[lid]['status'] == 'running':
                running[lid]['status'] = 'max_total'
    return steps


def status():
    out = {}
    for lid in running:
        out[lid] = {'iteration': running[lid]['iteration'], 'status': running[lid]['status'], 'next_t': running[lid]['next_t'],
                    'log': list(running[lid]['log'][-10:])}
    return out


def reset():
    running.clear()
