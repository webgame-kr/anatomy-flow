# STEP 04-C 학습 콘텐츠 생성기 (개발 도구 — 수업 범위 밖)
# 출력: content/lessons/hemodynamics/hemodynamics.json, content/lessons/baroreceptor-reflex/baroreceptor-reflex.json,
#       content/lessons/raas/raas.json, content/lessons/index.json(항목 추가)
# - 질문·설명은 이 프로젝트에서 직접 썼다. 강의 문장을 옮기지 않았다(쪽 번호만 적음).
# - 계산 문제의 정답은 생리 계산 엔진(py/formula_engine.py)으로 계산해 넣는다(콘텐츠와 엔진 값이 어긋나지 않게).
# - Edge의 physiology.ops = 정답 뒤 일어나는 생리 상태 변화. physiology_hide = 제출 전 상태 모니터가 숨길 변수(암기·추론 모드).
# 실행: python tools/content/make_physiology_lessons.py
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'py'))
import physiology_commands as pc  # noqa: E402
import biological_state as bs  # noqa: E402

MODEL_URL = 'content/physiology/cardiovascular-model.json'
model = json.load(open(os.path.join(ROOT, MODEL_URL), encoding='utf-8'))
assert pc.load(model)['ok']


def calc(sets):
    # 기준 상태에서 값 몇 개를 바꾼 뒤 계산한 결과
    pc.switch_context('experiment')
    pc.reset()
    for k in sets:
        pc.state_set(k, sets[k])
    out = {}
    for v in ('stroke_volume', 'ejection_fraction', 'cardiac_output', 'pulse_pressure', 'mean_arterial_pressure'):
        out[v] = bs.get(v)
    pc.switch_context('mechanism')
    return out


BASE = calc({})
FAST = calc({'heart_rate': 100})


def nums(x, units):
    vals = []
    text = ('{:.2f}'.format(x)).rstrip('0').rstrip('.')
    vals.append(text)
    for u in units:
        vals.append(text + u)
        vals.append(text + ' ' + u)
    return vals


INC = ['증가', '증가한다', '증가함', '늘어난다', '늘어남', '늘어나요', '상승', '상승한다', '커진다', '↑', '높아진다', 'increase', 'increases']
DEC = ['감소', '감소한다', '감소함', '줄어든다', '줄어듦', '줄어요', '하강', '떨어진다', '낮아진다', '작아진다', '↓', 'decrease', 'decreases']
SCENE = {'type': 'anatomy', 'url': 'content/anatomy/cardiovascular/scene.json', 'animations': 'content/animations/physiology-concept.json',
         'start_scale': 'concept.physiology'}


def N(nid, ko, en, answers, prompt, reason, explanation, hint, refs, status='MATCH', unconfirmed=None, review='review'):
    return {'node_id': nid, 'name_ko': ko, 'name_en': en, 'accepted_answers': answers, 'prompt': prompt, 'reason_prompt': reason,
            'explanation': explanation, 'hint': hint, 'verification_status': 'CONCEPTUAL', 'revisit': review,
            'lecture_check': {'status': status, 'refs': refs, 'unconfirmed': unconfirmed or [], 'date': '2026-11-29'}, 'events': []}


def E(eid, a, b, ops=None, hide=None):
    e = {'edge_id': eid, 'source_node': a, 'target_node': b, 'transition_type': 'jump', 'checkpoint_id': '', 'duration': 600}
    if ops:
        e['physiology'] = {'ops': ops}
    if hide:
        e['physiology_hide'] = hide
    return e


def causal(changes, mechanisms):
    return {'op': 'causal_apply', 'changes': changes, 'mechanisms': mechanisms}


def lesson(lid, title, system_note, nodes, edges, phys, source):
    return {
        'version': 2, 'id': lid, 'content_version': '0.1.0', 'title': title, 'system': 'cardiovascular', 'scene': SCENE,
        'actor_id': 'phy_sig_aff1', 'start': nodes[0]['node_id'], 'max_steps': 60, 'options': {'ignore_spaces': True},
        'variables': {}, 'variable_labels': {}, 'physiology': phys,
        'verification_note': '교육용 계산·단순화 모델과 개념 장면입니다. 실제 환자의 생리 반응을 예측하지 않습니다. ' + system_note,
        'lecture_check_note': 'lecture_check: 강의자료·교재 쪽 번호와 일치 여부만 적는다(내용 미전재).',
        'source': '직접 작성. ' + source, 'complete': {'node': nodes[-1]['node_id']}, 'nodes': nodes, 'edges': edges,
        'generator': 'tools/content/make_physiology_lessons.py',
    }


# =====================================================================
# 1) 혈압과 심박출량
# =====================================================================
HD_MON = ['heart_rate', 'end_diastolic_volume', 'end_systolic_volume', 'stroke_volume', 'cardiac_output', 'preload', 'afterload',
          'contractility', 'systemic_vascular_resistance', 'mean_arterial_pressure']
