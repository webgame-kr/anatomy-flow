# 인과관계 엔진 (STEP 04-C)
# - 변수 사이 인과관계를 데이터(딕셔너리 리스트)로 정의하고, 원인 변화가 결과에 미치는 "방향"을 차례로 전한다.
# - 관계 유형: positive(양), negative(음), activation(활성화), inhibition(억제), conditional(조건부),
#   threshold(역치 기반), multi_condition(복수 조건), parallel(병렬 반응), formula_direction(공식의 방향 관계)
# - 일반 인과관계는 순환이 없어야 한다(의존성 순서로 처리). 순환(되먹임)은 feedback_engine이 단계별로 처리한다.
# - 크기 근거가 없으므로 단계(방향)만 전한다. 같은 방향 원인이 여러 개면 가장 큰 단계 하나만 쓴다(더하지 않음).
#   반대 방향 원인이 함께 작용하면 우선순위(priority)가 더 높은 관계가 있고 그 관계가 dominant일 때만 그쪽을 따르고,
#   아니면 결과를 MIXED(미확정)로 두고 더 전하지 않는다.
# - 같은 이벤트(event_id)는 한 번만 적용한다(중복 적용으로 수치가 계속 커지지 않게).

import biological_state as bs

TYPES = ('positive', 'negative', 'activation', 'inhibition', 'conditional', 'threshold', 'multi_condition',
         'parallel', 'formula_direction')
OPS = ('==', '!=', '>', '>=', '<', '<=')

relations = []            # 정의 (불러온 순서)
by_id = {}
incoming = {}             # 결과 변수 -> [관계 id]
var_order = []            # 위상 순서의 변수 id
applied_events = set()    # 이미 적용한 이벤트 id
last_result = {}


def clear():
    del relations[:]
    by_id.clear()
    incoming.clear()
    del var_order[:]
    applied_events.clear()
    last_result.clear()


def sign_of(rel):
    if rel['direction'] == 'increase':
        return 1
    return -1


def check_definition(rel):
    errors = []
    for key in ('causal_id', 'source_variable', 'target_variable', 'direction', 'relationship_type'):
        if key not in rel:
            errors.append('인과관계 정의에 {}가 없습니다'.format(key))
    if len(errors) > 0:
        return errors
    cid = rel['causal_id']
    if rel['relationship_type'] not in TYPES:
        errors.append('{}: 알 수 없는 관계 유형 {}'.format(cid, rel['relationship_type']))
    if rel['direction'] not in ('increase', 'decrease'):
        errors.append('{}: direction은 increase 또는 decrease'.format(cid))
    kind = rel['relationship_type']
    if (kind == 'positive' or kind == 'activation') and rel['direction'] != 'increase':
        errors.append('{}: {} 관계는 direction이 increase여야 합니다'.format(cid, kind))
    if (kind == 'negative' or kind == 'inhibition') and rel['direction'] != 'decrease':
        errors.append('{}: {} 관계는 direction이 decrease여야 합니다'.format(cid, kind))
    for key in ('source_variable', 'target_variable'):
        if not bs.has(rel[key]):
            errors.append('{}: 없는 변수 {}'.format(cid, rel[key]))
    if rel['source_variable'] == rel['target_variable']:
        errors.append('{}: 원인과 결과가 같습니다'.format(cid))
    if kind == 'threshold':
        th = rel.get('threshold')
        if type(th) != dict or th.get('op') not in OPS or not bs.is_number(th.get('value')):
            errors.append('{}: threshold {{var, op, value}}가 필요합니다'.format(cid))
    delay = rel.get('delay', 0)
    if type(delay) != int or delay < 0:
        errors.append('{}: delay는 0 이상 정수(물리 시간 단위)'.format(cid))
    for cond in rel.get('conditions', []):
        if type(cond) != dict or not bs.has(cond.get('var', '')) or cond.get('op') not in OPS:
            errors.append('{}: 조건 형식 오류 {}'.format(cid, cond))
    return errors


def load(defs):
    clear()
    errors = []
    for rel in defs:
        problems = check_definition(rel)
        if len(problems) > 0:
            for p in problems:
                errors.append(p)
            continue
        if rel['causal_id'] in by_id:
            errors.append('인과관계 id 중복: {}'.format(rel['causal_id']))
            continue
        relations.append(rel)
        by_id[rel['causal_id']] = rel
        incoming.setdefault(rel['target_variable'], []).append(rel['causal_id'])
    result = sort_variables()
    for e in result:
        errors.append(e)
    return {'ok': len(errors) == 0, 'errors': errors, 'count': len(relations)}


