# 심혈관 생리 상태 모델 생성기 (STEP 04-C, 개발 도구 — 수업 범위 밖)
# 출력: content/physiology/cardiovascular-model.json
# - 변수·공식·인과관계·되먹임·수용체·신호·시각 바인딩·시나리오를 한 파일에 둔다.
# - 근거는 강의자료 쪽 번호(내용은 옮기지 않음)와 공개 참고자료(OpenStax A&P 2e)로 구분한다.
# - 정량 근거가 없는 변수는 숫자를 만들지 않고 상대 단계(relative)로 둔다.
# 실행: python tools/content/make_physiology_model.py
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ---------- 출처 라벨 (공개 문서에는 쪽 번호만) ----------
L14 = '강의 14주 통합적 이해'
PH9 = '약리 9주차 심혈관계 약물1'
PH10 = '약리 10주차 심혈관계 약물2'
ANS = '자율신경계 기관별·수용체별 표'
TX = '성인간호학 상권 9판'
RENAL = '신장생리학 강의'
ENDO = '내분비생리 통합 강의'
VS = '기본간호학 활력징후'
OS194 = 'OpenStax A&P 2e 19.4 Cardiac Physiology'
OS202 = 'OpenStax A&P 2e 20.2 Blood Flow, Blood Pressure, and Resistance'
OS204 = 'OpenStax A&P 2e 20.4 Homeostatic Regulation of the Vascular System'


def src(*items):
    return ' · '.join(items)


def num(vid, ko, en, unit, base, rng, normal, source, status, notes='', kind='input', group='hemodynamic'):
    return {'variable_id': vid, 'name_ko': ko, 'name_en': en, 'data_type': 'number', 'unit': unit, 'baseline': base,
            'allowed_range': rng, 'normal_range': normal, 'source': source, 'verification_status': status, 'notes': notes,
            'value_kind': kind, 'group': group}


def comp(vid, ko, en, unit, normal, source, status, notes='', group='hemodynamic'):
    return {'variable_id': vid, 'name_ko': ko, 'name_en': en, 'data_type': 'computed', 'unit': unit, 'baseline': None,
            'allowed_range': [0, 100000], 'normal_range': normal, 'source': source, 'verification_status': status,
            'notes': notes, 'value_kind': 'calculated', 'group': group}


def rel(vid, ko, en, source, status, notes='', group='regulation', change_direction=''):
    return {'variable_id': vid, 'name_ko': ko, 'name_en': en, 'data_type': 'relative', 'unit': '단계', 'baseline': 0,
            'source': source, 'verification_status': status, 'notes': notes, 'value_kind': 'relative', 'group': group,
            'change_direction': change_direction}


def act(vid, ko, en, source, status, notes=''):
    return {'variable_id': vid, 'name_ko': ko, 'name_en': en, 'data_type': 'activation', 'unit': '', 'baseline': 'INACTIVE',
            'source': source, 'verification_status': status, 'notes': notes, 'value_kind': 'activation', 'group': 'receptor'}


