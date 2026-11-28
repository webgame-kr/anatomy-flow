"""STEP 04-B+ 자산·데이터 점검 (개발 도구 — 수업 범위 밖)

  python tools/asset-processing/test_asset_upgrade.py

- 배포 파일(assets/, content/, docs/references/asset_registry.csv)만으로 도는 검사와,
  raw-models/(Git 제외)가 있을 때만 도는 검색 검사로 나뉜다.
"""
import csv
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
passed = failed = 0


def check(name, ok):
    global passed, failed
    if ok:
        passed += 1
        print('[통과]', name)
    else:
        failed += 1
        print('[실패]', name)


def glb(rel):
    b = (ROOT / rel).read_bytes()
    n = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + n]), len(b)


def morph_names(j):
    out = set()
    for m in j['meshes']:
        out.update((m.get('extras') or {}).get('targetNames', []))
    return out


# ---------- GLB ----------
j, _ = glb('assets/anatomy/cardiovascular/heart-v2.glb')
names = {n.get('name') for n in j['nodes']}
check('heart-v2: 메시 21개', len(j['meshes']) == 21)
check('heart-v2: 통합 심실 벽과 첨판 11개 노드', 'heart_wall_ventricles' in names and sum(1 for n in names if n and (n.startswith('heart_leaflet_') or n.startswith('heart_cusp_'))) == 11)

j, _ = glb('assets/anatomy/cardiovascular/heart-v2-ventricle-regions.glb')
names = {n.get('name') for n in j['nodes']}
check('심실 벽 영역: lv_free·rv_free·septum 3개', {'heart_wall_lv_free', 'heart_wall_rv_free', 'heart_wall_septum'} <= names)
check('심실 벽 영역: Morph contract', morph_names(j) == {'contract'})
check('심실 벽 영역: 기본 가중치 0', all(w == 0 for m in j['meshes'] for w in m.get('weights', [0])))

j, _ = glb('assets/anatomy/cardiovascular/heart-v2-valves-rig.glb')
clips = {a['name'] for a in j.get('animations', [])}
check('판막 리깅: 클립 8개(판막 4 × 열림/닫힘)', clips == {v + s for v in ('tricuspid', 'mitral', 'pulmonary', 'aortic') for s in ('_open', '_close')})
check('판막 리깅: Morph open, 기본 가중치 0', morph_names(j) == {'open'} and all(w == 0 for m in j['meshes'] for w in m.get('weights', [0])))
groups = {n.get('name') for n in j['nodes'] if 'children' in n}
check('판막 리깅: 판막 그룹 4개', {'valve_tricuspid', 'valve_mitral', 'valve_pulmonary', 'valve_aortic'} <= groups)
check('판막 리깅: 개념 힘줄끈을 따로 만들지 않음(원본 첨판에 포함)', not any((n.get('name') or '').startswith('concept_chordae') for n in j['nodes']))

j, size = glb('assets/micro/vessel-wall-concept.glb')
check('혈관 벽: Morph constrict·dilate', morph_names(j) == {'constrict', 'dilate'})
check('혈관 벽: 파일 3 MB 미만', size < 3_000_000)
for f, need in (('alveolus-concept', {'rbc_flow', 'gas_exchange'}), ('tissue-capillary-concept', {'rbc_flow', 'tissue_exchange'})):
    j, _ = glb('assets/micro/' + f + '.glb')
    check(f + ': 반복 클립', {a['name'] for a in j.get('animations', [])} == need)

j, _ = glb('assets/anatomy/regulation/za-nerves-thyroid.glb')
names = {n.get('name') for n in j['nodes']}
check('Z-Anatomy 파일: 갑상샘·미주신경·교감신경줄기', {'thyroid_gland', 'right_vagus_nerve', 'left_vagus_nerve', 'right_sympathetic_trunk'} <= names)
check('Z-Anatomy 파일: BodyParts3D 노드와 섞이지 않음', not any((n or '').startswith(('heart_', 'right_kidney')) for n in names))

# ---------- 경로 ----------
main_paths = json.loads((ROOT / 'content/anatomy/cardiovascular/paths.json').read_text(encoding='utf-8'))['paths']
br = json.loads((ROOT / 'content/anatomy/cardiovascular/paths-branches.json').read_text(encoding='utf-8'))
paths = main_paths + br['paths']
ok_status = {'PENDING', 'APPROXIMATE', 'GEOMETRY_CHECKED', 'CONCEPTUAL', 'TEST_PATH'}
check('경로: 학습용 9개(paths.json) + 가지 13개(paths-branches.json)', len(main_paths) == 9 and len(br['paths']) == 13)
check('학습용 paths.json은 지연 로딩 자산을 가리키지 않음', not any((q.get('object_id') or '').startswith('bp3d-cv-systemic-vessels/') for p in main_paths for q in p['points']))
check('가지 경로 파일에 필요한 자산 목록', br['requires_assets'] and all(a in json.dumps(json.loads((ROOT / 'content/anatomy/cardiovascular/scene.json').read_text(encoding='utf-8'))['assets']) for a in br['requires_assets']))
check('경로 상태가 정의된 값 (ANATOMY_REVIEWED 없음)', all(p['verification_status'] in ok_status for p in paths))
new = [p for p in paths if p.get('step') == '04-B+']
check('04-B+ 경로 13개, 모두 geometry_check', len(new) == 13 and all('geometry_check' in p for p in new))
check('GEOMETRY_CHECKED는 메시 밖 표본 0일 때만', all((p['geometry_check']['outside_ratio'] == 0) == (p['verification_status'] == 'GEOMETRY_CHECKED') for p in new))
check('APPROXIMATE 경로는 이유(notes)가 있음', all('APPROXIMATE' in p['notes'] for p in new if p['verification_status'] == 'APPROXIMATE'))
ids = {p['path_id'] for p in paths}
check('링크 대상 경로가 있음', all(l['to'] in ids for p in paths for l in p.get('links', [])))
check('폐정맥 4개 경로', {'cv.pv_to_la', 'cv.pv_ri_to_la', 'cv.pv_ls_to_la', 'cv.pv_li_to_la'} <= ids)