def sort_variables():
    # 변수 위상 정렬 (Kahn). 순환이 있으면 오류 (되먹임은 feedback으로 정의해야 함)
    del var_order[:]
    nodes = []
    for var_id in bs.order:
        nodes.append(var_id)
    indeg = {}
    outs = {}
    for v in nodes:
        indeg[v] = 0
        outs[v] = []
    for rel in relations:
        s = rel['source_variable']
        t = rel['target_variable']
        if t not in outs[s]:
            outs[s].append(t)
            indeg[t] += 1
    ready = []
    for v in nodes:
        if indeg[v] == 0:
            ready.append(v)
    while len(ready) > 0:
        v = ready.pop(0)
        var_order.append(v)
        for t in outs[v]:
            indeg[t] -= 1
            if indeg[t] == 0:
                ready.append(t)
    if len(var_order) < len(nodes):
        left = []
        for v in nodes:
            if v not in var_order:
                left.append(v)
        return ['인과관계에 순환이 있습니다 (되먹임은 feedback으로 정의): {}'.format(', '.join(left))]
    return []


def compare(left, op, right):
    if op == '==':
        return left == right
    if op == '!=':
        return left != right
    if not bs.is_number(left) or not bs.is_number(right):
        return False
    if op == '>':
        return left > right
    if op == '>=':
        return left >= right
    if op == '<':
        return left < right
    if op == '<=':
        return left <= right
    return False


def condition_ok(cond):
    # {'var', 'op', 'value'} → 현재 값, {'var', 'op', 'level'} → 상대 단계
    var_id = cond['var']
    if 'level' in cond:
        return compare(bs.level_of(var_id), cond['op'], cond['level'])
    return compare(bs.get(var_id), cond['op'], cond['value'])


def relation_applies(rel, mechanisms):
    # 적용 여부와 이유. 결과 (적용?, 이유, 범위 밖 처리)
    # mechanisms가 None이면 모든 관계, 리스트면 그 기전만 ('core'도 적어야 한다 → 학습 단계를 하나씩 보여 줄 수 있다)
    if mechanisms != None and rel.get('mechanism', '') not in mechanisms:
        return (False, '기전 범위 밖 ({})'.format(rel.get('mechanism', '')), '')
    for cond in rel.get('conditions', []):
        if not condition_ok(cond):
            return (False, '조건 불충족: {} {} {}'.format(cond['var'], cond['op'], cond.get('level', cond.get('value'))),
                    rel.get('out_of_range', 'skip'))
    if rel['relationship_type'] == 'threshold':
        th = rel['threshold']
        var_id = th.get('var', rel['source_variable'])
        if not compare(bs.get(var_id), th['op'], th['value']):
            return (False, '역치 미달: {} {} {}'.format(var_id, th['op'], th['value']), '')
    return (True, '', '')


def apply(triggers, event_id='', mechanisms=None, start_t=0):
    # triggers: [{'var', 'delta'(정수 또는 'UNKNOWN')}] 또는 [{'var', 'level'}](단계 지정)
    # 결과 {'ok', 'result', 'changes'(시간 순), 'skipped', 'unresolved', 'errors'}
    if event_id != '' and event_id in applied_events:
        return {'ok': True, 'result': 'duplicate', 'changes': [], 'skipped': [], 'unresolved': [], 'errors': []}
    errors = []
    changes = {}
    for trig in triggers:
        var_id = trig.get('var', '')
        if not bs.has(var_id):
            errors.append('없는 변수: {}'.format(var_id))
            continue
        if 'level' in trig:
            before = bs.level_of(var_id)
            target = trig['level']
            if target in bs.SPECIAL:
                delta = target
            elif before in bs.SPECIAL:
                delta = target
            else:
                delta = target - before
        else:
            delta = trig.get('delta', 0)
        if delta not in bs.SPECIAL and type(delta) != int:
            errors.append('{}: delta는 정수 또는 UNKNOWN'.format(var_id))
            continue
        done = bs.shift(var_id, delta, '원인(trigger)')
        if not done['ok']:
            errors.append(done['error'])
            continue
        changes[var_id] = {'delta': delta, 't': start_t, 'causes': ['trigger'], 'kind': 'trigger'}
    if len(errors) > 0:
        return {'ok': False, 'result': 'error', 'changes': [], 'skipped': [], 'unresolved': [], 'errors': errors}

    skipped = []
    unresolved = []
    for var_id in var_order:
        if var_id in changes and changes[var_id]['kind'] == 'trigger':
            continue
        contrib = []
        for cid in incoming.get(var_id, []):
            rel = by_id[cid]
            src = rel['source_variable']
            if src not in changes:
                continue
            ds = changes[src]['delta']
            if ds == 0:
                continue
            check = relation_applies(rel, mechanisms)
            if not check[0]:
                skipped.append({'causal_id': cid, 'reason': check[1]})
                if check[2] == 'unknown':
                    contrib.append({'causal_id': cid, 'delta': 'UNKNOWN', 't': changes[src]['t'] + rel.get('delay', 0),
                                    'priority': rel.get('priority', 0), 'dominant': False})
                continue
            if ds in bs.SPECIAL:
                contrib.append({'causal_id': cid, 'delta': 'UNKNOWN', 't': changes[src]['t'] + rel.get('delay', 0),
                                'priority': rel.get('priority', 0), 'dominant': False})
                continue
            step = 1
            if rel.get('magnitude') == 'follow':
                step = abs(ds)
            direction = 1
            if ds < 0:
                direction = -1
            contrib.append({'causal_id': cid, 'delta': direction * sign_of(rel) * step,
                            't': changes[src]['t'] + rel.get('delay', 0), 'priority': rel.get('priority', 0),
                            'dominant': rel.get('dominant', False)})
        if len(contrib) == 0:
            continue
        combined = combine(var_id, contrib)
        if combined['delta'] == 'MIXED':
            unresolved.append({'var': var_id, 'causes': combined['causes'], 'reason': combined['reason']})
        note = '원인: ' + ', '.join(combined['causes'])
        if combined['delta'] in bs.SPECIAL:
            bs.shift(var_id, combined['delta'], note + ' (' + combined['reason'] + ')')
        else:
            bs.shift(var_id, combined['delta'], note)
        changes[var_id] = {'delta': combined['delta'], 't': combined['t'], 'causes': combined['causes'], 'kind': 'effect'}
    if event_id != '':
        applied_events.add(event_id)
    ordered = order_changes(changes)
    last_result.clear()
    last_result['changes'] = ordered
    return {'ok': True, 'result': 'applied', 'changes': ordered, 'skipped': skipped, 'unresolved': unresolved, 'errors': []}


