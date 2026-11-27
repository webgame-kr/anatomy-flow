# 3D Sandbox 게임 로직 (Three.js를 모른다)
# 객체 상태를 딕셔너리로 관리하고, JavaScript가 실행할 명령 리스트를 돌려준다.

import sys
import math

KINDS = ('box', 'sphere', 'cylinder')
KIND_NAMES = {'box': '정육면체', 'sphere': '구체', 'cylinder': '원통'}
PALETTE = ['#e5484d', '#f5a00a', '#46a758', '#2f6fde', '#8e4ec6', '#12a594']
HEX = '0123456789abcdef'
LIMIT = 10          # 좌표 범위 (-10 ~ 10)

objects = {}        # id -> 객체 정보 dict
order = []          # 만든 순서대로 id
counter = {}        # 종류별 번호
next_id = 1         # 명령 고유 번호


# ---------- 결과와 명령 ----------

def make_command(op, target):
    global next_id
    command = {'id': next_id, 'op': op, 'target': target}
    next_id += 1
    return command


def get_state():
    # 만든 순서대로 객체 목록 (복사본)
    result = []
    for obj_id in order:
        obj = objects[obj_id]
        item = {}
        for key in obj.keys():
            item[key] = obj[key]
        item['position'] = list(obj['position'])
        item['rotation'] = list(obj['rotation'])
        result.append(item)
    return result


def ok(commands, message):
    return {'ok': True, 'commands': commands, 'objects': get_state(), 'message': message}


def fail(message):
    return {'ok': False, 'commands': [], 'objects': get_state(), 'message': message}


# ---------- 값 검사 ----------

def is_number(value):
    return type(value) == int or type(value) == float


def clamp(value, low, high):
    if value < low:
        return low
    if value > high:
        return high
    return value


def is_color(text):
    # '#rrggbb' 형식인지 검사
    if type(text) != str or len(text) != 7 or text[0] != '#':
        return False
    for ch in text[1:].lower():
        if ch not in HEX:
            return False
    return True


# ---------- 기능 ----------

def ping():
    # 연결 확인: 딕셔너리와 리스트를 돌려준다
    version = sys.version.split()[0]
    return {'python': version, 'kinds': list(KINDS), 'palette': PALETTE, 'count': len(order)}


def create(kind, x=0, y=0.5, z=0):
    if kind not in KINDS:
        return fail('알 수 없는 객체 종류: {}'.format(kind))
    if not is_number(x) or not is_number(y) or not is_number(z):
        return fail('좌표는 숫자여야 합니다.')
    counter[kind] = counter.get(kind, 0) + 1
    obj_id = '{}-{}'.format(kind, counter[kind])
    color = PALETTE[(len(order)) % len(PALETTE)]
    obj = {'id': obj_id, 'kind': kind, 'name': KIND_NAMES[kind],
           'position': [clamp(x, -LIMIT, LIMIT), clamp(y, -LIMIT, LIMIT), clamp(z, -LIMIT, LIMIT)],
           'rotation': [0, 0, 0], 'scale': 1.0, 'color': color, 'visible': True}
    objects[obj_id] = obj
    order.append(obj_id)
    cmd = make_command('create', obj_id)
    cmd['object'] = get_state()[-1]
    return ok([cmd], '{} 생성'.format(obj_id))


def remove(obj_id):
    if obj_id not in objects:
        return fail('없는 객체: {}'.format(obj_id))
    del objects[obj_id]
    order.remove(obj_id)
    return ok([make_command('remove', obj_id)], '{} 제거'.format(obj_id))


def update_command(obj_id, fields, duration):
    # 바뀐 값만 담은 update 명령
    cmd = make_command('update', obj_id)
    for key in fields:
        value = objects[obj_id][key]
        if type(value) == list:
            value = list(value)
        cmd[key] = value
    cmd['duration'] = duration
    return cmd