hd_nodes = [
    N('n.hd.co', '심박출량', 'cardiac output', ['심박출량', '심장박출량', 'co', 'cardiac output'],
      '좌심실이 1분 동안 대동맥으로 내보내는 혈액량을 무엇이라 할까요?', '심박수와 한 번에 내보내는 양을 곱한 값은?',
      '심박출량(CO) = 심박수(HR) × 일회박출량(SV). 교재는 정상 범위를 분당 약 4~8 L로 제시합니다.', '심장이 1분 동안 뿜어내는 양', ['교재 p614']),
    N('n.hd.sv', '일회박출량', 'stroke volume', ['일회박출량', '1회박출량', '일회 박출량', 'sv', 'stroke volume'],
      '심실이 한 번 수축할 때 내보내는 혈액량은?', '확장기말 용적에서 수축기말 용적을 뺀 양은?',
      'SV = 이완기말 용적(EDV) − 수축기말 용적(ESV). 교재 그림 15-7: EDV 120 mL, ESV 50 mL, SV 70 mL.', '한 번 박출하는 양', ['교재 p614 그림 15-7', '약리 10주 p9']),
    N('n.hd.calc_sv', 'SV 계산 70 mL', 'SV = 70 mL', nums(BASE['stroke_volume'], ['ml', 'mL']),
      '[계산] EDV 120 mL, ESV 50 mL일 때 일회박출량은 몇 mL일까요? (숫자만)', '[계산] SV = EDV − ESV',
      'SV = 120 − 50 = {} mL. 박출률 EF = SV ÷ EDV × 100 ≈ {}%.'.format(BASE['stroke_volume'], BASE['ejection_fraction']),
      'EDV − ESV', ['교재 p614 그림 15-7']),
    N('n.hd.calc_co', 'CO 계산 5.25 L/분', 'CO = 5.25 L/min', nums(BASE['cardiac_output'], ['l/분', 'L/분', 'l/min', 'L/min']),
      '[계산] 심박수 75회/분, 일회박출량 70 mL일 때 심박출량은 몇 L/분일까요? (소수 둘째 자리까지)', '[계산] CO = HR × SV, mL를 L로 바꾸기',
      '75 × 70 = 5,250 mL/분 = {} L/분. 단위를 mL에서 L로 바꾸려고 1000으로 나눕니다. (75회/분은 OpenStax 예시값이며 강의 수치가 아닙니다)'.format(BASE['cardiac_output']),
      '5,250 mL ÷ 1000', ['교재 p614'], status='PARTIAL', unconfirmed=['심박수 75회/분 예시값은 OpenStax(강의 미확인)']),
    N('n.hd.calc_hr', 'HR 100일 때 CO 7 L/분', 'CO = 7 L/min', nums(FAST['cardiac_output'], ['l/분', 'L/분', 'l/min', 'L/min']),
      '[계산] 다른 조건이 같고 심박수만 100회/분이 되면 심박출량은 몇 L/분일까요?', '[계산] SV가 그대로라는 가정에서 CO는?',
      '100 × 70 ÷ 1000 = {} L/분. "다른 조건이 같다"는 가정입니다. 실제로 심박수가 매우 빠르면 충만 시간이 줄어 SV가 줄 수 있습니다(OpenStax: 건강한 젊은 성인 약 160회/분 이상).'.format(FAST['cardiac_output']),
      'HR × SV', ['교재 p614']),
    N('n.hd.preload', '전부하', 'preload', ['전부하', 'preload'],
      '확장기말에 심실 근육이 늘어난 정도(이완기말 용적에 따라 달라짐)를 무엇이라 할까요?', '정맥 환류가 늘면 커지는, 수축 직전 심근의 신장 정도는?',
      '전부하는 확장기말 용적(EDV)에 따라 달라지며, 정맥 환류가 많을수록 커집니다.', '수축 전 늘어난 정도', ['약리 10주 p9', '교재 p615']),
    N('n.hd.dir_preload', '전부하↑ → SV 증가', 'preload up → SV up', INC,
      '[방향 예측] 다른 조건이 같을 때 정맥 환류가 늘어 전부하가 증가하면 일회박출량은? (증가/감소)', '[방향 예측] Frank-Starling 법칙: 더 늘어난 심근은?',
      'Frank-Starling 법칙: "어느 시점까지는" 더 많이 늘어날수록 더 강하게 수축해 일회박출량이 늘어납니다. 범위를 넘으면 이 모델은 결과를 미확정으로 둡니다.',
      'Frank-Starling', ['약리 10주 p9'], review='relearn'),
    N('n.hd.afterload', '후부하', 'afterload', ['후부하', 'afterload'],
      '심실이 혈액을 내보낼 때 이겨야 하는 저항(주로 말초혈관 저항)을 무엇이라 할까요?', '대동맥판을 열고 박출하려면 이겨야 하는 것은?',
      '후부하는 박출에 대한 저항입니다. 말초혈관 저항이 커지면 후부하가 커집니다.', '박출할 때의 저항', ['교재 p615', '약리 10주 p9']),
    N('n.hd.dir_afterload', '후부하↑ → SV 감소', 'afterload up → SV down', DEC,
      '[방향 예측] 다른 조건이 같을 때 말초혈관 저항이 커져 후부하가 증가하면 일회박출량은?', '[방향 예측] 저항이 커지면 박출되는 양은?',
      '후부하가 커지면 수축기말 용적이 늘고 일회박출량은 줄어듭니다. 이때 평균동맥압은 저항↑(올리는 쪽)과 심박출량↓(내리는 쪽)이 함께 작용해 이 모델에서는 "미확정(MIXED)"입니다. 혈관 지름만으로 혈압 변화를 설명할 수 없습니다.',
      '저항이 클수록', ['약리 10주 p8', '교재 p615'], review='relearn'),
    N('n.hd.contr', '심근수축력', 'contractility', ['심근수축력', '수축력', '심근 수축력', 'contractility'],
      '같은 전부하에서 심근이 수축하는 힘(교감신경 β1 자극으로 커짐)은?', 'β1 수용체가 자극되면 커지는 심장의 성질은?',
      '심근수축력이 커지면 같은 전부하에서도 더 많이 박출합니다(약리 10주 p8, 자율신경 수용체 표의 β1).', '수축하는 힘', ['약리 10주 p8', '자율신경 수용체 표']),
    N('n.hd.dir_contr', '수축력↑ → SV 증가', 'contractility up → SV up', INC,
      '[방향 예측] 다른 조건이 같을 때 수축력이 증가하면 일회박출량은?', '[방향 예측] 더 강하게 수축하면 남는 혈액(ESV)은 줄고, SV는?',
      '수축력↑ → 수축기말 용적↓ → 일회박출량↑ → 심박출량↑.', '더 세게 짜면', ['약리 10주 p8'], review='relearn'),
    N('n.hd.map_rel', '말초혈관저항', 'systemic vascular resistance', ['말초혈관저항', '총말초저항', '말초저항', '말초 혈관 저항', '혈관저항', 'tpr', 'svr'],
      '평균동맥압(MAP)은 심박출량과 무엇의 곱으로 나타낼까요? (MAP = CO × ?)', '심박출량이 같을 때 MAP를 바꾸는 혈관 쪽 요인은?',
      'MAP = CO × TPR(총 말초저항). 중심정맥압을 무시한 교육용 식이며, 이 식만으로 수축기·이완기 혈압이 정해지지는 않습니다.', '혈관 쪽 저항', ['14주 p4', '기본간호학 활력징후']),
    N('n.hd.calc_map', 'MAP 추정 93.3 mmHg', 'MAP estimate 93.3', nums(BASE['mean_arterial_pressure'], ['mmhg', 'mmHg']),
      '[계산] 혈압 120/80 mmHg일 때 평균동맥압 추정값(DBP + 맥압/3)은? (소수 첫째 자리)', '[계산] 맥압 = 120 − 80, MAP ≈ 80 + 맥압/3',
      '80 + 40/3 ≈ {} mmHg. 강의 정상 범위 70–100 mmHg 안입니다. 이것은 근사식이며, 혈압 120/80은 OpenStax 예시값입니다.'.format(BASE['mean_arterial_pressure']),
      'DBP + (SBP − DBP)/3', ['14주 p4', '기본간호학 활력징후'], status='PARTIAL', unconfirmed=['혈압 120/80 예시값은 OpenStax']),
]
BASELINE = {'op': 'scenario_start', 'scenario_id': 'sc.baseline'}
hd_edges = [
    E('e.hd.1', 'n.hd.co', 'n.hd.sv'),
    E('e.hd.2', 'n.hd.sv', 'n.hd.calc_sv', hide=['stroke_volume']),
    E('e.hd.3', 'n.hd.calc_sv', 'n.hd.calc_co', hide=['cardiac_output']),
    E('e.hd.4', 'n.hd.calc_co', 'n.hd.calc_hr', [{'op': 'state_set', 'var': 'heart_rate', 'value': 100}], hide=['cardiac_output']),
    E('e.hd.5', 'n.hd.calc_hr', 'n.hd.preload', [BASELINE]),
    E('e.hd.6', 'n.hd.preload', 'n.hd.dir_preload', [causal([{'var': 'venous_return', 'delta': 1}], ['core'])],
      hide=['end_diastolic_volume', 'preload', 'stroke_volume', 'cardiac_output', 'mean_arterial_pressure']),
    E('e.hd.7', 'n.hd.dir_preload', 'n.hd.afterload', [BASELINE]),
    E('e.hd.8', 'n.hd.afterload', 'n.hd.dir_afterload', [causal([{'var': 'systemic_vascular_resistance', 'delta': 1}], ['core'])],
      hide=['afterload', 'stroke_volume', 'cardiac_output', 'mean_arterial_pressure']),
    E('e.hd.9', 'n.hd.dir_afterload', 'n.hd.contr', [BASELINE]),
    E('e.hd.10', 'n.hd.contr', 'n.hd.dir_contr', [causal([{'var': 'contractility', 'delta': 1}], ['core'])],
      hide=['stroke_volume', 'cardiac_output', 'mean_arterial_pressure']),
    E('e.hd.11', 'n.hd.dir_contr', 'n.hd.map_rel', [BASELINE]),
    E('e.hd.12', 'n.hd.map_rel', 'n.hd.calc_map', hide=['mean_arterial_pressure']),
]
hd = lesson('cv.hemodynamics', '혈압과 심박출량: 계산과 방향 예측 (생리 상태 엔진)',
            '계산 문제의 값(EDV 120·ESV 50 mL)은 교재 그림, 심박수 75회/분과 혈압 120/80 mmHg는 공개 참고자료(OpenStax) 예시값입니다. 방향 문제는 "다른 조건이 같다"는 가정입니다.',
            hd_nodes, hd_edges,
            {'model': MODEL_URL, 'context': 'mechanism', 'scenario': 'sc.baseline', 'monitor': HD_MON,
             'graph': ['heart_rate', 'cardiac_output', 'mean_arterial_pressure', 'systemic_vascular_resistance'],
             'experiment': {'inputs': ['heart_rate', 'end_diastolic_volume', 'end_systolic_volume', 'systolic_bp', 'diastolic_bp', 'systemic_vascular_resistance'],
                            'outputs': ['stroke_volume', 'ejection_fraction', 'cardiac_output', 'pulse_pressure', 'mean_arterial_pressure'],
                            'note': '자유 실험: 바꾼 값 하나만 다르고 나머지 조건은 일정하다고 가정합니다. 실제 몸에서는 여러 변수가 함께 바뀝니다.'},
             'mechanism_note': '기전 학습: 정답을 맞힐 때마다 해당 원인 하나를 적용하고, 매 방향 문제 전에 기준 상태로 되돌립니다("다른 조건이 같다").'},
            '교재 p614–615, 약리 10주 p8–9, 14주 p4, 기본간호학 활력징후, 자율신경 수용체 표 대조. 일부 예시값은 OpenStax A&P 2e 19.4, 20.2.')

