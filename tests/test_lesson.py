# STEP 03-D 3D 학습 게임 Python 테스트 (lesson.py, game.py 확장, 기록 v2)
# 실행: 프로젝트 폴더에서  python tests/test_lesson.py

import sys
import json
sys.path.insert(0, 'py')

import lesson
import game
import content_loader
import typing_engine
import record_engine

passed = 0
failed = 0


def check(name, result):
    global passed, failed
    if result:
        passed += 1
        print('[통과] ' + name)
    else:
        failed += 1
        print('[실패] ' + name)


def read(path):
    f = open(path, encoding='utf-8')
    data = json.load(f)
    f.close()
    return data


def play(text, status='arrived'):
    # 제출 → (이동 명령이 있으면) 이동 결과 전달까지
    r = lesson.submit(text)
    if r['result'] == 'correct' and r['edge'] != None:
        return lesson.arrived(status)
    return r


# ---------- 타이핑 ----------
check('유니코드 정규화(전각 영문)', typing_engine.normalize('ＲＡ') == 'ra')
check('자모 조합형 → 완성형', typing_engine.normalize('상대정맥') == '상대정맥')
check('비슷한 오타는 오답', not typing_engine.is_correct('상대정멕', ['상대정맥']))

# ---------- 콘텐츠 검증 ----------
cv = read('content/lessons/cardiovascular/blood-circulation.json')
check('심혈관 콘텐츠 검증 통과', len(content_loader.validate(content_loader.upgrade(cv))['errors']) == 0)
up = content_loader.upgrade(cv)
check('3D 별칭 필드 변환 (accepted_answers → answers, source_node → from)',
      'answers' in up['nodes'][0] and up['edges'][0]['from'] == 'n.venous_return' and up['edges'][2]['path'] == 'cv.svc_to_ra')
check('set_variable → set 이벤트', up['nodes'][3]['events'][0]['type'] == 'set')
check('원본 콘텐츠는 바뀌지 않음', 'accepted_answers' in cv['nodes'][0] and 'answers' not in cv['nodes'][0])

bad = read('content/lessons/cardiovascular/blood-circulation.json')
bad['nodes'][1]['verification_status'] = 'MEDICALLY_PERFECT'
bad['edges'][0]['transition_type'] = 'teleport'
bad['nodes'][3]['events'].append({'type': 'scene', 'command': {'action': 'explode'}})
errs = content_loader.validate(content_loader.upgrade(bad))['errors']
check('잘못된 검증 상태·전환·3D 명령 검출', len(errs) == 3)
bad2 = read('content/lessons/cardiovascular/blood-circulation.json')
bad2['version'] = 7
check('지원하지 않는 버전 검출', len(content_loader.validate(bad2)['errors']) == 1)

# ---------- 기본 진행 (상대정맥 경로) ----------
r = lesson.load(cv, 'rbc_01')
check('불러오기', r['ok'])
r = lesson.submit('정맥 환류')
check('시작 노드는 이동 없이 도착', r['result'] == 'correct' and r['edge'] == None and r['events'][0]['type'] == 'arrive')
v = lesson.view()
check('분기 후보 2개 (상대정맥·하대정맥)', len(v['candidates']) == 2)
r = lesson.submit('하대 정맥류')
check('오답이면 위치 유지', r['result'] == 'wrong' and r['view']['current'] == 'n.venous_return')
check('오답 개념 기록 (두 후보)', r['view']['wrong_nodes'] == {'n.svc': 1, 'n.ivc': 1})
r = lesson.submit('SVC')
check('약어 정답 → jump 명령(Checkpoint에 놓기)', r['result'] == 'correct' and r['commands'][0]['action'] == 'actor_place_at_checkpoint' and r['commands'][0]['checkpoint_id'] == 'cp.svc')
check('이동 결과 전 상태는 moving', r['view']['phase'] == 'moving' and r['view']['current'] == 'n.venous_return')
check('이동 중 제출은 busy', lesson.submit('우심방')['result'] == 'busy')
r = lesson.arrived('arrived')
check('도착 후 다음 노드', r['result'] == 'arrived' and r['view']['current'] == 'n.svc')
check('같은 도착 결과 두 번은 무시', lesson.arrived('arrived')['result'] == 'ignored')
r = lesson.submit('우 심방')
check('띄어쓰기 허용 콘텐츠 (ignore_spaces)', r['result'] == 'correct')
check('경로 이동 명령 → actor_move_to_checkpoint cp.ra', r['commands'][0]['action'] == 'actor_move_to_checkpoint' and r['commands'][0]['checkpoint_id'] == 'cp.ra' and r['commands'][0]['wait'])
lesson.arrived('arrived')

# 이동 실패 → 재시도 → 복구
r = lesson.submit('삼첨판')
r = lesson.arrived('failed')
check('이동 실패면 진행하지 않음', r['result'] == 'move_failed' and r['view']['current'] == 'n.ra' and r['view']['phase'] == 'moving')
r = lesson.retry()
check('재시도: 같은 이동 명령', r['ok'] and r['commands'][0]['checkpoint_id'] == 'cp.tricuspid')
r = lesson.arrived('cancelled')
r = lesson.recover('사용자 복구')
check('복구: 마지막 정상 노드(우심방)와 그 Checkpoint', r['view']['phase'] == 'ready' and r['view']['current'] == 'n.ra' and r['checkpoint_id'] == 'cp.ra')
check('복구 뒤 이전 결과는 무시', lesson.arrived('arrived')['result'] == 'ignored')
check('복구 뒤 다시 입력 가능', play('tricuspid valve')['view']['current'] == 'n.tricuspid')

