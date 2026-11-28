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
    data = content_loader.upgrade(data)      # STEP 03-D: 3D(version 2) 별칭 필드 맞추기
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
        state['tries'] += 1
        expected = []
        for cand in candidates:
            expected.append(cand[1])
            state['wrong_nodes'][cand[1]] = state['wrong_nodes'].get(cand[1], 0) + 1
        state_engine.add_attempt(state, expected, typing_engine.normalize(text), 'wrong')
        state_engine.add_log(state, '오답: "{}"'.format(typing_engine.normalize(text)))
        return {'result': 'wrong', 'commands': [], 'view': get_view()}

    state['correct'] += 1
    edge_id = choice[0]
    node_id = choice[1]
    count_question(node_id)
    state_engine.add_attempt(state, [node_id], typing_engine.normalize(text), 'correct')
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
    # STEP 03-D: 3D 이동 정보 (좌표가 아니라 ID만)
    target = index['nodes'][node_id]
    cmd['actor'] = edge.get('actor_id', content.get('actor_id', ''))
    cmd['checkpoint'] = edge.get('checkpoint_id', target.get('checkpoint_id', ''))   # Edge가 도착 지점을 정하면 그것
    cmd['transition'] = edge.get('transition_type', 'move')
    # STEP 04-A: 스케일 전환 (전환 전 이동할 Checkpoint, 전환 정보)
    cmd['pre_checkpoint'] = edge.get('pre_checkpoint_id', '')
    # STEP 04-B: 이동과 함께 끝까지 기다릴 필수(Blocking) 타임라인
    cmd['timeline'] = edge.get('timeline_id', '')
    # STEP 04-C: 생리 상태 변화 (Edge의 physiology.ops). 확정은 이동·필수 애니메이션이 끝난 뒤(lesson.arrived)
    phys = edge.get('physiology')
    if type(phys) == dict:
        cmd['physiology'] = phys
    scale = edge.get('scale')
    if type(scale) == dict:
        cmd['scale'] = {'level': scale.get('level', ''), 'scene_id': scale.get('scene_id', ''),
                        'checkpoint_id': scale.get('checkpoint_id', '')}
    cmd['anatomical_id'] = target.get('anatomical_id', '')
    state_engine.add_log(state, '이동 시작: {} → {}'.format(edge['from'], edge['to']))
    return {'result': 'correct', 'commands': [cmd], 'view': get_view()}


def arrive(edge_id):
    # JS 애니메이션이 끝나면 호출한다. 같은 도착이 두 번 오면 무시한다
    if state == None or state['phase'] != 'moving' or state['moving_edge'] != edge_id:
        return {'result': 'ignored', 'commands': [], 'view': get_view()}
    if edge_id in state['done_edges']:
        state['laps'] += 1          # 이미 지난 Edge를 다시 지나감 = 순환 이동
    state['done_edges'].append(edge_id)
    node_id = state['pending_node']
    state['moving_edge'] = None
    state['pending_node'] = None
    state['phase'] = 'ready'
    # Edge 이벤트를 먼저 실행해 변수 변화가 완료 검사에 반영되게 한다
    edge_cmds = flow_engine.run_events(index['edges'][edge_id].get('events', []), state)
    node_cmds = enter_node(node_id)
    commands = [node_cmds[0]]
    for one in edge_cmds:
        commands.append(one)
    for one in node_cmds[1:]:
        commands.append(one)
    return {'result': 'arrived', 'commands': commands, 'view': get_view()}


def count_question(node_id):
    # 첫 시도 통계: 복습(review) 노드를 다시 맞힌 경우는 세지 않는다
    node = index['nodes'][node_id]
    review = node.get('revisit', 'relearn') == 'review' and node_id in state['completed']
    if not review:
        state['questions'] += 1
        if state['tries'] == 0:
            state['first_correct'] += 1
    state['tries'] = 0
    state['hinted'] = False


