# 생리 상태 명령 (STEP 04-C): JavaScript가 부르는 함수 모음
# - Python이 생리 상태의 유일한 기준이다. JS는 여기서 받은 스냅샷(view)으로 표시하고, 시각 명령(commands)만 실행한다.
# - 시각 변화(애니메이션)가 생리 값을 바꾸지 않는다: 바인딩은 상태 → 시각 한 방향이다.
# - 명령: state_set, state_update, state_calculate, causal_apply, feedback_start, feedback_step, feedback_stop,
#         feedback_run, signal_emit, receptor_activate, receptor_deactivate, state_bind_visual, state_snapshot, state_restore
# - 학습 연결: begin(이벤트 id, ops) → (필수 애니메이션 완료) → commit / 실패·취소 → rollback(이전 정상 상태로)
# - 문맥(context): mechanism(기전 학습), experiment(자유 실험), observe(자동 관찰)의 상태·기록을 따로 둔다.
# - 교육용 계산·단순화 모델이다. 실제 환자의 생리 반응을 예측하지 않는다.

import biological_state as bs
import formula_engine
import causal_engine
import feedback_engine
import scenario_engine

model = {}             # 불러온 모델 (원본)
receptors = {}         # receptor_id -> 정의
signals = {}           # signal_id -> 정의
signal_log = []        # 최근 신호 (화면용)
bindings = []          # 시각 바인딩
contexts = {}          # 문맥 이름 -> 스냅샷 (다른 문맥에 있을 때)
info = {'context': 'mechanism', 'loaded': False, 'time_scale_ms': 600, 'next_id': 1}
pending = {}           # 이벤트 id -> {'snap', 'events'} (확정 전)
committed = []         # 확정한 이벤트 id (중복 방지)
BINDING_KINDS = ('animation_speed', 'morph', 'structure_state', 'material', 'signal')
SIGNAL_TYPES = ('neural_afferent', 'neural_efferent', 'hormone', 'enzyme', 'neurotransmitter', 'paracrine', 'electrical')
MAX_SIGNAL_LOG = 30


def fail(message):
    return {'ok': False, 'errors': [message], 'commands': [], 'changes': [], 'view': view()}


def load(data):
    # 모델 불러오기. 오류가 있으면 불러오지 않는다 (부분 상태를 남기지 않음)
    errors = []
    warnings = []
    if type(data) != dict:
        return {'ok': False, 'errors': ['모델은 객체여야 합니다'], 'warnings': [], 'view': None}
    bs.clear()
    model.clear()
    receptors.clear()
    signals.clear()
    del signal_log[:]
    del bindings[:]
    contexts.clear()
    pending.clear()
    del committed[:]
    for spec in data.get('variables', []):
        r = bs.define(spec)
        if not r['ok']:
            errors.append(r['error'])
    if len(errors) == 0:
        r = formula_engine.load(data.get('formulas', []), data.get('formula_modes', {}))
        for e in r['errors']:
            errors.append(e)
    if len(errors) == 0:
        r = causal_engine.load(data.get('causal', []))
        for e in r['errors']:
            errors.append(e)
        r = feedback_engine.load(data.get('feedback', []))
        for e in r['errors']:
            errors.append(e)
        for rec in data.get('receptors', []):
            rid = rec.get('receptor_id', '')
            if rid == '' or not bs.has(rec.get('variable', '')):
                errors.append('수용체 정의 오류: {} (variable 필요)'.format(rid))
                continue
            if bs.variables[rec['variable']]['data_type'] != 'activation':
                errors.append('{}: 수용체 변수는 activation 자료형'.format(rid))
                continue
            receptors[rid] = rec
        for sig in data.get('signals', []):
            sid = sig.get('signal_id', '')
            if sid == '' or sig.get('signal_type') not in SIGNAL_TYPES:
                errors.append('신호 정의 오류: {} (signal_type은 {})'.format(sid, ', '.join(SIGNAL_TYPES)))
                continue
            if sig.get('receptor_id', '') != '' and sig['receptor_id'] not in receptors:
                warnings.append('{}: 없는 수용체 {}'.format(sid, sig['receptor_id']))
            signals[sid] = sig
        for b in data.get('visual_bindings', []):
            if b.get('kind') not in BINDING_KINDS or not bs.has(b.get('variable', '')):
                errors.append('시각 바인딩 오류: {}'.format(b.get('binding_id', b)))
                continue
            if b['kind'] == 'signal' and b.get('signal_id') not in signals:
                errors.append('{}: 없는 신호 {}'.format(b.get('binding_id'), b.get('signal_id')))
                continue
            bindings.append(b)
        r = scenario_engine.load(data.get('scenarios', []))
        for e in r['errors']:
            errors.append(e)
    if len(errors) > 0:
        info['loaded'] = False
        return {'ok': False, 'errors': errors, 'warnings': warnings, 'view': None}
    for key in data:
        model[key] = data[key]
    info['time_scale_ms'] = data.get('time', {}).get('tick_ms', 600)
    first = formula_engine.compute_all()
    for e in first['errors']:
        warnings.append('기준 상태 계산: ' + e)
    formula_engine.derive_baselines()
    calc = formula_engine.compute_all()
    for e in calc['errors']:
        warnings.append('기준 상태 계산: ' + e)
    # 기준 상태의 계산 결과를 그 변수의 기준값으로 (표시용 비교 기준)
    for r in calc['records']:
        bs.variables[r['output']]['baseline'] = r['value']
        bs.variables[r['output']]['trend'] = 0
    bs.record('기준 상태')
    info['loaded'] = True
    info['context'] = 'mechanism'
    return {'ok': True, 'errors': [], 'warnings': warnings, 'view': view()}