# =====================================================================
# 2) 압력수용체 반사
# =====================================================================
BR_MON = ['mean_arterial_pressure', 'baroreceptor_activity', 'sympathetic_activity', 'parasympathetic_activity', 'heart_rate', 'contractility',
          'systemic_vascular_resistance', 'cardiac_output']
br_nodes = [
    N('n.br.receptor', '압력수용체', 'baroreceptor', ['압력수용체', '압수용체', '압력 수용체', 'baroreceptor', '압수용기'],
      '혈관 벽이 늘어나는 정도(신장)를 감지해 혈압 정보를 보내는 수용체는?', '목동맥팽대와 대동맥동에 있는 신장 수용체는?',
      '압력수용체는 주로 대동맥동(대동맥판 바로 위 오름대동맥 벽)과 목동맥팽대(속목동맥 시작부)에 있습니다. 대정맥·우심방 벽에도 저압 수용체가 있습니다.',
      '늘어남을 감지', ['14주 p7']),
    N('n.br.firing', '발화 감소', 'firing decreases', DEC,
      '[방향 예측] 혈압이 떨어지면 압력수용체의 발화(활동전위 빈도)는?', '[방향 예측] 혈관 벽이 덜 늘어나면 발화 빈도는?',
      '혈압이 낮아지면 벽이 덜 늘어나 발화 빈도가 줄어듭니다. 이 신호는 구심 신경을 따라 숨뇌로 갑니다(화면의 파란 신호).', '덜 늘어나면', ['14주 p7–8'],
      review='relearn'),
    N('n.br.center', '숨뇌(연수)', 'medulla oblongata', ['숨뇌', '연수', '심혈관중추', '심혈관 중추', '숨뇌 심혈관 중추', 'medulla', 'medulla oblongata'],
      '압력수용체의 구심 신호를 받아 심장과 혈관을 조절하는 중추가 있는 곳은?', '혈압과 혈류를 신경으로 조절하는 뇌줄기 부위는?',
      '숨뇌(연수)의 심혈관 중추가 교감·부교감 출력을 조절합니다.', '뇌줄기 아래쪽', ['14주 p5']),
    N('n.br.symp', '교감 증가', 'sympathetic up', INC,
      '[방향 예측] 발화가 줄면 숨뇌에서 교감신경 출력은?', '[방향 예측] 혈압을 올려야 할 때 교감신경은?',
      '혈압이 낮으면 교감신경 활성이 증가합니다(화면의 주황 원심 신호). 실제로는 다음 단계들이 동시에 일어납니다.', '혈압을 올리는 쪽', ['14주 p8–9', 'OpenStax 20.4'],
      review='relearn'),
    N('n.br.para', '부교감 감소', 'parasympathetic down', DEC,
      '[방향 예측] 같은 상황에서 미주신경(부교감) 출력은?', '[방향 예측] 심박수를 늦추는 신경은 어떻게?',
      '부교감(미주신경) 활성은 감소합니다. 교감↑·부교감↓가 함께 작용합니다(병렬).', '심박수를 늦추는 신경', ['14주 p8–9']),
    N('n.br.b1', '심박수·수축력 증가', 'HR and contractility up', INC,
      '[방향 예측] 교감신경이 심장의 β1 수용체를 자극하면 심박수와 수축력은?', '[방향 예측] β1 자극의 심장 효과는?',
      'β1: 심박수·수축력·방실결절 전도 증가 → 심박출량 증가(자율신경 수용체 표). 부교감 감소로 무스카린 수용체 자극이 줄어든 것도 심박수를 올리는 쪽입니다.',
      'β1', ['자율신경 수용체 표']),
    N('n.br.a1', '혈관 수축', 'vasoconstriction', ['수축', '혈관수축', '혈관 수축', '좁아진다', '좁아짐', '수축한다', 'vasoconstriction'],
      '교감신경이 세동맥의 α1 수용체를 자극하면 혈관은?', 'α1 수용체의 혈관 효과는?',
      'α1: 피부·내장·골격근·신장 혈관 수축 → 말초혈관 저항 증가 → 혈압 상승 쪽.', 'α1', ['자율신경 수용체 표', '14주 p6']),
    N('n.br.map', '혈압 회복 방향', 'BP toward recovery', INC + ['회복', '회복된다', '회복 방향', '올라간다'],
      '[방향 예측] 심박출량과 말초혈관 저항이 늘면 평균동맥압은 어느 방향으로 작용할까요?', '[방향 예측] MAP = CO × TPR에서 둘 다 늘면?',
      'MAP = CO × TPR이므로 혈압을 올리는(회복시키는) 방향으로 작용합니다. "회복 방향으로 작용"은 실제로 항상 정상으로 돌아간다는 뜻이 아닙니다.',
      'MAP = CO × TPR', ['14주 p4, p9']),
    N('n.br.negfb', '음성 되먹임', 'negative feedback', ['음성되먹임', '음성 되먹임', '음성피드백', '음성 피드백', '네거티브 피드백', 'negative feedback'],
      '결과(혈압 회복)가 처음 변화(혈압 감소)를 줄이는 방향으로 작용하는 조절 방식은?', '변화를 되돌리는 방향의 조절 고리는?',
      '압력수용체 반사는 음성 되먹임입니다. 신경 조절이라 빠르게(초 단위) 일어납니다.', '되돌리는 고리', ['14주 p9, p15']),
    N('n.br.rise', '혈압 증가 → 심박수 감소', 'BP rise → HR down', DEC,
      '[방향 예측] 이번에는 혈압이 올랐습니다. 압력수용체 반사가 한 번 작동하면 심박수는?', '[방향 예측] 발화↑ → 부교감↑·교감↓이면 심박수는?',
      '혈압↑ → 발화↑ → 부교감↑·교감↓ → 심박수·심박출량↓, 세동맥 확장 → 혈압을 낮추는 방향. 이 단계는 되먹임 엔진이 반사 전체를 한 번에(병렬로) 계산한 결과입니다.',
      '반대 방향', ['14주 p8', 'OpenStax 20.4'], review='relearn'),
]
none_mech = ['_step']
br_edges = [
    E('e.br.1', 'n.br.receptor', 'n.br.firing', [causal([{'var': 'baroreceptor_activity', 'delta': -1}], none_mech)], hide=['baroreceptor_activity']),
    E('e.br.2', 'n.br.firing', 'n.br.center'),
    E('e.br.3', 'n.br.center', 'n.br.symp', [causal([{'var': 'sympathetic_activity', 'delta': 1}], none_mech)], hide=['sympathetic_activity']),
    E('e.br.4', 'n.br.symp', 'n.br.para', [causal([{'var': 'parasympathetic_activity', 'delta': -1}], none_mech)], hide=['parasympathetic_activity']),
    E('e.br.5', 'n.br.para', 'n.br.b1', [causal([{'var': 'beta1_heart', 'delta': 1}, {'var': 'm2_heart', 'delta': -1}], ['ans'])],
      hide=['heart_rate', 'contractility']),
    E('e.br.6', 'n.br.b1', 'n.br.a1', [causal([{'var': 'alpha1_vessel', 'delta': 1}], ['ans'])], hide=['systemic_vascular_resistance']),
    E('e.br.7', 'n.br.a1', 'n.br.map', [causal([{'var': 'heart_rate', 'delta': 0}, {'var': 'cardiac_output', 'delta': 1}], ['core'])],
      hide=['cardiac_output', 'mean_arterial_pressure']),
    E('e.br.8', 'n.br.map', 'n.br.negfb'),
    E('e.br.9', 'n.br.negfb', 'n.br.rise', [{'op': 'scenario_start', 'scenario_id': 'sc.bp_rise'}, {'op': 'feedback_step', 'loop_id': 'fb.baroreflex'}],
      hide=['heart_rate', 'sympathetic_activity', 'parasympathetic_activity', 'baroreceptor_activity', 'cardiac_output', 'mean_arterial_pressure']),
]
br = lesson('cv.baroreflex', '압력수용체 반사: 혈압 감소와 증가 (생리 상태 엔진)',
            '신경 경로는 개념 장면의 표시용 선이며 실제 신경 주행이 아닙니다. 문제는 학습을 위해 순서대로 묻지만 실제 반응은 동시에(병렬로) 일어납니다.',
            br_nodes, br_edges,
            {'model': MODEL_URL, 'context': 'mechanism', 'scenario': 'sc.bp_drop', 'monitor': BR_MON,
             'graph': ['mean_arterial_pressure', 'heart_rate', 'systemic_vascular_resistance', 'sympathetic_activity'],
             'observe': {'scenarios': ['sc.bp_drop', 'sc.bp_rise'], 'loops': ['fb.baroreflex']},
             'mechanism_note': '구심(압력수용체→숨뇌)과 원심(숨뇌→심장·세동맥) 신호를 색으로 구분합니다. 문제 순서는 학습용이며 실제 반응은 병렬입니다.'},
            '14주 p5–9, p15, 자율신경 수용체 표 대조. 보조: OpenStax A&P 2e 20.4.')

