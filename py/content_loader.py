# 콘텐츠 로더: JSON(dict) 구조 검증과 색인 만들기

import scene_commands

OPS = ('==', '!=', '>', '>=', '<', '<=')
EVENT_TYPES = ('set', 'add', 'color', 'show', 'hide', 'pulse', 'log', 'scene', 'set_variable')
MODEL_EVENTS = ('color', 'show', 'hide', 'pulse')
SHAPES = ('circle', 'rect', 'ellipse', 'path')

# STEP 03-D: 3D 콘텐츠(version 2) 필드
TRANSITIONS = ('move', 'jump', 'scene')  # move: 경로를 따라 이동, jump: 이동 없이 바로 도착, scene: 스케일 장면 전환(STEP 04-A)
LEVELS = ('BODY', 'ORGAN', 'TISSUE', 'CELL', 'MOLECULAR')
REVISIT = ('relearn', 'review')         # 순환으로 다시 온 노드: 새 학습 시점 / 복습(첫 시도 통계 제외)
STATUSES = ('VERIFIED', 'APPROXIMATE', 'PENDING', 'CONCEPT', 'TEST',
            'GEOMETRY_CHECKED', 'ANATOMY_REVIEWED', 'CONCEPTUAL')   # STEP 04-A 경로 상태도 노드에 쓸 수 있다
EVENT_MODES = ('sequential', 'parallel')

# 3D 데이터 이름 → v0.1 이름 (요구서의 필드 이름을 그대로 써도 된다)
NODE_ALIASES = {'node_id': 'id', 'name_ko': 'ko', 'name_en': 'en', 'accepted_answers': 'answers',
                'prerequisites': 'requires'}
EDGE_ALIASES = {'edge_id': 'id', 'source_node': 'from', 'target_node': 'to', 'conditions': 'condition',
                'path_id': 'path'}


def rename_keys(item, aliases):
    # 별칭 키를 v0.1 키로 바꾼 새 dict (원본은 바꾸지 않는다)
    result = {}
    for key in item:
        if key in aliases and aliases[key] not in item:
            result[aliases[key]] = item[key]
        else:
            result[key] = item[key]
    return result


def upgrade(content):
    # version 2(3D) 콘텐츠의 별칭 필드를 v0.1 형식으로 맞춘다. v0.1 콘텐츠는 그대로 돌려준다
    if type(content) != dict or content.get('version') != 2:
        return content
    result = {}
    for key in content:
        result[key] = content[key]
    if type(content.get('nodes')) == list:
        nodes = []
        for node in content['nodes']:
            if type(node) == dict:
                node = rename_keys(node, NODE_ALIASES)
                if 'events' in node:
                    node['events'] = fix_events(node['events'])
            nodes.append(node)
        result['nodes'] = nodes
    if type(content.get('edges')) == list:
        edges = []
        for edge in content['edges']:
            if type(edge) == dict:
                edge = rename_keys(edge, EDGE_ALIASES)
                if 'events' in edge:
                    edge['events'] = fix_events(edge['events'])
            edges.append(edge)
        result['edges'] = edges
    return result


def fix_events(events):
    # set_variable 이벤트는 v0.1의 set 이벤트와 같다
    if type(events) != list:
        return events
    fixed = []
    for ev in events:
        if type(ev) == dict and ev.get('type') == 'set_variable':
            copy = {}
            for key in ev:
                copy[key] = ev[key]
            copy['type'] = 'set'
            fixed.append(copy)
        else:
            fixed.append(ev)
    return fixed


def scene_actions():
    # 3D 콘텐츠의 scene 이벤트에 쓸 수 있는 명령 이름
    names = set()
    for name in scene_commands.ACTIONS:
        names.add(name)
    for name in scene_commands.MOTION:
        names.add(name)
    return names


def is_number(value):
    return type(value) == int or type(value) == float


def is_text(value):
    return type(value) == str and value.strip() != ''


def collect_ids(items, kind, errors):
    # 리스트 안 항목들의 id를 모으고 중복·누락을 검사한다
    ids = set()
    for i in range(len(items)):
        item = items[i]
        if type(item) != dict:
            errors.append('{} {}번째 항목이 객체가 아닙니다.'.format(kind, i + 1))
            continue
        item_id = item.get('id')
        if not is_text(item_id):
            errors.append('{} {}번째 항목에 id가 없습니다.'.format(kind, i + 1))
            continue
        if item_id in ids:
            errors.append('{} id "{}"가 중복됩니다.'.format(kind, item_id))
        ids.add(item_id)
    return ids


