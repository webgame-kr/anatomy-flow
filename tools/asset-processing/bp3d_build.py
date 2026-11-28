"""BodyParts3D 변환 파이프라인: 계획 → 선택 추출 → Blender 변환 (개발 도구 — 수업 범위 밖)

  python tools/asset-processing/bp3d_build.py plan    tools/asset-processing/specs/cardiovascular.json
  python tools/asset-processing/bp3d_build.py extract tools/asset-processing/specs/cardiovascular.json
  python tools/asset-processing/bp3d_build.py convert tools/asset-processing/specs/cardiovascular.json
  python tools/asset-processing/bp3d_build.py all     tools/asset-processing/specs/cardiovascular.json

- plan: 사양(spec)의 파트를 실제 element file ID로 풀고, 중복·누락·겹침을 기록한다.
        한 element는 먼저 나온 파트 하나에만 들어간다. 결과: tools/out/<system>/plan.json
- extract: 계획에 필요한 OBJ만 ZIP에서 꺼낸다(전체 해제 안 함). 이미 같은 파일이 있으면 건너뛴다.
           경로 검증(파일명 ^FJ\\d+M?\\.obj$, 대상 폴더 밖 쓰기 금지), 원본 CRC·SHA-256 기록.
           결과: raw-models/bodyparts3d/extracted/<tree>/FJxxxx.obj + manifest.csv
- convert: Blender 5.x를 백그라운드로 실행해 tools/blender/bp3d_to_glb.py로 GLB를 만든다.
"""
import csv
import hashlib
import json
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bp3d_catalog as cat  # noqa: E402

BLENDER = Path(r'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe')
SAFE_NAME = re.compile(r'^FJ\d+M?\.obj$')


def load_spec(path):
    spec = json.loads(Path(path).read_text(encoding='utf-8'))
    out_dir = cat.ROOT / 'tools' / 'out' / spec['system']
    return spec, out_dir


