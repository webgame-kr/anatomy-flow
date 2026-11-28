# STEP 04-C 생리 상태 학습 통합 테스트 (정답 → 상태 변경 → 애니메이션 완료 → 확정 → 다음 문제)
# 실행: python tests/test_physiology_lesson.py

import sys
import json
sys.path.insert(0, 'py')

import lesson
import content_loader
import physiology_commands as pc
import biological_state as bs

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


model = read('content/physiology/cardiovascular-model.json')


def with_model(path):
    data = read(path)
    data['physiology_model'] = model
    return data


def play_all(data):
    # 정답을 차례로 입력하고 이동 결과로 arrived를 보낸다. 결과: (모두 진행?, 단계 수, 마지막 view)
    r = lesson.load(data, data['actor_id'])
    if not r['ok']:
        return (False, 0, r)
    steps = 0
    view = r['view']
    for i in range(len(data['nodes']) + 2):
        if view['phase'] == 'done':
            break
        cand = view['candidates'][0]
        out = lesson.submit(cand['answers'][0])
        if out['result'] != 'correct':
            return (False, steps, out)
        if out['edge'] != None:
            a = lesson.arrived('arrived')
            view = a['view']
        else:
            view = out['view']
        steps += 1
    return (view['phase'] == 'done', steps, view)


LESSONS = [('content/lessons/hemodynamics/hemodynamics.json', 'cv.hemodynamics'),
           ('content/lessons/baroreceptor-reflex/baroreceptor-reflex.json', 'cv.baroreflex'),
           ('content/lessons/raas/raas.json', 'cv.raas')]
for path, lid in LESSONS:
    data = with_model(path)
    v = content_loader.validate(content_loader.upgrade(data))
    check('{}: 콘텐츠 검증 통과'.format(lid), len(v['errors']) == 0)
    r = lesson.load(data, data['actor_id'])
    check('{}: 생리 모델과 함께 불러오기'.format(lid), r['ok'] and r.get('physiology') != None and len(r.get('physiology_commands', [])) > 0)
    done = play_all(with_model(path))
    check('{}: 정답으로 끝까지 진행 ({}단계)'.format(lid, done[1]), done[0])

# ---------- 혈역학 ----------
data = with_model('content/lessons/hemodynamics/hemodynamics.json')
r = lesson.load(data, data['actor_id'])
check('모니터는 콘텐츠가 고른 변수만', [x['variable_id'] for x in r['physiology']['vars']] == data['physiology']['monitor'])
view = r['view']
out = lesson.submit('심박출량')
check('시작 노드 정답 (이동 없음)', out['result'] == 'correct' and out['edge'] == None)
out = lesson.submit('일회박출량')
a = lesson.arrived('arrived')
out = lesson.submit('70')
check('계산 문제: SV = 70 mL 정답', out['result'] == 'correct')
lesson.arrived('arrived')
out = lesson.submit('5.24')
check('계산 문제: 틀린 값(5.24)은 오답', out['result'] == 'wrong')
out = lesson.submit('5.25')
lesson.arrived('arrived')
v = lesson.view()
cand = v['candidates'][0]
check('다음 문제의 숨김 변수(physiology_hide) 전달', cand['physiology_hide'] == ['cardiac_output'])
out = lesson.submit('7')
check('HR 100 계산 문제 정답 → 시각 명령(박동 속도) 포함', out['result'] == 'correct'
      and any(c['action'] == 'animation_play' and c['speed'] > 1.2 for c in out['commands']))
check('확정 전(pending) 상태: 심박수 100', bs.get('heart_rate') == 100 and pc.view()['pending'] == 1)
a = lesson.arrived('failed')
check('애니메이션 실패: 학습은 진행하지 않음', a['result'] == 'move_failed' and lesson.view()['phase'] == 'moving')
rec = lesson.recover('test')
check('복구: 생리 상태를 이전 정상 상태로 되돌림 (심박수 75)', bs.get('heart_rate') == 75 and rec['physiology']['pending'] == 0
      and len(rec['physiology_commands']) > 0)
