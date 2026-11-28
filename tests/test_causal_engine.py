# STEP 04-C 인과관계 엔진 테스트
# 실행: python tests/test_causal_engine.py

import sys
sys.path.insert(0, 'py')

import biological_state as bs
import causal_engine as ce

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


def R(cid, s, t, direction, kind, **extra):
    d = {'causal_id': cid, 'source_variable': s, 'target_variable': t, 'direction': direction, 'relationship_type': kind}
    for k in extra:
        d[k] = extra[k]
    return d


def setup(relations):
    bs.clear()
    for vid in ['symp', 'para', 'b1', 'm2', 'hr', 'contr', 'sv', 'preload', 'afterload', 'co', 'renin', 'ace', 'ang1', 'ang2', 'svr', 'aldo']:
        kind = 'relative'
        if vid in ('b1', 'm2'):
            kind = 'activation'
        bs.define({'variable_id': vid, 'name_ko': vid, 'data_type': kind})
    bs.define({'variable_id': 'rate', 'name_ko': '심박수(수치)', 'data_type': 'number', 'unit': '회/분', 'baseline': 75, 'allowed_range': [20, 250]})
    bs.define({'variable_id': 'edv', 'name_ko': 'EDV(수치)', 'data_type': 'number', 'unit': 'mL', 'baseline': 120, 'allowed_range': [0, 400]})
    return ce.load(relations)


BASE = [
    R('symp_b1', 'symp', 'b1', 'increase', 'activation', delay=1),
    R('b1_hr', 'b1', 'hr', 'increase', 'positive'),
    R('b1_contr', 'b1', 'contr', 'increase', 'positive'),
    R('para_m2', 'para', 'm2', 'increase', 'activation', delay=1),
    R('m2_hr', 'm2', 'hr', 'decrease', 'negative'),
    R('contr_sv', 'contr', 'sv', 'increase', 'positive'),
    R('afterload_sv', 'afterload', 'sv', 'decrease', 'negative'),
    R('preload_sv', 'preload', 'sv', 'increase', 'conditional', conditions=[{'var': 'preload', 'op': '<=', 'level': 1}], out_of_range='unknown'),
    R('hr_co', 'hr', 'co', 'increase', 'formula_direction'),
    R('sv_co', 'sv', 'co', 'increase', 'formula_direction'),
    R('renin_ang1', 'renin', 'ang1', 'increase', 'conditional', conditions=[{'var': 'ace', 'op': '>=', 'level': -2}], delay=1, mechanism='raas'),
    R('ang1_ang2', 'ang1', 'ang2', 'increase', 'conditional', conditions=[{'var': 'ace', 'op': '>=', 'level': 0}], delay=1, mechanism='raas'),
    R('ang2_svr', 'ang2', 'svr', 'increase', 'positive', mechanism='raas'),
    R('ang2_aldo', 'ang2', 'aldo', 'increase', 'positive', delay=2, mechanism='raas'),
    R('rate_edv', 'rate', 'edv', 'decrease', 'threshold', threshold={'var': 'rate', 'op': '>=', 'value': 160}),
]
r = setup(BASE)
check('관계 불러오기', r['ok'] and r['count'] == len(BASE))

# 양의 관계 · 활성화 · 연쇄
out = ce.apply([{'var': 'symp', 'delta': 1}], 'e1')
vars_changed = [c['var'] for c in out['changes']]
check('양의 관계·활성화 연쇄: 교감↑ → β1 ACTIVE → HR↑·수축력↑ → SV↑ → CO↑',
      bs.get('b1') == 'ACTIVE' and bs.get('hr') == 1 and bs.get('contr') == 1 and bs.get('sv') == 1 and bs.get('co') == 1)
check('의존성 순서대로 기록 (원인이 결과보다 앞)', vars_changed.index('symp') < vars_changed.index('b1') < vars_changed.index('hr') < vars_changed.index('co'))
check('지연(delay)이 물리 시간에 반영 (β1은 t=1)', [c for c in out['changes'] if c['var'] == 'b1'][0]['t'] == 1)
check('같은 이벤트 중복 적용 방지', ce.apply([{'var': 'symp', 'delta': 1}], 'e1')['result'] == 'duplicate' and bs.get('hr') == 1)

# 음의 관계
setup(BASE)
ce.apply([{'var': 'afterload', 'delta': 1}], 'e2')
check('음의 관계: 후부하↑ → SV↓ → CO↓', bs.get('sv') == -1 and bs.get('co') == -1)

# 상충하는 원인 → MIXED (정량 결합 근거 없음)
setup(BASE)
out = ce.apply([{'var': 'contr', 'delta': 1}, {'var': 'afterload', 'delta': 1}], 'e3')
check('상충 원인: 수축력↑ + 후부하↑ → SV는 MIXED(미확정)', bs.get('sv') == 'MIXED' and len(out['unresolved']) == 1)
check('MIXED는 더 전하지 않음 → CO 미확정(UNKNOWN)', bs.get('co') == 'UNKNOWN')

