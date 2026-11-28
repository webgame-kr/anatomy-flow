"""BodyParts3D 메타데이터·OBJ 검색 도구 (개발 도구 — 수업 범위 밖)

게임 로직(py/)과 분리된 자산 가공 도구입니다. 강의에서 다루지 않은 표준 라이브러리
(zipfile, json, csv, argparse, pathlib, hashlib, re)와 class 없이 함수만 사용합니다.

데이터 구조 (공식 README_e.html 기준, 실제 파일로 확인)
  *_parts_list_e.txt            concept id(FMA) · representation id(BP) · en
  *_element_parts.txt           concept id · name · element file id(FJ)   ← COMPOUND = ELEMENT의 합
  *_inclusion_relation_list.txt parent id · parent name · child id · child name
  OBJ 파일명 = element file id (FMA ID나 BP ID가 아님). OBJ 머리글에 File ID, Representation ID,
  Concept ID, English name, Bounds(mm)가 있다.
IS-A 트리와 PART-OF 트리는 따로 다룬다(같은 FMA ID라도 구성 element가 다를 수 있음).

사용 예
  python tools/asset-processing/bp3d_catalog.py search heart --tree partof
  python tools/asset-processing/bp3d_catalog.py search FMA7088 --exact --json out.json
  python tools/asset-processing/bp3d_catalog.py components FMA7088 --tree partof
  python tools/asset-processing/bp3d_catalog.py relations FMA7088 --tree partof
"""
import argparse
import csv
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BP3D = ROOT / 'raw-models' / 'bodyparts3d'
META = BP3D / 'metadata'
ARCH = BP3D / 'archives'
INDEX_DIR = BP3D / 'index'
TREES = ('isa', 'partof')
ZIP_NAME = {'isa': 'isa_BP3D_4.0_obj_99.zip', 'partof': 'partof_BP3D_4.0_obj_99.zip'}
SOURCE_URL = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/'
ELEMENT_RE = re.compile(r'^FJ\d+M?$')
HEADER_KEYS = {
    'File ID': 'file_id', 'Representation ID': 'representation_id', 'Build-up logic': 'build_up_logic',
    'Concept ID': 'concept_id', 'English name': 'name', 'Bounds(mm)': 'bounds_mm', 'Volume(cm3)': 'volume_cm3',
    'Compatibility version': 'version',
}


def read_table(path):
    """탭 구분 텍스트 → (헤더, 행 리스트). 헤더와 열 수를 확인한다."""
    lines = path.read_text(encoding='utf-8').splitlines()
    header = lines[0].split('\t')
    rows = []
    for no, line in enumerate(lines[1:], start=2):
        cells = line.split('\t')
        if len(cells) != len(header):
            raise ValueError(f'{path.name}:{no} 열 수 {len(cells)} != 헤더 {len(header)}')
        rows.append(cells)
    return header, rows


def parse_obj_header(raw):
    info = {}
    for line in raw.decode('utf-8', 'replace').splitlines():
        if not line.startswith('#'):
            break
        m = re.match(r'#\s*([^:]+?)\s*:\s*(.*)$', line)
        if m and m.group(1) in HEADER_KEYS:
            info[HEADER_KEYS[m.group(1)]] = m.group(2).strip()
    if 'bounds_mm' in info:
        nums = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', info['bounds_mm'])]
        if len(nums) == 6:
            info['bounds_mm'] = {'min': nums[:3], 'max': nums[3:]}
    return info


def build_index(tree):
    """메타데이터 3종 + ZIP 안 OBJ 머리글(압축 해제 없이 앞부분만 읽음)로 색인을 만든다."""
    h, parts = read_table(META / f'{tree}_parts_list_e.txt')
    assert h == ['concept id', 'representation id', 'en'], h
    h, elems = read_table(META / f'{tree}_element_parts.txt')
    assert h == ['concept id', 'name', 'element file id'], h
    h, rels = read_table(META / f'{tree}_inclusion_relation_list.txt')
    assert h == ['parent id', 'parent name', 'child id', 'child name'], h

    concepts = {}
    for cid, rep, name in parts:
        concepts[cid] = {'concept_id': cid, 'representation_id': rep, 'name': name,
                         'elements': [], 'children': [], 'parents': []}
    for cid, name, fj in elems:
        concepts.setdefault(cid, {'concept_id': cid, 'representation_id': None, 'name': name,
                                  'elements': [], 'children': [], 'parents': []})
        concepts[cid]['elements'].append(fj)
    for pid, _pn, cid, _cn in rels:
        if pid in concepts:
            concepts[pid]['children'].append(cid)
        if cid in concepts:
            concepts[cid]['parents'].append(pid)

    objs = {}
    zpath = ARCH / ZIP_NAME[tree]
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            name = Path(info.filename).name
            if not name.lower().endswith('.obj'):
                continue
            fid = name[:-4]
            with z.open(info) as f:
                header = parse_obj_header(f.read(1024))
            objs[fid] = {'member': info.filename, 'crc32': f'{info.CRC:08x}', 'size': info.file_size, **header}

    # element(원자 장기) 판별: OBJ 머리글의 Concept ID가 바로 그 concept인 경우
    element_of = {}
    for fid, o in objs.items():
        if o.get('concept_id'):
            element_of.setdefault(o['concept_id'], []).append(fid)
    for cid, c in concepts.items():
        c['own_element_files'] = sorted(element_of.get(cid, []))
        c['kind'] = 'ELEMENT' if c['own_element_files'] and set(c['elements']) <= set(c['own_element_files']) else 'COMPOUND'
        c['missing_obj'] = sorted(set(c['elements']) - set(objs))

    index = {'tree': tree, 'zip': ZIP_NAME[tree], 'source_url': SOURCE_URL, 'concepts': concepts, 'objs': objs}
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    (INDEX_DIR / f'{tree}_index.json').write_text(json.dumps(index, ensure_ascii=False), encoding='utf-8')
    return index