EDU = '교육용 기준 상태. 실제 환자 측정값이 아니다.'
V = [
    # 수치 (근거가 있는 기준값만)
    num('heart_rate', '심박수', 'heart rate', '회/분', 75, [20, 250], [60, 100], src(OS194 + ' (예시 75 회/분, 정상 60–100)'), 'PUBLIC_REFERENCE',
        '강의 텍스트에서 심박수 정상 수치를 찾지 못했다(활력징후 표 3-6 추출 안 됨). ' + EDU),
    num('end_diastolic_volume', '이완기말 용적', 'end-diastolic volume (EDV)', 'mL', 120, [0, 400], None,
        src(TX + ' p614 그림 15-7 (EDV 120 mL)'), 'LECTURE_CHECKED', EDU),
    num('end_systolic_volume', '수축기말 용적', 'end-systolic volume (ESV)', 'mL', 50, [0, 400], None,
        src(TX + ' p614 그림 15-7 (ESV 50 mL)'), 'LECTURE_CHECKED', EDU),
    comp('stroke_volume', '일회박출량', 'stroke volume (SV)', 'mL', [55, 100], src(TX + ' p614 그림 15-7 (SV 70 mL)', PH10 + ' p9', OS194 + ' (정상 55–100 mL)'),
         'LECTURE_CHECKED', 'SV = EDV - ESV'),
    comp('ejection_fraction', '박출률', 'ejection fraction (EF)', '%', [55, 70], src(OS194 + ' (55–70%, 평균 58%)', PH10 + ' p22 (LVEF 용어)'),
         'PUBLIC_REFERENCE', 'EF = SV / EDV × 100'),
    comp('cardiac_output', '심박출량', 'cardiac output (CO)', 'L/분', [4, 8], src(TX + ' p614 (CO 정의·정상 4~8 L/분)', OS194), 'LECTURE_CHECKED',
         'CO = HR × SV (mL → L 변환)'),
    num('systolic_bp', '수축기 혈압', 'systolic blood pressure', 'mmHg', 120, [40, 300], None, src(OS202 + ' (예시 120/80)'), 'PUBLIC_REFERENCE',
        '강의 텍스트에 혈압 정상 수치가 없다(활력징후 표 추출 안 됨). ' + EDU),
    num('diastolic_bp', '이완기 혈압', 'diastolic blood pressure', 'mmHg', 80, [20, 200], None, src(OS202 + ' (예시 120/80)'), 'PUBLIC_REFERENCE', EDU),
    comp('pulse_pressure', '맥압', 'pulse pressure', 'mmHg', None, src(PH9 + ' p4 (맥압 정의)', OS202), 'LECTURE_CHECKED', 'PP = SBP - DBP'),
    comp('mean_arterial_pressure', '평균동맥압', 'mean arterial pressure (MAP)', 'mmHg', [70, 100],
         src(L14 + ' p4 (MAP = CO × TPR, 임상 추정식, 정상 70–100)', VS + ' (MAP 식)', PH9 + ' p4 (약 95 유지)', OS202 + ' (정상 70–110)'),
         'LECTURE_CHECKED', '정상 범위가 강의(70–100)와 OpenStax(70–110)에서 다르다 → 강의 값을 쓰고 검토 대상으로 남김'),
    num('systemic_vascular_resistance', '말초혈관저항', 'systemic vascular resistance (SVR, TPR)', 'mmHg·분/L', 17.78, [1, 80], None,
        src(L14 + ' p4 (총 말초저항)', VS + ' (BP = PR × CO)', OS202 + ' (F = ΔP/R)'), 'EDUCATIONAL_VALUE',
        '측정값이 아니라 기준 MAP(추정) ÷ 기준 CO로 유도한 교육용 값(중심정맥압 무시).', kind='derived'),
    # 상대 상태 (정량 근거 없음)
    rel('preload', '전부하', 'preload', src(PH10 + ' p9 (EDV에 따라 달라짐, Frank-Starling)', TX + ' p615'), 'LECTURE_CHECKED',
        '심근 섬유가 늘어난 정도. 수치 없이 단계로만', group='hemodynamic'),
    rel('afterload', '후부하', 'afterload', src(TX + ' p615 (박출 저항)', PH10 + ' p9', OS194), 'LECTURE_CHECKED', group='hemodynamic'),
    rel('contractility', '심근수축력', 'contractility', src(PH10 + ' p8', ANS + ' (β1: 수축력 증가)', OS194), 'LECTURE_CHECKED', group='hemodynamic'),
    rel('venous_return', '정맥 환류', 'venous return', src(TX + ' p615', PH9 + ' p36'), 'LECTURE_CHECKED', group='hemodynamic'),
    rel('blood_volume', '혈액량', 'blood volume', src(PH9 + ' p4 (혈압의 기본 변수)', L14 + ' p11–14', OS202), 'LECTURE_CHECKED', group='hemodynamic'),
    rel('sympathetic_activity', '교감신경 활성', 'sympathetic activity', src(L14 + ' p5–9', ANS, OS204), 'LECTURE_CHECKED', group='neural'),
    rel('parasympathetic_activity', '부교감신경(미주신경) 활성', 'parasympathetic (vagal) activity', src(L14 + ' p5–9', ANS, OS204), 'LECTURE_CHECKED', group='neural'),
    rel('baroreceptor_activity', '압력수용체 발화', 'baroreceptor firing', src(L14 + ' p7–9', OS204), 'LECTURE_CHECKED',
        '혈압이 오르면 더 늘어나 발화 빈도 증가, 내리면 감소', group='neural'),
    rel('renal_perfusion', '신장 관류', 'renal perfusion', src(L14 + ' p11 (혈압 저하 → 레닌)', RENAL + ' 슬라이드 35–39 (자가조절·TGF 그림)'), 'LECTURE_CHECKED',
        '사구체옆세포가 감지하는 신장 쪽 압력·관류를 묶어 단계로 표시(단순화)', group='renal'),
    rel('renin_activity', '레닌 활성', 'renin activity', src(L14 + ' p11', PH9 + ' p7', ANS + ' (신장 β1: 레닌 분비)'), 'LECTURE_CHECKED',
        '레닌은 효소(일부에서는 호르몬으로 분류, 14주)', group='hormone'),
    rel('angiotensinogen', '안지오텐시노겐', 'angiotensinogen', src(L14 + ' p11 (간에서 생성되는 혈장 단백질)'), 'LECTURE_CHECKED',
        '이 모델에서는 늘 충분하다고 가정(기준 0)', group='hormone'),
    rel('angiotensin_i', '안지오텐신 I', 'angiotensin I', src(L14 + ' p11'), 'LECTURE_CHECKED', group='hormone'),
    rel('ace_activity', 'ACE (안지오텐신 전환효소)', 'angiotensin-converting enzyme', src(L14 + ' p11 (폐에서)', PH9 + ' p9 (모든 혈관 내부, 특히 폐 혈관계통에 풍부)'),
        'LECTURE_CHECKED', 'ACE가 폐에만 있다고 표현하지 않는다. 이 모델에서는 늘 작용(기준 0)', group='hormone'),
    rel('angiotensin_ii', '안지오텐신 II', 'angiotensin II', src(L14 + ' p11', PH9 + ' p9'), 'LECTURE_CHECKED', group='hormone'),
    rel('aldosterone', '알도스테론', 'aldosterone', src(L14 + ' p11', PH9 + ' p9', ENDO + ' 슬라이드 46'), 'LECTURE_CHECKED', group='hormone'),
    rel('adh', '항이뇨호르몬(ADH)', 'antidiuretic hormone (vasopressin)', src(L14 + ' p10–11', RENAL + ' 슬라이드 50', OS204), 'LECTURE_CHECKED', group='hormone'),
    rel('plasma_osmolality', '혈장 삼투압', 'plasma osmolality', src(L14 + ' p10', RENAL + ' 슬라이드 50'), 'LECTURE_CHECKED', group='renal'),
    rel('thirst', '갈증', 'thirst', src(L14 + ' p11 (시상하부 갈증 중추)', OS204), 'LECTURE_CHECKED', group='renal'),
    rel('sodium_reabsorption', '나트륨 재흡수', 'sodium reabsorption', src(L14 + ' p11', ENDO + ' 슬라이드 46 (원위세뇨관)'), 'LECTURE_CHECKED', group='renal'),
    rel('water_reabsorption', '수분 재흡수', 'water reabsorption', src(L14 + ' p10–11', RENAL + ' 슬라이드 50 (집합관)'), 'LECTURE_CHECKED', group='renal'),
    rel('skeletal_muscle_blood_flow', '골격근 혈류(국소)', 'skeletal muscle blood flow (local)', src(ANS + ' (β2: 골격근 혈관 확장)'), 'LECTURE_CHECKED',
        'β2 작용은 골격근·관상동맥 혈관에만. 전신 말초저항에 같은 효과로 넣지 않았다', group='local'),
    # 수용체 (활성화)
    act('beta1_heart', 'β₁ 수용체 (심장)', 'β1 adrenergic receptor (heart)', src(ANS + ' (심박수·수축력·방실전도 증가)'), 'LECTURE_CHECKED'),
    act('beta1_jg', 'β₁ 수용체 (신장 사구체옆세포)', 'β1 adrenergic receptor (JG cells)', src(ANS + ' (신장: 레닌 분비 증가)'), 'LECTURE_CHECKED'),
    act('alpha1_vessel', 'α₁ 수용체 (세동맥)', 'α1 adrenergic receptor (arterioles)', src(ANS + ' (피부·내장·골격근·신장 혈관 수축 → 혈압 상승)'), 'LECTURE_CHECKED'),
    act('beta2_vessel', 'β₂ 수용체 (골격근·관상동맥 혈관)', 'β2 adrenergic receptor (skeletal muscle, coronary vessels)', src(ANS + ' (확장)'), 'LECTURE_CHECKED'),
    act('m2_heart', '무스카린 수용체 (심장, M₂)', 'muscarinic receptor (heart, M2)', src(ANS + ' (무스카린 M: 심박수 감소, 심방 수축력 저하, 방실 전도 감소)'), 'LECTURE_CHECKED',
        '강의는 "무스카린(M)"으로만 적는다. 아형 M₂ 표기는 일반 약리 지식(공개 자료) — 검토 대상'),
    act('at1_vessel', 'AT₁ 수용체 (혈관)', 'AT1 receptor (vessels)', src(PH9 + ' p24 (AT1: 혈관과 심장)'), 'LECTURE_CHECKED',
        '같은 강의는 AT2를 부신·신장·중추신경에 둔다. 일반 교재는 알도스테론 분비를 AT1 매개로 설명한다 → 충돌, 검토 대상. 이 모델은 안지오텐신 II → 알도스테론을 수용체 없이 잇는다'),
    act('mr_tubule', '무기질코르티코이드 수용체 (원위세뇨관·집합관)', 'mineralocorticoid receptor', src(PH9 + ' p24 (알도스테론 수용체 길항제)', ENDO + ' 슬라이드 46'),
        'LECTURE_CHECKED'),
]

