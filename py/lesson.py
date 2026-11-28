# 3D 학습 게임 API (STEP 03-D): game.py(학습 규칙) + motion_link.py(3D 이동 명령 변환)를 한 번에 부른다
# JavaScript는 입력과 이동 결과만 넘기고, 정답 판정·진행·기록은 모두 여기(Python)에서 정한다.
# 반환값의 commands는 3D 이동 명령, events는 도착 후 화면 명령(arrive, var, scene, complete 등)이다.
# STEP 04-C: 콘텐츠에 physiology가 있으면 생리 상태 엔진(physiology_commands)을 함께 쓴다.
#   정답 → 상태 계산(확정 전) → 시각 명령(이동 묶음에 넣음) → 필수 애니메이션 완료 → 확정(commit)
#   실패·취소·복구 → 이전 정상 상태로 되돌림(rollback). 같은 이벤트는 한 번만 확정한다.

import game
import motion_link
import physiology_commands
import biological_state as bs
import feedback_engine

last = {}            # 마지막 이동: {'edge': ..., 'commands': [...], 'event': ...} (재시도용)
phys = {'on': False, 'setup': {}, 'visits': {}}


def physiology_event(edge_id):
    # 같은 Edge를 순환으로 다시 지나면 새 이벤트 (방문 번호)
    count = phys['visits'].get(edge_id, 0) + 1
    return '{}@{}'.format(edge_id, count)


def setup_physiology():
    # 콘텐츠의 시작 문맥·시나리오를 적용하고 그 시각 명령을 돌려준다
    commands = []
    errors = []
    setup = phys['setup']
    physiology_commands.reset()
    physiology_commands.switch_context(setup.get('context', 'mechanism'))
    scenario = setup.get('scenario', '')
    if scenario != '':
        out = physiology_commands.run_ops([{'op': 'scenario_start', 'scenario_id': scenario}], 'setup')
        for e in out['errors']:
            errors.append(e)
        for c in out['commands']:
            commands.append(c)
    else:
        for c in physiology_commands.bind_all():
            commands.append(c)
    phys['visits'].clear()
    return {'commands': commands, 'errors': errors}


def monitor_vars():
    # 학습 문맥: 콘텐츠가 고른 모니터 변수만. 자유 실험: 실험 입력·결과 변수도 함께
    var_ids = []
    for var_id in phys['setup'].get('monitor', []):
        var_ids.append(var_id)
    exp = phys['setup'].get('experiment')
    if physiology_commands.info['context'] == 'experiment' and type(exp) == dict:
        for key in ('inputs', 'outputs'):
            for var_id in exp.get(key, []):
                if var_id not in var_ids:
                    var_ids.append(var_id)
    return var_ids


def phys_view():
    if not phys['on']:
        return None
    return physiology_commands.view(monitor_vars())


def load(data, actor_id):
    # 콘텐츠 불러오기. 오류가 있으면 불러오지 않는다
    phys['on'] = False
    phys['setup'] = {}
    model = None
    if type(data) == dict and type(data.get('physiology')) == dict:
        model = data.get('physiology_model')
        if type(model) != dict:
            return {'ok': False, 'errors': ['physiology 콘텐츠에 모델(physiology_model)이 없습니다'], 'warnings': [], 'view': None}
    result = game.load(data)
    last.clear()
    motion_link.setup(actor_id, {})
    if not result['ok'] or model == None:
        return result
    loaded = physiology_commands.load(model)
    if not loaded['ok']:
        return {'ok': False, 'errors': loaded['errors'], 'warnings': result['warnings'], 'view': None}
    phys['on'] = True
    phys['setup'] = data['physiology']
    # Edge의 생리 명령이 모델의 변수·고리·신호를 가리키는지 확인
    problems = check_edges(data)
    if len(problems) > 0:
        phys['on'] = False
        return {'ok': False, 'errors': problems, 'warnings': result['warnings'], 'view': None}
    setup = setup_physiology()
    for w in loaded['warnings']:
        result['warnings'].append(w)
    for e in setup['errors']:
        result['warnings'].append('생리 시작 상태: ' + e)
    result['physiology'] = phys_view()
    result['physiology_commands'] = setup['commands']
    return result


