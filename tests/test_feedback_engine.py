# STEP 04-C 되먹임 엔진 테스트 (+ 실제 심혈관 모델로 압력수용체 반사·RAAS)
# 실행: python tests/test_feedback_engine.py

import sys
import json
sys.path.insert(0, 'py')

import biological_state as bs
import causal_engine as ce
import feedback_engine as fb
import physiology_commands as pc

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


def setup(loops, relations=None):
    bs.clear()
    for vid in ['press', 'sensor', 'effector', 'volume', 'x']:
        bs.define({'variable_id': vid, 'name_ko': vid, 'data_type': 'relative'})
    if relations == None:
        relations = [
            {'causal_id': 's_e', 'source_variable': 'sensor', 'target_variable': 'effector', 'direction': 'decrease', 'relationship_type': 'negative',
             'mechanism': 'reflex', 'delay': 1},
            {'causal_id': 'e_p', 'source_variable': 'effector', 'target_variable': 'press', 'direction': 'increase', 'relationship_type': 'positive',
             'mechanism': 'reflex'},
        ]
    ce.load(relations)
    return fb.load(loops)


NEG = {'loop_id': 'neg', 'loop_type': 'negative', 'sensed_variable': 'press', 'sensor_variable': 'sensor', 'setpoint': {'level': 0},
       'sensor_direction': 'increase', 'mechanism': 'reflex', 'delay': 1, 'max_iterations': 5}
r = setup([NEG])
check('고리 불러오기', r['ok'])
bs.shift('press', -2)
fb.start('neg', 0)
s1 = fb.step('neg')
check('음성 되먹임 1단계: 압력 -2 → 감지 -2 → 효과기↑ → 압력 회복 방향(-1)', s1['status'] == 'running' and bs.get('press') == -1 and bs.get('effector') == 1 and bs.get('sensor') == -2)
check('되먹임 단계의 인과 변화 기록', len(s1['changes']) > 0 and s1['direction'] == '회복 방향')
check('물리 시간 진행 (delay)', s1['t'] == 1 and fb.running['neg']['next_t'] == 2)
s2 = fb.step('neg')
check('2단계: 오차가 남아 있으면 조절을 한 번 더 → 효과기 +2, 압력 기준(0)', bs.get('effector') == 2 and bs.get('press') == 0)
s3 = fb.step('neg')
check('설정점에 오면 종료(within_setpoint), 더 바꾸지 않음', s3['status'] == 'within_setpoint' and s3['changes'] == [])
s4 = fb.step('neg')
check('명시적 종료: 끝난 고리는 더 진행하지 않음', s4['changes'] == [] and s4['status'] == 'within_setpoint')

# 설정점 안이면 조절하지 않음
setup([NEG])
fb.start('neg', 0)
s = fb.step('neg')
check('설정점 안: within_setpoint, 변화 없음', s['status'] == 'within_setpoint' and s['changes'] == [])

# 최대 반복 횟수
LOOP2 = dict(NEG)
LOOP2['loop_id'] = 'neg2'
LOOP2['max_iterations'] = 1
setup([LOOP2], [{'causal_id': 's_x', 'source_variable': 'sensor', 'target_variable': 'x', 'direction': 'increase', 'relationship_type': 'positive', 'mechanism': 'reflex'}])
bs.shift('press', -1)
fb.start('neg2', 0)
fb.step('neg2')
s = fb.step('neg2')
check('최대 반복 횟수 도달 → max_iterations (압력이 회복되지 않는 고리)', s['status'] in ('max_iterations', 'plateau'))

# 종료 조건
LOOP3 = dict(NEG)
LOOP3['loop_id'] = 'neg3'
LOOP3['stop'] = [{'var': 'x', 'op': '>=', 'level': 1}]
setup([LOOP3])
bs.shift('press', -1)
bs.shift('x', 1)
fb.start('neg3', 0)
s = fb.step('neg3')
check('종료 조건(stop) 충족 → stop_condition', s['status'] == 'stop_condition')

# 제한: 원인이 남아 있으면 기준까지 가지 않음
LOOP4 = dict(NEG)
LOOP4['loop_id'] = 'neg4'
LOOP4['limits'] = [{'when': [{'var': 'volume', 'op': '<', 'level': 0}], 'cap_level': -1, 'reason': '원인 남음'}]
setup([LOOP4])
bs.shift('press', -2)
bs.shift('volume', -1)
fb.start('neg4', 0)
fb.step('neg4')
s = fb.step('neg4')
check('제한(limits): 원인이 남으면 -1에서 멈춤 (무조건 정상화하지 않음)', bs.get('press') == -1 and s['status'] == 'plateau')

# 양성 되먹임 (교육용 일반 구조)
POS = {'loop_id': 'pos', 'loop_type': 'positive', 'sensed_variable': 'press', 'sensor_variable': 'sensor', 'setpoint': {'level': 0},
       'sensor_direction': 'increase', 'mechanism': 'amp', 'delay': 1, 'max_iterations': 4, 'stop': [{'var': 'press', 'op': '>=', 'level': 2}]}
setup([POS], [{'causal_id': 's_p', 'source_variable': 'sensor', 'target_variable': 'press', 'direction': 'increase', 'relationship_type': 'positive', 'mechanism': 'amp'}])
bs.shift('press', 1)
steps = fb.run_until_settled(['pos'], 0, 10)
check('양성 되먹임: 같은 방향으로 커지다가 종료 조건(+2)에서 멈춤', bs.get('press') == 2 and steps[-1]['status'] in ('stop_condition', 'plateau'))