F = [
    {'formula_id': 'f.sv', 'output': 'stroke_volume', 'function': 'stroke_volume', 'inputs': {'edv': 'end_diastolic_volume', 'esv': 'end_systolic_volume'},
     'input_units': {'edv': 'mL', 'esv': 'mL'}, 'output_unit': 'mL', 'round': 1, 'source': src(TX + ' p614', PH10 + ' p9'), 'notes': 'SV = EDV − ESV'},
    {'formula_id': 'f.ef', 'output': 'ejection_fraction', 'function': 'ejection_fraction', 'inputs': {'sv': 'stroke_volume', 'edv': 'end_diastolic_volume'},
     'input_units': {'sv': 'mL', 'edv': 'mL'}, 'output_unit': '%', 'round': 1, 'source': OS194, 'notes': 'EF = SV ÷ EDV × 100'},
    {'formula_id': 'f.co', 'output': 'cardiac_output', 'function': 'cardiac_output', 'inputs': {'rate': 'heart_rate', 'volume_ml': 'stroke_volume'},
     'input_units': {'rate': '회/분', 'volume_ml': 'mL'}, 'output_unit': 'L/분', 'round': 2, 'source': src(TX + ' p614', OS194),
     'notes': 'CO = HR × SV. mL를 L로 바꾸려고 1000으로 나눈다'},
    {'formula_id': 'f.pp', 'output': 'pulse_pressure', 'function': 'pulse_pressure', 'inputs': {'sbp': 'systolic_bp', 'dbp': 'diastolic_bp'},
     'input_units': {'sbp': 'mmHg', 'dbp': 'mmHg'}, 'output_unit': 'mmHg', 'round': 1, 'source': src(PH9 + ' p4', OS202)},
    {'formula_id': 'f.map_estimate', 'output': 'mean_arterial_pressure', 'function': 'map_estimate', 'mode_group': 'map', 'mode': 'pressure_estimate',
     'inputs': {'sbp': 'systolic_bp', 'dbp': 'diastolic_bp'}, 'input_units': {'sbp': 'mmHg', 'dbp': 'mmHg'}, 'output_unit': 'mmHg', 'round': 1,
     'source': src(L14 + ' p4 (임상 추정식)', VS, OS202),
     'notes': '근사식. 안정 시 확장기가 수축기보다 길다는 가정에 기댄다. 심박수가 매우 빠르면 맞지 않을 수 있다(일반 지식, 강의·OpenStax에 언급 없음 → 검토 대상)'},
    {'formula_id': 'f.map_hemodynamic', 'output': 'mean_arterial_pressure', 'function': 'map_hemodynamic', 'mode_group': 'map', 'mode': 'hemodynamic',
     'inputs': {'co': 'cardiac_output', 'svr': 'systemic_vascular_resistance'}, 'input_units': {'co': 'L/분', 'svr': 'mmHg·분/L'}, 'output_unit': 'mmHg',
     'round': 1, 'source': src(L14 + ' p4 (MAP = CO × TPR)', VS + ' (BP = PR × CO)'),
     'notes': 'MAP − CVP ≈ CO × SVR에서 중심정맥압을 무시한 교육용 식. 수축기·이완기 혈압을 정하지 않는다'},
    {'formula_id': 'f.svr_baseline', 'output': 'systemic_vascular_resistance', 'function': 'svr_from_map_co', 'run': 'baseline',
     'inputs': {'map': 'mean_arterial_pressure', 'co': 'cardiac_output'}, 'input_units': {'map': 'mmHg', 'co': 'L/분'}, 'output_unit': 'mmHg·분/L',
     'round': 2, 'source': '기준값 유도 (교육용)', 'notes': '기준 상태에서 SVR = MAP(추정) ÷ CO. 측정값이 아님'},
]


def C(cid, s, t, direction, kind, source, status, mechanism='core', delay=0, timescale='immediate', notes='', **extra):
    d = {'causal_id': cid, 'source_variable': s, 'target_variable': t, 'direction': direction, 'relationship_type': kind,
         'conditions': [], 'delay': delay, 'priority': 0, 'mechanism': mechanism, 'timescale': timescale, 'source': source,
         'verification_status': status, 'notes': notes}
    for k in extra:
        d[k] = extra[k]
    return d


