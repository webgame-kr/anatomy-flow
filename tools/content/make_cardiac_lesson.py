# 심장주기 학습 콘텐츠 생성 (개발 도구, 수업 범위 밖). 결과: content/lessons/cardiac-cycle/cardiac-cycle.json
# 단계 구분과 판막 상태는 HA6 p5 그림(5단계), 교재 p614를 따른다. 문장은 직접 작성했다.
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ANIM = json.load(open(os.path.join(HERE, '..', '..', 'content', 'animations', 'cardiac-concept.json'), encoding='utf-8'))
PH = {p['phase_key']: p for p in ANIM['phases']}
ALL_CLOSED = {'valve.tricuspid': 'CLOSED', 'valve.mitral': 'CLOSED', 'valve.pulmonary': 'CLOSED', 'valve.aortic': 'CLOSED'}


def phase_vars(key, label):
    p = PH[key]
    return [{'type': 'set_variable', 'var': 'phase', 'value': label},
            {'type': 'set_variable', 'var': 'atria', 'value': p['atria']},
            {'type': 'set_variable', 'var': 'ventricles', 'value': p['ventricles']},
            {'type': 'set_variable', 'var': 'av_valves', 'value': p['av_valves']},
            {'type': 'set_variable', 'var': 'semilunar_valves', 'value': p['semilunar_valves']},
            {'type': 'set_variable', 'var': 'flow', 'value': p['flow']}]


def lc(status, refs, unconfirmed=None):
    return {'status': status, 'refs': refs, 'unconfirmed': unconfirmed or [], 'date': '2026-11-28'}