def new_id():
    n = info['next_id']
    info['next_id'] += 1
    return n


# ---------- 문맥 ----------
def switch_context(name):
    # 기전 학습(mechanism)과 자유 실험(experiment)의 상태를 따로 둔다
    # observe: 자동 관찰(시나리오를 처음부터 되먹임까지 재생) — 학습 상태를 바꾸지 않는 별도 사본
    if name not in ('mechanism', 'experiment', 'observe'):
        return fail('알 수 없는 문맥: {}'.format(name))
    if name == info['context']:
        return {'ok': True, 'errors': [], 'commands': [], 'changes': [], 'view': view()}
    contexts[info['context']] = {'state': bs.snapshot(), 'history': list(bs.history), 'events': set(causal_engine.applied_events)}
    if name in contexts:
        saved = contexts[name]
        bs.restore(saved['state'])
        del bs.history[:]
        for row in saved['history']:
            bs.history.append(row)
        causal_engine.applied_events.clear()
        for e in saved['events']:
            causal_engine.applied_events.add(e)
    else:
        bs.reset()
        causal_engine.applied_events.clear()
        formula_engine.compute_all()
        bs.record('기준 상태')
    feedback_engine.reset()
    info['context'] = name
    return {'ok': True, 'errors': [], 'commands': bind_all(), 'changes': [], 'view': view()}


# ---------- 상태 ----------
def threshold_warnings(var_id):
    # 역치 관계(예: 심박수가 매우 빠르면 충만 감소)가 지금 값에서 성립하면 알린다. 자유 실험은 다른 조건을 고정한다
    out = []
    for rel in causal_engine.relations:
        if rel['relationship_type'] != 'threshold' or rel['source_variable'] != var_id:
            continue
        check = causal_engine.relation_applies(rel, None)
        if check[0]:
            out.append('{}: {}'.format(rel['causal_id'], rel.get('notes', '')))
    return out


def state_set(var_id, value):
    # 값 설정 → 공식 계산. 계산이 비정상 관계(예: ESV > EDV)를 만들면 설정을 되돌리고 오류로 돌려준다
    before = bs.snapshot()
    r = bs.set_value(var_id, value, '직접 설정')
    if not r['ok']:
        return fail(r['error'])
    calc = formula_engine.compute_all()
    if not calc['ok']:
        bs.restore(before)
        formula_engine.compute_all()
        out = fail('{} = {}: 계산할 수 없는 상태라 되돌렸습니다'.format(var_id, value))
        for e in calc['errors']:
            out['errors'].append(e)
        return out
    delta = 0
    if bs.is_number(r['old']) and bs.is_number(value):
        delta = bs.direction_of(value - r['old'])
    changes = [{'var': var_id, 'delta': delta, 't': bs.clock['t'], 'causes': ['state_set'], 'kind': 'set',
                'level': bs.level_of(var_id), 'label': bs.label_of(var_id)}]
    for rec in calc['records']:
        changes.append({'var': rec['output'], 'delta': bs.variables[rec['output']]['trend'], 't': bs.clock['t'],
                        'causes': [rec['formula_id']], 'kind': 'formula', 'level': bs.level_of(rec['output']),
                        'label': bs.label_of(rec['output'])})
    bs.record('설정 {}'.format(var_id))
    return {'ok': True, 'errors': [], 'warnings': threshold_warnings(var_id), 'commands': bind_changes(changes),
            'changes': changes, 'view': view(), 'calc': calc['records']}