R = [
    # 혈역학 핵심 (core): 공식의 방향 관계와 전부하·후부하·수축력
    C('c.bv_vr', 'blood_volume', 'venous_return', 'increase', 'positive', src(PH9 + ' p4', OS202), 'PUBLIC_REFERENCE', notes='혈액량이 줄면 심장으로 돌아오는 혈액도 줄어드는 방향 (단순화)'),
    C('c.vr_edv', 'venous_return', 'end_diastolic_volume', 'increase', 'positive', src(TX + ' p615 (돌아온 혈액량이 많을수록 전부하 증가)', PH9 + ' p36'), 'LECTURE_CHECKED'),
    C('c.edv_preload', 'end_diastolic_volume', 'preload', 'increase', 'positive', src(PH10 + ' p9 (전부하는 EDV에 따라)'), 'LECTURE_CHECKED'),
    C('c.preload_sv', 'preload', 'stroke_volume', 'increase', 'conditional', src(PH10 + ' p9 (Frank-Starling: 어느 시점까지)', OS194 + ' (생리적 범위 안에서)'),
      'LECTURE_CHECKED', conditions=[{'var': 'preload', 'op': '<=', 'level': 1}], out_of_range='unknown',
      notes='"어느 시점까지"만 성립. 전부하가 크게 증가(+2)하면 이 모델은 결과를 미확정(UNKNOWN)으로 둔다'),
    C('c.contr_sv', 'contractility', 'stroke_volume', 'increase', 'positive', src(PH10 + ' p8', OS194), 'LECTURE_CHECKED'),
    C('c.afterload_sv', 'afterload', 'stroke_volume', 'decrease', 'negative', src(PH10 + ' p8', OS194 + ' (후부하↑ → ESV↑, SV↓)'), 'LECTURE_CHECKED',
      notes='다른 조건이 같을 때의 방향. 수축력 증가 등이 함께 있으면 반대 원인으로 처리(MIXED)'),
    C('c.svr_afterload', 'systemic_vascular_resistance', 'afterload', 'increase', 'positive', src(TX + ' p615', PH10 + ' p9'), 'LECTURE_CHECKED'),
    C('c.hr_co', 'heart_rate', 'cardiac_output', 'increase', 'formula_direction', src('f.co', OS194), 'LECTURE_CHECKED',
      conditions=[{'var': 'heart_rate', 'op': '<', 'value': 160}], out_of_range='unknown',
      notes='CO = HR × SV의 방향. OpenStax 예: 건강한 젊은 성인에서 약 160회/분 이상이면 SV가 더 빨리 줄어 CO가 감소 → 그 범위에서는 미확정'),
    C('c.hr_filling', 'heart_rate', 'end_diastolic_volume', 'decrease', 'threshold', src(OS194 + ' (심박수↑ → 확장기·충만 시간 감소)'), 'PUBLIC_REFERENCE',
      threshold={'var': 'heart_rate', 'op': '>=', 'value': 160},
      notes='역치 기반. 심박수가 매우 빠를 때만(교육용 역치 160회/분, OpenStax 예시) 충만 감소를 경고한다'),
    C('c.sv_co', 'stroke_volume', 'cardiac_output', 'increase', 'formula_direction', src('f.co'), 'LECTURE_CHECKED'),
    C('c.co_map', 'cardiac_output', 'mean_arterial_pressure', 'increase', 'formula_direction', src(L14 + ' p4', VS), 'LECTURE_CHECKED'),
    C('c.svr_map', 'systemic_vascular_resistance', 'mean_arterial_pressure', 'increase', 'formula_direction', src(L14 + ' p4', VS), 'LECTURE_CHECKED',
      notes='혈관 직경(저항)만으로 모든 혈압 변화를 설명하지 않는다: CO·혈액량도 함께 작용'),
    # 압력수용체 반사 (baroreflex): 감지(MAP → 발화)는 되먹임 고리에서
    C('c.baro_symp', 'baroreceptor_activity', 'sympathetic_activity', 'decrease', 'negative', src(L14 + ' p7–9', OS204), 'LECTURE_CHECKED',
      mechanism='baroreflex', delay=1, timescale='neural_fast', notes='연수 심혈관 중추를 거친다(중추 자체는 상태 변수로 두지 않음)'),
    C('c.baro_para', 'baroreceptor_activity', 'parasympathetic_activity', 'increase', 'positive', src(L14 + ' p7–9', OS204), 'LECTURE_CHECKED',
      mechanism='baroreflex', delay=1, timescale='neural_fast'),
    # 자율신경 → 수용체 → 효과 (ans)
    C('c.symp_b1h', 'sympathetic_activity', 'beta1_heart', 'increase', 'activation', src(ANS), 'LECTURE_CHECKED', mechanism='ans', delay=1, timescale='neural_fast'),
    C('c.b1h_hr', 'beta1_heart', 'heart_rate', 'increase', 'positive', src(ANS), 'LECTURE_CHECKED', mechanism='ans'),
    C('c.b1h_contr', 'beta1_heart', 'contractility', 'increase', 'positive', src(ANS, PH9 + ' (β1과 칼슘 통로)'), 'LECTURE_CHECKED', mechanism='ans'),
    C('c.symp_a1', 'sympathetic_activity', 'alpha1_vessel', 'increase', 'activation', src(ANS, L14 + ' p6 (혈관운동중추·노르에피네프린)'), 'LECTURE_CHECKED',
      mechanism='ans', delay=1, timescale='neural_fast'),
    C('c.a1_svr', 'alpha1_vessel', 'systemic_vascular_resistance', 'increase', 'positive', src(ANS + ' (혈관 수축 → 혈압 상승)'), 'LECTURE_CHECKED', mechanism='ans'),
    C('c.para_m2', 'parasympathetic_activity', 'm2_heart', 'increase', 'activation', src(ANS), 'LECTURE_CHECKED', mechanism='ans', delay=1, timescale='neural_fast'),
    C('c.m2_hr', 'm2_heart', 'heart_rate', 'decrease', 'negative', src(ANS), 'LECTURE_CHECKED', mechanism='ans'),
    C('c.symp_b1jg', 'sympathetic_activity', 'beta1_jg', 'increase', 'activation', src(ANS + ' (신장 β1: 레닌 분비)'), 'LECTURE_CHECKED',
      mechanism='ans_renal', delay=1, timescale='neural_fast'),
    C('c.b1jg_renin', 'beta1_jg', 'renin_activity', 'increase', 'positive', src(ANS), 'LECTURE_CHECKED', mechanism='ans_renal', delay=1, timescale='hormonal'),
    C('c.b2_flow', 'beta2_vessel', 'skeletal_muscle_blood_flow', 'increase', 'positive', src(ANS), 'LECTURE_CHECKED', mechanism='ans_beta2'),
    # RAAS (raas): 병렬 분기 a(혈관) · b(알도스테론) · c(ADH·갈증)
    C('c.perf_renin', 'renal_perfusion', 'renin_activity', 'decrease', 'negative', src(L14 + ' p11 (혈압 저하 → JG 세포 레닌 분비)', OS204), 'LECTURE_CHECKED',
      mechanism='raas', delay=1, timescale='hormonal'),
    C('c.renin_ang1', 'renin_activity', 'angiotensin_i', 'increase', 'conditional', src(L14 + ' p11'), 'LECTURE_CHECKED', mechanism='raas', delay=1,
      timescale='hormonal', conditions=[{'var': 'angiotensinogen', 'op': '>=', 'level': 0}],
      notes='안지오텐시노겐(간)이 있어야 한다는 조건부 관계'),
    C('c.ang1_ang2', 'angiotensin_i', 'angiotensin_ii', 'increase', 'conditional', src(L14 + ' p11', PH9 + ' p9'), 'LECTURE_CHECKED', mechanism='raas', delay=1,
      timescale='hormonal', conditions=[{'var': 'ace_activity', 'op': '>=', 'level': 0}],
      notes='ACE가 작용해야 한다(ACE 억제가 단계 -1 이하면 적용 안 됨). ACE는 폐 혈관에 풍부하지만 다른 혈관 내피에도 있다'),
    C('c.ang2_at1', 'angiotensin_ii', 'at1_vessel', 'increase', 'activation', src(PH9 + ' p24'), 'LECTURE_CHECKED', mechanism='raas', timescale='hormonal'),
    C('c.at1_svr', 'at1_vessel', 'systemic_vascular_resistance', 'increase', 'positive', src(L14 + ' p11 (강력한 혈관 수축)', PH9 + ' p9'), 'LECTURE_CHECKED',
      mechanism='raas', notes='분기 a: 안지오텐신 II의 직접 혈관 작용'),
    C('c.ang2_aldo', 'angiotensin_ii', 'aldosterone', 'increase', 'positive', src(L14 + ' p11', PH9 + ' p9'), 'LECTURE_CHECKED', mechanism='raas', delay=2,
      timescale='hormonal', notes='분기 b. 부신피질의 수용체 아형은 자료가 충돌해 두지 않았다'),
    C('c.aldo_mr', 'aldosterone', 'mr_tubule', 'increase', 'activation', src(ENDO + ' 슬라이드 46'), 'LECTURE_CHECKED', mechanism='raas', delay=1, timescale='hormonal'),
    C('c.mr_na', 'mr_tubule', 'sodium_reabsorption', 'increase', 'positive', src(L14 + ' p11', ENDO + ' 슬라이드 46'), 'LECTURE_CHECKED', mechanism='raas', timescale='hormonal'),
    C('c.na_water', 'sodium_reabsorption', 'water_reabsorption', 'increase', 'positive', src(L14 + ' p11 (나트륨과 수분 재흡수)', OS204), 'LECTURE_CHECKED',
      mechanism='raas', timescale='renal_volume'),
    C('c.ang2_adh', 'angiotensin_ii', 'adh', 'increase', 'positive', src(L14 + ' p11', OS204), 'LECTURE_CHECKED', mechanism='raas', delay=1, timescale='hormonal',
      notes='분기 c'),
    C('c.osm_adh', 'plasma_osmolality', 'adh', 'increase', 'positive', src(L14 + ' p10 (주요 요인: 삼투압 증가)', RENAL + ' 슬라이드 50 (혈장 삼투압↑, 혈액량↓)'), 'LECTURE_CHECKED',
      mechanism='raas', delay=1, timescale='hormonal'),
    C('c.adh_water', 'adh', 'water_reabsorption', 'increase', 'positive', src(L14 + ' p10', RENAL + ' 슬라이드 50'), 'LECTURE_CHECKED', mechanism='raas', timescale='renal_volume'),
    C('c.adh_svr', 'adh', 'systemic_vascular_resistance', 'increase', 'positive', src(L14 + ' p10 (말초 혈관 수축 작용)', OS204), 'LECTURE_CHECKED', mechanism='raas'),
    C('c.ang2_thirst', 'angiotensin_ii', 'thirst', 'increase', 'positive', src(L14 + ' p11'), 'LECTURE_CHECKED', mechanism='raas', timescale='hormonal'),
    C('c.water_bv', 'water_reabsorption', 'blood_volume', 'increase', 'positive', src(L14 + ' p10–11 (체액량·혈액량 증가)', PH9 + ' p4 (장기적 기전)'), 'LECTURE_CHECKED',
      mechanism='raas', delay=3, timescale='renal_volume', notes='체액량 회복은 신경 반사보다 느리다(교육용 지연 3단위)'),
]