nodes = [
 {'node_id': 'n.cc.start', 'name_ko': '심장주기', 'name_en': 'cardiac cycle',
  'accepted_answers': ['심장주기', '심장 주기', 'cardiac cycle'],
  'prompt': '심장이 한 번 뛰는 동안 심방과 심실이 수축·이완하고 판막이 열리고 닫히는 한 바퀴의 변화를 무엇이라고 하나요?',
  'reason_prompt': '수축기와 이완기(확장기)를 합쳐 한 번의 박동을 이루는 반복 단위는?',
  'explanation': '심장주기는 심실이 수축하는 수축기와 이완하는 이완기(확장기)로 나뉩니다. 이 학습은 강의자료의 5단계 구분을 따라 심실 충만에서 시작합니다. 모델은 직접 만든 개념 모델이며, 단계 시간은 교육용 값입니다.',
  'hint': '심장 + 주기', 'checkpoint_id': 'cp.cc.la', 'visual_state': ALL_CLOSED, 'verification_status': 'CONCEPT',
  'lecture_check': lc('MATCH', ['HA6 p5', '산소화요구 p7']),
  'events': [{'type': 'set_variable', 'var': 'phase', 'value': '시작 전'}]},
 {'node_id': 'n.cc.filling', 'name_ko': '심실 충만기 (후기 심실확장기)', 'name_en': 'ventricular filling',
  'accepted_answers': ['심실 충만기', '심실충만기', '후기 심실확장기', '후기심실확장기', '빠른 심실충만기', '느린 심실충만기', '급속 충만기', 'ventricular filling'],
  'prompt': '심실이 이완해 심실 압력이 심방보다 낮아지면 방실판막이 열리고 혈액이 심실로 들어옵니다. 이 단계는?',
  'reason_prompt': '심방 압력 > 심실 압력이 되었을 때 열리는 판막과 그때 일어나는 일은?',
  'explanation': '심실 압력이 심방보다 낮아지면 방실판막(삼첨판·승모판)이 압력 차이로 열리고, 혈액이 심방에서 심실로 들어옵니다. 반월판막은 닫혀 있습니다. 교재는 빠른 심실충만기와 느린 심실충만기로 나눕니다. 판막은 근육이 아니라 압력 차이로 열리고 닫히는 구조입니다.',
  'hint': '심실이 채워지는 시기', 'checkpoint_id': 'cp.cc.lv_fill', 'visual_state': PH['filling']['visual_state'], 'verification_status': 'CONCEPTUAL',
  'lecture_check': lc('MATCH', ['HA6 p5 그림 ⑤', '교재 p614']), 'events': phase_vars('filling', '심실 충만기')},
 {'node_id': 'n.cc.atrial', 'name_ko': '심방수축기', 'name_en': 'atrial systole',
  'accepted_answers': ['심방수축기', '심방 수축기', '심방수축', 'atrial systole'],
  'prompt': '이완기 마지막에 심방이 수축해 남은 혈액을 심실로 보냅니다. 이 단계는?',
  'reason_prompt': '방실판막이 아직 열려 있을 때 심실을 마지막으로 채우는 힘은 어디에서 오나요?',
  'explanation': '심방이 수축해 마지막 혈액을 심실로 보냅니다. 방실판막은 열려 있고 반월판막은 닫혀 있습니다. 이 단계 뒤 심실의 혈액량을 확장기말용적(EDV)이라고 하며 교재 그림에서는 약 120 mL입니다. 이때 들릴 수 있는 소리가 제4심음입니다.',
  'hint': '심방이 짜는 시기', 'checkpoint_id': 'cp.cc.lv', 'visual_state': PH['atrial_systole']['visual_state'], 'verification_status': 'CONCEPTUAL',
  'lecture_check': lc('MATCH', ['HA6 p5 그림 ①', 'HA6 p19', '교재 p614']), 'events': phase_vars('atrial_systole', '심방수축기')},
 {'node_id': 'n.cc.ivc', 'name_ko': '등용적 수축기 (전기 심실수축기)', 'name_en': 'isovolumetric contraction',
  'accepted_answers': ['등용적 수축기', '등용적수축기', '전기 심실수축기', '전기심실수축기', '등용적성 심실수축기', '등장성 수축기', '등장성수축기', 'isovolumetric contraction'],
  'prompt': '심실이 수축하기 시작해 심실 압력이 심방보다 높아지면 방실판막이 닫히지만, 아직 동맥보다 낮아 반월판막도 닫혀 있습니다. 이 단계는?',
  'reason_prompt': '모든 판막이 닫힌 채 심실 압력만 오르는 구간에서 심실 용적은 어떻게 되나요?',
  'explanation': '심실 압력이 심방보다 높아지면 방실판막이 닫힙니다(제1심음). 아직 동맥 압력보다 낮아 반월판막도 닫혀 있어, 네 판막이 모두 닫힌 채 용적은 그대로이고 압력만 오릅니다. 화면의 색 변화는 압력이 오르는 구간을 표시한 것이며 수치가 아닙니다. 기본간호학 자료는 이 구간을 "등장성"이라고 적습니다.',
  'hint': '용적이 같은 채 수축', 'checkpoint_id': 'cp.cc.lv', 'visual_state': PH['isovolumetric_contraction']['visual_state'], 'verification_status': 'CONCEPTUAL',
  'lecture_check': lc('PARTIAL', ['HA6 p5 그림 ②', 'HA6 p17', '산소화요구 p7'], ['교재의 수축기 하위 단계 이름(교재 p613 스캔 누락)']),
  'events': phase_vars('isovolumetric_contraction', '등용적 수축기')},
 {'node_id': 'n.cc.eject', 'name_ko': '심실 박출기 (후기 심실수축기)', 'name_en': 'ventricular ejection',
  'accepted_answers': ['심실 박출기', '심실박출기', '후기 심실수축기', '후기심실수축기', '급속 박출기', '박출기', 'ventricular ejection'],
  'prompt': '심실 압력이 대동맥·폐동맥줄기보다 높아지면 반월판막이 열리고 혈액이 동맥으로 나갑니다. 이 단계는?',
  'reason_prompt': '심실 압력 > 동맥 압력일 때 열리는 판막과 혈액의 방향은?',
  'explanation': '심실 압력이 동맥보다 높아지면 반월판막(폐동맥판·대동맥판)이 열리고 혈액이 대동맥과 폐동맥줄기로 나갑니다. 방실판막은 닫혀 있습니다. 한 번에 나가는 양이 일회박출량(SV)이며 교재 그림에서는 약 70 mL입니다.',
  'hint': '심실이 내보내는 시기', 'checkpoint_id': 'cp.cc.aorta', 'visual_state': PH['ejection']['visual_state'], 'verification_status': 'CONCEPTUAL',
  'lecture_check': lc('MATCH', ['HA6 p5 그림 ③', '교재 p614']), 'events': phase_vars('ejection', '심실 박출기')},
 {'node_id': 'n.cc.ivr', 'name_ko': '등용적 이완기 (전기 심실확장기)', 'name_en': 'isovolumetric relaxation',
  'accepted_answers': ['등용적 이완기', '등용적이완기', '전기 심실확장기', '전기심실확장기', '등용적성 심실확장기', '등장성 이완기', '등장성이완기', 'isovolumetric relaxation'],
  'prompt': '심실이 이완하기 시작해 심실 압력이 동맥보다 낮아지면 반월판막이 닫히지만, 아직 심방보다 높아 방실판막도 닫혀 있습니다. 이 단계는?',
  'reason_prompt': '반월판막이 닫힐 때 나는 심음과, 이때 심실 용적의 변화는?',
  'explanation': '심실 압력이 동맥보다 낮아지면 반월판막이 닫힙니다(제2심음). 아직 심방보다 높아 방실판막도 닫혀 있어 용적이 변하지 않습니다. 이때 남은 혈액량이 수축기말용적(ESV)이며 교재 그림에서는 약 50 mL입니다. 심실 압력이 심방보다 낮아지면 다시 충만기로 이어집니다.',
  'hint': '용적이 같은 채 이완', 'checkpoint_id': 'cp.cc.aorta', 'visual_state': PH['isovolumetric_relaxation']['visual_state'], 'verification_status': 'CONCEPTUAL',
  'lecture_check': lc('MATCH', ['HA6 p5 그림 ④', '교재 p614']), 'events': phase_vars('isovolumetric_relaxation', '등용적 이완기')},
]
order = ['n.cc.start', 'n.cc.filling', 'n.cc.atrial', 'n.cc.ivc', 'n.cc.eject', 'n.cc.ivr']
tl = {'n.cc.filling': 'cc.phase.filling', 'n.cc.atrial': 'cc.phase.atrial_systole', 'n.cc.ivc': 'cc.phase.isovolumetric_contraction',
      'n.cc.eject': 'cc.phase.ejection', 'n.cc.ivr': 'cc.phase.isovolumetric_relaxation'}
