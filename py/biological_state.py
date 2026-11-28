# 생리적 상태 변수 관리 (STEP 04-C)
# - 변수 정의(variable_id, 이름, 자료형, 단위, 기준값, 허용 범위, 출처, 검증 상태)와 현재 값을 딕셔너리로 관리한다.
# - 자료형: number(수치), boolean(참/거짓), category(범주), relative(상대적 상태), activation(활성화), computed(계산 결과)
# - 상대적 상태는 정수 단계로 저장한다: -2(크게 감소) -1(감소) 0(기준) 1(증가) 2(크게 증가)
#   정량 근거가 없는 변수는 숫자를 만들지 않고 이 단계만 쓴다.
# - 수치 변수도 "변화 방향(trend)"을 따로 가진다. 인과관계가 방향만 정할 때(크기 근거 없음) 숫자는 바꾸지 않고 trend만 바꾼다.
# - 이 값들은 교육용 단순화이며 실제 환자의 측정값이 아니다.

import math

TYPES = ('number', 'boolean', 'category', 'relative', 'activation', 'computed')
LEVELS = (-2, -1, 0, 1, 2)
LEVEL_LABEL = {-2: 'MARKEDLY_DECREASED', -1: 'DECREASED', 0: 'BASELINE', 1: 'INCREASED', 2: 'MARKEDLY_INCREASED'}
LEVEL_KO = {-2: '크게 감소', -1: '감소', 0: '기준', 1: '증가', 2: '크게 증가'}
SPECIAL = ('UNKNOWN', 'MIXED')            # 판단할 수 없음 / 서로 다른 원인이 반대로 작용
ACTIVATION = ('ACTIVE', 'INACTIVE', 'UNKNOWN')
STATUSES = ('TECH_TESTED', 'LECTURE_CHECKED', 'PUBLIC_REFERENCE', 'NEEDS_ANATOMY_REVIEW', 'NEEDS_PHYSIOLOGY_REVIEW',
            'EXPERT_REVIEWED', 'CONCEPTUAL', 'EDUCATIONAL_VALUE', 'PENDING_REVIEW')
NEEDED = ('variable_id', 'name_ko', 'data_type')
MAX_HISTORY = 300
BASELINE_TOLERANCE = 0.05                 # 수치 변수: 기준값 ±5% 안이면 BASELINE으로 본다 (표시용)

variables = {}        # variable_id -> 정의 + 현재 값
order = []            # 등록 순서 (결정적 순서)
history = []          # (물리 시간, 학습 단계, {변수: 값}) 기록
clock = {'t': 0, 'step': 0}


def clear():
    variables.clear()
    del order[:]
    del history[:]
    clock['t'] = 0
    clock['step'] = 0


def is_number(value):
    if type(value) != int and type(value) != float:
        return False
    if type(value) == float and (math.isnan(value) or math.isinf(value)):
        return False
    return True


def check_value(var, value):
    # 값이 이 변수의 자료형·범위에 맞는지 검사한다. 문제가 없으면 빈 문자열
    kind = var['data_type']
    if kind == 'number' or kind == 'computed':
        if value == None and kind == 'computed':
            return ''
        if not is_number(value):
            return '{}: 숫자가 아니거나 NaN·무한대입니다 ({})'.format(var['variable_id'], value)
        rng = var.get('allowed_range')
        if type(rng) == list and len(rng) == 2:
            if value < rng[0] or value > rng[1]:
                return '{}: 허용 범위 {}~{} {} 밖입니다 ({})'.format(var['variable_id'], rng[0], rng[1], var.get('unit', ''), value)
        return ''
    if kind == 'boolean':
        if type(value) != bool:
            return '{}: true/false여야 합니다'.format(var['variable_id'])
        return ''
    if kind == 'category':
        allowed = var.get('categories', [])
        if value not in allowed:
            return '{}: 허용 값 {} 중 하나여야 합니다 ({})'.format(var['variable_id'], allowed, value)
        return ''
    if kind == 'relative':
        if value in SPECIAL or value in LEVELS:
            return ''
        return '{}: 상대 단계는 -2~2 정수 또는 UNKNOWN·MIXED ({})'.format(var['variable_id'], value)
    if kind == 'activation':
        if value in ACTIVATION:
            return ''
        return '{}: ACTIVE·INACTIVE·UNKNOWN 중 하나 ({})'.format(var['variable_id'], value)
    return '{}: 알 수 없는 자료형 {}'.format(var['variable_id'], kind)


