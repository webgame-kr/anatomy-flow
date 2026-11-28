# 장면 명령 만들기와 검증 (STEP 02)
# 3D 객체의 실제 상태는 JavaScript 레지스트리가 관리한다.
# Python은 JS가 보내 준 스냅샷(ID, 종류, 표시 여부)만 보고 명령을 만든다.

# 명령 이름 → 값의 종류
ACTIONS = {
    'set_position': 'vector3',
    'set_rotation': 'vector3',
    'set_scale': 'scale',
    'set_color': 'color',
    'set_visibility': 'bool',
    'set_opacity': 'opacity',
    'highlight': 'bool',
    'camera_focus': 'none',
    'camera_overview': 'none',
    'scene_change': 'scene',
}
NO_TARGET = ('camera_overview', 'scene_change')
HEX = '0123456789abcdef'

# STEP 03-C 이동 명령 -> 대상 종류 (new_actor: 새 ID, actor: 있는 Actor, path: 경로, none: 대상 없음)
MOTION = {
    'actor_create': 'new_actor',
    'actor_remove': 'actor',
    'actor_set_path': 'actor',
    'actor_move': 'actor',
    'actor_move_to_checkpoint': 'actor',
    'actor_pause': 'actor',
    'actor_resume': 'actor',
    'actor_stop': 'actor',
    'actor_reset': 'actor',
    'actor_reverse': 'actor',
    'actor_set_speed': 'actor',
    'actor_seek': 'actor',
    'actor_set_state': 'actor',
    'actor_place_at_checkpoint': 'actor',
    'path_show': 'path',
    'path_hide': 'path',
    'camera_follow': 'actor',
    'camera_unfollow': 'none',
}
UNTIL = ('end', 'next_stop')

snapshot = {}       # 객체 ID -> {'type', 'visible', 'parent'}
scene_ids = []      # 전환할 수 있는 장면 ID
current_scene = ''
paths = {}          # 경로 ID -> Checkpoint ID 리스트
checkpoints = {}    # Checkpoint ID -> 경로 ID


def set_snapshot(objects, scenes, scene_id):
    # JS 레지스트리의 스냅샷을 받아 저장한다
    global scene_ids, current_scene
    snapshot.clear()
    for obj in objects:
        info = {'type': obj.get('type', ''), 'visible': obj.get('visible', True), 'parent': obj.get('parent', None)}
        snapshot[obj['id']] = info
    scene_ids = list(scenes)
    current_scene = scene_id
    return {'ok': True, 'count': len(snapshot), 'types': count_types(), 'scene': current_scene}


def set_paths(path_list):
    # JS 경로 엔진이 보낸 경로·Checkpoint ID 목록을 저장한다 (좌표는 받지 않는다)
    paths.clear()
    checkpoints.clear()
    for item in path_list:
        cp_ids = []
        for cp_id in item.get('checkpoints', []):
            cp_ids.append(cp_id)
            checkpoints[cp_id] = item['id']
        paths[item['id']] = cp_ids
    return {'ok': True, 'paths': len(paths), 'checkpoints': len(checkpoints)}


def is_actor(obj_id):
    return obj_id in snapshot and snapshot[obj_id]['type'] == 'actor'