FB = [
    {'loop_id': 'fb.baroreflex', 'name_ko': '압력수용체 반사 (음성 되먹임)', 'loop_type': 'negative', 'sensed_variable': 'mean_arterial_pressure',
     'setpoint': {'level': 0, 'note': '기준 상태. 강의 정상 범위 70–100 mmHg (14주 p4)'}, 'sensor_variable': 'baroreceptor_activity',
     'sensor_direction': 'increase', 'mechanism': 'baroreflex', 'also_mechanisms': ['ans', 'core'], 'delay': 1, 'timescale': 'neural_fast',
     'max_iterations': 6,
     'limits': [{'when': [{'var': 'blood_volume', 'op': '<', 'level': 0}], 'cap_level': -1,
                 'reason': '혈액량 감소가 남아 있으면 신경 반사만으로 기준까지 돌아가지 않는다(교육용 단순화). 14주: 손실된 혈액량 회복에는 내분비계 관여 필요'},
                {'when': [{'var': 'blood_volume', 'op': '>', 'level': 0}], 'cap_level': 1,
                 'reason': '혈액량 증가가 남아 있으면 신경 반사만으로 기준까지 내려가지 않는다(교육용 단순화)'}],
     'source': src(L14 + ' p7–9, p15', OS204, PH9 + ' p4 (단기 기전: 신경계)'), 'verification_status': 'LECTURE_CHECKED',
     'notes': '혈압 변화 → 발화 변화 → 연수 → 교감·부교감 → 심장·세동맥. 실제로는 여러 반응이 동시에 일어난다'},
    {'loop_id': 'fb.raas', 'name_ko': 'RAAS (음성 되먹임, 느린 호르몬·체액량 조절)', 'loop_type': 'negative', 'sensed_variable': 'mean_arterial_pressure',
     'setpoint': {'level': 0}, 'sensor_variable': 'renal_perfusion', 'sensor_direction': 'increase', 'mechanism': 'raas', 'also_mechanisms': ['core'],
     'delay': 4, 'timescale': 'hormonal_slow', 'max_iterations': 4,
     'source': src(L14 + ' p11–14', PH9 + ' p4 (장기 기전: 내분비계·신장)', PH9 + ' (내분비계는 신경계보다 느리다)', ENDO + ' 슬라이드 46 (알도스테론 작용 시간 그림: 시간 단위)'),
     'verification_status': 'LECTURE_CHECKED',
     'notes': '레닌 → 안지오텐신 I → (ACE) → 안지오텐신 II → 혈관 수축 / 알도스테론 → Na·물 재흡수 / ADH·갈증 → 혈액량 → 혈압 회복 방향'},
]

