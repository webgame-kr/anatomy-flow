"""해부학 구조 조사 도구 (개발 도구 — 수업 범위 밖)

targets/<system>.json의 이름(동의어 포함)으로 IS-A·PART-OF 트리를 각각 검색해
완전 일치 후보와 부분 일치 후보를 모두 기록한다. 트리를 병합하지 않는다.

  python tools/asset-processing/survey_structures.py tools/asset-processing/targets/cardiovascular.json

출력: docs/development/bp3d/<system>-survey.csv (후보 전부), 화면에 대상별 요약
"""
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bp3d_catalog as cat  # noqa: E402

INTERNAL_WORDS = ('cavity', 'valve', 'leaflet', 'cusp', 'papillary', 'septum', 'chordae', 'trabecul')


def structure_class(name):
    n = name.lower()
    if any(w in n for w in INTERNAL_WORDS):
        return 'internal'
    if n.startswith('wall of') or 'myocardium' in n:
        return 'wall'
    return 'organ/vessel'


def survey(target_file):
    spec = json.loads(Path(target_file).read_text(encoding='utf-8'))
    rows = []
    summary = []
    for t in spec['targets']:
        exact_hits = []
        for nm in t['names']:
            for r in cat.search(nm, exact=True):
                exact_hits.append((nm, r))
        partial = []
        for r in cat.search(t['names'][0], exact=False):
            if not any(r['concept_id'] == e[1]['concept_id'] and r['tree'] == e[1]['tree'] for e in exact_hits):
                partial.append(r)
        for nm, r in exact_hits:
            rows.append({'target': t['key'], 'match': 'exact', 'query': nm, **flat(r)})
        for r in partial[:25]:
            rows.append({'target': t['key'], 'match': 'partial', 'query': t['names'][0], **flat(r)})
        primary = [r for nm, r in exact_hits if nm == t['names'][0]]
        status = 'FOUND' if primary else ('FOUND_VIA_SYNONYM' if exact_hits else ('PARTIAL_ONLY' if partial else 'NOT_FOUND'))
        summary.append({'target': t['key'], 'label': t['label'], 'status': status,
                        'primary': [(r['tree'], r['concept_id'], r['name'], r['kind'], r['element_count']) for r in primary],
                        'synonyms': sorted({(r['tree'], r['concept_id'], r['name']) for nm, r in exact_hits if nm != t['names'][0]}),
                        'partial_count': len(partial)})
    out_dir = cat.ROOT / 'docs' / 'development' / 'bp3d'
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{spec['system']}-survey.csv"
    with out.open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator='\n')
        w.writeheader()
        w.writerows(rows)
    return summary, out


def flat(r):
    return {'tree': r['tree'], 'concept_id': r['concept_id'], 'representation_id': r['representation_id'],
            'name': r['name'], 'kind': r['kind'], 'class': structure_class(r['name']),
            'element_count': r['element_count'], 'obj_present': r['obj_present'],
            'obj_missing': ' '.join(r['obj_missing'])}


if __name__ == '__main__':
    summary, out = survey(sys.argv[1])
    for s in summary:
        print(f"{s['label']:<24} {s['status']:<18} primary={s['primary']} partial={s['partial_count']}")
        for syn in s['synonyms']:
            print(f"{'':<24}   synonym {syn}")
    print('->', out)
