# STEP 04-B 심장주기 콘텐츠·애니메이션 명령 테스트 (Python 규칙 쪽)
# 실행: python tests/test_cardiac_cycle.py
# 학습 판단(정답·다음 단계·도착)은 Python, 애니메이션 실행은 JS라는 역할 분리를 확인한다.

import sys
import json
sys.path.insert(0, 'py')

import lesson
import content_loader
import scene_commands
import motion_link

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


cc = read('content/lessons/cardiac-cycle/cardiac-cycle.json')
anim = read('content/animations/cardiac-concept.json')

# ---------- 콘텐츠 ----------
r = content_loader.validate(content_loader.upgrade(cc))
check('심장주기 콘텐츠 검증 통과', len(r['errors']) == 0)
timeline_ids = []
for t in anim['timelines']:
    timeline_ids.append(t['timeline_id'])
ok = True
for e in cc['edges']:
    if e.get('timeline_id') not in timeline_ids:
        ok = False
check('모든 Edge의 timeline_id가 애니메이션 데이터에 있음', ok)

# 단계 순서: HA6 p5 그림 ⑤ → ① → ② → ③ → ④
order = []
for n in cc['nodes']:
    order.append(n['node_id'])
check('단계 순서 (충만 → 심방수축 → 등용적 수축 → 박출 → 등용적 이완)',
      order == ['n.cc.start', 'n.cc.filling', 'n.cc.atrial', 'n.cc.ivc', 'n.cc.eject', 'n.cc.ivr'])

# 판막 상태표 (강의자료 그림 기준)
nodes = {}
for n in cc['nodes']:
    nodes[n['node_id']] = n
expect = {
    'n.cc.filling': ('OPEN', 'CLOSED'),
    'n.cc.atrial': ('OPEN', 'CLOSED'),
    'n.cc.ivc': ('CLOSED', 'CLOSED'),
    'n.cc.eject': ('CLOSED', 'OPEN'),
    'n.cc.ivr': ('CLOSED', 'CLOSED'),
}
ok = True
for nid in expect:
    vs = nodes[nid]['visual_state']
    av = expect[nid][0]
    sl = expect[nid][1]
    if vs['valve.tricuspid'] != av or vs['valve.mitral'] != av or vs['valve.pulmonary'] != sl or vs['valve.aortic'] != sl:
        ok = False
check('단계별 판막 상태: 방실판막·반월판막 (좌우 같은 단계)', ok)

# 타임라인이 판막을 지나 Actor를 옮기면, 그 단계에서 그 판막이 OPEN이어야 한다
phase_of = {}
for e in cc['edges']:
    phase_of[e['timeline_id']] = e['target_node']


def moves_through(steps, out):
    # 중첩 단계를 재귀 없이 스택으로 훑는다
    stack = list(steps)
    while len(stack) > 0:
        s = stack.pop()
        if s.get('type') == 'command' and 'through' in s:
            for v in s['through']:
                out.append(v)
        if 'steps' in s:
            for c in s['steps']:
                stack.append(c)


ok = True
count = 0
for t in anim['timelines']:
    if t['timeline_id'] not in phase_of:
        continue
    used = []
    moves_through(t['steps'], used)
    vs = nodes[phase_of[t['timeline_id']]]['visual_state']
    for v in used:
        count += 1
        if vs.get(v) != 'OPEN':
            ok = False
check('혈액 이동이 지나는 판막은 그 단계에서 OPEN ({}곳)'.format(count), ok and count == 5)

# 등용적 단계에는 판막을 지나는 이동이 없다
ok = True
for tid in ['cc.phase.isovolumetric_contraction', 'cc.phase.isovolumetric_relaxation']:
    for t in anim['timelines']:
        if t['timeline_id'] == tid:
            used = []
            moves_through(t['steps'], used)
            if len(used) > 0:
                ok = False
check('등용적 수축·이완에는 판막 통과 이동 없음', ok)

# ---------- 학습 진행 (정답 → 필수 타임라인 명령 → 도착) ----------
r = lesson.load(cc, 'rbc_01')
check('불러오기', r['ok'])
lesson.reset()
r = lesson.submit('심장주기')
check('시작 노드', r['result'] == 'correct' and r['view']['current'] == 'n.cc.start')
r = lesson.submit('심방수축기')
check('오답(순서가 다른 단계)은 진행하지 않음', r['result'] == 'wrong' and r['view']['current'] == 'n.cc.start')
r = lesson.submit('심실 충만기')
check('정답 → 이동 명령은 필수 타임라인 하나 (wait)', r['result'] == 'correct' and len(r['commands']) == 1 and
      r['commands'][0]['action'] == 'timeline_play' and r['commands'][0]['target'] == 'cc.phase.filling' and r['commands'][0]['wait'])