def state_update(var_id, delta):
    # 단계 변화만 (전파하지 않음). 전파는 causal_apply
    r = bs.shift(var_id, delta, '직접 변경')
    if not r['ok']:
        return fail(r['error'])
    changes = [{'var': var_id, 'delta': delta, 't': bs.clock['t'], 'causes': ['state_update'], 'kind': 'set',
                'level': bs.level_of(var_id), 'label': bs.label_of(var_id)}]
    bs.record('변경 {}'.format(var_id))
    return {'ok': True, 'errors': [], 'commands': bind_changes(changes), 'changes': changes, 'view': view()}


def state_calculate():
    calc = formula_engine.compute_all()
    bs.record('계산')
    return {'ok': calc['ok'], 'errors': calc['errors'], 'commands': [], 'changes': [], 'calc': calc['records'], 'view': view()}


def set_formula_mode(group, mode):
    r = formula_engine.set_mode(group, mode)
    if not r['ok']:
        return fail(r['error'])
    return state_calculate()


def reset():
    bs.reset()
    causal_engine.applied_events.clear()
    feedback_engine.reset()
    formula_engine.compute_all()
    pending.clear()
    del committed[:]
    del signal_log[:]
    bs.record('기준 상태')
    return {'ok': True, 'errors': [], 'commands': bind_all(), 'changes': [], 'view': view()}


# ---------- 인과·되먹임 ----------
def advance_clock(changes):
    for c in changes:
        if c['t'] > bs.clock['t']:
            bs.clock['t'] = c['t']


def causal_apply(triggers, event_id='', mechanisms=None):
    if event_id == '':
        event_id = 'causal#{}'.format(new_id())
    out = causal_engine.apply(triggers, event_id, mechanisms, bs.clock['t'])
    if not out['ok']:
        return {'ok': False, 'errors': out['errors'], 'commands': [], 'changes': [], 'view': view()}
    if out['result'] == 'duplicate':
        return {'ok': True, 'errors': [], 'result': 'duplicate', 'commands': [], 'changes': [], 'view': view()}
    advance_clock(out['changes'])
    bs.record('인과 {}'.format(event_id))
    return {'ok': True, 'errors': [], 'result': 'applied', 'commands': bind_changes(out['changes']), 'changes': out['changes'],
            'skipped': out['skipped'], 'unresolved': out['unresolved'], 'view': view()}


def feedback_start(loop_id):
    r = feedback_engine.start(loop_id, bs.clock['t'])
    if not r['ok']:
        return fail(r['error'])
    return {'ok': True, 'errors': [], 'commands': [], 'changes': [], 'view': view()}


def feedback_step(loop_id):
    if loop_id not in feedback_engine.running:
        r = feedback_engine.start(loop_id, bs.clock['t'])
        if not r['ok']:
            return fail(r['error'])
    out = feedback_engine.step(loop_id)
    if not out['ok'] and out.get('status') == 'not_started':
        return fail(out['error'])
    changes = out.get('changes', [])
    advance_clock(changes)
    if 't' in out and out['t'] > bs.clock['t'] and len(changes) > 0:
        bs.clock['t'] = out['t']
    bs.record('되먹임 {} {}회'.format(loop_id, out.get('iteration', 0)))
    errors = []
    if out.get('error', '') != '':
        errors.append(out['error'])
    return {'ok': True, 'errors': errors, 'commands': bind_changes(changes), 'changes': changes, 'feedback': out, 'view': view()}


def feedback_stop(loop_id):
    r = feedback_engine.stop(loop_id)
    if not r['ok']:
        return fail(r['error'])
    return {'ok': True, 'errors': [], 'commands': [], 'changes': [], 'view': view()}


def feedback_run(loop_ids, max_total=20):
    steps = feedback_engine.run_until_settled(loop_ids, bs.clock['t'], max_total)
    changes = []
    for s in steps:
        for c in s.get('changes', []):
            changes.append(c)
    advance_clock(changes)
    bs.record('되먹임 실행')
    summary = []
    for s in steps:
        summary.append({'loop_id': s.get('loop_id'), 'iteration': s.get('iteration'), 'status': s.get('status'),
                        't': s.get('t'), 'note': s.get('note', ''), 'sensed': s.get('sensed')})
    return {'ok': True, 'errors': [], 'commands': bind_changes(changes), 'changes': changes, 'steps': summary, 'view': view()}