REC = [
    {'receptor_id': 'rc.beta1_heart', 'name_ko': 'β₁ (심장)', 'variable': 'beta1_heart', 'ligand': '노르에피네프린(교감신경 말단), 에피네프린', 'anatomical_location': '심장(동방결절·방실결절·심근)',
     'target_variables': ['heart_rate', 'contractility'], 'downstream_effects': '심박수·수축력·방실결절 전도 증가 → 심박출량 증가', 'mechanisms': ['ans', 'core'],
     'source': ANS, 'verification_status': 'LECTURE_CHECKED'},
    {'receptor_id': 'rc.beta1_jg', 'name_ko': 'β₁ (신장 사구체옆세포)', 'variable': 'beta1_jg', 'ligand': '노르에피네프린', 'anatomical_location': '신장 사구체옆세포',
     'target_variables': ['renin_activity'], 'downstream_effects': '레닌 분비 증가', 'mechanisms': ['ans_renal', 'raas', 'core'], 'source': ANS, 'verification_status': 'LECTURE_CHECKED'},
    {'receptor_id': 'rc.alpha1_vessel', 'name_ko': 'α₁ (세동맥)', 'variable': 'alpha1_vessel', 'ligand': '노르에피네프린', 'anatomical_location': '피부·내장·골격근·신장 혈관',
     'target_variables': ['systemic_vascular_resistance'], 'downstream_effects': '혈관 수축 → 말초저항·혈압 상승', 'mechanisms': ['ans', 'core'], 'source': ANS, 'verification_status': 'LECTURE_CHECKED'},
    {'receptor_id': 'rc.beta2_vessel', 'name_ko': 'β₂ (골격근·관상동맥 혈관)', 'variable': 'beta2_vessel', 'ligand': '에피네프린', 'anatomical_location': '골격근·신장·관상동맥 혈관',
     'target_variables': ['skeletal_muscle_blood_flow'], 'downstream_effects': '그 혈관만 확장(국소). 모든 조직에 같게 적용하지 않음', 'mechanisms': ['ans_beta2'],
     'source': ANS, 'verification_status': 'LECTURE_CHECKED'},
    {'receptor_id': 'rc.m2_heart', 'name_ko': '무스카린 M (심장)', 'variable': 'm2_heart', 'ligand': '아세틸콜린(미주신경)', 'anatomical_location': '심장(동방결절·방실결절·심방)',
     'target_variables': ['heart_rate'], 'downstream_effects': '심박수 감소, 방실 전도 감소, 심방 수축력 저하', 'mechanisms': ['ans', 'core'], 'source': ANS, 'verification_status': 'LECTURE_CHECKED'},
    {'receptor_id': 'rc.at1_vessel', 'name_ko': 'AT₁ (혈관)', 'variable': 'at1_vessel', 'ligand': '안지오텐신 II', 'anatomical_location': '혈관 평활근 (강의: 혈관과 심장)',
     'target_variables': ['systemic_vascular_resistance'], 'downstream_effects': '혈관 수축', 'mechanisms': ['raas', 'core'], 'source': PH9 + ' p24', 'verification_status': 'LECTURE_CHECKED'},
    {'receptor_id': 'rc.mr_tubule', 'name_ko': '무기질코르티코이드 수용체', 'variable': 'mr_tubule', 'ligand': '알도스테론', 'anatomical_location': '원위세뇨관·집합관 상피',
     'target_variables': ['sodium_reabsorption'], 'downstream_effects': 'Na⁺ 재흡수 증가(K⁺ 배설) → 물 재흡수 방향', 'mechanisms': ['raas', 'core'],
     'source': src(ENDO + ' 슬라이드 46', PH9 + ' p24'), 'verification_status': 'LECTURE_CHECKED'},
]


def S(sid, kind, src_s, tgt_s, path, direction, actor, style, duration, receptor='', scale='교육용 표시 (실제 신호 속도·크기 아님)'):
    return {'signal_id': sid, 'signal_type': kind, 'source_structure': src_s, 'target_structure': tgt_s, 'path_id': path,
            'from_checkpoint': path.replace('phy.path.', 'cp.phy.') + '.from', 'to_checkpoint': path.replace('phy.path.', 'cp.phy.') + '.to',
            'signal_direction': direction, 'actor_id': actor, 'receptor_id': receptor, 'activation_state': 'INACTIVE',
            'visual_style': style, 'educational_scale': scale, 'duration_ms': duration, 'verification_status': 'CONCEPTUAL'}


NERVE_AFF = {'color': '#4fc3f7', 'kind': 'pulse'}
NERVE_SYM = {'color': '#ff8a3d', 'kind': 'pulse'}
NERVE_PARA = {'color': '#5ad17a', 'kind': 'pulse'}
HORMONE = {'color': '#b07cf0', 'kind': 'particle'}
ENZYME = {'color': '#f0c75e', 'kind': 'particle'}
SIG = [
    S('sig.baro_carotid', 'neural_afferent', '목동맥팽대', '연수 심혈관 중추', 'phy.path.carotid_medulla', 'afferent', 'phy_sig_aff1', NERVE_AFF, 800),
    S('sig.baro_aortic', 'neural_afferent', '대동맥동', '연수 심혈관 중추', 'phy.path.aortic_medulla', 'afferent', 'phy_sig_aff2', NERVE_AFF, 900),
    S('sig.symp_heart', 'neural_efferent', '연수(교감)', '심장', 'phy.path.symp_heart', 'efferent', 'phy_sig_sym1', NERVE_SYM, 900, 'rc.beta1_heart'),
    S('sig.symp_vessel', 'neural_efferent', '연수(혈관운동)', '세동맥', 'phy.path.symp_vessel', 'efferent', 'phy_sig_sym2', NERVE_SYM, 900, 'rc.alpha1_vessel'),
    S('sig.symp_kidney', 'neural_efferent', '연수(교감)', '신장 사구체옆세포', 'phy.path.symp_kidney', 'efferent', 'phy_sig_sym3', NERVE_SYM, 900, 'rc.beta1_jg'),
    S('sig.vagal_heart', 'neural_efferent', '연수(심장억제)', '심장', 'phy.path.vagus_heart', 'efferent', 'phy_sig_para', NERVE_PARA, 900, 'rc.m2_heart'),
    S('sig.renin', 'enzyme', '신장 사구체옆세포', '혈액(간의 안지오텐시노겐)', 'phy.path.kidney_liver', 'blood', 'phy_sig_renin', ENZYME, 1600),
    S('sig.ang1', 'hormone', '혈액(간 쪽)', '폐 혈관 내피(ACE 풍부)', 'phy.path.liver_lung', 'blood', 'phy_sig_ang1', HORMONE, 1600),
    S('sig.ang2_vessel', 'hormone', '혈액', '세동맥 (AT₁)', 'phy.path.lung_vessel', 'blood', 'phy_sig_ang2a', HORMONE, 1500, 'rc.at1_vessel'),
    S('sig.ang2_adrenal', 'hormone', '혈액', '부신피질', 'phy.path.lung_adrenal', 'blood', 'phy_sig_ang2b', HORMONE, 1500),
    S('sig.aldosterone', 'hormone', '부신피질', '원위세뇨관·집합관', 'phy.path.adrenal_tubule', 'blood', 'phy_sig_aldo', HORMONE, 1600, 'rc.mr_tubule'),
    S('sig.adh', 'hormone', '뇌하수체 후엽', '집합관', 'phy.path.pituitary_tubule', 'blood', 'phy_sig_adh', HORMONE, 1800),
]