def check_motion(command):
    # 이동 명령 검사. 문제가 없으면 빈 문자열
    action = command['action']
    kind = MOTION[action]
    target = command.get('target')
    if kind == 'new_actor':
        if type(target) != str or target == '':
            return 'actor_id(target)가 필요합니다'
        if target in snapshot:
            return '이미 있는 ID: {}'.format(target)
        value = command.get('value', {})
        if type(value) != dict:
            return 'value는 딕셔너리여야 합니다'
        if 'path_id' in value and value['path_id'] not in paths:
            return '없는 경로: {}'.format(value['path_id'])
        return ''
    if kind == 'actor' and not is_actor(target):
        return '없는 Actor: {}'.format(target)
    if kind == 'path' and target not in paths:
        return '없는 경로: {}'.format(target)
    if action == 'actor_set_path':
        if command.get('path_id') not in paths:
            return '없는 경로: {}'.format(command.get('path_id'))
        if 'progress' in command:
            progress = command['progress']
            if not is_number(progress) or progress < 0 or progress > 1:
                return 'progress는 0~1'
        if 'direction' in command and command['direction'] not in (1, -1):
            return 'direction은 1 또는 -1'
    if action == 'actor_move':
        if 'speed' in command and (not is_number(command['speed']) or command['speed'] <= 0):
            return 'speed는 0보다 큰 숫자'
        if 'duration' in command and (not is_number(command['duration']) or command['duration'] <= 0):
            return 'duration은 0보다 큰 숫자(ms)'
        if 'until' in command and command['until'] not in UNTIL:
            return "until은 'end' 또는 'next_stop'"
        if 'route' in command:
            for path_id in command['route']:
                if path_id not in paths:
                    return 'route에 없는 경로: {}'.format(path_id)
    if action == 'actor_move_to_checkpoint' or action == 'actor_place_at_checkpoint':
        if command.get('checkpoint_id') not in checkpoints:
            return '없는 Checkpoint: {}'.format(command.get('checkpoint_id'))
        if 'duration' in command and (not is_number(command['duration']) or command['duration'] <= 0):
            return 'duration은 0보다 큰 숫자(ms)'
    if action == 'actor_set_speed':
        if not is_number(command.get('value')) or command.get('value') <= 0:
            return '속도는 0보다 큰 숫자'
    if action == 'actor_seek':
        value = command.get('value')
        if not is_number(value) or value < 0 or value > 1:
            return '진행률은 0~1'
    if action == 'actor_set_state':
        if type(command.get('value')) != dict:
            return 'value는 딕셔너리여야 합니다'
    return ''


def count_types():
    # 종류별 객체 수 (딕셔너리 집계)
    counts = {}
    for obj_id in snapshot:
        kind = snapshot[obj_id]['type']
        counts[kind] = counts.get(kind, 0) + 1
    return counts


def is_number(value):
    return type(value) == int or type(value) == float


def is_color(text):
    if type(text) != str or len(text) != 7 or text[0] != '#':
        return False
    for ch in text[1:].lower():
        if ch not in HEX:
            return False
    return True


def check_value(kind, value):
    # 값 검사. 문제가 없으면 빈 문자열을 돌려준다
    if kind == 'none':
        return ''
    if kind == 'vector3':
        if type(value) != list or len(value) != 3:
            return '[x, y, z] 숫자 3개가 필요합니다'
        for n in value:
            if not is_number(n):
                return '좌표에 숫자가 아닌 값이 있습니다'
        return ''
    if kind == 'scale':
        if is_number(value):
            if value <= 0:
                return '크기는 0보다 커야 합니다'
            return ''
        if type(value) == list and len(value) == 3:
            for n in value:
                if not is_number(n) or n <= 0:
                    return '크기는 0보다 큰 숫자 3개여야 합니다'
            return ''
        return '크기는 숫자 또는 [x, y, z]여야 합니다'
    if kind == 'color':
        if not is_color(value):
            return '색상은 #rrggbb 형식이어야 합니다'
        return ''
    if kind == 'bool':
        if type(value) != bool:
            return 'True 또는 False가 필요합니다'
        return ''
    if kind == 'opacity':
        if not is_number(value) or value < 0 or value > 1:
            return '투명도는 0 ~ 1 사이 숫자여야 합니다'
        return ''
    if kind == 'scene':
        if value not in scene_ids:
            return '없는 장면: {}'.format(value)
        return ''
    return '알 수 없는 값 종류'


def validate(command):
    # 명령 하나를 검사한다. 문제가 없으면 빈 문자열
    if type(command) != dict:
        return '명령은 딕셔너리여야 합니다'
    action = command.get('action')
    if action in MOTION:
        return check_motion(command)
    if action not in ACTIONS:
        return '지원하지 않는 명령: {}'.format(action)
    if action not in NO_TARGET:
        target = command.get('target')
        if target not in snapshot:
            return '없는 객체 ID: {}'.format(target)
    return check_value(ACTIONS[action], command.get('value'))


def make(action, target=None, value=None, duration=0):
    command = {'action': action}
    if target != None:
        command['target'] = target
    if value != None:
        command['value'] = value
    if duration > 0:
        command['duration'] = duration
    return command


def build(commands):
    # 명령 목록을 검사해 통과한 것만 보낸다
    good = []
    errors = []
    for i in range(len(commands)):
        message = validate(commands[i])
        if message == '':
            good.append(commands[i])
        else:
            errors.append('#{} {}: {}'.format(i + 1, commands[i].get('action'), message))
    return {'ok': len(errors) == 0, 'commands': good, 'errors': errors,
            'message': '명령 {}개 중 {}개 통과'.format(len(commands), len(good))}