def load_index(tree, rebuild=False):
    path = INDEX_DIR / f'{tree}_index.json'
    if path.exists() and not rebuild:
        return json.loads(path.read_text(encoding='utf-8'))
    return build_index(tree)


def summarize(index, c):
    objs = index['objs']
    present = [fj for fj in c['elements'] if fj in objs]
    return {
        'tree': index['tree'], 'concept_id': c['concept_id'], 'representation_id': c['representation_id'],
        'name': c['name'], 'kind': c['kind'], 'element_count': len(c['elements']),
        'obj_present': len(present), 'obj_missing': c['missing_obj'],
        'children': len(c['children']), 'parents': [p for p in c['parents']],
    }


def search(query, trees=TREES, exact=False):
    """영문명 또는 FMA ID 검색 (대소문자 무시). exact=False면 부분 일치."""
    q = query.strip().lower()
    by_id = bool(re.fullmatch(r'fma\d+', q))
    results = []
    for tree in trees:
        index = load_index(tree)
        for c in index['concepts'].values():
            key = c['concept_id'].lower() if by_id else c['name'].lower()
            hit = key == q if (exact or by_id) else q in key
            if hit:
                results.append(summarize(index, c))
    results.sort(key=lambda r: (r['name'].lower() != q, len(r['name']), r['tree']))
    return results


def components(concept_id, tree):
    index = load_index(tree)
    c = index['concepts'].get(concept_id)
    if not c:
        return []
    out = []
    for fj in c['elements']:
        o = index['objs'].get(fj)
        out.append({'element_file_id': fj, 'obj_exists': o is not None,
                    'element_concept_id': o.get('concept_id') if o else None,
                    'element_name': o.get('name') if o else None,
                    'representation_id': o.get('representation_id') if o else None,
                    'bounds_mm': o.get('bounds_mm') if o else None})
    return out


def relations(concept_id, tree):
    index = load_index(tree)
    cs = index['concepts']
    c = cs.get(concept_id)
    if not c:
        return None
    ancestors, seen, stack = [], set(), list(c['parents'])
    while stack:
        p = stack.pop()
        if p in seen or p not in cs:
            continue
        seen.add(p)
        ancestors.append({'concept_id': p, 'name': cs[p]['name']})
        stack.extend(cs[p]['parents'])
    return {'concept_id': concept_id, 'name': c['name'],
            'parents': [{'concept_id': p, 'name': cs[p]['name']} for p in c['parents'] if p in cs],
            'children': [{'concept_id': x, 'name': cs[x]['name']} for x in c['children'] if x in cs],
            'ancestors': ancestors}


def write_out(rows, path):
    path = Path(path)
    if path.suffix.lower() == '.csv':
        with path.open('w', newline='', encoding='utf-8') as f:
            if rows:
                w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
                w.writeheader()
                for r in rows:
                    w.writerow({k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v) for k, v in r.items()})
    else:
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')


def main(argv=None):
    ap = argparse.ArgumentParser(description='BodyParts3D 검색 도구')
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('search'); s.add_argument('query'); s.add_argument('--tree', choices=TREES)
    s.add_argument('--exact', action='store_true'); s.add_argument('--json'); s.add_argument('--csv')
    c = sub.add_parser('components'); c.add_argument('concept_id'); c.add_argument('--tree', choices=TREES, required=True)
    c.add_argument('--json'); c.add_argument('--csv')
    r = sub.add_parser('relations'); r.add_argument('concept_id'); r.add_argument('--tree', choices=TREES, required=True)
    i = sub.add_parser('index'); i.add_argument('--tree', choices=TREES)
    a = ap.parse_args(argv)

    if a.cmd == 'index':
        for t in ([a.tree] if a.tree else TREES):
            idx = build_index(t)
            print(t, 'concepts', len(idx['concepts']), 'objs', len(idx['objs']))
        return
    if a.cmd == 'search':
        rows = search(a.query, [a.tree] if a.tree else TREES, a.exact)
    elif a.cmd == 'components':
        rows = components(a.concept_id, a.tree)
    else:
        print(json.dumps(relations(a.concept_id, a.tree), ensure_ascii=False, indent=2))
        return
    for row in rows[:60]:
        print(json.dumps(row, ensure_ascii=False))
    print(f'-- {len(rows)}건', file=sys.stderr)
    if getattr(a, 'json', None):
        write_out(rows, a.json)
    if getattr(a, 'csv', None):
        write_out(rows, a.csv)


if __name__ == '__main__':
    main()