out = lesson.submit('7')
check('복구 뒤 같은 문제를 다시 맞히면 다시 적용', out['result'] == 'correct' and bs.get('heart_rate') == 100)
a = lesson.arrived('arrived')
check('완료 후 확정 (pending 0, 학습 단계 증가)', a['result'] == 'arrived' and a['physiology']['pending'] == 0 and a['physiology']['time']['step'] >= 1)
a2 = lesson.arrived('arrived')
check('같은 도착이 두 번 오면 무시 (상태 중복 적용 없음)', a2['result'] == 'ignored' and bs.get('heart_rate') == 100)
out = lesson.submit('전부하')
lesson.arrived('arrived')
check('방향 문제 전에 기준 상태로 (다른 조건 일정)', bs.get('heart_rate') == 75)
before = bs.level_of('stroke_volume')
out = lesson.submit('감소')
check('방향 예측 오답(감소)은 상태를 바꾸지 않음', out['result'] == 'wrong' and bs.level_of('stroke_volume') == before)
out = lesson.submit('증가')
lesson.arrived('arrived')
check('정답(증가) → 정맥 환류↑ → 전부하↑ → SV↑ → CO↑', bs.level_of('preload') == 1 and bs.level_of('stroke_volume') == 1 and bs.level_of('cardiac_output') == 1)
lesson.submit('후부하')
lesson.arrived('arrived')
lesson.submit('감소')
lesson.arrived('arrived')
check('후부하↑ → SV↓, MAP는 미확정(MIXED: 저항↑·CO↓)', bs.level_of('stroke_volume') == -1 and bs.level_of('mean_arterial_pressure') == 'MIXED')
view = lesson.reset()
check('재시작: 생리 상태 기준값, 시각 명령 포함', bs.get('heart_rate') == 75 and bs.level_of('stroke_volume') == 0 and len(view['physiology_commands']) > 0)

# 자유 실험 문맥 (학습 상태와 분리)
r = lesson.physiology('state_set', ['heart_rate', 120])
check('학습 문맥에서는 직접 변경 불가', not r['ok'])
lesson.physiology('switch_context', ['experiment'])
r = lesson.physiology('state_set', ['heart_rate', 120])
check('자유 실험: HR 120 → CO 8.4 L/분', r['ok'] and bs.get('cardiac_output') == 8.4)
r = lesson.physiology('state_set', ['end_systolic_volume', 130])
check('자유 실험: ESV > EDV는 되돌리고 오류', not r['ok'] and bs.get('end_systolic_volume') == 50)
r = lesson.physiology('state_set', ['heart_rate', 170])
check('자유 실험: HR 170 → 역치 관계 경고(충만 감소)', r['ok'] and len(r.get('warnings', [])) == 1)
lesson.physiology('switch_context', ['mechanism'])
check('학습 문맥으로 돌아오면 학습 상태 그대로 (HR 75)', bs.get('heart_rate') == 75)
r = lesson.physiology('eval', ['1+1'])
check('허용되지 않은 명령 거부', not r['ok'])

# ---------- 압력수용체 반사 ----------
data = with_model('content/lessons/baroreceptor-reflex/baroreceptor-reflex.json')
r = lesson.load(data, data['actor_id'])
check('시작 시나리오: 혈압 감소', bs.level_of('mean_arterial_pressure') == -1)
lesson.submit('압력수용체')
out = lesson.submit('감소')
check('발화 감소 → 구심 신호 명령 (파란 신호)', any(c.get('signal_type') == 'neural_afferent' for c in out['commands']))
lesson.arrived('arrived')
lesson.submit('연수')
lesson.arrived('arrived')
out = lesson.submit('증가')
check('교감 증가 → 원심 신호 명령', any(c.get('signal_type') == 'neural_efferent' for c in out['commands']))
lesson.arrived('arrived')
check('단계 학습: 아직 심박수는 그대로 (원인 하나씩)', bs.level_of('heart_rate') == 0)
lesson.submit('감소')
lesson.arrived('arrived')
lesson.submit('증가')
lesson.arrived('arrived')
check('β1(+) · 무스카린 자극 감소 → 심박수·수축력 증가', bs.level_of('heart_rate') == 1 and bs.level_of('contractility') == 1)
lesson.submit('수축')
lesson.arrived('arrived')
check('α1 → 말초혈관저항 증가', bs.level_of('systemic_vascular_resistance') == 1)
lesson.submit('회복')
lesson.arrived('arrived')
check('혈압 회복 방향 (기준 단계)', bs.level_of('mean_arterial_pressure') == 0)
lesson.submit('음성되먹임')
lesson.arrived('arrived')
out = lesson.submit('감소')
check('혈압 증가 상황: 되먹임 한 단계(병렬 반응) → 심박수↓', out['result'] == 'correct' and bs.level_of('heart_rate') == -1 and bs.level_of('parasympathetic_activity') == 1)
a = lesson.arrived('arrived')
check('압력수용체 반사 완료', a['view']['phase'] == 'done')