check('타임라인이 끝나기 전에는 다른 제출 불가', lesson.submit('심방수축기')['result'] != 'correct')
r = lesson.arrived('failed')
check('필수 애니메이션 실패 → 진행하지 않음(moving 유지)', r['result'] == 'move_failed' and r['view']['phase'] == 'moving' and r['view']['current'] == 'n.cc.start')
r = lesson.retry()
check('재시도: 같은 타임라인', r['ok'] and r['commands'][0]['target'] == 'cc.phase.filling')
r = lesson.arrived('cancelled')
r = lesson.recover('사용자 복구')
check('복구: 마지막 정상 노드의 위치·보이는 상태', r['view']['current'] == 'n.cc.start' and r['checkpoint_id'] == 'cp.cc.la' and
      r['visual_state']['valve.mitral'] == 'CLOSED')
lesson.submit('ventricular filling')
r = lesson.arrived('completed')
check('타임라인 완료 → 도착, 단계 변수', r['result'] == 'arrived' and r['view']['current'] == 'n.cc.filling' and r['view']['vars']['av_valves'] == '열림')
for word in ['심방수축기', '등장성 수축기', '후기 심실수축기']:
    lesson.submit(word)
    lesson.arrived('completed')
v = lesson.view()
check('동의어(등장성 수축기, 후기 심실수축기)로 진행', v['current'] == 'n.cc.eject' and v['vars']['semilunar_valves'] == '열림')
lesson.submit('등용적 이완기')
r = lesson.arrived('completed')
check('완료', r['view']['phase'] == 'done' and r['view']['vars']['av_valves'] == '닫힘' and r['view']['vars']['semilunar_valves'] == '닫힘')

# ---------- Python 애니메이션 명령 검사 ----------
info = {'animations': [], 'timelines': timeline_ids, 'structures': [], 'morph_objects': []}
for a in anim['animations']:
    info['animations'].append({'id': a['animation_id'], 'type': a['animation_type']})
for s in anim['structures']:
    info['structures'].append({'id': s['structure_id'], 'states': s['states']})
for g in anim['groups']:
    for o in g['objects']:
        if 'morphs' in o:
            info['morph_objects'].append(o['id'])
r = scene_commands.set_animations(info)
check('애니메이션 ID 목록 받기', r['animations'] == 22 and r['timelines'] == len(timeline_ids) and r['structures'] == 4)
V = scene_commands.validate
check('timeline_play 정상', V({'action': 'timeline_play', 'target': 'cc.phase.filling', 'wait': True}) == '')
check('없는 타임라인', V({'action': 'timeline_play', 'target': 'zz'}) != '')
check('animation_play 정상·속도 오류', V({'action': 'animation_play', 'target': 'cc.lv.contract'}) == '' and
      V({'action': 'animation_play', 'target': 'cc.lv.contract', 'speed': 0}) != '')
check('animation_set_weight 범위', V({'action': 'animation_set_weight', 'target': 'cc.lv.contract', 'value': 1.5}) != '')
check('morph_transition 정상·시간 오류', V({'action': 'morph_transition', 'target': 'cc.lv', 'morph': 'contract', 'value': 1, 'duration': 500}) == '' and
      V({'action': 'morph_transition', 'target': 'cc.lv', 'morph': 'contract', 'value': 1, 'duration': 0}) != '')
check('Morph 없는 객체', V({'action': 'morph_set_value', 'target': 'cc.aorta', 'morph': 'contract', 'value': 0.5}) != '')
check('구조 상태 정상·없는 상태', V({'action': 'set_biological_visual_state', 'value': {'valve.mitral': 'OPEN'}}) == '' and
      V({'action': 'set_biological_visual_state', 'value': {'valve.mitral': 'HALF'}}) != '')
check('scene 이벤트에 애니메이션 명령 사용 가능', 'animation_play' in content_loader.scene_actions() and 'timeline_play' in content_loader.scene_actions())

# 혈액순환 콘텐츠의 이동 명령에는 타임라인이 붙지 않는다 (기존 동작 유지)
motion_link.setup('rbc_01', {})
r = motion_link.to_motion([{'type': 'move', 'edge': 'e1', 'path': 'p', 'checkpoint': 'c', 'transition': 'move', 'duration': 500}])
check('타임라인 없는 Edge는 기존 이동 명령만', len(r['commands']) == 1 and r['commands'][0]['action'] == 'actor_move_to_checkpoint')

print('')
print('결과: {}개 통과, {}개 실패'.format(passed, failed))
if failed > 0:
    sys.exit(1)