B = [
    {'binding_id': 'b.hr_beat_lv', 'variable': 'heart_rate', 'kind': 'animation_speed', 'target': 'phy.beat.lv', 'mode': 'auto',
     'map': {'-2': 0.6, '-1': 0.8, '0': 1.0, '1': 1.35, '2': 1.7}, 'weight_variable': 'contractility',
     'weight_map': {'-2': 0.45, '-1': 0.6, '0': 0.8, '1': 0.95, '2': 1.0}, 'note': '박동 속도 = 심박수(교육용 배율), 수축 깊이 = 수축력'},
    {'binding_id': 'b.hr_beat_rv', 'variable': 'heart_rate', 'kind': 'animation_speed', 'target': 'phy.beat.rv', 'mode': 'auto',
     'map': {'-2': 0.6, '-1': 0.8, '0': 1.0, '1': 1.35, '2': 1.7}, 'weight_variable': 'contractility',
     'weight_map': {'-2': 0.45, '-1': 0.6, '0': 0.8, '1': 0.95, '2': 1.0}},
    {'binding_id': 'b.svr_vessel', 'variable': 'systemic_vascular_resistance', 'kind': 'structure_state', 'target': 'vessel.phy_arteriole',
     'map': {'-2': 'VASODILATION', '-1': 'VASODILATION', '0': 'BASELINE', '1': 'VASOCONSTRICTION', '2': 'VASOCONSTRICTION'},
     'note': '세동맥 지름 표시. 혈관 지름만으로 혈압 전체를 설명하지 않는다'},
    {'binding_id': 'b.baro_color', 'variable': 'baroreceptor_activity', 'kind': 'material', 'target': 'phy.carotid_sinus',
     'map': {'-2': '#2b5c7a', '-1': '#3f86b3', '0': '#4fc3f7', '1': '#9fe3ff', '2': '#d8f5ff'}},
    {'binding_id': 'b.baro_color2', 'variable': 'baroreceptor_activity', 'kind': 'material', 'target': 'phy.aortic_sinus',
     'map': {'-2': '#2b5c7a', '-1': '#3f86b3', '0': '#4fc3f7', '1': '#9fe3ff', '2': '#d8f5ff'}},
    {'binding_id': 'b.symp_color', 'variable': 'sympathetic_activity', 'kind': 'material', 'target': 'phy.nerve_symp',
     'map': {'-2': '#6b4a35', '-1': '#9c6a46', '0': '#c98a5a', '1': '#ff8a3d', '2': '#ffb070'}},
    {'binding_id': 'b.symp_color_v', 'variable': 'sympathetic_activity', 'kind': 'material', 'target': 'phy.nerve_symp_v',
     'map': {'-2': '#6b4a35', '-1': '#9c6a46', '0': '#c98a5a', '1': '#ff8a3d', '2': '#ffb070'}},
    {'binding_id': 'b.symp_color_k', 'variable': 'sympathetic_activity', 'kind': 'material', 'target': 'phy.nerve_symp_k',
     'map': {'-2': '#6b4a35', '-1': '#9c6a46', '0': '#c98a5a', '1': '#ff8a3d', '2': '#ffb070'}},
    {'binding_id': 'b.para_color', 'variable': 'parasympathetic_activity', 'kind': 'material', 'target': 'phy.nerve_vagus',
     'map': {'-2': '#335e40', '-1': '#47855a', '0': '#5aa572', '1': '#5ad17a', '2': '#9cf0b0'}},
    {'binding_id': 'b.renin_color', 'variable': 'renin_activity', 'kind': 'material', 'target': 'phy.kidney_jg',
     'map': {'-2': '#7d6a3a', '-1': '#a88f4c', '0': '#c9ad63', '1': '#f0c75e', '2': '#ffe08a'}},
    {'binding_id': 'b.aldo_adrenal', 'variable': 'aldosterone', 'kind': 'material', 'target': 'phy.adrenal',
     'map': {'-2': '#7a6a3a', '-1': '#a8904c', '0': '#d9a845', '1': '#ffc94d', '2': '#ffe08a'}},
    {'binding_id': 'b.na_tubule', 'variable': 'sodium_reabsorption', 'kind': 'material', 'target': 'phy.tubule',
     'map': {'-2': '#6c7b8a', '-1': '#8195a8', '0': '#9fb4c9', '1': '#c7e0ff', '2': '#e8f3ff'}},
    {'binding_id': 'b.bv_color', 'variable': 'blood_volume', 'kind': 'material', 'target': 'phy.blood_pool',
     'map': {'-2': '#5a2020', '-1': '#8a3030', '0': '#c04040', '1': '#e05a5a', '2': '#ff7a7a'}},
    # 신호: 변수 변화 → 경로를 따라가는 신호
    {'binding_id': 'b.sig_baro1', 'variable': 'baroreceptor_activity', 'kind': 'signal', 'signal_id': 'sig.baro_carotid', 'when': 'change'},
    {'binding_id': 'b.sig_baro2', 'variable': 'baroreceptor_activity', 'kind': 'signal', 'signal_id': 'sig.baro_aortic', 'when': 'change'},
    {'binding_id': 'b.sig_symh', 'variable': 'sympathetic_activity', 'kind': 'signal', 'signal_id': 'sig.symp_heart', 'when': 'change'},
    {'binding_id': 'b.sig_symv', 'variable': 'sympathetic_activity', 'kind': 'signal', 'signal_id': 'sig.symp_vessel', 'when': 'change'},
    {'binding_id': 'b.sig_symk', 'variable': 'beta1_jg', 'kind': 'signal', 'signal_id': 'sig.symp_kidney', 'when': 'increase'},
    {'binding_id': 'b.sig_vag', 'variable': 'parasympathetic_activity', 'kind': 'signal', 'signal_id': 'sig.vagal_heart', 'when': 'change'},
    {'binding_id': 'b.sig_renin', 'variable': 'renin_activity', 'kind': 'signal', 'signal_id': 'sig.renin', 'when': 'increase'},
    {'binding_id': 'b.sig_ang1', 'variable': 'angiotensin_i', 'kind': 'signal', 'signal_id': 'sig.ang1', 'when': 'increase'},
    {'binding_id': 'b.sig_ang2v', 'variable': 'angiotensin_ii', 'kind': 'signal', 'signal_id': 'sig.ang2_vessel', 'when': 'increase'},
    {'binding_id': 'b.sig_ang2a', 'variable': 'angiotensin_ii', 'kind': 'signal', 'signal_id': 'sig.ang2_adrenal', 'when': 'increase'},
    {'binding_id': 'b.sig_aldo', 'variable': 'aldosterone', 'kind': 'signal', 'signal_id': 'sig.aldosterone', 'when': 'increase'},
    {'binding_id': 'b.sig_adh', 'variable': 'adh', 'kind': 'signal', 'signal_id': 'sig.adh', 'when': 'increase'},
]

