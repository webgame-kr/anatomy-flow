# 미세 구조 개념 모델(GLB 3종)의 애니메이션·혈관 긴장도 상태 콘텐츠 생성기 (개발 도구, 수업 범위 밖)
# 출력: content/animations/micro-concepts.json  — Sandbox 장면 MA·MB·MC가 쓴다
# - 폐포·조직: GLB 내장 클립(반복). 적혈구 흐름·기체/물질 이동 표시. 개수·속도는 의미가 없다(교육용 표시).
# - 혈관 벽: Morph constrict/dilate로 BASELINE ↔ VASOCONSTRICTION ↔ VASODILATION (교육용 값, 실측 아님)
# 실행: python tools/content/make_micro_anim.py
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ALV = 'nf-micro-alveolus'
TIS = 'nf-micro-tissue-capillary'
VES = 'nf-micro-vessel-wall'
VROOT = VES + '/vessel_wall_concept'

anims = [
    {'animation_id': 'mc.alv.rbc_flow', 'target_id': ALV, 'animation_type': 'clip', 'clip_name': 'rbc_flow', 'loop': True, 'verification_status': 'CONCEPTUAL'},
    {'animation_id': 'mc.alv.gas', 'target_id': ALV, 'animation_type': 'clip', 'clip_name': 'gas_exchange', 'loop': True, 'verification_status': 'CONCEPTUAL',
     'notes': 'O₂(파랑): 폐포 공기 → 모세혈관, CO₂(주황): 모세혈관 → 폐포. 입자는 분자 크기·개수가 아니다.'},
    {'animation_id': 'mc.tis.rbc_flow', 'target_id': TIS, 'animation_type': 'clip', 'clip_name': 'rbc_flow', 'loop': True, 'verification_status': 'CONCEPTUAL'},
    {'animation_id': 'mc.tis.exchange', 'target_id': TIS, 'animation_type': 'clip', 'clip_name': 'tissue_exchange', 'loop': True, 'verification_status': 'CONCEPTUAL',
     'notes': 'O₂(파랑)·영양소(초록): 모세혈관 → 세포, CO₂(주황)·노폐물(보라): 세포 → 모세혈관.'},
]


def tone(aid, key, a, b, ms=600):
    anims.append({'animation_id': aid, 'target_id': VROOT, 'animation_type': 'morph', 'duration_ms': ms, 'easing': 'ease_in_out',
                  'keyframes': [{'time': 0, 'value': {k: v for k, v in a.items()}}, {'time': 1, 'value': {k: v for k, v in b.items()}}],
                  'restore_on_cancel': True, 'verification_status': 'CONCEPTUAL'})


Z = {'constrict': 0, 'dilate': 0}
C = {'constrict': 1, 'dilate': 0}
D = {'constrict': 0, 'dilate': 1}
tone('mc.ves.constrict', 'constrict', Z, C)
tone('mc.ves.dilate', 'dilate', Z, D)
tone('mc.ves.c_to_base', 'constrict', C, Z)
tone('mc.ves.d_to_base', 'dilate', D, Z)
tone('mc.ves.c_to_d', 'both', C, D, 900)
tone('mc.ves.d_to_c', 'both', D, C, 900)

structures = [{
    'structure_id': 'vessel.micro_wall_tone', 'name_ko': '혈관 긴장도 (개념 단면)', 'kind': 'vessel',
    'states': ['BASELINE', 'VASOCONSTRICTION', 'VASODILATION'], 'initial': 'BASELINE',
    'transitions': {'BASELINE->VASOCONSTRICTION': {'animation': 'mc.ves.constrict'}, 'BASELINE->VASODILATION': {'animation': 'mc.ves.dilate'},
                    'VASOCONSTRICTION->BASELINE': {'animation': 'mc.ves.c_to_base'}, 'VASODILATION->BASELINE': {'animation': 'mc.ves.d_to_base'},
                    'VASOCONSTRICTION->VASODILATION': {'animation': 'mc.ves.c_to_d'}, 'VASODILATION->VASOCONSTRICTION': {'animation': 'mc.ves.d_to_c'}},
    'indicators': [], 'verification_status': 'CONCEPTUAL',
    'notes': '중막 민무늬근이 수축하면 내강이 좁아지고 중막이 두꺼워지는 모습을 단순화했다. 반지름 변화량은 교육용 값이다.'}]

timelines = [{'timeline_id': 'mc.ves.cycle', 'blocking': False, 'name_ko': '수축 → 기본 → 확장 → 기본', 'steps': [
    {'type': 'state', 'set': {'vessel.micro_wall_tone': 'VASOCONSTRICTION'}, 'wait': True}, {'type': 'delay', 'ms': 500},
    {'type': 'state', 'set': {'vessel.micro_wall_tone': 'BASELINE'}, 'wait': True}, {'type': 'delay', 'ms': 300},
    {'type': 'state', 'set': {'vessel.micro_wall_tone': 'VASODILATION'}, 'wait': True}, {'type': 'delay', 'ms': 500},
    {'type': 'state', 'set': {'vessel.micro_wall_tone': 'BASELINE'}, 'wait': True}]}]

doc = {'version': 1, 'scene_id': 'micro_models', 'verification_status': 'CONCEPTUAL',
       'description': 'STEP 04-B+ 미세 구조 개념 모델(직접 제작 GLB 3종)의 반복 클립과 혈관 긴장도 상태. 해부 모델이 아니며 의학적 검증 전이다.',
       'units': {'time': 'ms', 'morph': '0~1'}, 'groups': [], 'animations': anims, 'structures': structures, 'timelines': timelines,
       'generator': 'tools/content/make_micro_anim.py'}
out = os.path.join(ROOT, 'content', 'animations', 'micro-concepts.json')
json.dump(doc, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('WROTE', out, len(anims), 'animations')
