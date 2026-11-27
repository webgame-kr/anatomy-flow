# Python 핵심 엔진 단위 테스트
# 실행: 프로젝트 폴더(flow-engine)에서  python tests/test_engine.py

import sys
sys.path.insert(0, 'py')

import typing_engine
import content_loader
import game

passed = 0
failed = 0


def check(name, result):
    # 테스트 하나의 결과를 기록하고 출력한다
    global passed, failed
    if result:
        passed += 1
        print('[통과] ' + name)
    else:
        failed += 1
        print('[실패] ' + name)


def node(nid, ko, x, y, answers=None, events=None, requires=None):
    # 테스트용 노드 만들기
    if answers == None:
        answers = [ko]
    item = {'id': nid, 'ko': ko, 'answers': answers, 'x': x, 'y': y}
    if events != None:
        item['events'] = events
    if requires != None:
        item['requires'] = requires
    return item


def edge(eid, start, end, condition=None):
    item = {'id': eid, 'from': start, 'to': end, 'duration': 100}
    if condition != None:
        item['condition'] = condition
    return item


def line_content():
    # 순차형: a → b → c
    return {
        'id': 'line', 'title': '순차', 'start': 'a',
        'nodes': [node('a', '출발', 0, 0, ['출발', 'Start']),
                  node('b', '중간', 100, 0, ['중간', 'Middle Point']),
                  node('c', '도착', 200, 0)],
        'edges': [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')],
        'complete': {'node': 'c'}
    }


def go(text):
    # 제출하고 이동 명령이 있으면 바로 도착까지 처리한다
    result = game.submit(text)
    for cmd in result['commands']:
        if cmd['type'] == 'move':
            result = game.arrive(cmd['edge'])
    return result


# ---------- 1. 타이핑 엔진 ----------
check('앞뒤 공백·대소문자 정규화', typing_engine.normalize('  Heart  Rate ') == 'heart rate')
check('None 정규화는 빈 문자열', typing_engine.normalize(None) == '')
check('공백 무시 옵션', typing_engine.normalize('교감 신경', True) == '교감신경')
check('복수 정답 허용(영문)', typing_engine.is_correct('START', ['출발', 'start']))
check('복수 정답 허용(한글)', typing_engine.is_correct(' 출발 ', ['출발', 'start']))
check('오답 판정', not typing_engine.is_correct('출', ['출발', 'start']))
check('빈 입력은 정답 아님', not typing_engine.is_correct('   ', ['출발']))
check('가운데 공백은 기본적으로 구분', not typing_engine.is_correct('교감 신경', ['교감신경']))
check('공백 무시 옵션이면 같음', typing_engine.is_correct('교감 신경', ['교감신경'], True))

# ---------- 2. 콘텐츠 검증 ----------
good = content_loader.validate(line_content())
check('정상 콘텐츠는 오류 없음', len(good['errors']) == 0)

bad = line_content()
bad['nodes'].append(node('a', '중복', 0, 0))
check('중복 노드 id 검출', len(content_loader.validate(bad)['errors']) > 0)

bad = line_content()
bad['edges'].append(edge('e3', 'c', 'zz'))
errors = content_loader.validate(bad)['errors']
check('없는 도착 노드 검출', len(errors) == 1 and 'zz' in errors[0])

bad = line_content()
bad['edges'][0]['path'] = 'no_path'
check('없는 경로 id 검출', len(content_loader.validate(bad)['errors']) == 1)

bad = line_content()
bad['start'] = 'nope'
check('없는 시작 노드 검출', len(content_loader.validate(bad)['errors']) > 0)

bad = line_content()
bad['nodes'][1]['answers'] = []
check('빈 허용 정답 검출', len(content_loader.validate(bad)['errors']) > 0)

bad = line_content()
bad['edges'][0]['condition'] = {'var': 'x', 'op': '=>', 'value': 1}
check('잘못된 연산자 검출', len(content_loader.validate(bad)['errors']) > 0)

bad = line_content()
bad['nodes'][0]['events'] = [{'type': 'color', 'model': 'ghost', 'color': '#fff'}]
check('없는 모델 참조 검출', len(content_loader.validate(bad)['errors']) > 0)

bad = line_content()
bad['nodes'][0]['events'] = [{'type': 'explode'}]
check('알 수 없는 이벤트 검출', len(content_loader.validate(bad)['errors']) > 0)

bad = line_content()
del bad['complete']
check('완료 조건 누락 검출', len(content_loader.validate(bad)['errors']) > 0)

bad = line_content()
bad['complete'] = {}
check('빈 완료 조건 검출', len(content_loader.validate(bad)['errors']) > 0)

check('객체가 아닌 콘텐츠 검출', len(content_loader.validate([1, 2])['errors']) > 0)

warn = line_content()
warn['nodes'].append(node('d', '외딴곳', 300, 0))
warnings = content_loader.validate(warn)['warnings']
check('갈 수 없는 노드 경고', len(warnings) > 0 and 'd' in warnings[0])

loop = line_content()
loop['edges'].append(edge('e3', 'c', 'a'))
warnings = content_loader.validate(loop)['warnings']
found = False
for text in warnings:
    if '순환' in text:
        found = True
check('순환 구조 경고', found)

# ---------- 3. 순차 진행과 상태 유지 ----------
result = game.load(line_content())
check('불러오기 성공', result['ok'])
view = game.get_view()
check('시작 후보는 시작 노드', len(view['candidates']) == 1 and view['candidates'][0]['node'] == 'a')

result = game.submit('틀린말')
check('오답 결과', result['result'] == 'wrong')
check('오답이면 현재 노드 유지', result['view']['current'] == None and result['view']['completed'] == [])
check('오답 횟수 증가', result['view']['wrong'] == 1)

result = game.submit('   ')
check('빈 입력은 오답으로 세지 않음', result['result'] == 'empty' and result['view']['wrong'] == 1)

result = game.submit('start')
check('시작 노드 정답은 바로 도착', result['view']['current'] == 'a' and result['commands'][0]['type'] == 'arrive')

result = game.submit('middle point')
check('정답이면 이동 명령', result['commands'][0]['type'] == 'move' and result['commands'][0]['edge'] == 'e1')
check('이동 중 상태', result['view']['phase'] == 'moving')

result = game.submit('도착')
check('이동 중 제출은 거절', result['result'] == 'busy')

result = game.arrive('e2')
check('다른 Edge 도착 신호는 무시', result['result'] == 'ignored' and game.get_view()['current'] == 'a')

result = game.arrive('e1')
check('도착하면 다음 노드 활성화', result['view']['current'] == 'b' and result['view']['phase'] == 'ready')

result = game.arrive('e1')
check('같은 도착 신호 두 번은 무시', result['result'] == 'ignored' and game.get_view()['steps'] == 2)

result = go('도착')
check('완료 노드 도착하면 종료', result['view']['phase'] == 'done' and result['view']['end_reason'] == 'goal')
check('완료 노드 목록', result['view']['completed'] == ['a', 'b', 'c'])
check('지나간 경로 목록', result['view']['done_edges'] == ['e1', 'e2'])
last = result['commands'][-1]
check('완료 명령 전송', last['type'] == 'complete' and last['reason'] == 'goal')
check('종료 후 제출은 done', game.submit('출발')['result'] == 'done')

ids = []
for cmd in game.submit('x')['commands']:
    ids.append(cmd['id'])
check('종료 후에는 명령 없음', ids == [])

# ---------- 4. 초기화 ----------
view = game.reset()
check('초기화하면 상태 비움', view['current'] == None and view['completed'] == [] and view['correct'] == 0 and view['wrong'] == 0)
check('초기화 후 다시 시작 가능', game.submit('출발')['view']['current'] == 'a')

# 이동 중에 초기화
game.submit('중간')
view = game.reset()
check('이동 중 초기화하면 이동 취소', view['phase'] == 'ready' and view['moving_edge'] == None)
check('초기화 후 이전 도착 신호 무시', game.arrive('e1')['result'] == 'ignored')

# ---------- 5. 분기 ----------
branch = {
    'id': 'branch', 'title': '분기', 'start': 'j',
    'variables': {'route': ''},
    'nodes': [node('j', '분기점', 0, 0),
              node('u', '위쪽', 100, -100, ['위쪽', 'upper'], [{'type': 'set', 'var': 'route', 'value': 'upper'}]),
              node('d', '아래쪽', 100, 100, ['아래쪽', 'lower'], [{'type': 'set', 'var': 'route', 'value': 'lower'}]),
              node('m', '합류', 200, 0),
              node('b', '보너스', 300, -100),
              node('x', '출구', 300, 0)],
    'edges': [edge('e1', 'j', 'u'), edge('e2', 'j', 'd'), edge('e3', 'u', 'm'), edge('e4', 'd', 'm'),
              edge('e5', 'm', 'x'), edge('e6', 'm', 'b', {'var': 'route', 'op': '==', 'value': 'upper'}),
              edge('e7', 'b', 'x')],
    'complete': {'node': 'x'}
}
check('분기 콘텐츠 불러오기', game.load(branch)['ok'])
go('분기점')
check('분기점 후보 2개', len(game.get_view()['candidates']) == 2)
result = go('lower')
check('입력한 용어로 분기 선택', result['view']['current'] == 'd' and result['view']['vars']['route'] == 'lower')
go('합류')
nodes = []
for cand in game.get_view()['candidates']:
    nodes.append(cand['node'])
check('조건 안 맞는 Edge는 후보 아님', nodes == ['x'])
check('조건으로 잠긴 노드 입력은 오답', go('보너스')['result'] == 'wrong')

game.reset()
go('분기점')
go('위쪽')
go('합류')
check('조건 맞으면 추가 분기', len(game.get_view()['candidates']) == 2)
go('보너스')
result = go('출구')
check('분기 경로 완료', result['view']['end_reason'] == 'goal')

# ---------- 6. 순환 ----------
cycle = {
    'id': 'cycle', 'title': '순환', 'start': 'a', 'max_steps': 20,
    'variables': {'lap': 0},
    'nodes': [node('a', '출발점', 0, 0, None, [{'type': 'add', 'var': 'lap', 'value': 1}]),
              node('b', '오른쪽', 100, 0),
              node('c', '아래', 50, 100)],
    'edges': [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'a')],
    'complete': {'node': 'a', 'visits': 3}
}
check('순환 콘텐츠 불러오기', game.load(cycle)['ok'])
go('출발점')
for lap in range(2):
    go('오른쪽')
    go('아래')
    result = go('출발점')
