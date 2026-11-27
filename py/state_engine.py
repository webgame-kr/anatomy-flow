# 상태 엔진: 게임 상태 dict 만들기와 기록

MAX_LOG = 200          # 이벤트 로그 최대 개수


def new_state(content):
    # 콘텐츠의 초기값으로 새 상태를 만든다
    state = {}
    state['phase'] = 'ready'         # ready, moving, done
    state['current'] = None          # 현재 노드 id
    state['completed'] = []          # 완료한 노드 id (처음 도착한 순서)
    state['visits'] = {}             # 노드별 방문 횟수
    state['done_edges'] = []         # 지나간 Edge id
    state['moving_edge'] = None      # 이동 중인 Edge id
    state['pending_node'] = None     # 이동이 끝나면 도착할 노드 id
    state['correct'] = 0
    state['wrong'] = 0
    state['steps'] = 0
    state['end_reason'] = ''         # goal, limit, stuck
    state['log'] = []
    state['next_id'] = 1             # 명령 고유 번호

    # 변수 초기값 복사 (원본 콘텐츠가 바뀌지 않게)
    variables = content.get('variables', {})
    state['vars'] = {}
    for key in variables.keys():
        state['vars'][key] = variables[key]

    # 모델 상태: 색과 보이기 여부
    state['models'] = {}
    for model in content.get('models', []):
        info = {}
        info['color'] = model.get('color', '#9aa4b2')
        info['visible'] = model.get('visible', True)
        state['models'][model['id']] = info
    return state


def add_log(state, text):
    # 로그는 (번호, 문장) 튜플로 저장한다
    number = len(state['log']) + 1
    state['log'].append((number, text))
    if len(state['log']) > MAX_LOG:
        state['log'].pop(0)


def make_command(state, kind):
    # 고유 번호가 붙은 명령 dict를 만든다
    command = {'id': state['next_id'], 'type': kind}
    state['next_id'] += 1
    return command


def mark_visit(state, node_id):
    # 노드 도착 기록
    state['current'] = node_id
    state['visits'][node_id] = state['visits'].get(node_id, 0) + 1
    if node_id not in state['completed']:
        state['completed'].append(node_id)
    state['steps'] += 1