def pick(preferred, kind):
    # 원하는 ID가 있으면 그것을, 없으면 같은 종류의 첫 객체를 고른다
    if preferred in snapshot:
        return preferred
    for obj_id in snapshot:
        if snapshot[obj_id]['type'] == kind:
            return obj_id
    return None


def demo():
    # Scene D 데모: 위치, 색상, 투명도, 강조, 카메라 명령
    sphere = pick('sphere_01', 'primitive')
    cube = pick('cube_01', 'primitive')
    cylinder = pick('cylinder_01', 'primitive')
    if sphere == None:
        return {'ok': False, 'commands': [], 'errors': ['조작할 객체가 없습니다'], 'message': '스냅샷이 비어 있음'}
    commands = []
    commands.append(make('set_position', sphere, [0, 1.6, 0], 600))
    commands.append(make('set_color', sphere, '#e5484d'))
    commands.append(make('highlight', sphere, True))
    if cube != None:
        commands.append(make('set_rotation', cube, [0, 45, 0], 600))
        commands.append(make('set_scale', cube, [1.2, 0.6, 1.2], 600))
        commands.append(make('set_color', cube, '#46a758'))
    if cylinder != None:
        commands.append(make('set_opacity', cylinder, 0.35))
    commands.append(make('camera_focus', sphere))
    return build(commands)


def restore_demo():
    # 데모 이전 상태로 되돌리는 명령
    commands = []
    for obj_id in ['sphere_01', 'cube_01', 'cylinder_01']:
        if obj_id in snapshot:
            commands.append(make('set_visibility', obj_id, True))
            commands.append(make('set_opacity', obj_id, 1.0))
            commands.append(make('highlight', obj_id, False))
    commands.append(make('camera_overview'))
    return build(commands)


def error_test():
    # 일부러 잘못된 명령을 섞는다. Python 검사 결과와 함께 원본 목록을 그대로 보내
    # JavaScript 쪽 검사도 같은 명령을 거르는지 확인한다.
    first = pick('sphere_01', 'primitive')
    raw = [
        make('set_opacity', 'ghost_99', 0.5),
        make('explode', first, True),
        make('set_opacity', first, 2.0),
        make('set_color', first, 'blue'),
        make('set_position', first, [1, 'a', 0]),
        make('scene_change', None, 'scene_zz'),
        make('set_visibility', first, True),
    ]
    checked = build(raw)
    return {'ok': True, 'commands': raw, 'errors': checked['errors'],
            'message': 'Python 검사: {}개 중 {}개 오류 (원본 그대로 전송)'.format(len(raw), len(checked['errors']))}


def change_scene(scene_id):
    return build([make('scene_change', None, scene_id)])


def move_to(actor_id, checkpoint_id, duration=0):
    # Checkpoint까지 이동하는 명령 하나 (STEP 03-D 타이핑 정답 처리에서 쓸 형식)
    command = {'action': 'actor_move_to_checkpoint', 'target': actor_id, 'checkpoint_id': checkpoint_id}
    if duration > 0:
        command['duration'] = duration
    return command


def route_demo(actor_id, path_id, checkpoint_id):
    # 경로 지정 → Checkpoint까지 이동 → 카메라 추적
    commands = []
    commands.append({'action': 'actor_set_path', 'target': actor_id, 'path_id': path_id})
    commands.append(move_to(actor_id, checkpoint_id, 2000))
    commands.append({'action': 'camera_follow', 'target': actor_id})
    return build(commands)


def motion_error_test(actor_id):
    # 잘못된 이동 명령을 섞어 Python·JS 양쪽 검사를 확인한다 (원본 그대로 전송)
    raw = [
        {'action': 'actor_move', 'target': 'ghost_actor'},
        {'action': 'actor_set_path', 'target': actor_id, 'path_id': 'no_such_path'},
        {'action': 'actor_move_to_checkpoint', 'target': actor_id, 'checkpoint_id': 'no_such_cp'},
        {'action': 'actor_seek', 'target': actor_id, 'value': 1.5},
        {'action': 'actor_set_speed', 'target': actor_id, 'value': -1},
        {'action': 'actor_pause', 'target': actor_id},
    ]
    checked = build(raw)
    return {'ok': True, 'commands': raw, 'errors': checked['errors'],
            'message': 'Python 검사: {}개 중 {}개 오류 (원본 그대로 전송)'.format(len(raw), len(checked['errors']))}