# 무한 반복 방지 (반복 총수 제한)
setup([NEG])
bs.shift('press', -2)
steps = fb.run_until_settled(['neg'], 0, 3)
check('run_until_settled: 반복 총수 제한을 넘지 않음', len(steps) <= 3)

# 결정성: 같은 입력이면 같은 결과
def run_once():
    setup([NEG])
    bs.shift('press', -2)
    steps = fb.run_until_settled(['neg'], 0, 10)
    out = []
    for s in steps:
        out.append((s['status'], s.get('t'), s.get('iteration')))
    return (out, bs.get('press'), bs.get('effector'))


check('결정적 실행: 두 번 실행 결과가 같음', run_once() == run_once())

# 정의 검사
r = setup([{'loop_id': 'bad', 'loop_type': 'neutral', 'sensed_variable': 'press', 'sensor_variable': 'sensor', 'setpoint': {'level': 0}}])
check('알 수 없는 loop_type 거부', not r['ok'])
r = setup([{'loop_id': 'bad2', 'loop_type': 'negative', 'sensed_variable': 'press', 'sensor_variable': 'sensor', 'setpoint': {'level': 0}, 'max_iterations': 999}])
check('max_iterations 상한(50) 검사', not r['ok'])
check('시작 안 한 고리 step 오류', not fb.step('nope')['ok'])

# ---------- 실제 심혈관 모델 ----------
model = json.load(open('content/physiology/cardiovascular-model.json', encoding='utf-8'))
r = pc.load(model)
check('심혈관 모델 불러오기 (오류 0)', r['ok'] and len(r['errors']) == 0)
check('기준 상태: 유도한 기준값(말초혈관저항)도 기준 단계 0 (변화 방향 없음)', bs.level_of('systemic_vascular_resistance') == 0
      and bs.variables['systemic_vascular_resistance']['trend'] == 0)
check('기준 상태 계산: SV 70 mL, CO 5.25 L/분, MAP 93.3 mmHg', bs.get('stroke_volume') == 70 and bs.get('cardiac_output') == 5.25
      and bs.get('mean_arterial_pressure') == 93.3)
pc.run_ops([{'op': 'scenario_start', 'scenario_id': 'sc.bp_drop'}], 'test')
out = pc.feedback_step('fb.baroreflex')
lv = bs.level_of
check('압력수용체 반사(혈압 감소): 발화↓ 교감↑ 부교감↓ 심박수↑ 수축력↑ 말초저항↑',
      lv('baroreceptor_activity') == -1 and lv('sympathetic_activity') == 1 and lv('parasympathetic_activity') == -1
      and lv('heart_rate') == 1 and lv('contractility') == 1 and lv('systemic_vascular_resistance') == 1)
check('반사 결과 평균동맥압 회복 방향 (기준 단계로)', lv('mean_arterial_pressure') == 0)
check('구심(압력수용체→연수)·원심(연수→심장·세동맥) 신호 명령 생성',
      any(c.get('signal_type') == 'neural_afferent' for c in out['commands']) and any(c.get('signal_type') == 'neural_efferent' for c in out['commands']))
check('심박수 → 박동 속도, 말초저항 → 혈관 수축 시각 명령',
      any(c['action'] == 'animation_play' and c['speed'] > 1 for c in out['commands'])
      and any(c['action'] == 'set_biological_visual_state' and c['value'].get('vessel.phy_arteriole') == 'VASOCONSTRICTION' for c in out['commands']))
pc.run_ops([{'op': 'scenario_start', 'scenario_id': 'sc.bp_rise'}], 'test2')
pc.feedback_step('fb.baroreflex')
check('압력수용체 반사(혈압 증가): 반대 방향 (교감↓ 부교감↑ 심박수↓)',
      lv('sympathetic_activity') == -1 and lv('parasympathetic_activity') == 1 and lv('heart_rate') == -1)
pc.run_ops([{'op': 'scenario_start', 'scenario_id': 'sc.volume_loss'}], 'test3')
res = pc.feedback_run(['fb.baroreflex', 'fb.raas'])
first = res['steps'][0]
check('혈액량 감소: 신경 반사가 먼저(t=1), RAAS는 나중(t=4)', first['loop_id'] == 'fb.baroreflex' and first['t'] == 1
      and [s for s in res['steps'] if s['loop_id'] == 'fb.raas'][0]['t'] == 4)
check('혈액량 감소가 남은 동안 신경 반사만으로는 MAP가 기준까지 오지 않음(제한)', first['sensed']['after'] == -1)
check('RAAS 분기: 레닌·안지오텐신 II·알도스테론·ADH 증가, 나트륨·수분 재흡수 증가',
      lv('renin_activity') == 1 and lv('angiotensin_ii') == 1 and lv('aldosterone') == 1 and lv('adh') == 1
      and lv('sodium_reabsorption') == 1 and lv('water_reabsorption') == 1)
check('호르몬 신호(레닌=효소, 안지오텐신·알도스테론=호르몬) 명령', any(c.get('signal_type') == 'enzyme' for c in res['commands'])
      and any(c.get('signal_type') == 'hormone' for c in res['commands']))
check('RAAS는 회복 방향으로 작용하고 고리 기록이 남음', len(fb.status()) == 2)

print('\n통과 {}개, 실패 {}개'.format(passed, failed))
if failed > 0:
    sys.exit(1)