def check_edges(data):
    errors = []
    for edge in data.get('edges', []):
        block = edge.get('physiology')
        if type(block) != dict:
            continue
        where = edge.get('edge_id', edge.get('id', '?'))
        for op in block.get('ops', []):
            kind = op.get('op')
            if kind == 'causal_apply':
                for ch in op.get('changes', []):
                    if not bs.has(ch.get('var', '')):
                        errors.append('{}: 없는 생리 변수 {}'.format(where, ch.get('var')))
            if kind == 'feedback_step' and op.get('loop_id') not in feedback_engine.by_id:
                errors.append('{}: 없는 되먹임 고리 {}'.format(where, op.get('loop_id')))
            if kind == 'feedback_run':
                for lid in op.get('loop_ids', []):
                    if lid not in feedback_engine.by_id:
                        errors.append('{}: 없는 되먹임 고리 {}'.format(where, lid))
            if kind == 'signal_emit' and op.get('signal_id') not in physiology_commands.signals:
                errors.append('{}: 없는 신호 {}'.format(where, op.get('signal_id')))
            if kind == 'receptor_activate' and op.get('receptor_id') not in physiology_commands.receptors:
                errors.append('{}: 없는 수용체 {}'.format(where, op.get('receptor_id')))
        for var_id in edge.get('physiology_hide', []):
            if not bs.has(var_id):
                errors.append('{}: physiology_hide의 없는 변수 {}'.format(where, var_id))
    return errors


def reset():
    last.clear()
    motion_link.setup(motion_link.actor, {})
    view = game.reset()
    if not phys['on']:
        return view
    setup = setup_physiology()
    if view != None:
        view['physiology'] = phys_view()
        view['physiology_commands'] = setup['commands']
    return view


def submit(text):
    # 입력 제출 → 정답 판정 → (정답이면) 이동 명령 (+ 생리 상태 변화의 시각 명령)
    result = game.submit(text)
    out = {'result': result['result'], 'view': result['view'], 'commands': [], 'events': [], 'edge': None,
           'errors': [], 'physiology': phys_view()}
    if result['result'] != 'correct':
        return out
    moves = []
    for cmd in result['commands']:
        if cmd['type'] == 'move':
            moves.append(cmd)
        else:
            out['events'].append(cmd)       # 시작 노드처럼 이동 없이 도착한 경우
    if len(moves) > 0:
        motion = motion_link.to_motion(moves)
        out['commands'] = motion['commands']
        out['errors'] = motion['errors']
        out['edge'] = moves[0]['edge']
        out['move'] = moves[0]
        last['edge'] = moves[0]['edge']
        if len(motion['errors']) > 0:
            # 3D 경로가 없으면 이동 전 상태로 되돌린다 (학습 상태만 앞서가지 않게)
            back = game.cancel_move('3D 경로 없음')
            out['result'] = 'move_error'
            out['view'] = back['view']
            return out
        block = moves[0].get('physiology')
        if phys['on'] and type(block) == dict:
            event_id = physiology_event(moves[0]['edge'])
            began = physiology_commands.begin(event_id, block.get('ops', []))
            if not began['ok']:
                back = game.cancel_move('생리 상태 계산 오류')
                out['result'] = 'move_error'
                out['errors'] = began['errors']
                out['view'] = back['view']
                return out
            last['event'] = event_id
            # 생리 변화의 시각 명령은 이동 뒤에 둔다 (필수 단계). 끝나야 arrived가 온다
            for c in began['commands']:
                out['commands'].append(c)
            out['physiology'] = phys_view()
            out['physiology_changes'] = began['changes']
        last['commands'] = out['commands']
    return out


def arrived(status):
    # JS 이동 결과. 도착이면 규칙 엔진 진행, 실패·취소면 마지막 정상 노드로 되돌린다
    done = motion_link.motion_done(status)
    if done['result'] == 'arrive':
        result = game.arrive(done['edge'])
        if phys['on'] and 'event' in last:
            physiology_commands.commit(last['event'])
            phys['visits'][done['edge']] = phys['visits'].get(done['edge'], 0) + 1
            del last['event']
        return {'result': result['result'], 'events': result['commands'], 'view': result['view'], 'physiology': phys_view()}
    if done['result'] == 'ignored':
        return {'result': 'ignored', 'events': [], 'view': game.get_view(), 'physiology': phys_view()}
    # 실패·취소: 학습 상태는 이동 전(moving)에 그대로 둔다 → JS가 재시도(retry) 또는 복구(recover)를 고른다
    # 생리 상태는 확정하지 않은 채 둔다(재시도하면 같은 변화를 다시 보여 주고, 복구하면 되돌린다)
    return {'result': 'move_' + status, 'events': [], 'view': game.get_view(), 'edge': done['edge'], 'physiology': phys_view()}


def recover(reason):
    # 마지막 정상 노드로 되돌리기: 이동을 취소하고 현재 노드(마지막 도착 노드)에서 다시 입력받는다
    commands = []
    if phys['on']:
        commands = physiology_commands.rollback_all()
    last.clear()
    back = game.cancel_move(reason)
    view = back['view']
    node = None
    if view != None and view['current'] != None:
        node = game.index['nodes'][view['current']]
    checkpoint = ''
    visual = {}
    if node != None:
        checkpoint = node.get('checkpoint_id', '')
        # STEP 04-B: 마지막 정상 노드의 보이는 상태 (판막 등). 복사본을 보낸다
        state = node.get('visual_state', {})
        for key in state:
            visual[key] = state[key]
    return {'result': back['result'], 'view': view, 'checkpoint_id': checkpoint, 'visual_state': visual,
            'physiology': phys_view(), 'physiology_commands': commands}