def plan(spec_path):
    spec, out_dir = load_spec(spec_path)
    tree = spec['tree']
    index = cat.load_index(tree)
    cs, objs = index['concepts'], index['objs']
    # STEP 04-B+: 파트마다 다른 트리(예: IS-A에만 있는 FJ2428 심실 벽)를 쓸 수 있다: part["tree"]
    other = {t: cat.load_index(t) for t in cat.TREES if t != tree}
    assigned = {}                 # element → part id (전체 자산 공통, 중복 방지)
    problems = []
    assets = []

    # 1차: concept로 지정한 파트, 2차: rest_of(남은 element 키워드 분류) 파트
    for phase in ('concept', 'rest_of'):
        for a in spec['assets']:
            for p in a['parts']:
                if phase not in p:
                    continue
                ptree = p.get('tree', tree)
                pidx = index if ptree == tree else other[ptree]
                pcs, pobjs = pidx['concepts'], pidx['objs']
                p['_tree'] = ptree
                if phase == 'concept':
                    c = pcs.get(p['concept'])
                    if not c:
                        problems.append(f"{p['id']}: concept {p['concept']} 없음")
                        p['_elements'] = []
                        continue
                    wanted = list(c['elements'])
                    p['_concept'] = {'concept_id': c['concept_id'], 'representation_id': c['representation_id'],
                                     'name': c['name'], 'kind': c['kind']}
                else:
                    c = pcs.get(p['rest_of'])
                    if not c:
                        problems.append(f"{p['id']}: rest_of {p['rest_of']} 없음")
                        p['_elements'] = []
                        continue
                    kws = [k.lower() for k in p.get('keywords', [])]
                    wanted = [fj for fj in c['elements']
                              if fj not in assigned and fj in pobjs
                              and (not kws or any(k in pobjs[fj].get('name', '').lower() for k in kws))]
                    p['_concept'] = {'concept_id': c['concept_id'], 'representation_id': c['representation_id'],
                                     'name': c['name'], 'kind': c['kind'], 'filter_keywords': kws}
                mine = []
                for fj in wanted:
                    if fj not in pobjs:
                        problems.append(f"{p['id']}: OBJ 없음 {fj}")
                        continue
                    if fj in assigned:
                        problems.append(f"{p['id']}: {fj}는 이미 {assigned[fj]}에 있음 (건너뜀)")
                        continue
                    assigned[fj] = p['id']
                    mine.append(fj)
                p['_elements'] = mine

    for a in spec['assets']:
        parts = []
        for p in a['parts']:
            els = p.get('_elements', [])
            if not els:
                problems.append(f"{p['id']}: element 0개 (파트 생략)")
                continue
            ptree = p.get('_tree', tree)
            pobjs = objs if ptree == tree else other[ptree]['objs']
            parts.append({
                'id': p['id'], 'name': p['name'], 'material': p['material'], 'source': {**p['_concept'], 'tree': ptree},
                'note': p.get('note', ''),
                'elements': [{'file_id': fj, 'tree': ptree, 'name': pobjs[fj].get('name'), 'concept_id': pobjs[fj].get('concept_id'),
                              'representation_id': pobjs[fj].get('representation_id'),
                              'bounds_mm': pobjs[fj].get('bounds_mm'),
                              'path': str(cat.BP3D / 'extracted' / ptree / (fj + '.obj'))} for fj in els],
            })
        assets.append({'asset_id': a['asset_id'], 'file': a['file'], 'display_name': a['display_name'],
                       'note': a.get('note', ''), 'parts': parts})

    # 폐 등 상위 concept 중 어느 파트에도 들어가지 않은 element 보고
    leftovers = {}
    for a in spec['assets']:
        for p in a['parts']:
            root = p.get('rest_of')
            if root and root in cs:
                left = [fj for fj in cs[root]['elements'] if fj not in assigned]
                leftovers[root] = {'name': cs[root]['name'], 'count': len(left),
                                   'names': sorted({objs[fj].get('name') for fj in left if fj in objs})[:20]}

    result = {
        'system': spec['system'], 'tree': tree, 'source_zip': index['zip'], 'source_url': cat.SOURCE_URL,
        'created': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'transform': spec['transform'], 'materials': spec['materials'],
        'output_dir': str(cat.ROOT / spec['output_dir']), 'extracted_dir': str(cat.BP3D / 'extracted' / tree),
        'assets': assets, 'preview': spec.get('preview'), 'problems': problems, 'unassigned': leftovers,
        'element_count': len(assigned),
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'plan.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"plan: 자산 {len(assets)}개, element {len(assigned)}개, 문제 {len(problems)}건 -> {out_dir / 'plan.json'}")
    for a in assets:
        print(f"  {a['file']:<26} " + ', '.join(f"{p['id']}({len(p['elements'])})" for p in a['parts']))
    for msg in problems:
        print('  !', msg)
    for root, info in leftovers.items():
        if info['count']:
            print(f"  미배정 {root} {info['name']}: {info['count']}개 (예: {info['names'][:4]})")
    return result


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def extract(spec_path):
    spec, out_dir = load_spec(spec_path)
    p = json.loads((out_dir / 'plan.json').read_text(encoding='utf-8'))
    tree = p['tree']
    dest = (cat.BP3D / 'extracted' / tree).resolve()
    dest.mkdir(parents=True, exist_ok=True)
    manifest_path = cat.BP3D / 'extracted' / 'manifest.csv'
    manifest = {}
    if manifest_path.exists():
        with manifest_path.open(encoding='utf-8') as f:
            for row in csv.DictReader(f):
                manifest[(row['tree'], row['file_id'])] = row
    need_all = sorted({(e.get('tree', tree), e['file_id']) for a in p['assets'] for part in a['parts'] for e in part['elements']})
    done = skipped = 0
    for etree in sorted({t for t, _ in need_all}):
      index = cat.load_index(etree)
      dest = (cat.BP3D / 'extracted' / etree).resolve()
      dest.mkdir(parents=True, exist_ok=True)
      need = [fj for t, fj in need_all if t == etree]
      zpath = cat.ARCH / index['zip']
      with zipfile.ZipFile(zpath) as z:
        for fj in need:
            info = index['objs'].get(fj)
            if not info:
                print('  ! OBJ 없음', fj)
                continue
            member = info['member']
            base = Path(member).name
            if not SAFE_NAME.match(base):
                raise ValueError(f'안전하지 않은 파일명: {member}')
            target = (dest / base).resolve()
            if target.parent != dest:
                raise ValueError(f'대상 폴더 밖 경로: {target}')
            data = z.read(member)
            digest = sha256(data)
            if target.exists() and sha256(target.read_bytes()) == digest:
                skipped += 1
            else:
                target.write_bytes(data)
                done += 1
            manifest[(etree, fj)] = {
                'tree': etree, 'file_id': fj, 'source_zip': index['zip'], 'zip_member': member,
                'zip_crc32': info['crc32'], 'sha256': digest, 'size': len(data),
                'concept_id': info.get('concept_id', ''), 'name': info.get('name', ''),
                'extracted_to': str(target.relative_to(cat.ROOT)).replace('\\', '/'),
                'source_url': cat.SOURCE_URL + index['zip'],
            }
    with manifest_path.open('w', newline='', encoding='utf-8') as f:
        rows = sorted(manifest.values(), key=lambda r: (r['tree'], r['file_id']))
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator='\n')
        w.writeheader()
        w.writerows(rows)
    print(f'extract: 필요 {len(need_all)}개 · 새로 {done} · 이미 있음 {skipped}')