edges = []
for i in range(len(order) - 1):
    a, b = order[i], order[i + 1]
    edges.append({'edge_id': 'e.' + a.split('.')[-1] + '_' + b.split('.')[-1], 'source_node': a, 'target_node': b, 'transition_type': 'jump',
                  'checkpoint_id': '', 'timeline_id': tl[b], 'duration': 600})

doc = {'version': 2, 'id': 'cv.cardiac_cycle', 'content_version': '0.1.0', 'title': '심장주기: 판막과 심실의 다섯 단계', 'system': 'cardiovascular',
       'scene': {'type': 'anatomy', 'url': 'content/anatomy/cardiovascular/scene.json', 'animations': 'content/animations/cardiac-concept.json', 'start_scale': 'concept.cardiac'},
       'actor_id': 'rbc_01', 'start': 'n.cc.start', 'max_steps': 20, 'options': {'ignore_spaces': True},
       'variables': {'phase': '시작 전', 'atria': '-', 'ventricles': '-', 'av_valves': '-', 'semilunar_valves': '-', 'flow': '-'},
       'variable_labels': {'phase': '심장주기 단계', 'atria': '심방', 'ventricles': '심실', 'av_valves': '방실판막', 'semilunar_valves': '반월판막', 'flow': '혈액 이동'},
       'initial_visual_state': ALL_CLOSED,
       'verification_note': ('심장주기 개념 모델(CONCEPTUAL)이다. 원본 해부 모델(BodyParts3D)에는 심실 근육 벽·심실중격이 없고 판막 첨판도 움직일 수 없어 직접 만든 단순 형태로 보여 준다. '
                             '단계 구분과 판막 상태는 강의자료(HA6 p5 그림, 교재 p614)를 따랐지만, 모양·크기·단계 시간은 교육용 값이며 실제 압력·용적·혈류역학 계산이 아니다. '
                             '실제 모델 보기에서는 판막을 색으로만 표시한다.'),
       'lecture_check_note': 'lecture_check: 쪽 번호와 일치 여부만 적는다. HA6 건강사정 6장, 교재 성인간호학 상권.',
       'source': '직접 작성. 강의자료와 대조: HA6 p5·p17·p19, 교재 p614, 산소화요구 p7. 문장을 옮기지 않았다.',
       'complete': {'node': 'n.cc.ivr'}, 'nodes': nodes, 'edges': edges}
out = os.path.join(HERE, '..', '..', 'content', 'lessons', 'cardiac-cycle')
os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'cardiac-cycle.json'), 'w', encoding='utf-8').write(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print('nodes', len(nodes), 'edges', len(edges))