h = lesson.hint()
check('힌트 사용 기록', h['ok'] and h['view']['hints'] == 1 and h['hints'][0]['node'] == 'n.rv')
for word in ['우심실', '폐동맥판', '폐동맥', '폐 모세혈관']:
    r = play(word)
check('폐 모세혈관: 산소화 변수 + Actor 상태 명령', r['view']['vars']['oxygenation'] == 'oxygenated' and
      [e for e in r['events'] if e['type'] == 'scene'][0]['command']['action'] == 'actor_set_state')
check('순환 구분 변수', r['view']['vars']['current_circulation'] == 'pulmonary')
r = lesson.submit('폐정맥')
check('PENDING 구간(jump, Checkpoint 없음) → 이동 명령 없음', r['result'] == 'correct' and r['commands'] == [])
lesson.arrived('ok')
for word in ['좌심방', '이첨판', '좌심실', '대동맥판', '대동맥']:
    r = play(word)
check('대동맥판 지나면 체순환', r['view']['vars']['current_circulation'] == 'systemic')
r = play('전신 조직')
check('완료', r['view']['phase'] == 'done' and r['view']['end_reason'] == 'goal' and r['view']['progress'] == 1.0)
check('주기 변수', r['view']['vars']['completed_cycles'] == 1 and r['view']['vars']['oxygenation'] == 'deoxygenated')
v = r['view']
check('첫 시도 정답 수 (분기에서 1번 틀림)', v['questions'] == 16 and v['first_correct'] == 15 and v['first_accuracy'] == 93.8)
check('전체 시도 정답률', v['correct'] == 16 and v['wrong'] == 1)
rec = lesson.record({'session_id': 's1', 'learning_mode': 'guide', 'start_time': 't0', 'end_time': 't1', 'active_seconds': 12.34, 'completion_status': 'completed'})
check('기록 v2 필드', rec['version'] == 2 and rec['content_version'] == '0.1.1' and rec['hint_count'] == 1 and len(rec['completed_nodes']) == 15 and rec['active_learning_time'] == 12.3)
check('입력 기록', len(rec['attempted_answers']) == 17 and rec['attempted_answers'][1]['result'] == 'wrong')
csv = lesson.records_csv([rec, {'date': '2026-11-01', 'content_id': 'old', 'correct': 3, 'wrong': 1, 'accuracy': 75.0, 'finished': True, 'seconds': 9}])
lines = csv.strip().split('\n')
check('CSV v2 머리글 17열 + v1 기록 변환', len(lines[0].split(',')) == 17 and len(lines[2].split(',')) == 17 and lines[2].split(',')[-1] == 'completed')

# ---------- 강의자료 용어 (2026-11-28 대조 후 추가) ----------
lesson.load(cv, 'rbc_01')
check('강의 용어: 정맥 귀환', play('정맥귀환')['view']['current'] == 'n.venous_return')
play('상대정맥')
play('우심방')
check('강의 용어: 삼첨판막', play('삼첨판막')['view']['current'] == 'n.tricuspid')

# ---------- 진행률: 고르지 않은 분기는 분모에 넣지 않음 ----------
lesson.load(cv, 'rbc_01')
play('정맥 환류')
play('하대정맥')
v = lesson.view()
check('하대정맥 경로 진행률 (상대정맥 노드는 분모 제외)', v['progress'] == round(2 / (2 + 13), 3))

# ---------- 분기·순환 ----------
bc = read('content/lessons/test/branch-cycle.json')
check('분기·순환 콘텐츠 불러오기', lesson.load(bc, 'rbc_branch')['ok'])
for word in ['출발', '분기점']:
    play(word)
check('분기점 후보 2개', len(lesson.view()['candidates']) == 2)
play('왼쪽')
for word in ['순환 A', '순환 B', '순환 A']:
    play(word)
v = lesson.view()
check('조건: laps<2 이면 A로만', [c['node'] for c in v['candidates']] == ['t.loop_b'])
check('재방문 표시 (seen)', v['candidates'][0]['seen'])
r = play('순환 B')
check('순환 이동 횟수(laps)와 방문 횟수 구분', r['view']['laps'] >= 1 and r['view']['visits']['t.loop_a'] == 2 and r['view']['vars']['laps'] == 2)
check('조건 만족 → 출구만', [c['node'] for c in r['view']['candidates']] == ['t.exit'])
r = play('도착')
check('명시적 종료', r['view']['end_reason'] == 'goal')
check('복습(review) 재방문은 첫 시도 통계 제외', r['view']['questions'] == 7)

lesson.load(bc, 'rbc_branch')
for word in ['출발', '분기점', '오른쪽']:
    play(word)
check('오른쪽 분기 → 진행률은 그 경로 기준', lesson.view()['progress'] == round(3 / (3 + 1), 3))

# ---------- 초기화 ----------
lesson.reset()
check('초기화 후 이전 이동 결과 무시', lesson.arrived('arrived')['result'] == 'ignored' and lesson.view()['current'] == None)

print('')
print('결과: {}개 통과, {}개 실패'.format(passed, failed))
if failed > 0:
    sys.exit(1)
