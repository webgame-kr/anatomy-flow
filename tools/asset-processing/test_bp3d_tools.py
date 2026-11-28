"""자산 가공 도구 자체 테스트 (개발 도구 — 수업 범위 밖)

  python tools/asset-processing/test_bp3d_tools.py

raw-models/(Git 제외)에 원본 ZIP과 메타데이터가 있어야 실행된다. 없으면 건너뛴다.
"""
import csv
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bp3d_catalog as cat  # noqa: E402

passed = failed = 0


def check(name, ok):
    global passed, failed
    if ok:
        passed += 1
        print('[통과]', name)
    else:
        failed += 1
        print('[실패]', name)


if not (cat.META / 'partof_parts_list_e.txt').exists() or not (cat.ARCH / cat.ZIP_NAME['partof']).exists():
    print('원본 자료가 없어 건너뜀 (raw-models/bodyparts3d)')
    sys.exit(0)

r = cat.search('heart', ['partof'], exact=True)
check('영문 완전 일치: heart → FMA7088', len(r) == 1 and r[0]['concept_id'] == 'FMA7088')
check('대소문자 무시', cat.search('HEART', ['partof'], exact=True)[0]['concept_id'] == 'FMA7088')
check('FMA ID 검색', cat.search('fma7088', ['partof'])[0]['name'] == 'heart')
check('부분 일치는 여러 후보', len(cat.search('pulmonary vein', ['partof'])) > 4)
check('없는 이름은 0건', cat.search('interventricular septum', exact=True) == [])

comps = cat.components('FMA7088', 'partof')
check('심장 COMPOUND = element 83개, OBJ 모두 있음', len(comps) == 83 and all(c['obj_exists'] for c in comps))
check('element 머리글 concept 확인', any(c['element_name'] == 'Wall of right atrium' for c in comps))

rel = cat.relations('FMA7236', 'partof')
check('포함 관계: 대동맥판의 상위', any(a['name'] == 'heart' for a in rel['ancestors']))

idx = cat.load_index('isa')
check('IS-A 트리는 따로 색인 (concept 2905)', len(idx['concepts']) == 2905)
check('OBJ 파일명 ≠ FMA ID (FJ 형식)', all(k.startswith('FJ') for k in idx['objs']))

plan_path = cat.ROOT / 'tools' / 'out' / 'cardiovascular' / 'plan.json'
if plan_path.exists():
    plan = json.loads(plan_path.read_text(encoding='utf-8'))
    ids = [e['file_id'] for a in plan['assets'] for p in a['parts'] for e in p['elements']]
    check('계획: element 중복 배정 없음', len(ids) == len(set(ids)))
    heart = [p for a in plan['assets'] if a['file'] == 'heart.glb' for p in a['parts']]
    check('계획: 심장 element 83개 모두 배정', sum(len(p['elements']) for p in heart) == 83)

manifest = cat.BP3D / 'extracted' / 'manifest.csv'
if manifest.exists():
    rows = list(csv.DictReader(manifest.open(encoding='utf-8')))
    bad = [r['file_id'] for r in rows
           if hashlib.sha256((cat.ROOT / r['extracted_to']).read_bytes()).hexdigest() != r['sha256']]
    check(f'추출본 SHA-256 = 기록 ({len(rows)}개)', not bad)

print(f'\n통과 {passed}개, 실패 {failed}개')
sys.exit(1 if failed else 0)