def convert(spec_path):
    spec, out_dir = load_spec(spec_path)
    script = cat.ROOT / 'tools' / 'blender' / 'bp3d_to_glb.py'
    cmd = [str(BLENDER), '--background', '--factory-startup', '--python', str(script), '--', str(out_dir / 'plan.json')]
    print('convert:', ' '.join(f'"{c}"' if ' ' in c else c for c in cmd))
    res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    log = out_dir / 'blender.log'
    log.write_text(res.stdout + '\n--- stderr ---\n' + res.stderr, encoding='utf-8')
    for line in res.stdout.splitlines():
        if line.startswith('[bp3d]'):
            print(' ', line)
    if res.returncode != 0:
        print(res.stderr[-2000:])
        raise SystemExit(f'Blender 실패 (code {res.returncode}), 로그: {log}')


LICENSE = 'CC-BY-4.0'
LICENSE_URL = 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html'
ATTRIBUTION = 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International'
REGISTRY = cat.ROOT / 'docs' / 'references' / 'asset_registry.csv'
EXTRA_COLUMNS = ['display_name', 'concept_id', 'representation_id', 'element_file_ids', 'source_archive',
                 'coordinate_system', 'unit', 'transformation', 'mesh_count', 'triangle_count',
                 'bounding_box', 'modifications', 'metadata_file']
COORD = 'glTF Y-up: +X = patient left, +Y = superior, +Z = anterior (BodyParts3D origin, no recentering)'
TRANSFORM = 'glTF (x, y, z) = (X_obj, Z_obj, -Y_obj) * 0.001; same for every file'
MODS = ('Selected ELEMENT OBJs joined per part; uniform scale mm->m; axis conversion Z-up->Y-up at glTF export; '
        'project materials assigned; no decimation, no recentering, no shape edits')