# ---------- 수용체·신호 ----------
def receptor_activate(receptor_id, event_id=''):
    if receptor_id not in receptors:
        return fail('없는 수용체: {}'.format(receptor_id))
    rec = receptors[receptor_id]
    if event_id == '':
        event_id = 'receptor:{}#{}'.format(receptor_id, new_id())
    return causal_apply([{'var': rec['variable'], 'level': 1}], event_id, rec.get('mechanisms'))


def receptor_deactivate(receptor_id):
    # 비활성으로 표시만 한다(이전 활성으로 생긴 변화는 되돌리지 않음 — 되돌리려면 state_restore 또는 reset)
    if receptor_id not in receptors:
        return fail('없는 수용체: {}'.format(receptor_id))
    rec = receptors[receptor_id]
    bs.variables[rec['variable']]['value'] = 'INACTIVE'
    bs.variables[rec['variable']]['note'] = '비활성화 (후속 변화는 유지)'
    changes = [{'var': rec['variable'], 'delta': -1, 't': bs.clock['t'], 'causes': ['receptor_deactivate'], 'kind': 'set',
                'level': 0, 'label': 'INACTIVE'}]
    bs.record('수용체 비활성 {}'.format(receptor_id))
    return {'ok': True, 'errors': [], 'commands': bind_changes(changes), 'changes': changes, 'view': view()}


def signal_command(sig, wait=True):
    duration = sig.get('duration_ms', 900)
    return {'action': 'signal_emit', 'target': sig.get('actor_id', ''), 'signal_id': sig['signal_id'],
            'signal_type': sig['signal_type'], 'path_id': sig.get('path_id', ''), 'from': sig.get('from_checkpoint', ''),
            'to': sig.get('to_checkpoint', ''), 'duration': duration, 'style': sig.get('visual_style', {}), 'wait': wait}


def signal_emit(signal_id):
    if signal_id not in signals:
        return fail('없는 신호: {}'.format(signal_id))
    sig = signals[signal_id]
    note_signal(sig)
    return {'ok': True, 'errors': [], 'commands': [signal_command(sig)], 'changes': [], 'view': view()}


def note_signal(sig):
    signal_log.append({'signal_id': sig['signal_id'], 'signal_type': sig['signal_type'], 't': bs.clock['t'],
                       'source': sig.get('source_structure', ''), 'target': sig.get('target_structure', ''),
                       'direction': sig.get('signal_direction', ''), 'receptor_id': sig.get('receptor_id', '')})
    if len(signal_log) > MAX_SIGNAL_LOG:
        signal_log.pop(0)


# ---------- 시각 바인딩 (상태 → 시각, 한 방향) ----------
def level_key(level):
    return str(level)


def binding_command(b, var_id):
    level = bs.level_of(var_id)
    kind = b['kind']
    key = level_key(level)
    mapping = b.get('map', {})
    if kind == 'animation_speed':
        # mode ratio: 값 ÷ 기준값 / level: 단계 표 / auto: 값이 기준과 다르면 ratio, 같으면(방향만 바뀜) 단계 표
        speed = None
        value = bs.get(var_id)
        base = bs.variables[var_id].get('baseline')
        mode = b.get('mode', 'level')
        numeric = bs.is_number(value) and bs.is_number(base) and base > 0
        if mode == 'ratio' and numeric:
            speed = value / base
        elif mode == 'auto' and numeric and value != base:
            speed = value / base
        elif key in mapping:
            speed = mapping[key]
        if speed == None:
            return None
        lo = b.get('min', 0.4)
        hi = b.get('max', 2.5)
        if speed < lo:
            speed = lo
        if speed > hi:
            speed = hi
        cmd = {'action': 'animation_play', 'target': b['target'], 'speed': round(speed, 3), 'loop': True, 'wait': False,
               'binding': b.get('binding_id', '')}
        wvar = b.get('weight_variable', '')
        if wvar != '' and bs.has(wvar):
            wkey = level_key(bs.level_of(wvar))
            if wkey in b.get('weight_map', {}):
                cmd['weight'] = b['weight_map'][wkey]
        return cmd
    if key not in mapping:
        return None
    if kind == 'morph':
        return {'action': 'morph_transition', 'target': b['target'], 'morph': b['morph'], 'value': mapping[key],
                'duration': b.get('duration_ms', 500), 'wait': False, 'binding': b.get('binding_id', '')}
    if kind == 'structure_state':
        value = {}
        value[b['target']] = mapping[key]
        return {'action': 'set_biological_visual_state', 'value': value, 'wait': False, 'binding': b.get('binding_id', '')}
    if kind == 'material':
        return {'action': 'set_color', 'target': b['target'], 'value': mapping[key], 'binding': b.get('binding_id', '')}
    return None