def check_condition(cond, where, node_ids, errors):
    # 조건 형식 검사. 하나(dict)든 여러 개(list)든 리스트로 맞춰서 검사한다
    if cond == None:
        return
    if type(cond) == list:
        cond_list = cond
    else:
        cond_list = [cond]
    for one in cond_list:
        if type(one) != dict:
            errors.append('{}: 조건은 객체 또는 객체 리스트여야 합니다.'.format(where))
            continue
        if 'visited' in one:
            if one['visited'] not in node_ids:
                errors.append('{}: visited 노드 "{}"가 없습니다.'.format(where, one['visited']))
            continue
        if not is_text(one.get('var')):
            errors.append('{}: 조건에 var 또는 visited가 필요합니다.'.format(where))
            continue
        if one.get('op') not in OPS:
            errors.append('{}: 알 수 없는 연산자 "{}"'.format(where, one.get('op')))
        if 'value' not in one:
            errors.append('{}: 조건에 value가 없습니다.'.format(where))


def check_events(events, where, model_ids, node_ids, errors):
    if type(events) != list:
        errors.append('{}: events는 리스트여야 합니다.'.format(where))
        return
    for i in range(len(events)):
        ev = events[i]
        place = '{} 이벤트 {}'.format(where, i + 1)
        if type(ev) != dict:
            errors.append('{}: 객체가 아닙니다.'.format(place))
            continue
        kind = ev.get('type')
        if kind not in EVENT_TYPES:
            errors.append('{}: 알 수 없는 이벤트 "{}"'.format(place, kind))
            continue
        if kind in MODEL_EVENTS and ev.get('model') not in model_ids:
            errors.append('{}: 모델 "{}"가 없습니다.'.format(place, ev.get('model')))
        if kind == 'color' and not is_text(ev.get('color')):
            errors.append('{}: color 값이 없습니다.'.format(place))
        if kind == 'set' or kind == 'add':
            if not is_text(ev.get('var')):
                errors.append('{}: var가 없습니다.'.format(place))
            if 'value' not in ev:
                errors.append('{}: value가 없습니다.'.format(place))
            if kind == 'add' and not is_number(ev.get('value')):
                errors.append('{}: add의 value는 숫자여야 합니다.'.format(place))
        if kind == 'log' and not is_text(ev.get('text')):
            errors.append('{}: text가 없습니다.'.format(place))
        if kind == 'scene':
            command = ev.get('command')
            if type(command) != dict or command.get('action') not in scene_actions():
                errors.append('{}: 지원하지 않는 3D 명령 "{}"'.format(place, command))
            if 'mode' in ev and ev['mode'] not in EVENT_MODES:
                errors.append('{}: mode는 sequential 또는 parallel'.format(place))
        check_condition(ev.get('when'), place, node_ids, errors)


def has_cycle(node_ids, edges):
    # 진입 차수를 이용해 순환이 있는지 확인한다 (진입 0인 노드를 계속 지운다)
    indegree = {}
    for nid in node_ids:
        indegree[nid] = 0
    for edge in edges:
        if edge['to'] in indegree and edge['from'] in indegree:
            indegree[edge['to']] += 1
    queue = []
    for nid in node_ids:
        if indegree[nid] == 0:
            queue.append(nid)
    removed = 0
    while len(queue) > 0:
        nid = queue.pop(0)
        removed += 1
        for edge in edges:
            if edge['from'] == nid and edge['to'] in indegree:
                indegree[edge['to']] -= 1
                if indegree[edge['to']] == 0:
                    queue.append(edge['to'])
    return removed < len(node_ids)


def reachable(start, edges):
    # 시작 노드에서 갈 수 있는 노드 집합 (조건은 무시)
    seen = set([start])
    queue = [start]
    while len(queue) > 0:
        nid = queue.pop(0)
        for edge in edges:
            if edge['from'] == nid and edge['to'] not in seen:
                seen.add(edge['to'])
                queue.append(edge['to'])
    return seen