# =====================================================================
# 3) RAAS
# =====================================================================
RA_MON = ['mean_arterial_pressure', 'blood_volume', 'renin_activity', 'angiotensin_i', 'angiotensin_ii', 'aldosterone', 'adh',
          'sodium_reabsorption', 'water_reabsorption', 'systemic_vascular_resistance']
ra_nodes = [
    N('n.ra.renin', '레닌', 'renin', ['레닌', 'renin'],
      '혈압·혈액량이 줄면 신장의 사구체옆세포가 혈액으로 분비하는 효소는?', '신장 관류가 줄 때 RAAS를 시작하는 물질은?',
      '혈압이 낮아지면 사구체옆세포(JG 세포)가 레닌을 분비합니다. 교감신경의 신장 β1 자극도 레닌 분비를 늘립니다(수용체 표). 레닌은 효소입니다(일부에서는 호르몬으로 분류).',
      '사구체옆세포', ['14주 p11', '자율신경 수용체 표']),
    N('n.ra.ang1', '안지오텐신 I', 'angiotensin I', ['안지오텐신i', '안지오텐신1', '안지오텐신 i', '안지오텐신 1', '앤지오텐신1', 'angiotensin i', 'angiotensin 1'],
      '레닌이 간에서 만들어진 안지오텐시노겐을 바꾸어 생기는 물질은?', '안지오텐시노겐에 레닌이 작용한 결과물은?',
      '레닌은 간에서 만든 혈장 단백질 안지오텐시노겐을 안지오텐신 I로 바꿉니다.', '첫 번째 안지오텐신', ['14주 p11']),
    N('n.ra.ace', 'ACE', 'angiotensin-converting enzyme', ['ace', '안지오텐신전환효소', '안지오텐신 전환효소', '안지오텐신 전환 효소', 'angiotensin converting enzyme'],
      '안지오텐신 I을 안지오텐신 II로 바꾸는 효소는?', '폐 혈관에 특히 풍부한 전환 효소는?',
      'ACE(안지오텐신 전환효소). 폐 혈관계통에 특히 풍부하지만 다른 혈관 내부에도 있습니다(약리 9주). "폐에만 있다"가 아닙니다.', '전환 효소', ['14주 p11', '약리 9주 p9']),
    N('n.ra.vaso', '혈관 수축', 'vasoconstriction', ['수축', '혈관수축', '혈관 수축', '좁아진다', '수축한다', 'vasoconstriction'],
      '[분기 a] 안지오텐신 II가 세동맥에 직접 작용하면 혈관은?', '[분기 a] 강력한 혈관 수축제인 안지오텐신 II의 직접 작용은?',
      '안지오텐신 II는 강력한 혈관 수축제입니다(AT1 수용체: 강의는 혈관·심장). 말초혈관 저항↑ → 혈압 상승 쪽. 이 분기는 알도스테론 분기와 병렬로 일어납니다.',
      '직접 작용', ['14주 p11', '약리 9주 p9, p24']),
    N('n.ra.aldo', '알도스테론', 'aldosterone', ['알도스테론', 'aldosterone'],
      '[분기 b] 안지오텐신 II가 부신피질에서 분비를 늘리는 호르몬은?', '[분기 b] 부신피질의 무기질코르티코이드는?',
      '안지오텐신 II는 부신피질의 알도스테론 분비를 자극합니다. 호르몬 작용이라 신경 반사보다 느립니다.', '부신피질 호르몬', ['14주 p11', '약리 9주 p9']),
    N('n.ra.na', '나트륨', 'sodium', ['나트륨', '소듐', 'na', 'na+', '나트륨이온', 'sodium'],
      '알도스테론이 원위세뇨관·집합관에서 재흡수를 늘리는 이온은?', '알도스테론이 늘리면 물도 따라가는 이온은?',
      '알도스테론은 원위세뇨관의 Na⁺ 재흡수를 늘리고 K⁺ 배설을 늘립니다(내분비 강의). 물이 Na⁺를 따라 재흡수됩니다.', 'Na⁺', ['14주 p11', '내분비 생리 슬라이드 46']),
    N('n.ra.adh', 'ADH', 'antidiuretic hormone', ['adh', '항이뇨호르몬', '항이뇨 호르몬', '바소프레신', 'vasopressin'],
      '[분기 c] 안지오텐신 II가 분비를 늘리는, 뇌하수체 후엽에서 나와 집합관 수분 재흡수를 늘리는 호르몬은?', '[분기 c] 삼투압 증가·혈액량 감소로도 분비되는 호르몬은?',
      'ADH(바소프레신)는 뇌하수체 후엽에서 분비되어 집합관의 수분 투과도를 높입니다. 분비 자극: 혈장 삼투압 증가, 혈액량 감소(신장 강의). 말초 혈관 수축 작용도 있습니다. 안지오텐신 II는 갈증도 자극합니다.',
      '뇌하수체 후엽', ['14주 p10–11', '신장 강의 슬라이드 50']),
    N('n.ra.volume', '혈액량 증가', 'blood volume up', ['혈액량', '체액량', '순환혈액량', '혈액량증가', '혈액량 증가', '체액량 증가', 'blood volume'],
      '나트륨·수분 재흡수가 늘면 어떤 양이 늘어나 혈압을 올릴까요?', '신장이 물을 붙잡으면 늘어나는 것은?',
      '수분 보유 → 혈액량 증가 → 정맥 환류·전부하 증가 → 일회박출량·심박출량 증가 → 혈압 회복 방향. 이 모델은 한 단계 회복으로 단순화했습니다. 실제 회복 정도와 시간은 원인과 처치에 따라 다릅니다.',
      '체액', ['14주 p11', '약리 9주 p4']),
    N('n.ra.bp', '혈압 회복 방향', 'BP toward recovery', INC + ['회복', '회복된다', '회복 방향', '올라간다'],
      '[방향 예측] 혈관 수축과 혈액량 증가가 함께 작용하면 혈압은 어느 방향으로?', '[방향 예측] 저항↑와 심박출량↑이면 MAP는?',
      '두 분기 모두 혈압을 올리는(회복시키는) 방향입니다. 혈압이 회복되면 레닌 분비가 줄어드는 음성 되먹임입니다. ANP는 반대로 작용합니다(이 모델에는 넣지 않음).',
      '두 분기 모두', ['14주 p11–14']),
    N('n.ra.speed', '느리다', 'slower', ['느리다', '느림', '느린', '더느리다', '더 느리다', '느려요', 'slower', 'slow'],
      '압력수용체 반사(신경)와 비교하면 RAAS·체액량 조절은 더 빠를까요, 느릴까요?', '호르몬·신장을 거치는 조절의 속도는?',
      '내분비계는 신경계보다 혈압 변화에 반응하는 속도가 느립니다(약리 9주). 신경 반사는 단기, 신장·호르몬은 장기 기전입니다. 화면의 물리 시간은 교육용으로 압축했습니다.',
      '호르몬은', ['약리 9주 p4']),
]
step = ['_step']
ra_edges = [
    E('e.ra.1', 'n.ra.renin', 'n.ra.ang1', [causal([{'var': 'renal_perfusion', 'delta': -1}, {'var': 'renin_activity', 'delta': 1}], step),
                                            causal([{'var': 'angiotensin_i', 'delta': 1}], step)], hide=['angiotensin_i']),
    E('e.ra.2', 'n.ra.ang1', 'n.ra.ace', [causal([{'var': 'angiotensin_ii', 'delta': 1}], step)], hide=['angiotensin_ii']),
    E('e.ra.3', 'n.ra.ace', 'n.ra.vaso', [causal([{'var': 'at1_vessel', 'delta': 1}], ['raas'])], hide=['systemic_vascular_resistance']),
    E('e.ra.4', 'n.ra.vaso', 'n.ra.aldo', [causal([{'var': 'aldosterone', 'delta': 1}], step)], hide=['aldosterone']),
    E('e.ra.5', 'n.ra.aldo', 'n.ra.na', [causal([{'var': 'mr_tubule', 'delta': 1}, {'var': 'sodium_reabsorption', 'delta': 1},
                                                 {'var': 'water_reabsorption', 'delta': 1}], step)], hide=['sodium_reabsorption', 'water_reabsorption']),
    E('e.ra.6', 'n.ra.na', 'n.ra.adh', [causal([{'var': 'adh', 'delta': 1}], step)], hide=['adh']),
    E('e.ra.7', 'n.ra.adh', 'n.ra.volume', [causal([{'var': 'blood_volume', 'delta': 1}], ['core'])],
      hide=['blood_volume', 'mean_arterial_pressure', 'cardiac_output']),
    E('e.ra.8', 'n.ra.volume', 'n.ra.bp', hide=['mean_arterial_pressure']),
    E('e.ra.9', 'n.ra.bp', 'n.ra.speed'),
]
ra = lesson('cv.raas', 'RAAS: 레닌 → 안지오텐신 → 알도스테론·ADH (생리 상태 엔진)',
            '호르몬 입자는 표시용이며 실제 농도·개수·속도가 아닙니다. 분기 a(혈관)와 b(알도스테론)·c(ADH)는 실제로 병렬로 일어납니다.',
            ra_nodes, ra_edges,
            {'model': MODEL_URL, 'context': 'mechanism', 'scenario': 'sc.volume_loss', 'monitor': RA_MON,
             'graph': ['mean_arterial_pressure', 'renin_activity', 'aldosterone', 'blood_volume'],
             'observe': {'scenarios': ['sc.volume_loss', 'sc.dehydration'], 'loops': ['fb.baroreflex', 'fb.raas']},
             'mechanism_note': '혈액량 감소 상황에서 시작합니다. 자동 관찰에서는 빠른 신경 반사(t=1)와 느린 RAAS(t=4 이후)를 시간 순서로 비교합니다.'},
            '14주 p10–14, 약리 9주 p4·p9·p24, 신장 강의 슬라이드 35–39·50, 내분비 강의 슬라이드 46, 자율신경 수용체 표 대조. 보조: OpenStax A&P 2e 20.4.')