def bind_changes(changes):
    # 바뀐 변수에 연결된 시각 명령. 시간(t) 순서를 지키고, 같은 시간의 신호는 함께(병렬) 보낸다
    commands = []
    times = []
    for c in changes:
        if c['t'] not in times:
            times.append(c['t'])
    times.sort()
    for t in times:
        group_signals = []
        group_visuals = []
        for c in changes:
            if c['t'] != t:
                continue
            for b in bindings:
                if b['variable'] != c['var'] and b.get('weight_variable', '') != c['var']:
                    continue
                if b['kind'] == 'signal':
                    when = b.get('when', 'change')
                    d = c['delta']
                    if d in bs.SPECIAL or d == 0:
                        continue
                    if when == 'change' or (when == 'increase' and d > 0) or (when == 'decrease' and d < 0):
                        sig = signals[b['signal_id']]
                        note_signal(sig)
                        group_signals.append(signal_command(sig, False))
                else:
                    cmd = binding_command(b, b['variable'])
                    if cmd != None and not has_binding(group_visuals, cmd):
                        group_visuals.append(cmd)
        # 같은 시간의 신호는 병렬, 마지막 하나만 기다린다 → 다음 시간 묶음은 그 뒤에
        if len(group_signals) > 0:
            group_signals[-1]['wait'] = True
        for cmd in group_signals:
            commands.append(cmd)
        for cmd in group_visuals:
            commands.append(cmd)
    return commands


def has_binding(cmds, cmd):
    for one in cmds:
        if one.get('binding') == cmd.get('binding'):
            return True
    return False


def bind_all():
    # 지금 상태 전체를 시각에 맞춘다 (복원·문맥 전환 뒤). 신호는 보내지 않는다
    commands = []
    for b in bindings:
        if b['kind'] == 'signal':
            continue
        cmd = binding_command(b, b['variable'])
        if cmd != None:
            if cmd['action'] == 'morph_transition':
                cmd['duration'] = 1
            commands.append(cmd)
    return commands


def state_bind_visual():
    return {'ok': True, 'errors': [], 'commands': bind_all(), 'changes': [], 'view': view()}


# ---------- 스냅샷 ----------
def state_snapshot():
    return {'state': bs.snapshot(), 'events': list(causal_engine.applied_events), 'context': info['context']}


def state_restore(snap):
    if type(snap) != dict or 'state' not in snap:
        return fail('스냅샷 형식 오류')
    r = bs.restore(snap['state'])
    if not r['ok']:
        return fail(r['error'])
    causal_engine.applied_events.clear()
    for e in snap.get('events', []):
        causal_engine.applied_events.add(e)
    feedback_engine.reset()
    return {'ok': True, 'errors': [], 'commands': bind_all(), 'changes': [], 'view': view()}


# ---------- 학습 이벤트 (정답 → 상태 변경 → 필수 애니메이션 → 확정) ----------
def run_ops(ops, event_id):
    # ops: [{'op': 'causal_apply'|'feedback_step'|'feedback_run'|'signal_emit'|'receptor_activate'|'state_set'|
    #        'state_update'|'scenario_start'|'set_formula_mode', ...}]
    commands = []
    changes = []
    errors = []
    k = 0
    for op in ops:
        k += 1
        kind = op.get('op', '')
        sub = '{}/{}'.format(event_id, k)
        if kind == 'causal_apply':
            out = causal_apply(op.get('changes', []), sub, op.get('mechanisms'))
        elif kind == 'feedback_step':
            out = feedback_step(op.get('loop_id', ''))
        elif kind == 'feedback_run':
            out = feedback_run(op.get('loop_ids', []), op.get('max_total', 20))
        elif kind == 'signal_emit':
            out = signal_emit(op.get('signal_id', ''))
        elif kind == 'receptor_activate':
            out = receptor_activate(op.get('receptor_id', ''), sub)
        elif kind == 'state_set':
            out = state_set(op.get('var', ''), op.get('value'))
        elif kind == 'state_update':
            out = state_update(op.get('var', ''), op.get('delta', 0))
        elif kind == 'scenario_start':
            feedback_engine.reset()          # 이전 시나리오의 되먹임 고리를 남기지 않는다
            r = scenario_engine.start(op.get('scenario_id', ''))
            out = {'ok': r['ok'], 'errors': r['errors'], 'commands': bind_all() + bind_changes(r['changes']), 'changes': r['changes']}
        elif kind == 'set_formula_mode':
            out = set_formula_mode(op.get('group', ''), op.get('mode', ''))
        else:
            out = {'ok': False, 'errors': ['알 수 없는 생리 명령: {}'.format(kind)], 'commands': [], 'changes': []}
        for e in out.get('errors', []):
            errors.append(e)
        for c in out.get('commands', []):
            commands.append(c)
        for c in out.get('changes', []):
            changes.append(c)
        if not out.get('ok', False):
            break
    return {'ok': len(errors) == 0, 'errors': errors, 'commands': commands, 'changes': changes}