def define(spec):
    # 변수 등록. 결과 {'ok', 'error'}
    if type(spec) != dict:
        return {'ok': False, 'error': '변수 정의는 객체여야 합니다'}
    for key in NEEDED:
        if key not in spec or spec[key] == '':
            return {'ok': False, 'error': '변수 정의에 {}가 없습니다'.format(key)}
    if spec['data_type'] not in TYPES:
        return {'ok': False, 'error': '{}: 알 수 없는 자료형 {}'.format(spec['variable_id'], spec['data_type'])}
    if spec['variable_id'] in variables:
        return {'ok': False, 'error': '변수 id 중복: {}'.format(spec['variable_id'])}
    status = spec.get('verification_status', 'PENDING_REVIEW')
    if status not in STATUSES:
        return {'ok': False, 'error': '{}: 알 수 없는 검증 상태 {}'.format(spec['variable_id'], status)}
    var = {}
    for key in spec:
        var[key] = spec[key]
    var['verification_status'] = status
    if 'baseline' not in var:
        var['baseline'] = default_baseline(var)
    problem = check_value(var, var['baseline'])
    if problem != '' and not (var['data_type'] == 'computed' and var['baseline'] == None):
        return {'ok': False, 'error': '기준값 오류: ' + problem}
    var['value'] = var['baseline']
    var['trend'] = 0                    # 변화 방향 단계 (수치 변수용)
    var['note'] = ''                    # 마지막 변화 설명 (예: 방향만 결정)
    variables[var['variable_id']] = var
    order.append(var['variable_id'])
    return {'ok': True, 'error': ''}


def default_baseline(var):
    kind = var['data_type']
    if kind == 'relative':
        return 0
    if kind == 'activation':
        return 'INACTIVE'
    if kind == 'boolean':
        return False
    if kind == 'category':
        cats = var.get('categories', [])
        if len(cats) > 0:
            return cats[0]
        return ''
    return None


def has(var_id):
    return var_id in variables


def get(var_id):
    if var_id not in variables:
        return None
    return variables[var_id]['value']


def set_value(var_id, value, note=''):
    # 값 바꾸기. 계산 결과(computed)는 공식 엔진만 바꾼다(force 경로 set_computed)
    if var_id not in variables:
        return {'ok': False, 'error': '없는 변수: {}'.format(var_id)}
    var = variables[var_id]
    if var['data_type'] == 'computed':
        return {'ok': False, 'error': '{}는 계산 결과라 직접 바꿀 수 없습니다'.format(var_id)}
    problem = check_value(var, value)
    if problem != '':
        return {'ok': False, 'error': problem}
    old = var['value']
    var['value'] = value
    var['note'] = note
    if var['data_type'] == 'number' and is_number(old) and is_number(value):
        var['trend'] = direction_of(value - old)
    return {'ok': True, 'error': '', 'old': old, 'value': value}


def set_computed(var_id, value, note=''):
    var = variables[var_id]
    problem = check_value(var, value)
    if problem != '':
        return {'ok': False, 'error': problem}
    old = var['value']
    var['value'] = value
    var['note'] = note
    if is_number(old) and is_number(value):
        var['trend'] = direction_of(value - old)
    return {'ok': True, 'error': '', 'old': old, 'value': value}


def direction_of(delta):
    if not is_number(delta):
        return 0
    if delta > 0:
        return 1
    if delta < 0:
        return -1
    return 0


def clamp_level(level):
    if level > 2:
        return 2
    if level < -2:
        return -2
    return level