# ---------- 애니메이션 콘텐츠 ----------
hv = json.loads((ROOT / 'content/animations/heart-v2-valves.json').read_text(encoding='utf-8'))
check('판막 구조 4개, 전환에 애니메이션', len(hv['structures']) == 4 and all(s['transitions']['CLOSED->OPEN']['animation'] for s in hv['structures']))
anim_ids = {a['animation_id'] for a in hv['animations']}
check('전환 애니메이션이 정의됨', all(t['animation'] in anim_ids for s in hv['structures'] for t in s['transitions'].values()))


def walk(steps):
    for s in steps:
        yield s
        yield from walk(s.get('steps', []))


moves = [s for t in hv['timelines'] for s in walk(t['steps']) if s.get('type') == 'command' and s['command']['action'] == 'actor_move_to_checkpoint']
check('판막을 지나는 이동은 모두 through', moves and all(s.get('through') for s in moves))
check('판막 콘텐츠는 의학적 검증 표시 없음', 'VERIFIED' not in json.dumps(hv) and 'ANATOMY_REVIEWED' not in json.dumps(hv))
mc = json.loads((ROOT / 'content/animations/micro-concepts.json').read_text(encoding='utf-8'))
check('미세 모델 콘텐츠 CONCEPTUAL', mc['verification_status'] == 'CONCEPTUAL' and all(a['verification_status'] == 'CONCEPTUAL' for a in mc['animations']))

prep = json.loads((ROOT / 'content/anatomy/regulation/prep-04c.json').read_text(encoding='utf-8'))
check('04-C 준비: 게임 로직 없이 구조·Anchor·교육 경로만', set(prep) >= {'structures', 'anchors', 'educational_paths'} and 'rules' not in prep)
check('04-C 준비: 교육 경로는 CONCEPTUAL', all(p['verification_status'] == 'CONCEPTUAL' for p in prep['educational_paths']))
check('04-C 준비: Anchor 상태에 검증 완료 없음', all(a['verification_status'] in ('GEOMETRY_DERIVED', 'APPROXIMATE', 'CONCEPTUAL') for a in prep['anchors']))

# ---------- 대장·라이선스·출처 표기 ----------
rows = list(csv.DictReader((ROOT / 'docs/references/asset_registry.csv').open(encoding='utf-8')))
by_file = {r['file_name']: r for r in rows}
glbs = [str(p.relative_to(ROOT)).replace('\\', '/') for p in (ROOT / 'assets').rglob('*.glb') if 'test-models' not in p.parts]
missing = [g for g in glbs if g not in by_file]
check('assets/의 GLB가 모두 대장에 있음 ' + (str(missing) if missing else ''), not missing)
check('배포 가능(YES) 자산은 라이선스 파일이 있음', all(r['license_file'] and (ROOT / r['license_file']).exists() for r in rows if r['deployable'] == 'YES'))
check('raw-models·test-models는 배포 불가', all(not r['deployable'].startswith('YES') for r in rows if r['file_name'].startswith(('raw-models', 'assets/test-models'))))
check('Z-Anatomy 파생은 CC-BY-SA-4.0, 나머지 BodyParts3D 파생은 CC-BY-4.0',
      all(r['license'].startswith('CC-BY-SA-4.0') for r in rows if r['asset_id'].startswith('za-')) and
      all(r['license'] == 'CC-BY-4.0' for r in rows if r['asset_id'].startswith('bp3d-') and r['deployable'] == 'YES'))
check('모든 자산이 전문가 검토 전으로 표시', all('REVIEWED' not in r['anatomy_review_status'] or r['anatomy_review_status'].startswith('NOT_REVIEWED') for r in rows))
sc = json.loads((ROOT / 'content/sandbox/scenes.json').read_text(encoding='utf-8'))
need_credit = [s['scene_id'] for s in sc['scenes'] if any(a['asset_id'].startswith(('bp3d-', 'za-')) for a in s.get('assets', [])) and not s.get('credits')]
check('BodyParts3D·Z-Anatomy 장면은 출처 표기 ' + (str(need_credit) if need_credit else ''), not need_credit)
za_sc = [s for s in sc['scenes'] if any(a['asset_id'].startswith('za-') for a in s.get('assets', []))]
check('Z-Anatomy 장면 출처에 CC-BY-SA', all('CC-BY-SA' in s['credits'] for s in za_sc))

# ---------- 검색 (원본이 있을 때만) ----------
try:
    import bp3d_catalog as cat
    have = (cat.ARCH / cat.ZIP_NAME['isa']).exists()
except Exception:
    have = False
if have:
    r = cat.find('FJ2428', ['isa'])
    check('검색: FJ ID로 심실 벽(IS-A) 찾음', r['status'] == 'MODEL_PRESENT')
    r = cat.find('interventricular septum', ['partof', 'isa'])
    check('검색: 심실중격은 모델 없음으로 구분', r['status'] in ('NO_MATCH', 'NAME_FOUND_NO_OBJ'))
    r = cat.find('myocardium', ['isa'])
    check('검색: 동의어 myocardium → 심실 벽 후보', r['status'] == 'MODEL_PRESENT')
else:
    print('원본 자료가 없어 검색 검사는 건너뜀')

print('\n통과 {}개, 실패 {}개'.format(passed, failed))
sys.exit(1 if failed else 0)