SC = [
    {'scenario_id': 'sc.baseline', 'name_ko': '기준 상태', 'initial_state': [], 'trigger': [], 'available_mechanisms': None,
     'expected_response': {}, 'learning_objectives': ['기준 상태의 변수와 계산 관계 확인'], 'completion_condition': [],
     'source': '교육용', 'limitations': '교육용 기준 상태. 실제 개인의 정상값과 다를 수 있다'},
    {'scenario_id': 'sc.bp_drop', 'name_ko': '혈압 감소', 'initial_state': [], 'trigger': [{'var': 'mean_arterial_pressure', 'delta': -1}],
     'available_mechanisms': ['core', 'baroreflex', 'ans'], 'expected_response': {'baroreceptor_activity': 'decrease', 'sympathetic_activity': 'increase',
     'parasympathetic_activity': 'decrease', 'heart_rate': 'increase', 'systemic_vascular_resistance': 'increase'},
     'learning_objectives': ['압력수용체 반사의 방향 추론'], 'completion_condition': [{'var': 'mean_arterial_pressure', 'op': '>=', 'level': 0}],
     'source': src(L14 + ' p7–9', OS204), 'limitations': '원인을 정하지 않은 혈압 감소. 방향만 다룬다'},
    {'scenario_id': 'sc.bp_rise', 'name_ko': '혈압 증가', 'initial_state': [], 'trigger': [{'var': 'mean_arterial_pressure', 'delta': 1}],
     'available_mechanisms': ['core', 'baroreflex', 'ans'], 'expected_response': {'baroreceptor_activity': 'increase', 'sympathetic_activity': 'decrease',
     'parasympathetic_activity': 'increase', 'heart_rate': 'decrease'},
     'learning_objectives': ['혈압이 오를 때 반대 방향 반응'], 'completion_condition': [{'var': 'mean_arterial_pressure', 'op': '<=', 'level': 0}],
     'source': src(L14 + ' p8', OS204), 'limitations': '방향만 다룬다'},
    {'scenario_id': 'sc.volume_loss', 'name_ko': '혈액량 감소', 'initial_state': [], 'trigger': [{'var': 'blood_volume', 'delta': -1}],
     'available_mechanisms': ['core'], 'expected_response': {'venous_return': 'decrease', 'stroke_volume': 'decrease', 'mean_arterial_pressure': 'decrease'},
     'learning_objectives': ['혈액량 → 정맥 환류 → 전부하 → 일회박출량 → 혈압', '빠른 신경 반사와 느린 RAAS 구분'],
     'completion_condition': [{'var': 'blood_volume', 'op': '>=', 'level': 0}],
     'source': src(L14 + ' p15, p20 (출혈)', PH9 + ' p4'), 'limitations': '출혈량·속도·치료를 다루지 않는다. 실제 환자 경과를 예측하지 않는다'},
    {'scenario_id': 'sc.sympathetic', 'name_ko': '교감신경 활성 증가', 'initial_state': [], 'trigger': [{'var': 'sympathetic_activity', 'delta': 1}],
     'available_mechanisms': ['core', 'ans', 'ans_renal'], 'expected_response': {'heart_rate': 'increase', 'contractility': 'increase',
     'systemic_vascular_resistance': 'increase', 'renin_activity': 'increase'},
     'learning_objectives': ['수용체별 반응(β1 심장, α1 세동맥, β1 신장)'], 'completion_condition': [],
     'source': ANS, 'limitations': '스트레스·운동 등 원인을 구분하지 않는다'},
    {'scenario_id': 'sc.dehydration', 'name_ko': '상대적 탈수', 'initial_state': [], 'trigger': [{'var': 'blood_volume', 'delta': -1}, {'var': 'plasma_osmolality', 'delta': 1}],
     'available_mechanisms': ['core', 'raas'], 'expected_response': {'adh': 'increase', 'water_reabsorption': 'increase'},
     'learning_objectives': ['삼투압 증가와 혈액량 감소가 ADH를 늘리는 방향'], 'completion_condition': [],
     'source': src(L14 + ' p10', RENAL + ' 슬라이드 50'), 'limitations': '수액·전해질 수치를 다루지 않는다. 치료 판단에 쓰지 않는다'},
]

doc = {
    'version': 1, 'model_id': 'cv.regulation', 'title_ko': '심혈관 생리 상태 모델 (교육용)',
    'disclaimer': '교육용 계산·단순화 모델입니다. 실제 환자의 생리 반응·혈역학을 예측하지 않으며 진단·처치·약물 용량 결정에 쓰지 않습니다. 수치는 교육용 기준값이고, 근거가 없는 변수는 증가·감소 방향(단계)으로만 표시합니다.',
    'time': {'tick_ms': 600, 'units': {'neural_fast': '빠른 신경 조절 (초 단위)', 'hormonal': '호르몬 (분 단위)', 'hormonal_slow': '느린 호르몬 조절 (분~시간)',
             'renal_volume': '신장·체액량 (시간 단위 이상)', 'immediate': '즉시 (계산 관계)'},
             'note': '물리 시간 1단위 = 화면 0.6초(교육용 압축). 신경 반사와 RAAS의 실제 시간 차이(초 vs 분~시간)를 같은 비율로 줄이지 않았다.'},
    'formula_modes': {'map': 'pressure_estimate'},
    'monitor': {'default': ['heart_rate', 'stroke_volume', 'cardiac_output', 'mean_arterial_pressure', 'systemic_vascular_resistance']},
    'variables': V, 'formulas': F, 'causal': R, 'feedback': FB, 'receptors': REC, 'signals': SIG, 'visual_bindings': B, 'scenarios': SC,
    'generator': 'tools/content/make_physiology_model.py',
}
out = os.path.join(ROOT, 'content', 'physiology', 'cardiovascular-model.json')
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(doc, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('WROTE', out, len(V), 'vars', len(F), 'formulas', len(R), 'causal', len(FB), 'loops', len(REC), 'receptors', len(SIG), 'signals', len(B), 'bindings', len(SC), 'scenarios')