def validate(content):
    # 결과: {'errors': [...], 'warnings': [...]}
    errors = []
    warnings = []
    result = {'errors': errors, 'warnings': warnings}

    if type(content) != dict:
        errors.append('콘텐츠가 객체(JSON object)가 아닙니다.')
        return result

    for key in ['id', 'title', 'start', 'nodes', 'edges', 'complete']:
        if key not in content:
            errors.append('필수 항목 "{}"가 없습니다.'.format(key))
    for key in ['nodes', 'edges', 'models', 'paths']:
        if key in content and type(content[key]) != list:
            errors.append('"{}"는 리스트여야 합니다.'.format(key))
    if 'variables' in content and type(content['variables']) != dict:
        errors.append('"variables"는 객체여야 합니다.')
    if 'max_steps' in content:
        if not is_number(content['max_steps']) or content['max_steps'] < 1:
            errors.append('"max_steps"는 1 이상의 숫자여야 합니다.')
    if len(errors) > 0:
        return result

    version = content.get('version', 1)
    if version not in (1, 2):
        errors.append('지원하지 않는 콘텐츠 버전: {}'.format(version))
        return result
    nodes = content['nodes']
    edges = content['edges']
    models = content.get('models', [])
    paths = content.get('paths', [])

    node_ids = collect_ids(nodes, '노드', errors)
    edge_ids = collect_ids(edges, 'Edge', errors)
    model_ids = collect_ids(models, '모델', errors)
    path_ids = collect_ids(paths, '경로', errors)

    if len(nodes) == 0:
        errors.append('노드가 하나도 없습니다.')
    if content['start'] not in node_ids:
        errors.append('시작 노드 "{}"가 없습니다.'.format(content['start']))

    # 모델과 경로
    for model in models:
        if type(model) != dict:
            continue
        if model.get('shape') not in SHAPES:
            errors.append('모델 "{}": 알 수 없는 모양 "{}"'.format(model.get('id'), model.get('shape')))
        if model.get('shape') == 'path' and not is_text(model.get('d')):
            errors.append('모델 "{}": path 모양에는 d가 필요합니다.'.format(model.get('id')))
    for path in paths:
        if type(path) == dict and not is_text(path.get('d')):
            errors.append('경로 "{}"에 d가 없습니다.'.format(path.get('id')))

    # 노드
    for node in nodes:
        if type(node) != dict or not is_text(node.get('id')):
            continue
        where = '노드 "{}"'.format(node['id'])
        if not is_text(node.get('ko')):
            errors.append('{}: 한글 용어(ko)가 없습니다.'.format(where))
        answers = node.get('answers')
        if type(answers) != list or len(answers) == 0:
            errors.append('{}: 허용 정답(answers)이 비어 있습니다.'.format(where))
        else:
            for ans in answers:
                if not is_text(ans):
                    errors.append('{}: 빈 정답이 있습니다.'.format(where))
        if version == 2:
            check_node3d(node, where, errors, warnings)
        elif not is_number(node.get('x')) or not is_number(node.get('y')):
            errors.append('{}: 좌표 x, y가 숫자가 아닙니다.'.format(where))
        if 'model' in node and node['model'] not in model_ids:
            errors.append('{}: 모델 "{}"가 없습니다.'.format(where, node['model']))
        requires = node.get('requires', [])
        if type(requires) != list:
            errors.append('{}: requires는 리스트여야 합니다.'.format(where))
        else:
            for req in requires:
                if req not in node_ids:
                    errors.append('{}: 선행 노드 "{}"가 없습니다.'.format(where, req))
        check_events(node.get('events', []), where, model_ids, node_ids, errors)

    # Edge
    good_edges = []
    for edge in edges:
        if type(edge) != dict or not is_text(edge.get('id')):
            continue
        where = 'Edge "{}"'.format(edge['id'])
        ok = True
        if edge.get('from') not in node_ids:
            errors.append('{}: 출발 노드 "{}"가 없습니다.'.format(where, edge.get('from')))
            ok = False
        if edge.get('to') not in node_ids:
            errors.append('{}: 도착 노드 "{}"가 없습니다.'.format(where, edge.get('to')))
            ok = False
        if version == 2:
            check_edge3d(edge, where, node_ids, model_ids, errors)
        elif 'path' in edge and edge['path'] not in path_ids:
            errors.append('{}: 경로 "{}"가 없습니다.'.format(where, edge['path']))
        if 'duration' in edge:
            if not is_number(edge['duration']) or edge['duration'] <= 0:
                errors.append('{}: duration은 0보다 큰 숫자여야 합니다.'.format(where))
        check_condition(edge.get('condition'), where, node_ids, errors)
        if ok:
            good_edges.append(edge)

    # 완료 조건
    complete = content['complete']
    if type(complete) != dict or len(complete) == 0:
        errors.append('완료 조건(complete)이 비어 있습니다.')
    else:
        if 'node' in complete and complete['node'] not in node_ids:
            errors.append('완료 노드 "{}"가 없습니다.'.format(complete['node']))
        if 'visits' in complete:
            if 'node' not in complete:
                errors.append('완료 조건 visits에는 node가 필요합니다.')
            if not is_number(complete['visits']) or complete['visits'] < 1:
                errors.append('완료 조건 visits는 1 이상의 숫자여야 합니다.')
        if 'vars' in complete:
            check_condition(complete['vars'], '완료 조건', node_ids, errors)
        if 'node' not in complete and 'vars' not in complete:
            errors.append('완료 조건에는 node 또는 vars가 필요합니다.')

    if len(errors) > 0:
        return result

    # 경고: 갈 수 없는 노드, 막다른 노드, 순환 구조
    seen = reachable(content['start'], good_edges)
    for node in nodes:
        if node['id'] not in seen:
            warnings.append('노드 "{}"는 시작 노드에서 갈 수 없습니다.'.format(node['id']))
    end_node = complete.get('node')
    for node in nodes:
        has_out = False
        for edge in good_edges:
            if edge['from'] == node['id']:
                has_out = True
        if not has_out and node['id'] != end_node:
            warnings.append('노드 "{}"는 나가는 Edge가 없는 막다른 노드입니다.'.format(node['id']))
    if has_cycle(node_ids, good_edges):
        steps = content.get('max_steps', 200)
        warnings.append('순환 구조가 있습니다. 완료 조건 또는 최대 {}번 이동으로 끝납니다.'.format(steps))
    return result