def move(obj_id, dx, dy, dz, duration=400):
    # 현재 위치에서 상대 이동 (Python은 목표 위치만 계산, 프레임 보간은 JS)
    if obj_id not in objects:
        return fail('없는 객체: {}'.format(obj_id))
    pos = objects[obj_id]['position']
    new_pos = [pos[0] + dx, pos[1] + dy, pos[2] + dz]
    for i in range(3):
        new_pos[i] = round(clamp(new_pos[i], -LIMIT, LIMIT), 2)
    objects[obj_id]['position'] = new_pos
    cmd = update_command(obj_id, ['position'], duration)
    return ok([cmd], '{} 이동 → ({}, {}, {})'.format(obj_id, new_pos[0], new_pos[1], new_pos[2]))


def rotate(obj_id, rx, ry, rz, duration=400):
    # 회전은 도(degree) 단위
    if obj_id not in objects:
        return fail('없는 객체: {}'.format(obj_id))
    rot = objects[obj_id]['rotation']
    objects[obj_id]['rotation'] = [(rot[0] + rx) % 360, (rot[1] + ry) % 360, (rot[2] + rz) % 360]
    cmd = update_command(obj_id, ['rotation'], duration)
    return ok([cmd], '{} 회전'.format(obj_id))


def resize(obj_id, factor, duration=300):
    if obj_id not in objects:
        return fail('없는 객체: {}'.format(obj_id))
    if not is_number(factor) or factor <= 0:
        return fail('크기 배율은 0보다 커야 합니다.')
    new_scale = round(clamp(objects[obj_id]['scale'] * factor, 0.2, 5.0), 2)
    objects[obj_id]['scale'] = new_scale
    cmd = update_command(obj_id, ['scale'], duration)
    return ok([cmd], '{} 크기 → {}'.format(obj_id, new_scale))


def set_color(obj_id, color):
    if obj_id not in objects:
        return fail('없는 객체: {}'.format(obj_id))
    if not is_color(color):
        return fail('색상은 #rrggbb 형식이어야 합니다: {}'.format(color))
    objects[obj_id]['color'] = color.lower()
    cmd = update_command(obj_id, ['color'], 0)
    return ok([cmd], '{} 색상 → {}'.format(obj_id, color.lower()))


def next_color(obj_id):
    # 팔레트의 다음 색으로 바꾼다
    if obj_id not in objects:
        return fail('없는 객체: {}'.format(obj_id))
    now = objects[obj_id]['color']
    if now in PALETTE:
        number = (PALETTE.index(now) + 1) % len(PALETTE)
    else:
        number = 0
    return set_color(obj_id, PALETTE[number])


def toggle_visible(obj_id):
    if obj_id not in objects:
        return fail('없는 객체: {}'.format(obj_id))
    objects[obj_id]['visible'] = not objects[obj_id]['visible']
    cmd = update_command(obj_id, ['visible'], 0)
    if objects[obj_id]['visible']:
        word = '보이기'
    else:
        word = '숨기기'
    return ok([cmd], '{} {}'.format(obj_id, word))


def arrange_circle(radius=3, duration=900):
    # Python 데모: 모든 객체를 원형으로 배치하고 순서대로 색을 바꾼다
    if len(order) == 0:
        return fail('배치할 객체가 없습니다.')
    commands = []
    count = len(order)
    for i in range(count):
        obj_id = order[i]
        angle = 2 * math.pi * i / count
        x = round(radius * math.cos(angle), 2)
        z = round(radius * math.sin(angle), 2)
        objects[obj_id]['position'] = [x, 0.5, z]
        objects[obj_id]['color'] = PALETTE[i % len(PALETTE)]
        commands.append(update_command(obj_id, ['position', 'color'], duration))
    return ok(commands, '{}개 객체 원형 배치'.format(count))


def reset():
    # 전체 초기화: 모든 상태를 지우고 기본 객체 3개를 만든다
    global next_id
    objects.clear()
    order.clear()
    counter.clear()
    next_id = 1
    commands = [make_command('clear', None)]
    for spec in [('box', -2.5, 0.5, 0), ('sphere', 0, 0.5, 0), ('cylinder', 2.5, 0.5, 0)]:
        result = create(spec[0], spec[1], spec[2], spec[3])
        for cmd in result['commands']:
            commands.append(cmd)
    return ok(commands, '전체 초기화 (기본 객체 3개)')