def register(spec_path):
    """변환 보고서로 모델별 메타데이터 JSON을 쓰고 asset_registry.csv에 행을 추가·갱신한다."""
    spec, out_dir = load_spec(spec_path)
    rep = json.loads((out_dir / 'convert-report.json').read_text(encoding='utf-8'))
    plan_data = json.loads((out_dir / 'plan.json').read_text(encoding='utf-8'))
    out_rel = spec['output_dir']
    # STEP 04-B+: element마다 트리(IS-A / PART-OF)가 다를 수 있다 → 자산별로 실제 쓴 ZIP을 적는다
    tree_of = {e['file_id']: e.get('tree', plan_data.get('tree', 'partof'))
               for a in plan_data['assets'] for part in a['parts'] for e in part['elements']}
    tree_label = {'partof': 'PART-OF', 'isa': 'IS-A'}
    entries = list(rep['assets'])
    if rep.get('preview'):
        pv = dict(rep['preview'])
        pv['parts'] = [p for a in rep['assets'] for p in a['parts']]
        pv['note'] = 'All assets of this system in one file, identical coordinates'
        entries.append(pv)

    rows_new = []
    for e in entries:
        parts = e['parts']
        trees = sorted({tree_of.get(fj, plan_data.get('tree', 'partof')) for p in parts for fj in p['element_file_ids']})
        source_archive = ' + '.join(cat.ZIP_NAME[t] for t in trees)
        source_label = ' + '.join(tree_label.get(t, t) for t in trees) + (' trees' if len(trees) > 1 else ' tree')
        meta = {
            'asset_id': e['asset_id'], 'display_name': e['display_name'], 'file': f"{out_rel}/{e['file']}",
            'original_name': '; '.join(sorted({p['concept_name'] for p in parts})),
            'concept_id': [p['concept_id'] for p in parts],
            'representation_id': [p['representation_id'] for p in parts],
            'element_file_ids': {p['id']: p['element_file_ids'] for p in parts},
            'source_archive': source_archive, 'source_url': ' + '.join(cat.SOURCE_URL + cat.ZIP_NAME[t] for t in trees),
            'license': LICENSE, 'license_url': LICENSE_URL, 'attribution': ATTRIBUTION,
            'coordinate_system': COORD, 'unit': 'm', 'transformation': TRANSFORM,
            'mesh_count': e['mesh_count'], 'triangle_count': e['triangle_count'],
            'bounding_box': e['bbox_gltf_m'], 'file_size': e['file_size'],
            'verification_status': 'SOURCE_TRACED (ids, element files, bbox checked); NOT medically verified',
            'modifications': MODS, 'note': e.get('note', ''),
            'parts': [{'id': p['id'], 'name': p['name'], 'concept_id': p['concept_id'],
                       'concept_name': p['concept_name'], 'material': p['material'],
                       'element_count': len(p['element_file_ids']), 'triangles': p['mesh']['triangles'],
                       'mesh_check': {k: p['mesh'][k] for k in ('non_manifold_edges', 'boundary_edges',
                                                                 'inconsistent_winding_edges', 'degenerate_faces',
                                                                 'loose_vertices')},
                       'bbox_gltf_m': p['bbox_gltf_m']} for p in parts],
        }
        meta_path = cat.ROOT / out_rel / (Path(e['file']).stem + '.meta.json')
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
        rows_new.append({
            'asset_id': e['asset_id'], 'file_name': f"{out_rel}/{e['file']}", 'original_file_name': source_archive,
            'anatomical_system': spec['system'], 'anatomical_structure': meta['original_name'][:300],
            'source': 'BodyParts3D 4.0 (Database Center for Life Science) — ' + source_label + ', derived',
            'source_url': ' + '.join(cat.SOURCE_URL + cat.ZIP_NAME[t] for t in trees), 'license': LICENSE, 'attribution': ATTRIBUTION,
            'file_format': 'GLB (glTF 2.0 binary)', 'file_size': e['file_size'],
            'processing_status': 'CONVERTED (tools/asset-processing/bp3d_build.py + tools/blender/bp3d_to_glb.py)',
            'verification_status': meta['verification_status'], 'notes': e.get('note', ''),
            'display_name': e['display_name'], 'concept_id': ' '.join(meta['concept_id']),
            'representation_id': ' '.join(x or '' for x in meta['representation_id']),
            'element_file_ids': ' '.join(fj for p in parts for fj in p['element_file_ids']),
            'source_archive': source_archive, 'coordinate_system': COORD, 'unit': 'm', 'transformation': TRANSFORM,
            'mesh_count': e['mesh_count'], 'triangle_count': e['triangle_count'],
            'bounding_box': json.dumps(e['bbox_gltf_m']), 'modifications': MODS,
            'metadata_file': str(meta_path.relative_to(cat.ROOT)).replace('\\', '/'),
        })

    with REGISTRY.open(encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fields = list(reader.fieldnames)
        rows = list(reader)
    for col in EXTRA_COLUMNS:
        if col not in fields:
            fields.append(col)
    by_id = {r['asset_id']: r for r in rows}
    for r in rows_new:
        if r['asset_id'] in by_id:
            by_id[r['asset_id']].update(r)
        else:
            rows.append(r)
    with REGISTRY.open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator='\n')
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, '') for k in fields})
    print(f'register: 메타데이터 {len(entries)}개, 대장 {len(rows)}행 ({len(fields)}열)')


if __name__ == '__main__':
    cmd, spec_path = sys.argv[1], sys.argv[2]
    if cmd in ('plan', 'all'):
        plan(spec_path)
    if cmd in ('extract', 'all'):
        extract(spec_path)
    if cmd in ('convert', 'all'):
        convert(spec_path)
    if cmd in ('register', 'all'):
        register(spec_path)