def check_node3d(node, where, errors, warnings):
    # 3D 노드 필드 검사 (ID가 실제 모델·Anchor·경로에 있는지는 JS가 검사한다)
    for key in ['anatomical_id', 'anchor_id', 'checkpoint_id', 'scene_id', 'prompt', 'explanation', 'hint']:
        if key in node and node[key] != None and not is_text(node[key]):
            errors.append('{}: {}는 글자여야 합니다.'.format(where, key))
    status = node.get('verification_status')
    if status != None and status not in STATUSES:
        errors.append('{}: 알 수 없는 검증 상태 "{}"'.format(where, status))
    if status == None:
        warnings.append('{}: verification_status가 없습니다.'.format(where))
    if 'revisit' in node and node['revisit'] not in REVISIT:
        errors.append('{}: revisit은 relearn 또는 review'.format(where))


def check_edge3d(edge, where, node_ids, model_ids, errors):
    kind = edge.get('transition_type', 'move')
    if kind not in TRANSITIONS:
        errors.append('{}: transition_type은 move, jump, scene 중 하나'.format(where))
    if kind == 'scene':
        # 스케일 전환: scale = {level, scene_id, checkpoint_id(새 장면에 놓을 곳)}
        scale = edge.get('scale')
        if type(scale) != dict:
            errors.append('{}: scene 전환에는 scale(딕셔너리)이 필요합니다.'.format(where))
        else:
            if scale.get('level') not in LEVELS:
                errors.append('{}: scale.level은 {} 중 하나'.format(where, ', '.join(LEVELS)))
            if not is_text(scale.get('scene_id')) or scale.get('scene_id') == '':
                errors.append('{}: scale.scene_id가 필요합니다.'.format(where))
            if 'checkpoint_id' in scale and not is_text(scale['checkpoint_id']):
                errors.append('{}: scale.checkpoint_id는 글자여야 합니다.'.format(where))
    if 'pre_checkpoint_id' in edge and not is_text(edge['pre_checkpoint_id']):
        errors.append('{}: pre_checkpoint_id는 글자여야 합니다.'.format(where))
    if 'path' in edge and not is_text(edge['path']):
        errors.append('{}: path_id는 글자여야 합니다.'.format(where))
    if 'actor_id' in edge and not is_text(edge['actor_id']):
        errors.append('{}: actor_id는 글자여야 합니다.'.format(where))
    if 'events' in edge:
        check_events(edge['events'], where, model_ids, node_ids, errors)


def build_index(content):
    # id로 바로 찾을 수 있게 dict로 정리한다
    index = {'nodes': {}, 'edges': {}, 'paths': {}}
    for node in content['nodes']:
        index['nodes'][node['id']] = node
    for edge in content['edges']:
        index['edges'][edge['id']] = edge
    for path in content.get('paths', []):
        index['paths'][path['id']] = path
    return index
