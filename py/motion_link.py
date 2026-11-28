# v0.1 규칙 엔진(game.py)의 이동 명령을 3D 이동 명령으로 바꾸는 연결 모듈 (STEP 03-C 준비, STEP 03-D에서 사용)
# game.submit()이 돌려주는 {'type': 'move', 'edge', 'path', 'reverse', 'duration'} 명령을
# actor_move_to_checkpoint 또는 actor_set_path + actor_move 명령으로 바꾼다.
# JS가 이동을 끝내면 motion_done(결과)를 불러 game.arrive(edge_id)에 넘길 Edge를 돌려받는다.
# 이 모듈은 3D 좌표를 모른다. 경로 ID와 Checkpoint ID만 다룬다.

edge_map = {}        # Edge ID -> {'path_id': ..., 'checkpoint_id': ...}
actor = ''           # 움직일 Actor ID
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


def to_motion(game_commands):
    # 규칙 엔진 명령 목록 -> 3D 이동 명령 목록
    global move_count
    commands = []
    errors = []
    for one in game_commands:
        if one.get('type') != 'move':
            continue
        edge_id = one.get('edge')
        if edge_id not in edge_map:
            errors.append('3D 경로가 연결되지 않은 Edge: {}'.format(edge_id))
            continue
        info = edge_map[edge_id]
        duration = one.get('duration', 1000)
        if info['checkpoint_id'] != '':
            command = {'action': 'actor_move_to_checkpoint', 'target': actor,
                       'checkpoint_id': info['checkpoint_id'], 'duration': duration}
            commands.append(command)
        else:
            direction = 1
            if one.get('reverse', False):
                direction = -1
            commands.append({'action': 'actor_set_path', 'target': actor,
                             'path_id': info['path_id'], 'direction': direction})
            commands.append({'action': 'actor_move', 'target': actor, 'duration': duration, 'until': 'end'})
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
    if status == 'arrived' or status == 'completed':
        waiting.clear()
        return {'result': 'arrive', 'edge': edge_id}
    if status == 'cancelled' or status == 'failed':
        waiting.clear()
        return {'result': status, 'edge': edge_id}
    return {'result': 'ignored', 'edge': None}