def shift(var_id, delta, note=''):
    # 상대 단계 변화(인과관계). relative/activation은 값 자체를, 수치 변수는 trend만 바꾼다
    if var_id not in variables:
        return {'ok': False, 'error': '없는 변수: {}'.format(var_id)}
    var = variables[var_id]
    kind = var['data_type']
    if delta in SPECIAL:
        if kind == 'relative':
            var['value'] = delta
        else:
            var['trend'] = delta
        var['note'] = note
        return {'ok': True, 'error': ''}
    if kind == 'relative':
        current = var['value']
        if current in SPECIAL:
            current = 0
        var['value'] = clamp_level(current + delta)
    elif kind == 'activation':
        if delta > 0:
            var['value'] = 'ACTIVE'
        elif delta < 0:
            var['value'] = 'INACTIVE'
    elif kind == 'number' or kind == 'computed':
        current = var['trend']
        if current in SPECIAL:
            current = 0
        var['trend'] = clamp_level(current + delta)
    else:
        return {'ok': False, 'error': '{}: {} 자료형은 단계 변화를 쓸 수 없습니다'.format(var_id, kind)}
    var['note'] = note
    return {'ok': True, 'error': ''}


def level_of(var_id):
    # 상대 단계 (수치 변수는 trend, 단 trend가 0이면 기준값과 비교)
    var = variables[var_id]
    kind = var['data_type']
    if kind == 'relative':
        return var['value']
    if kind == 'activation':
        if var['value'] == 'ACTIVE':
            return 1
        if var['value'] == 'INACTIVE':
            return 0
        return 'UNKNOWN'
    if kind == 'number' or kind == 'computed':
        if var['trend'] != 0:
            return var['trend']
        base = var.get('baseline')
        value = var['value']
        if is_number(base) and is_number(value) and base != 0:
            ratio = (value - base) / abs(base)
            if ratio > BASELINE_TOLERANCE:
                return 1
            if ratio < -BASELINE_TOLERANCE:
                return -1
        return 0
    return 0


def label_of(var_id):
    level = level_of(var_id)
    var = variables[var_id]
    if var['data_type'] == 'activation':
        return var['value']
    if level in SPECIAL:
        return level
    return LEVEL_LABEL[level]


def reset():
    # 모든 변수를 기준값으로
    for var_id in order:
        var = variables[var_id]
        var['value'] = var['baseline']
        var['trend'] = 0
        var['note'] = ''
    del history[:]
    clock['t'] = 0
    clock['step'] = 0


def snapshot():
    # 복원용 전체 상태 (복사본)
    values = {}
    for var_id in order:
        var = variables[var_id]
        values[var_id] = (var['value'], var['trend'], var['note'])
    return {'values': values, 't': clock['t'], 'step': clock['step'], 'history_len': len(history)}


def restore(snap):
    if type(snap) != dict or 'values' not in snap:
        return {'ok': False, 'error': '스냅샷 형식 오류'}
    for var_id in snap['values']:
        if var_id in variables:
            item = snap['values'][var_id]
            variables[var_id]['value'] = item[0]
            variables[var_id]['trend'] = item[1]
            variables[var_id]['note'] = item[2]
    clock['t'] = snap.get('t', 0)
    clock['step'] = snap.get('step', 0)
    keep = snap.get('history_len', len(history))
    while len(history) > keep:
        history.pop()
    return {'ok': True, 'error': ''}


def record(label=''):
    # 그래프용 기록 (크기 제한). 수치는 값, 나머지는 단계
    row = {}
    levels = {}
    for var_id in order:
        var = variables[var_id]
        levels[var_id] = level_of(var_id)
        if var['data_type'] == 'number' or var['data_type'] == 'computed':
            row[var_id] = var['value']
        else:
            row[var_id] = levels[var_id]
    # 수치 변수는 값과 단계를 함께 남긴다 (기전 학습에서는 값은 그대로이고 방향만 바뀔 수 있다)
    history.append((clock['t'], clock['step'], label, row, levels))
    if len(history) > MAX_HISTORY:
        history.pop(0)


def view(var_ids=None):
    # 화면용 요약 (필요한 변수만)
    if var_ids == None:
        var_ids = order
    out = []
    for var_id in var_ids:
        if var_id not in variables:
            continue
        var = variables[var_id]
        item = {'variable_id': var_id, 'name_ko': var['name_ko'], 'name_en': var.get('name_en', ''),
                'data_type': var['data_type'], 'unit': var.get('unit', ''), 'value': var['value'],
                'baseline': var['baseline'], 'level': level_of(var_id), 'label': label_of(var_id),
                'trend': var['trend'], 'note': var['note'], 'normal_range': var.get('normal_range'),
                'value_kind': var.get('value_kind', ''), 'verification_status': var['verification_status']}
        out.append(item)
    return out
