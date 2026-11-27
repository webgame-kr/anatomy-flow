# 게임 API: JavaScript가 부르는 함수 모음
# Python은 상태(view)와 명령(commands)만 돌려주고 화면은 JavaScript가 그린다.

import typing_engine
import state_engine
import flow_engine
import content_loader
import record_engine

content = None      # 불러온 콘텐츠 dict
index = None        # id 색인
state = None        # 게임 상태


def load(data):
    # 콘텐츠 검증 후 불러오기. 오류가 있으면 불러오지 않는다
    global content, index, state
    check = content_loader.validate(data)
    if len(check['errors']) > 0:
        content = None
        index = None
        state = None
        return {'ok': False, 'errors': check['errors'], 'warnings': check['warnings'], 'view': None}
    content = data
    index = content_loader.build_index(content)
    state = state_engine.new_state(content)
    state_engine.add_log(state, '콘텐츠 "{}" 불러옴'.format(content['title']))
    for text in check['warnings']:
        state_engine.add_log(state, '[경고] ' + text)
    return {'ok': True, 'errors': [], 'warnings': check['warnings'], 'view': get_view()}


def reset():
    # 같은 콘텐츠로 처음부터 다시
    global state
    if content == None:
        return None
    state = state_engine.new_state(content)
    state_engine.add_log(state, '초기화')
    return get_view()


def ignore_spaces():
    options = content.get('options', {})
    return options.get('ignore_spaces', False)


def peek(text):
    # 정답인지 확인만 한다 (오답 횟수는 늘리지 않음). 자동 이동 옵션에 쓴다
    if state == None or state['phase'] != 'ready':
        return False
    candidates = flow_engine.get_candidates(content, index, state)
    choice = typing_engine.find_choice(text, candidates, index['nodes'], ignore_spaces())
    return choice != None


def submit(text):
    # 입력 제출. result: correct, wrong, empty, busy, done, not_loaded
    if state == None:
        return {'result': 'not_loaded', 'commands': [], 'view': None}
    if state['phase'] == 'moving':
        return {'result': 'busy', 'commands': [], 'view': get_view()}
    if state['phase'] == 'done':
        return {'result': 'done', 'commands': [], 'view': get_view()}
    if typing_engine.normalize(text) == '':
        return {'result': 'empty', 'commands': [], 'view': get_view()}

    candidates = flow_engine.get_candidates(content, index, state)
    choice = typing_engine.find_choice(text, candidates, index['nodes'], ignore_spaces())
    if choice == None:
        state['wrong'] += 1
        state_engine.add_log(state, '오답: "{}"'.format(typing_engine.normalize(text)))
        return {'result': 'wrong', 'commands': [], 'view': get_view()}

    state['correct'] += 1
    edge_id = choice[0]
    node_id = choice[1]
    state_engine.add_log(state, '정답: {}'.format(index['nodes'][node_id]['ko']))

    if edge_id == None:
        # 시작 노드는 이동 없이 바로 도착
        commands = enter_node(node_id)
        return {'result': 'correct', 'commands': commands, 'view': get_view()}

    # 이동 시작: 도착할 때까지 다른 제출은 막는다
    edge = index['edges'][edge_id]
    state['phase'] = 'moving'
    state['moving_edge'] = edge_id
    state['pending_node'] = node_id
    cmd = state_engine.make_command(state, 'move')
    cmd['edge'] = edge_id
    cmd['from'] = edge['from']
    cmd['to'] = edge['to']
    cmd['path'] = edge.get('path')
    cmd['reverse'] = edge.get('reverse', False)
    cmd['duration'] = edge.get('duration', 1000)
    cmd['mover'] = edge.get('mover', {})
    state_engine.add_log(state, '이동 시작: {} → {}'.format(edge['from'], edge['to']))
    return {'result': 'correct', 'commands': [cmd], 'view': get_view()}


def arrive(edge_id):
    # JS 애니메이션이 끝나면 호출한다. 같은 도착이 두 번 오면 무시한다
    if state == None or state['phase'] != 'moving' or state['moving_edge'] != edge_id:
        return {'result': 'ignored', 'commands': [], 'view': get_view()}
    state['done_edges'].append(edge_id)
    node_id = state['pending_node']
    state['moving_edge'] = None
    state['pending_node'] = None
    state['phase'] = 'ready'
    commands = enter_node(node_id)
    return {'result': 'arrived', 'commands': commands, 'view': get_view()}


def enter_node(node_id):
    # 노드 도착 처리: 방문 기록 → 이벤트 실행 → 완료 검사
    node = index['nodes'][node_id]
    state_engine.mark_visit(state, node_id)
    cmd = state_engine.make_command(state, 'arrive')
    cmd['node'] = node_id
    commands = [cmd]
    state_engine.add_log(state, '도착: {} ({}번째 방문)'.format(node['ko'], state['visits'][node_id]))

    event_cmds = flow_engine.run_events(node.get('events', []), state)
    for one in event_cmds:
        commands.append(one)

    reason = ''
    if flow_engine.check_complete(content, state):
        reason = 'goal'
    elif state['steps'] >= content.get('max_steps', 200):
        reason = 'limit'
    elif len(flow_engine.get_candidates(content, index, state)) == 0:
        reason = 'stuck'

    if reason != '':
        state['phase'] = 'done'
        state['end_reason'] = reason
        done = state_engine.make_command(state, 'complete')
        done['reason'] = reason
        commands.append(done)
        messages = {'goal': '완료!', 'limit': '최대 이동 횟수에 도달해 종료', 'stuck': '더 갈 수 있는 경로가 없어 종료'}
        state_engine.add_log(state, messages[reason])
    return commands


def get_view():
    # 화면과 개발자 패널에 필요한 정보만 모아서 돌려준다
    if state == None:
        return None
    view = {}
    for key in ['phase', 'current', 'completed', 'visits', 'done_edges', 'moving_edge',
                'correct', 'wrong', 'steps', 'end_reason', 'vars', 'models']:
        view[key] = state[key]
    view['log'] = state['log'][-50:]
    view['accuracy'] = record_engine.accuracy(state['correct'], state['wrong'])

    # 다음에 입력할 후보 (힌트와 개발자용 정답 표시)
    view['candidates'] = []
    for cand in flow_engine.get_candidates(content, index, state):
        node = index['nodes'][cand[1]]
        info = {'edge': cand[0], 'node': cand[1], 'ko': node['ko'],
                'en': node.get('en', ''), 'desc': node.get('desc', ''), 'answers': node['answers']}
        view['candidates'].append(info)
    return view


def make_record(date_text, seconds):
    if state == None:
        return None
    return record_engine.make_record(content, state, date_text, seconds)


def records_csv(records):
    return record_engine.to_csv(records)
