"""해부학 구조·Anchor 데이터 생성 (개발 도구 — 수업 범위 밖)

  python tools/asset-processing/anatomy_data.py tools/asset-processing/anatomy/cardiovascular.structures.src.json

입력: 사람이 쓴 구조 정의(*.structures.src.json) + assets/anatomy/*/*.meta.json + 추출 OBJ
출력: content/anatomy/<system>/structures.json, anchors.json

- members는 "asset_id:노드이름"(GLB 메시 이름)으로 명시한다. Three.js UUID는 쓰지 않는다.
- element ID·FMA·삼각형 수는 meta.json에서 가져온다(직접 입력하지 않음).
- Anchor 씨앗은 해당 파트 element OBJ의 정점 평균(centroid)을 glTF 좌표(m)로 계산한다.
  파트 노드의 변환이 단위 행렬이므로 이 값이 곧 객체 로컬 좌표다. 해부학적 위치 검증은 아니다.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International'
LICENSE = 'CC-BY-4.0'
EXTRACTED = ROOT / 'raw-models' / 'bodyparts3d' / 'extracted' / 'partof'


def load_meta():
    nodes = {}
    assets = {}
    for path in sorted((ROOT / 'assets' / 'anatomy').glob('*/*.meta.json')):
        meta = json.loads(path.read_text(encoding='utf-8'))
        if 'preview' in meta['asset_id']:
            continue
        assets[meta['asset_id']] = {'file': meta['file'], 'triangles': meta['triangle_count'],
                                    'file_size': meta['file_size'], 'parts': [p['id'] for p in meta['parts']]}
        for p in meta['parts']:
            nodes[f"{meta['asset_id']}:{p['id']}"] = {
                'asset_id': meta['asset_id'], 'node': p['id'], 'concept_id': p['concept_id'],
                'element_file_ids': meta['element_file_ids'][p['id']], 'triangles': p['triangles'],
                'bbox_gltf_m': p['bbox_gltf_m']}
    return nodes, assets


def expand(member, nodes, assets):
    asset, node = member.split(':', 1)
    if node == '*':
        if asset not in assets:
            raise SystemExit(f'없는 자산: {asset}')
        return [f'{asset}:{n}' for n in assets[asset]['parts']]
    if member not in nodes:
        raise SystemExit(f'meta.json에 없는 노드: {member}')
    return [member]


def centroid(element_ids):
    sx = sy = sz = 0.0
    n = 0
    for fj in element_ids:
        path = EXTRACTED / f'{fj}.obj'
        if not path.exists():
            raise SystemExit(f'추출 OBJ 없음 (bp3d_build.py extract 필요): {path}')
        for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
            if line.startswith('v '):
                x, y, z = (float(v) for v in line.split()[1:4])
                sx += x
                sy += y
                sz += z
                n += 1
    # 원본 mm (X, Y, Z) → glTF m (X, Z, -Y) × 0.001 (STEP 03-A와 같은 변환)
    return [round(sx / n * 0.001, 5), round(sz / n * 0.001, 5), round(-sy / n * 0.001, 5)], n


def main(src_path):
    src = json.loads(Path(src_path).read_text(encoding='utf-8'))
    system = src['system']
    nodes, assets = load_meta()
    out_dir = ROOT / 'content' / 'anatomy' / system
    out_dir.mkdir(parents=True, exist_ok=True)

    ids = {s['id'] for s in src['structures']}
    structures = []
    for s in src['structures']:
        if s.get('parent') and s['parent'] not in ids:
            raise SystemExit(f"{s['id']}: 없는 parent {s['parent']}")
        members = []
        for m in s['members']:
            members.extend(expand(m, nodes, assets))
        elements = []
        tris = 0
        for m in members:
            elements.extend(nodes[m]['element_file_ids'])
            tris += nodes[m]['triangles']
        status = s.get('status') or ('AVAILABLE' if members else 'MISSING')
        structures.append({
            'anatomical_id': s['id'], 'name_ko': s['ko'], 'name_en': s['en'], 'aliases': s.get('aliases', []),
            'fma_id': s.get('fma'), 'anatomical_system': system if s['id'].startswith('cv.') else 'context',
            'anatomical_group': s['group'], 'parent_id': s.get('parent'), 'children': [],
            'objects': [{'asset_id': nodes[m]['asset_id'], 'node': nodes[m]['node']} for m in members],
            'asset_ids': sorted({nodes[m]['asset_id'] for m in members}),
            'element_file_ids': elements, 'triangle_count': tris,
            'model_status': status, 'selectable': bool(members),
            'internal_structure_available': bool(s.get('internal')) and bool(members),
            'source': SOURCE if members else None, 'license': LICENSE if members else None,
            'verification_status': ('SOURCE_TRACED (FMA/element ids from BodyParts3D metadata); NOT medically verified'
                                    if members else 'MISSING in BodyParts3D 4.0'),
            'notes': s.get('notes', ''),
        })
    by_id = {s['anatomical_id']: s for s in structures}
    for s in structures:
        if s['parent_id']:
            by_id[s['parent_id']]['children'].append(s['anatomical_id'])

    (out_dir / 'structures.json').write_text(json.dumps({
        'system': system, 'generated_by': 'tools/asset-processing/anatomy_data.py',
        'source_definition': str(Path(src_path).resolve().relative_to(ROOT)).replace('\\', '/'),
        'structures': structures}, ensure_ascii=False, indent=2), encoding='utf-8')

    scene_id = f'anatomy_{system}'
    anchors = []
    for a in src.get('anchor_seeds', []):
        node = nodes[a['member']]
        pos, count = centroid(node['element_file_ids'])
        anchors.append({
            'anchor_id': a['anchor_id'], 'scene_id': scene_id, 'anatomical_id': a['anatomical_id'],
            'object': {'asset_id': node['asset_id'], 'node': node['node']},
            'object_id': f"{node['asset_id']}/{node['node']}",
            'name_ko': a['ko'], 'name_en': a['en'], 'position': pos, 'coordinate_space': 'object_local',
            'optional_direction': None,
            'verification_status': 'GEOMETRY_DERIVED (vertex centroid); NOT anatomically verified',
            'notes': f"{node['node']} element {len(node['element_file_ids'])}개 정점 {count}개의 평균. "
                     '열린·오목한 메시는 평균점이 내강 밖일 수 있으니 단면으로 확인할 것.',
        })
    candidates = [{'anatomical_id': aid, 'name_ko': ko, 'status': 'PENDING',
                   'notes': '경로 제작 후보. 모델 형상을 확인한 뒤 위치를 정한다.'} for aid, ko in src.get('anchor_candidates', [])]
    for c in candidates:
        if c['anatomical_id'] not in by_id:
            raise SystemExit(f"후보 {c['anatomical_id']}: 없는 구조")
    (out_dir / 'anchors.json').write_text(json.dumps({
        'version': 1, 'scene_id': scene_id,
        'coordinate_note': 'position은 object(asset_id + node)의 로컬 좌표(m). 장면 좌표 = 객체 matrixWorld × position.',
        'anchors': anchors, 'candidates': candidates}, ensure_ascii=False, indent=2), encoding='utf-8')

    missing = [s['anatomical_id'] for s in structures if s['model_status'] == 'MISSING']
    partial = [s['anatomical_id'] for s in structures if s['model_status'] == 'PARTIAL']
    print(f'structures {len(structures)} (MISSING {missing}, PARTIAL {partial}) · anchors {len(anchors)} · candidates {len(candidates)}')
    for a in anchors:
        print('  ', a['anchor_id'], a['position'])


if __name__ == '__main__':
    main(sys.argv[1])