# 같은 방향 원인 → 더하지 않고 가장 큰 단계
setup(BASE)
ce.apply([{'var': 'symp', 'delta': 1}, {'var': 'para', 'delta': -1}], 'e4')
check('같은 방향 원인 둘(β1↑, M 자극↓): HR +1 (더하지 않음)', bs.get('hr') == 1)

# 우선순위가 dominant인 관계
rel2 = list(BASE)
rel2[6] = R('afterload_sv', 'afterload', 'sv', 'decrease', 'negative', priority=5, dominant=True)
setup(rel2)
out = ce.apply([{'var': 'contr', 'delta': 1}, {'var': 'afterload', 'delta': 1}], 'e5')
check('우선 관계(dominant)가 있으면 그쪽: SV↓', bs.get('sv') == -1)

# 조건부 활성화 (Frank-Starling 범위, ACE 필요)
setup(BASE)
ce.apply([{'var': 'preload', 'delta': 1}], 'e6')
check('조건부: 전부하 +1 → SV↑ (범위 안)', bs.get('sv') == 1)
setup(BASE)
out = ce.apply([{'var': 'preload', 'delta': 2}], 'e7')
check('조건부: 전부하 +2 → 범위 밖, SV 미확정', bs.get('sv') == 'UNKNOWN' and any(s['causal_id'] == 'preload_sv' for s in out['skipped']))
setup(BASE)
bs.shift('ace', -1)
out = ce.apply([{'var': 'renin', 'delta': 1}], 'e8')
check('조건부: ACE 억제(-1)면 안지오텐신 II 생성 안 함', bs.get('ang1') == 1 and bs.get('ang2') == 0)

# 역치 기반
setup(BASE)
bs.set_value('rate', 120)
out = ce.apply([{'var': 'rate', 'delta': 1}], 'e9')
check('역치 미달(120 < 160): EDV 변화 없음', bs.variables['edv']['trend'] == 0)
setup(BASE)
bs.set_value('rate', 170)
out = ce.apply([{'var': 'rate', 'delta': 1}], 'e10')
check('역치 이상(170 ≥ 160): EDV↓ 방향(수치는 그대로)', bs.variables['edv']['trend'] == -1 and bs.get('edv') == 120)

# 병렬 반응 (같은 시간) · 기전 범위
setup(BASE)
out = ce.apply([{'var': 'renin', 'delta': 1}], 'e11', ['raas'])
t_svr = [c['t'] for c in out['changes'] if c['var'] == 'svr'][0]
t_aldo = [c['t'] for c in out['changes'] if c['var'] == 'aldo'][0]
check('병렬 분기: 안지오텐신 II → 혈관(t=2)과 알도스테론(t=4)이 각각 진행', t_svr == 2 and t_aldo == 4)
setup(BASE)
out = ce.apply([{'var': 'renin', 'delta': 1}], 'e12', ['baroreflex'])
check('기전 범위 밖 관계는 적용 안 함', bs.get('ang1') == 0 and len(out['skipped']) > 0)
setup(BASE)
out = ce.apply([{'var': 'hr', 'level': 2}], 'e13')
check('단계 지정 trigger (level)', bs.get('hr') == 2 and bs.get('co') == 1)

# 정의 검사
r = setup([R('a', 'hr', 'co', 'increase', 'positive'), R('b', 'co', 'hr', 'increase', 'positive')])
check('일반 인과관계 순환 거부 (되먹임은 feedback으로)', not r['ok'] and '순환' in r['errors'][0])
r = setup([R('a', 'hr', 'co', 'decrease', 'positive')])
check('positive인데 decrease면 거부', not r['ok'])
r = setup([R('a', 'hr', 'nope', 'increase', 'positive')])
check('없는 변수 거부', not r['ok'])
r = setup([R('a', 'hr', 'co', 'increase', 'magic')])
check('알 수 없는 관계 유형 거부', not r['ok'])
r = setup([R('a', 'rate', 'edv', 'decrease', 'threshold')])
check('역치 관계에 threshold 없으면 거부', not r['ok'])
setup(BASE)
out = ce.apply([{'var': 'nope', 'delta': 1}], 'e14')
check('없는 변수 trigger 오류', not out['ok'])
out = ce.apply([{'var': 'hr', 'delta': 1.5}], 'e15')
check('정수가 아닌 delta 오류', not out['ok'])
ce.forget_event('e1')
check('되돌리기 뒤 같은 이벤트 다시 적용 가능', 'e1' not in ce.applied_events)

print('\n통과 {}개, 실패 {}개'.format(passed, failed))
if failed > 0:
    sys.exit(1)
