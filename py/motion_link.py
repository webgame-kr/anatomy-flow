# v0.1 규칙 엔진(game.py)의 이동 명령을 3D 이동 명령으로 바꾸는 연결 모듈 (STEP 03-C 준비, STEP 03-D 사용)
# game.submit()이 돌려주는 {'type': 'move', 'edge', 'path', 'checkpoint', 'transition', 'actor', 'duration'} 명령을
# actor_move_to_checkpoint 또는 actor_set_path + actor_move 명령으로 바꾼다.
# JS가 이동을 끝내면 motion_done(결과)를 불러 game.arrive(edge_id)에 넘길 Edge를 돌려받는다.
# 이 모듈은 3D 좌표를 모른다. 경로 ID와 Checkpoint ID만 다룬다.

edge_map = {}        # Edge ID -> {'path_id': ..., 'checkpoint_id': ...} (명령에 정보가 없을 때 쓴다)
actor = ''           # 기본으로 움직일 Actor ID
waiting = {}         # 이동 중인 Edge: {'edge': ..., 'count': ...}
move_count = 0       # 이동 명령 번호 (같은 결과가 두 번 와도 한 번만 처리)


def setup(actor_id, mapping):
    # mapping: Edge ID -> {'path_id', 'checkpoint_id'(선택)}
    global actor, move_count
    actor = actor_id
    edge_map.clear()
    for edge_id in mapping:
        info = mapping[edge_id]
        edge_map[edge_id] = {'path_id': info.get('path_id', ''), 'checkpoint_id': info.get('checkpoint_id', '')}
    waiting.clear()
    move_count = 0
    return {'ok': True, 'edges': len(edge_map), 'actor': actor}


def info_of(one):
    # 이동 정보: setup의 표가 먼저, 없으면 명령에 들어 있는 값 (STEP 03-D 콘텐츠는 명령에 들어 있다)
    edge_id = one.get('edge')
    if edge_id in edge_map:
        return edge_map[edge_id]
    path_id = one.get('path')
    if path_id == None:
        path_id = ''
    return {'path_id': path_id, 'checkpoint_id': one.get('checkpoint', '')}


def to_motion(game_commands):
    # 규칙 엔진 명령 목록 -> 3D 이동 명령 목록
    global move_count
    commands = []
    errors = []
    for one in game_commands:
        if one.get('type') != 'move':
            continue
        edge_id = one.get('edge')
        if edge_id not in edge_map and one.get('path') == None and one.get('checkpoint', '') == '' \
                and one.get('transition', 'move') == 'move':
            errors.append('3D 경로가 연결되지 않은 Edge: {}'.format(edge_id))
            continue
        info = info_of(one)
        who = one.get('actor', '')
        if who == '':
            who = actor
        duration = one.get('duration', 1000)
        if one.get('transition', 'move') == 'jump':
            # 이동 없이 바로 도착: Checkpoint가 있으면 그 위치에 놓는다
            if info['checkpoint_id'] != '':
                commands.append({'action': 'actor_place_at_checkpoint', 'target': who,
                                 'checkpoint_id': info['checkpoint_id'], 'wait': True})
        elif info['checkpoint_id'] != '':
            commands.append({'action': 'actor_move_to_checkpoint', 'target': who,
                             'checkpoint_id': info['checkpoint_id'], 'duration': duration, 'wait': True})
        elif info['path_id'] != '':
            direction = 1
            if one.get('reverse', False):
                direction = -1
            commands.append({'action': 'actor_set_path', 'target': who,
                             'path_id': info['path_id'], 'direction': direction})
            commands.append({'action': 'actor_move', 'target': who, 'duration': duration,
                             'until': 'end', 'wait': True})
        move_count += 1
        waiting['edge'] = edge_id
        waiting['count'] = move_count
    return {'ok': len(errors) == 0, 'commands': commands, 'errors': errors,
            'message': '이동 명령 {}개'.format(len(commands))}


def motion_done(status):
    # JS 이동 결과(arrived, completed, cancelled, failed)를 받는다
    # 도착이면 game.arrive에 넘길 Edge ID를 돌려준다. 두 번째 결과는 무시한다
    if 'edge' not in waiting:
        return {'result': 'ignored', 'edge': None}
    edge_id = waiting['edge']
    if status == 'arrived' or status == 'completed' or status == 'ok':
        waiting.clear()
        return {'result': 'arrive', 'edge': edge_id}
    if status == 'cancelled' or status == 'failed':
        waiting.clear()
        return {'result': status, 'edge': edge_id}
    return {'result': 'ignored', 'edge': None}


def rearm(edge_id):
    # 이동 재시도: 같은 Edge의 결과를 다시 기다린다
    global move_count
    move_count += 1
    waiting['edge'] = edge_id
    waiting['count'] = move_count
    return {'ok': True, 'edge': edge_id}