out_files = [('hemodynamics', 'hemodynamics.json', hd), ('baroreceptor-reflex', 'baroreceptor-reflex.json', br), ('raas', 'raas.json', ra)]
for folder, name, data in out_files:
    d = os.path.join(ROOT, 'content', 'lessons', folder)
    os.makedirs(d, exist_ok=True)
    json.dump(data, open(os.path.join(d, name), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
idx_path = os.path.join(ROOT, 'content', 'lessons', 'index.json')
text = open(idx_path, encoding='utf-8').read()
idx = json.loads(text)
have = set()
for l in idx['lessons']:
    have.add(l['id'])
add = [
    {'id': 'cv.hemodynamics', 'url': 'content/lessons/hemodynamics/hemodynamics.json', 'system': '심혈관계', 'title': '혈압과 심박출량: 계산과 방향 예측 (생리 상태)', 'kind': 'anatomy'},
    {'id': 'cv.baroreflex', 'url': 'content/lessons/baroreceptor-reflex/baroreceptor-reflex.json', 'system': '심혈관계', 'title': '압력수용체 반사 (생리 상태)', 'kind': 'anatomy'},
    {'id': 'cv.raas', 'url': 'content/lessons/raas/raas.json', 'system': '심혈관계·비뇨계', 'title': 'RAAS: 레닌-안지오텐신-알도스테론 (생리 상태)', 'kind': 'anatomy'},
]
new_lines = []
for a in add:
    if a['id'] not in have:
        new_lines.append('    ' + json.dumps(a, ensure_ascii=False))
if new_lines:
    pos = text.rfind('}\n  ]')
    text = text[:pos + 1] + ',\n' + ',\n'.join(new_lines) + text[pos + 1:]
    open(idx_path, 'w', encoding='utf-8').write(text)
json.loads(open(idx_path, encoding='utf-8').read())
print('WROTE lessons', [len(x[2]['nodes']) for x in out_files], 'index +', len(new_lines))