def use_hint():
    # 힌트 보기: 지금 후보 노드들의 힌트. 힌트 횟수를 센다
    if state == None or state['phase'] != 'ready':
        return {'ok': False, 'hints': [], 'view': get_view()}
    hints = []
    for cand in flow_engine.get_candidates(content, index, state):
        node = index['nodes'][cand[1]]
        hints.append({'node': cand[1], 'hint': node.get('hint', node.get('desc', ''))})
    state['hints'] += 1
    state['hinted'] = True
    state_engine.add_log(state, '힌트 사용 ({}번째)'.format(state['hints']))
    return {'ok': True, 'hints': hints, 'view': get_view()}


def cancel_move(reason):
    # 시각적 이동이 실패하거나 취소되면 이동 전 상태(마지막 정상 노드)로 되돌린다
    if state == None or state['phase'] != 'moving':
        return {'result': 'ignored', 'view': get_view()}
    edge_id = state['moving_edge']
    state['moving_edge'] = None
    state['pending_node'] = None
    state['phase'] = 'ready'
    state_engine.add_log(state, '이동 취소: {} ({})'.format(edge_id, reason))
    return {'result': 'cancelled', 'edge': edge_id, 'view': get_view()}


def distance_to_goal(start):
    # 현재 노드에서 완료 노드까지 최소 Edge 수 (조건은 무시). 갈 수 없으면 -1
    goal = content['complete'].get('node')
    if goal == None:
        return -1
    if start == goal:
        return 0
    seen = set([start])
    queue = [(start, 0)]
    while len(queue) > 0:
        item = queue.pop(0)
        for edge in content['edges']:
            if edge['from'] == item[0] and edge['to'] not in seen:
                if edge['to'] == goal:
                    return item[1] + 1
                seen.add(edge['to'])
                queue.append((edge['to'], item[1] + 1))
    return -1


def progress():
    # 진행률 = 완료한 노드 수 / (완료한 노드 수 + 남은 최소 Edge 수)
    # 고르지 않은 분기 경로의 노드는 분모에 들어가지 않는다
    if state == None:
        return 0.0
    if state['phase'] == 'done' and state['end_reason'] == 'goal':
        return 1.0
    if state['current'] == None:
        return 0.0
    done = len(state['completed'])
    remain = distance_to_goal(state['current'])
    if remain < 0:
        return 0.0
    return round(done / (done + remain), 3)


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
                'correct', 'wrong', 'steps', 'end_reason', 'vars', 'models',
                'hints', 'first_correct', 'questions', 'laps', 'wrong_nodes']:
        view[key] = state[key]
    view['progress'] = progress()
    view['first_accuracy'] = record_engine.ratio(state['first_correct'], state['questions'])
    view['log'] = state['log'][-50:]
    view['accuracy'] = record_engine.accuracy(state['correct'], state['wrong'])

    # 다음에 입력할 후보 (힌트와 개발자용 정답 표시)
    view['candidates'] = []
    for cand in flow_engine.get_candidates(content, index, state):
        node = index['nodes'][cand[1]]
        info = {'edge': cand[0], 'node': cand[1], 'ko': node['ko'],
                'en': node.get('en', ''), 'desc': node.get('desc', ''), 'answers': node['answers']}
        # STEP 03-D: 3D 학습 정보
        for key in ['prompt', 'reason_prompt', 'explanation', 'hint', 'anatomical_id', 'anchor_id',
                    'checkpoint_id', 'verification_status', 'source']:
            info[key] = node.get(key, '')
        info['revisit'] = node.get('revisit', 'relearn')
        # STEP 04-C: 이 문제의 정답과 관련된 생리 변수 (암기·추론 모드에서 제출 전 상태 모니터가 숨긴다)
        info['physiology_hide'] = []
        if cand[0] != None and cand[0] in index['edges']:
            for var_id in index['edges'][cand[0]].get('physiology_hide', []):
                info['physiology_hide'].append(var_id)
        info['seen'] = cand[1] in state['completed']
        view['candidates'].append(info)
    return view


def make_record(date_text, seconds):
    if state == None:
        return None
    return record_engine.make_record(content, state, date_text, seconds)


def records_csv(records):
    return record_engine.to_csv(records)


def make_record_v2(info):
    # info: JS가 아는 값 (session_id, learning_mode, start_time, end_time, active_seconds, completion_status)
    if state == None:
        return None
    return record_engine.make_record_v2(content, state, info)


def records_csv_v2(records):
    return record_engine.to_csv_v2(records)