check('순환 2바퀴 후 완료', result['view']['phase'] == 'done' and result['view']['visits']['a'] == 3)
check('순환 변수 증가', result['view']['vars']['lap'] == 3)

endless = {
    'id': 'endless', 'title': '끝없는 순환', 'start': 'a', 'max_steps': 7,
    'variables': {'never': 0},
    'nodes': [node('a', '가', 0, 0), node('b', '나', 100, 0)],
    'edges': [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')],
    'complete': {'vars': {'var': 'never', 'op': '==', 'value': 1}}
}
check('완료 불가 순환 불러오기', game.load(endless)['ok'])
go('가')
count = 1
while game.get_view()['phase'] != 'done' and count < 100:
    if game.get_view()['current'] == 'a':
        go('나')
    else:
        go('가')
    count += 1
check('최대 이동 횟수로 무한 반복 방지', game.get_view()['end_reason'] == 'limit' and game.get_view()['steps'] == 7)

# ---------- 7. 인과관계 (변수·모델 변화) ----------
causal = {
    'id': 'causal', 'title': '인과', 'start': 's',
    'variables': {'p': 0, 'alarm': 'off'},
    'models': [{'id': 'tank', 'shape': 'rect', 'x': 0, 'y': 0, 'w': 10, 'h': 10, 'color': '#aaa'},
               {'id': 'lamp', 'shape': 'circle', 'x': 0, 'y': 0, 'r': 5, 'color': '#f00', 'visible': False}],
    'nodes': [node('s', '자극', 0, 0, None, [{'type': 'color', 'model': 'tank', 'color': '#0f0'}]),
              node('u', '증가', 100, 0, None, [
                  {'type': 'add', 'var': 'p', 'value': 1},
                  {'type': 'show', 'model': 'lamp', 'when': {'var': 'p', 'op': '>=', 'value': 3}},
                  {'type': 'set', 'var': 'alarm', 'value': 'on', 'when': {'var': 'p', 'op': '>=', 'value': 3}}]),
              node('k', '확인', 200, 0),
              node('r', '조절', 300, 0, None, [{'type': 'hide', 'model': 'lamp'}])],
    'edges': [edge('e1', 's', 'u'), edge('e2', 'u', 'k'),
              edge('e3', 'k', 'u', {'var': 'p', 'op': '<', 'value': 3}),
              edge('e4', 'k', 'r', {'var': 'p', 'op': '>=', 'value': 3})],
    'complete': {'node': 'r'}
}
check('인과 콘텐츠 불러오기', game.load(causal)['ok'])
result = go('자극')
check('이벤트로 모델 색 변경', result['view']['models']['tank']['color'] == '#0f0')
types = []
for cmd in result['commands']:
    types.append(cmd['type'])
check('도착 명령 뒤에 이벤트 명령', types == ['arrive', 'color'])
go('증가')
go('확인')
check('조건 미달이면 되돌아가는 경로만', game.get_view()['candidates'][0]['node'] == 'u')
check('경고등은 아직 숨김', game.get_view()['models']['lamp']['visible'] == False)
go('증가')
go('확인')
result = go('증가')
check('when 조건 만족 시 여러 객체·변수 변화',
      result['view']['vars']['p'] == 3 and result['view']['vars']['alarm'] == 'on' and result['view']['models']['lamp']['visible'])
go('확인')
result = go('조절')
check('인과 완료와 모델 숨김', result['view']['end_reason'] == 'goal' and not result['view']['models']['lamp']['visible'])

# 명령 번호는 겹치지 않는다
game.load(line_content())
all_ids = []
for text in ['출발', '중간', '도착']:
    r = game.submit(text)
    for cmd in r['commands']:
        all_ids.append(cmd['id'])
        if cmd['type'] == 'move':
            for cmd2 in game.arrive(cmd['edge'])['commands']:
                all_ids.append(cmd2['id'])
check('명령 고유 번호 중복 없음', len(all_ids) == len(set(all_ids)))

# ---------- 8. 선행 조건 ----------
req = line_content()
req['nodes'].append(node('z', '샛길', 100, 100, None, None, ['c']))
req['edges'].append(edge('e3', 'a', 'z'))
req['edges'].append(edge('e4', 'z', 'c'))
game.load(req)
go('출발')
check('선행 노드 미완료면 후보 아님', len(game.get_view()['candidates']) == 1)

# ---------- 9. 기록 ----------
game.load(line_content())
go('틀림')
go('출발')
go('중간')
go('도착')
record = game.make_record('2026-11-27 10:00', 12.34)
check('기록 계산', record['correct'] == 3 and record['wrong'] == 1 and record['accuracy'] == 75.0 and record['finished'])
record['title'] = '제목, 쉼표'
csv_text = game.records_csv([record])
lines = csv_text.split('\n')
check('CSV 머리글', lines[0].split(',')[0] == '날짜' and len(lines[0].split(',')) == 9)
check('CSV 쉼표 처리', len(lines[1].split(',')) == 9 and lines[1].split(',')[3] == 'Y')

# ---------- 결과 ----------
print()
print('통과 {}개, 실패 {}개'.format(passed, failed))
if failed > 0:
    sys.exit(1)
