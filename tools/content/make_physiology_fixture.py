# 브라우저 시각 바인딩 테스트용 명령 묶음 생성 (STEP 04-C, 개발 도구 — 수업 범위 밖)
# 출력: tests/fixtures/physiology-visual.json — Python 생리 엔진이 실제로 만든 시각 명령
#   baseline: 기준 상태 전체 바인딩 / bp_drop_step: 혈압 감소 → 압력수용체 반사 한 단계 / restore: 기준으로 되돌린 뒤 바인딩
#   raas: 혈액량 감소 → RAAS 한 단계 (호르몬·효소 신호)
# 실행: python tools/content/make_physiology_fixture.py
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'py'))
import physiology_commands as pc  # noqa: E402

model = json.load(open(os.path.join(ROOT, 'content', 'physiology', 'cardiovascular-model.json'), encoding='utf-8'))
assert pc.load(model)['ok']
out = {'note': 'physiology_commands가 만든 명령 (생성기: tools/content/make_physiology_fixture.py)'}
out['baseline'] = pc.bind_all()
snap = pc.state_snapshot()
r = pc.run_ops([{'op': 'scenario_start', 'scenario_id': 'sc.bp_drop'}], 'fx1')
out['bp_drop_start'] = r['commands']
out['bp_drop_step'] = pc.feedback_step('fb.baroreflex')['commands']
out['restore'] = pc.state_restore(snap)['commands']
pc.run_ops([{'op': 'scenario_start', 'scenario_id': 'sc.volume_loss'}], 'fx2')
pc.feedback_engine.start('fb.raas', 0)
pc.feedback_engine.running['fb.raas']['next_t'] = 0
out['raas_step'] = pc.feedback_step('fb.raas')['commands']
os.makedirs(os.path.join(ROOT, 'tests', 'fixtures'), exist_ok=True)
path = os.path.join(ROOT, 'tests', 'fixtures', 'physiology-visual.json')
json.dump(out, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('WROTE', path, {k: len(v) for k, v in out.items() if type(v) == list})