# ---------- RAAS ----------
data = with_model('content/lessons/raas/raas.json')
r = lesson.load(data, data['actor_id'])
check('시작 시나리오: 혈액량 감소 → 혈압 감소', bs.level_of('blood_volume') == -1 and bs.level_of('mean_arterial_pressure') == -1)
lesson.submit('레닌')
out = lesson.submit('안지오텐신 I')
check('레닌(효소)·안지오텐신 I(호르몬) 신호', any(c.get('signal_type') == 'enzyme' for c in out['commands']) and any(c.get('signal_type') == 'hormone' for c in out['commands']))
lesson.arrived('arrived')
lesson.submit('ACE')
lesson.arrived('arrived')
lesson.submit('혈관수축')
lesson.arrived('arrived')
check('분기 a: AT1 → 말초혈관저항 증가', bs.level_of('systemic_vascular_resistance') == 1)
lesson.submit('알도스테론')
lesson.arrived('arrived')
lesson.submit('나트륨')
lesson.arrived('arrived')
check('분기 b: 알도스테론 → Na 재흡수 → 수분 재흡수', bs.level_of('sodium_reabsorption') == 1 and bs.level_of('water_reabsorption') == 1)
lesson.submit('ADH')
lesson.arrived('arrived')
lesson.submit('혈액량')
lesson.arrived('arrived')
check('체액 보유 → 혈액량·혈압 회복 방향', bs.level_of('blood_volume') == 0 and bs.level_of('mean_arterial_pressure') == 0)
lesson.submit('증가')
lesson.arrived('arrived')
lesson.submit('느리다')
a = lesson.arrived('arrived')
check('RAAS 완료', a['view']['phase'] == 'done')
rec = lesson.record({'session_id': 's', 'learning_mode': 'reasoning', 'start_time': 't0', 'end_time': 't1', 'active_seconds': 10, 'completion_status': 'completed'})
check('학습 기록에 생리 학습 문맥 표시', rec['physiology_context'] == 'mechanism' and rec['physiology_steps'] > 0)

# 자동 관찰 문맥 (학습 상태를 바꾸지 않음)
lesson.physiology('switch_context', ['observe'])
r = lesson.physiology('scenario_start', ['sc.volume_loss'])
r = lesson.physiology('feedback_run', [['fb.baroreflex', 'fb.raas']])
check('자동 관찰: 신경 반사 → RAAS 순서 실행', r['ok'] and len(r['commands']) > 0)
lesson.physiology('switch_context', ['mechanism'])
check('관찰 뒤 학습 상태 그대로 (완료 상태)', bs.level_of('blood_volume') == 0)

# 기존 콘텐츠는 생리 모델 없이 그대로
r = lesson.load(read('content/lessons/cardiovascular/blood-circulation.json'), 'rbc_01')
check('기존 혈액순환 콘텐츠: 생리 모델 없이 불러오기 (호환)', r['ok'] and r.get('physiology') == None)
bad = with_model('content/lessons/raas/raas.json')
bad['edges'][0]['physiology']['ops'][0]['changes'][0]['var'] = 'nope'
r = lesson.load(bad, bad['actor_id'])
check('Edge가 모델에 없는 변수를 가리키면 불러오지 않음', not r['ok'])
bad = read('content/lessons/raas/raas.json')
r = lesson.load(bad, bad['actor_id'])
check('physiology가 있는데 모델이 없으면 오류', not r['ok'])

print('\n통과 {}개, 실패 {}개'.format(passed, failed))
if failed > 0:
    sys.exit(1)