def combine(var_id, contrib):
    # 여러 원인의 결합 정책
    causes = []
    ups = []
    downs = []
    unknown = []
    t = 0
    for c in contrib:
        causes.append(c['causal_id'])
        if c['t'] > t:
            t = c['t']
        if c['delta'] == 'UNKNOWN':
            unknown.append(c)
        elif c['delta'] > 0:
            ups.append(c)
        elif c['delta'] < 0:
            downs.append(c)
    if len(unknown) > 0 and len(ups) == 0 and len(downs) == 0:
        return {'delta': 'UNKNOWN', 't': t, 'causes': causes, 'reason': '적용 범위 밖 또는 원인 미확정'}
    if len(ups) > 0 and len(downs) > 0:
        best = None
        tie = False
        for c in ups + downs:
            if best == None or c['priority'] > best['priority']:
                best = c
                tie = False
            elif c['priority'] == best['priority']:
                tie = True
        if best != None and not tie and best['dominant']:
            return {'delta': best['delta'], 't': t, 'causes': causes,
                    'reason': '반대 원인 중 우선 관계 {} 적용'.format(best['causal_id'])}
        return {'delta': 'MIXED', 't': t, 'causes': causes, 'reason': '반대 방향 원인이 함께 작용 (정량 결합 근거 없음)'}
    group = ups
    if len(downs) > 0:
        group = downs
    biggest = 0
    for c in group:
        if abs(c['delta']) > abs(biggest):
            biggest = c['delta']
    reason = ''
    if len(unknown) > 0:
        reason = '일부 원인 미확정'
    return {'delta': biggest, 't': t, 'causes': causes, 'reason': reason}


def order_changes(changes):
    # 시간 순 → 같은 시간은 위상 순서 (같은 t = 병렬 반응)
    times = []
    for var_id in changes:
        if changes[var_id]['t'] not in times:
            times.append(changes[var_id]['t'])
    times.sort()
    out = []
    for t in times:
        for var_id in var_order:
            if var_id in changes and changes[var_id]['t'] == t:
                item = changes[var_id]
                out.append({'var': var_id, 'delta': item['delta'], 't': t, 'causes': list(item['causes']),
                            'kind': item['kind'], 'level': bs.level_of(var_id), 'label': bs.label_of(var_id)})
    return out


def forget_event(event_id):
    # 복구(되돌리기) 때: 이 이벤트를 다시 적용할 수 있게
    applied_events.discard(event_id)


def info():
    items = []
    for rel in relations:
        items.append({'causal_id': rel['causal_id'], 'source_variable': rel['source_variable'],
                      'target_variable': rel['target_variable'], 'direction': rel['direction'],
                      'relationship_type': rel['relationship_type'], 'delay': rel.get('delay', 0),
                      'mechanism': rel.get('mechanism', ''), 'timescale': rel.get('timescale', ''),
                      'verification_status': rel.get('verification_status', ''), 'source': rel.get('source', '')})
    return {'relations': items, 'order': list(var_order)}