def retry():
    # 실패한 이동을 다시 시도: 규칙 엔진은 아직 이동 전(moving) 상태여야 한다
    view = game.get_view()
    if view == None or view['phase'] != 'moving' or 'edge' not in last:
        return {'ok': False, 'commands': [], 'view': view}
    motion_link.rearm(last['edge'])
    return {'ok': True, 'commands': last['commands'], 'view': view}


def peek(text):
    # 자동 제출 옵션: 정답인지 확인만 한다 (오답 횟수는 늘리지 않음)
    return game.peek(text)


def hint():
    return game.use_hint()


def record(info):
    rec = game.make_record_v2(info)
    if rec != None and phys['on']:
        # 생리 학습 문맥만 기록한다 (자유 실험은 따로)
        rec['physiology_context'] = 'mechanism'
        rec['physiology_steps'] = bs.clock['step']
    return rec


def records_csv(records):
    return game.records_csv_v2(records)


def view():
    return game.get_view()


def physiology(fn_name, args):
    # 자유 실험·상태 모니터에서 쓰는 생리 명령 (학습 진행과 별개). 허용 목록만 부른다
    allowed = ('switch_context', 'scenario_start', 'state_set', 'state_update', 'state_calculate', 'set_formula_mode', 'reset', 'view',
               'causal_apply', 'feedback_step', 'feedback_run', 'feedback_start', 'feedback_stop', 'signal_emit',
               'receptor_activate', 'receptor_deactivate', 'state_bind_visual', 'describe')
    if not phys['on']:
        return {'ok': False, 'errors': ['생리 모델이 없는 콘텐츠입니다'], 'commands': [], 'view': None}
    if fn_name not in allowed:
        return {'ok': False, 'errors': ['허용되지 않은 생리 명령: {}'.format(fn_name)], 'commands': [], 'view': None}
    if game.state != None and game.state['phase'] == 'moving':
        return {'ok': False, 'errors': ['이동·애니메이션 중에는 바꿀 수 없습니다'], 'commands': [], 'view': None}
    readonly = ('switch_context', 'view', 'describe', 'state_bind_visual')
    if fn_name not in readonly and physiology_commands.info['context'] == 'mechanism':
        # 학습 진행 상태(mechanism)는 정답 처리(begin/commit)로만 바뀐다. 실험·관찰은 다른 문맥에서
        return {'ok': False, 'errors': ['학습 문맥에서는 직접 바꿀 수 없습니다 (자유 실험·자동 관찰 문맥으로 바꾸세요)'], 'commands': [], 'view': None}
    if fn_name == 'switch_context':
        out = physiology_commands.switch_context(args[0])
    elif fn_name == 'scenario_start':
        if physiology_commands.info['context'] == 'mechanism':
            return {'ok': False, 'errors': ['학습 문맥에서는 시나리오를 바꿀 수 없습니다'], 'commands': [], 'view': None}
        out = physiology_commands.run_ops([{'op': 'scenario_start', 'scenario_id': args[0]}], 'manual')
    elif fn_name == 'state_set':
        out = physiology_commands.state_set(args[0], args[1])
    elif fn_name == 'state_update':
        out = physiology_commands.state_update(args[0], args[1])
    elif fn_name == 'state_calculate':
        out = physiology_commands.state_calculate()
    elif fn_name == 'set_formula_mode':
        out = physiology_commands.set_formula_mode(args[0], args[1])
    elif fn_name == 'reset':
        out = physiology_commands.reset()
    elif fn_name == 'view':
        var_ids = None
        if len(args) > 0:
            var_ids = args[0]
        return {'ok': True, 'errors': [], 'commands': [], 'view': physiology_commands.view(var_ids)}
    elif fn_name == 'causal_apply':
        mechanisms = None
        if len(args) > 1:
            mechanisms = args[1]
        out = physiology_commands.causal_apply(args[0], '', mechanisms)
    elif fn_name == 'feedback_step':
        out = physiology_commands.feedback_step(args[0])
    elif fn_name == 'feedback_run':
        out = physiology_commands.feedback_run(args[0])
    elif fn_name == 'feedback_start':
        out = physiology_commands.feedback_start(args[0])
    elif fn_name == 'feedback_stop':
        out = physiology_commands.feedback_stop(args[0])
    elif fn_name == 'signal_emit':
        out = physiology_commands.signal_emit(args[0])
    elif fn_name == 'receptor_activate':
        out = physiology_commands.receptor_activate(args[0])
    elif fn_name == 'receptor_deactivate':
        out = physiology_commands.receptor_deactivate(args[0])
    elif fn_name == 'describe':
        return {'ok': True, 'errors': [], 'commands': [], 'describe': physiology_commands.describe()}
    else:
        out = physiology_commands.state_bind_visual()
    out['view'] = phys_view()
    return out