def begin(event_id, ops):
    # 확정 전 실행. 같은 이벤트가 이미 확정되었으면 다시 적용하지 않는다
    if event_id in committed:
        return {'ok': True, 'result': 'duplicate', 'errors': [], 'commands': [], 'changes': [], 'view': view()}
    if event_id in pending:
        return {'ok': True, 'result': 'pending', 'errors': [], 'commands': pending[event_id]['commands'], 'changes': [], 'view': view()}
    snap = state_snapshot()
    out = run_ops(ops, event_id)
    if not out['ok']:
        state_restore(snap)
        return {'ok': False, 'result': 'error', 'errors': out['errors'], 'commands': [], 'changes': [], 'view': view()}
    pending[event_id] = {'snap': snap, 'commands': out['commands']}
    return {'ok': True, 'result': 'pending', 'errors': [], 'commands': out['commands'], 'changes': out['changes'], 'view': view()}


def commit(event_id):
    if event_id not in pending:
        return {'ok': False, 'result': 'ignored', 'view': view()}
    del pending[event_id]
    committed.append(event_id)
    bs.clock['step'] += 1
    bs.record('학습 단계 {}'.format(bs.clock['step']))
    return {'ok': True, 'result': 'committed', 'view': view()}


def rollback(event_id):
    # 필수 애니메이션 실패·취소: 이전 정상 상태로
    if event_id not in pending:
        return {'ok': False, 'result': 'ignored', 'commands': [], 'view': view()}
    snap = pending[event_id]['snap']
    del pending[event_id]
    out = state_restore(snap)
    return {'ok': True, 'result': 'rolled_back', 'commands': out['commands'], 'view': view()}


def rollback_all():
    ids = []
    for event_id in pending:
        ids.append(event_id)
    commands = []
    for event_id in ids:
        out = rollback(event_id)
        for c in out.get('commands', []):
            commands.append(c)
    return commands


# ---------- 화면 ----------
def view(var_ids=None):
    if not info['loaded']:
        return None
    if var_ids == None:
        var_ids = model.get('monitor', {}).get('default', None)
    hist = []
    for row in bs.history[-60:]:
        hist.append({'t': row[0], 'step': row[1], 'label': row[2], 'values': row[3], 'levels': row[4]})
    rec_states = []
    for rid in receptors:
        rec = receptors[rid]
        rec_states.append({'receptor_id': rid, 'name_ko': rec.get('name_ko', rid), 'state': bs.get(rec['variable']),
                           'location': rec.get('anatomical_location', ''), 'ligand': rec.get('ligand', '')})
    return {'context': info['context'], 'model_id': model.get('model_id', ''), 'vars': bs.view(var_ids),
            'time': {'t': bs.clock['t'], 'step': bs.clock['step'], 'tick_ms': info['time_scale_ms'],
                     'note': model.get('time', {}).get('note', '')},
            'feedback': feedback_engine.status(), 'scenario': scenario_engine.current['id'],
            'receptors': rec_states, 'signals': list(signal_log[-10:]), 'history': hist,
            'calc': list(formula_engine.calc_log[-12:]), 'modes': dict(formula_engine.active_mode),
            'disclaimer': model.get('disclaimer', ''), 'pending': len(pending)}


def describe():
    # 개발자 편집기용: 모델 구조 전체
    return {'variables': bs.view(), 'formulas': formula_engine.info(), 'causal': causal_engine.info(),
            'feedback': feedback_ids(),
            'receptors': list(receptors.keys()), 'signals': list(signals.keys()), 'bindings': len(bindings),
            'scenarios': scenario_engine.info()}


def feedback_ids():
    out = []
    for loop in feedback_engine.loops:
        out.append(loop['loop_id'])
    return out
