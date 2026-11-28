# 흐름 엔진: 다음 후보 계산, 조건 판정, 이벤트 실행, 완료 판정

import state_engine


def is_number(value):
    return type(value) == int or type(value) == float


def compare(left, op, right):
    # 크기 비교는 둘 다 숫자일 때만 한다 (문자와 숫자 비교 오류 방지)
    if op == '==':
        return left == right
    if op == '!=':
        return left != right
    if not is_number(left) or not is_number(right):
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


def check_condition(cond, state):
    # 조건이 없으면 통과. 리스트는 모두 만족해야 통과
    if cond == None:
        return True
    if type(cond) == list:
        cond_list = cond
    else:
        cond_list = [cond]
    for one in cond_list:
        if 'visited' in one:
            if one['visited'] not in state['completed']:
                return False
            continue
        if one['var'] not in state['vars']:
            return False
        value = state['vars'][one['var']]
        if not compare(value, one['op'], one['value']):
            return False
    return True


def can_enter(node, state):
    # 선행 조건: requires의 노드를 모두 완료해야 들어갈 수 있다
    for req in node.get('requires', []):
        if req not in state['completed']:
            return False
    return True


def get_candidates(content, index, state):
    # 지금 입력할 수 있는 [edge_id, node_id] 목록
    if state['phase'] != 'ready':
        return []
    if state['current'] == None:
        return [[None, content['start']]]
    result = []
    for edge in content['edges']:
        if edge['from'] != state['current']:
            continue
        node = index['nodes'][edge['to']]
        if check_condition(edge.get('condition'), state) and can_enter(node, state):
            result.append([edge['id'], edge['to']])
    return result


def run_events(events, state):
    # 이벤트를 차례로 실행하고 JS에 보낼 명령 목록을 돌려준다
    commands = []
    for ev in events:
        if not check_condition(ev.get('when'), state):
            continue
        kind = ev['type']
        if kind == 'set' or kind == 'add':
            name = ev['var']
            if kind == 'set':
                state['vars'][name] = ev['value']
            else:
                old = state['vars'].get(name, 0)
                if not is_number(old):
                    old = 0
                state['vars'][name] = old + ev['value']
            cmd = state_engine.make_command(state, 'var')
            cmd['var'] = name
            cmd['value'] = state['vars'][name]
            state_engine.add_log(state, '변수 {} = {}'.format(name, state['vars'][name]))
        elif kind == 'color':
            state['models'][ev['model']]['color'] = ev['color']
            cmd = state_engine.make_command(state, 'color')
            cmd['model'] = ev['model']
            cmd['color'] = ev['color']
            state_engine.add_log(state, '모델 {} 색 → {}'.format(ev['model'], ev['color']))
        elif kind == 'show' or kind == 'hide':
            state['models'][ev['model']]['visible'] = (kind == 'show')
            cmd = state_engine.make_command(state, kind)
            cmd['model'] = ev['model']
            state_engine.add_log(state, '모델 {} {}'.format(ev['model'], kind))
        elif kind == 'pulse':
            cmd = state_engine.make_command(state, 'pulse')
            cmd['model'] = ev['model']
        elif kind == 'scene':
            # 3D 명령은 Python이 실행하지 않고 JS에 넘긴다 (복사본)
            cmd = state_engine.make_command(state, 'scene')
            command = {}
            for key in ev['command']:
                command[key] = ev['command'][key]
            cmd['command'] = command
            cmd['mode'] = ev.get('mode', 'parallel')
            cmd['required'] = ev.get('required', False)
        else:
            cmd = state_engine.make_command(state, 'log')
            cmd['text'] = ev['text']
            state_engine.add_log(state, ev['text'])
        commands.append(cmd)
    return commands


def check_complete(content, state):
    # 완료 조건의 항목을 모두 만족하면 True
    complete = content['complete']
    if 'node' in complete:
        need = complete.get('visits', 1)
        if state['visits'].get(complete['node'], 0) < need:
            return False
        if 'visits' not in complete and state['current'] != complete['node']:
            return False
    if 'vars' in complete:
        if not check_condition(complete['vars'], state):
            return False
    return True
