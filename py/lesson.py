# 3D 학습 게임 API (STEP 03-D): game.py(학습 규칙) + motion_link.py(3D 이동 명령 변환)를 한 번에 부른다
# JavaScript는 입력과 이동 결과만 넘기고, 정답 판정·진행·기록은 모두 여기(Python)에서 정한다.
# 반환값의 commands는 3D 이동 명령, events는 도착 후 화면 명령(arrive, var, scene, complete 등)이다.

import game
import motion_link

last = {}            # 마지막 이동: {'edge': ..., 'commands': [...]} (재시도용)


def load(data, actor_id):
    # 콘텐츠 불러오기. 오류가 있으면 불러오지 않는다
    result = game.load(data)
    last.clear()
    motion_link.setup(actor_id, {})
    return result


def reset():
    last.clear()
    motion_link.setup(motion_link.actor, {})
    return game.reset()


def submit(text):
    # 입력 제출 → 정답 판정 → (정답이면) 이동 명령
    result = game.submit(text)
    out = {'result': result['result'], 'view': result['view'], 'commands': [], 'events': [], 'edge': None,
           'errors': []}
    if result['result'] != 'correct':
        return out
    moves = []
    for cmd in result['commands']:
        if cmd['type'] == 'move':
            moves.append(cmd)
        else:
            out['events'].append(cmd)       # 시작 노드처럼 이동 없이 도착한 경우
    if len(moves) > 0:
        motion = motion_link.to_motion(moves)
        out['commands'] = motion['commands']
        out['errors'] = motion['errors']
        out['edge'] = moves[0]['edge']
        out['move'] = moves[0]
        last['edge'] = moves[0]['edge']
        last['commands'] = motion['commands']
        if len(motion['errors']) > 0:
            # 3D 경로가 없으면 이동 전 상태로 되돌린다 (학습 상태만 앞서가지 않게)
            back = game.cancel_move('3D 경로 없음')
            out['result'] = 'move_error'
            out['view'] = back['view']
    return out


def arrived(status):
    # JS 이동 결과. 도착이면 규칙 엔진 진행, 실패·취소면 마지막 정상 노드로 되돌린다
    done = motion_link.motion_done(status)
    if done['result'] == 'arrive':
        result = game.arrive(done['edge'])
        return {'result': result['result'], 'events': result['commands'], 'view': result['view']}
    if done['result'] == 'ignored':
        return {'result': 'ignored', 'events': [], 'view': game.get_view()}
    # 실패·취소: 학습 상태는 이동 전(moving)에 그대로 둔다 → JS가 재시도(retry) 또는 복구(recover)를 고른다
    return {'result': 'move_' + status, 'events': [], 'view': game.get_view(), 'edge': done['edge']}


def recover(reason):
    # 마지막 정상 노드로 되돌리기: 이동을 취소하고 현재 노드(마지막 도착 노드)에서 다시 입력받는다
    last.clear()
    back = game.cancel_move(reason)
    view = back['view']
    node = None
    if view != None and view['current'] != None:
        node = game.index['nodes'][view['current']]
    checkpoint = ''
    visual = {}
    if node != None:
        checkpoint = node.get('checkpoint_id', '')
        # STEP 04-B: 마지막 정상 노드의 보이는 상태 (판막 등). 복사본을 보낸다
        state = node.get('visual_state', {})
        for key in state:
            visual[key] = state[key]
    return {'result': back['result'], 'view': view, 'checkpoint_id': checkpoint, 'visual_state': visual}


def retry():
    # 실패한 이동을 다시 시도: 규칙 엔진은 아직 이동 전(moving) 상태여야 한다
    view = game.get_view()
    if view == None or view['phase'] != 'moving' or 'edge' not in last:
        return {'ok': False, 'commands': [], 'view': view}
    motion_link.rearm(last['edge'])
    return {'ok': True, 'commands': last['commands'], 'view': view}


def peek(text):
    # 자동 제출 옵션: 정답인지 확인만 한다 (오답 횟수는 늘리지 않음)
    return game.peek(text)


def hint():
    return game.use_hint()


def record(info):
    return game.make_record_v2(info)


def records_csv(records):
    return game.records_csv_v2(records)


def view():
    return game.get_view()
