# STEP 04-B+ 자산 대장 확장 (개발 도구, 수업 범위 밖)
# 1) 파이프라인(bp3d_build.py) 밖에서 만든 자산의 meta.json과 대장 행을 만든다(GLB를 읽어 메시·삼각형·클립·Morph를 센다).
# 2) 모든 행에 확장 열을 채운다: source_category, source_version, animation, rig, technical_status, anatomy_review_status, deployable
#    - 모르는 값은 UNKNOWN, 검토 전은 NOT_REVIEWED. 추측해서 채우지 않는다.
# 실행: python tools/asset-processing/registry_extend.py   (bp3d_build.py register 뒤에 다시 실행)
import csv
import hashlib
import json
import os
import struct

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REG = os.path.join(ROOT, 'docs', 'references', 'asset_registry.csv')
NEW_COLS = ['source_category', 'source_version', 'animation', 'rig', 'technical_status', 'anatomy_review_status', 'deployable']
BP_ATTR = 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International'
ZA_ATTR = ('Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0; includes BodyParts3D - The Database Center for Life Science - '
           'CC-BY-SA 2.1 Japan; vagus may be adapted from "Cranial Nerves and Foramina - by University of Dundee, CAHID - CC-BY 4.0"')
SELF = 'Project-made (same terms as this repository)'
COORD = 'glTF Y-up: +X = patient left, +Y = superior, +Z = anterior (BodyParts3D origin, no recentering)'


def glb_info(path):
    b = open(os.path.join(ROOT, path), 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    acc = j.get('accessors', [])
    tris = 0
    morph = set()
    for m in j.get('meshes', []):
        for pr in m['primitives']:
            if 'indices' in pr:
                tris += acc[pr['indices']]['count'] // 3
            else:
                tris += acc[pr['attributes']['POSITION']]['count'] // 3
        for t in (m.get('extras') or {}).get('targetNames', []):
            morph.add(t)
    nodes = [nd.get('name') for nd in j.get('nodes', []) if 'mesh' in nd]
    return {'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'meshes': len(nodes), 'mesh_nodes': nodes, 'triangles': tris,
            'clips': [a['name'] for a in j.get('animations', [])], 'morph_targets': sorted(morph)}


EXTRA = [
    {'asset_id': 'bp3d-cv-heart-v2-regions', 'file_name': 'assets/anatomy/cardiovascular/heart-v2-ventricle-regions.glb',
     'anatomical_system': 'cardiovascular', 'anatomical_structure': 'wall of ventricle (FJ2428) split into LV free wall / RV free wall / septal region',
     'source': 'BodyParts3D 4.0 IS-A FJ2428 + PART-OF cavities FJ2422, FJ2423 — derived (geometric split)', 'license': 'CC-BY-4.0', 'attribution': BP_ATTR,
     'processing_status': 'GENERATED (tools/blender/split_ventricle_wall.py)', 'source_category': 'BodyParts3D', 'source_version': '4.0 obj_99',
     'verification_status': 'GEOMETRY_DERIVED split (face-to-cavity distance, septum = between both cavities within 15 mm); NOT an anatomical segmentation; NOT medically verified',
     'notes': '중격 영역 6,791면(면적 12%). 경계는 앞·뒤 심실사이고랑을 따르지 않는다. Morph contract는 교육용 근사.',
     'modifications': 'faces split into 3 objects by distance to LV/RV cavities; shape key contract (pull toward cavity centroid 12/15/5%); uniform scale mm->m; Z-up->Y-up',
     'license_file': 'assets/licenses/bodyparts3d.md', 'technical_status': 'BUILT; independent select + morph tested in Sandbox (HC/HV)'},
    {'asset_id': 'bp3d-cv-heart-v2-valves-rig', 'file_name': 'assets/anatomy/cardiovascular/heart-v2-valves-rig.glb',
     'anatomical_system': 'cardiovascular', 'anatomical_structure': '11 valve leaflets/cusps (incl. chordae in AV leaflet elements) + 5 papillary muscles, open shape keys',
     'source': 'BodyParts3D 4.0 PART-OF leaflet/cusp/papillary OBJs — derived (rig)', 'license': 'CC-BY-4.0', 'attribution': BP_ATTR,
     'processing_status': 'GENERATED (tools/blender/rig_valves.py)', 'source_category': 'BodyParts3D', 'source_version': '4.0 obj_99',
     'verification_status': 'EDUCATIONAL_APPROXIMATION (hinge-rotation shape keys); not tissue deformation; NOT medically verified',
     'notes': '판막 그룹마다 Morph open(첨판·유두근 함께). 방실판막 첨판 element에 힘줄끈이 들어 있어 유두근 근처 정점은 유두근 변위를 따른다. 닫힌 모양을 기본으로 가정.',
     'modifications': 'shape key open per mesh (hinge rotation about annulus, AV +5 mm downstream push, chordae anchored near papillary); papillary open = +10% length; NLA clips <valve>_open/_close; uniform scale mm->m; Z-up->Y-up',
     'license_file': 'assets/licenses/bodyparts3d.md', 'technical_status': 'BUILT; state transitions + through-blocking tested in Sandbox (HV); GLB clips play but reset at end (mixer restore) → states use morph type'},
    {'asset_id': 'nf-micro-alveolus', 'file_name': 'assets/micro/alveolus-concept.glb', 'anatomical_system': 'respiratory/cardiovascular (micro)',
     'anatomical_structure': 'alveolar sac (cut-away), alveolar wall, pulmonary capillary network, exchange-zone inset, RBC, O2/CO2',
     'source': 'Project-made (tools/blender/make_micro_concepts.py)', 'license': SELF, 'attribution': 'NURSE FLOW 3D project',
     'processing_status': 'GENERATED', 'source_category': 'Self-made', 'source_version': 'project',
     'verification_status': 'CONCEPTUAL; simplified educational shapes; NOT an anatomical model; NOT medically verified',
     'notes': '크기는 일반 참고값(강의자료 미확인). 입자 개수·속도는 의미 없음.', 'modifications': 'n/a (made from primitives)',
     'license_file': 'assets/licenses/nf-micro-concept.md', 'technical_status': 'BUILT; clips play in Sandbox (MA)'},
    {'asset_id': 'nf-micro-tissue-capillary', 'file_name': 'assets/micro/tissue-capillary-concept.glb', 'anatomical_system': 'cardiovascular (micro)',
     'anatomical_structure': 'arteriole with smooth muscle rings, capillary network, venule, tissue cells, RBC, O2/nutrients, CO2/waste',
     'source': 'Project-made (tools/blender/make_micro_concepts.py)', 'license': SELF, 'attribution': 'NURSE FLOW 3D project',
     'processing_status': 'GENERATED', 'source_category': 'Self-made', 'source_version': 'project',
     'verification_status': 'CONCEPTUAL; simplified educational shapes; NOT an anatomical model; NOT medically verified',
     'notes': '세동맥 고리는 모세혈관앞 조임근을 단순화한 표시.', 'modifications': 'n/a (made from primitives)',
     'license_file': 'assets/licenses/nf-micro-concept.md', 'technical_status': 'BUILT; clips play in Sandbox (MB)'},
    {'asset_id': 'nf-micro-vessel-wall', 'file_name': 'assets/micro/vessel-wall-concept.glb', 'anatomical_system': 'cardiovascular (micro)',
     'anatomical_structure': 'artery wall cross-section 270°: intima, internal elastic lamina, media + smooth muscle cells, external elastic lamina, adventitia, vasa vasorum, lumen',
     'source': 'Project-made (tools/blender/make_micro_concepts.py)', 'license': SELF, 'attribution': 'NURSE FLOW 3D project',
     'processing_status': 'GENERATED', 'source_category': 'Self-made', 'source_version': 'project',
     'verification_status': 'CONCEPTUAL; simplified educational shapes; NOT an anatomical model; NOT medically verified',
     'notes': 'Shape Key constrict(내강 0.30→0.20, 중막 두꺼워짐)/dilate(내강 0.30→0.40). 층 두께·세포 수는 교육용 값.', 'modifications': 'n/a (made from primitives)',
     'license_file': 'assets/licenses/nf-micro-concept.md', 'technical_status': 'BUILT; tone states tested in Sandbox (MC)'},
    {'asset_id': 'za-reg-nerves-thyroid', 'file_name': 'assets/anatomy/regulation/za-nerves-thyroid.glb', 'anatomical_system': 'nervous/endocrine (STEP 04-C prep)',
     'anatomical_structure': 'thyroid gland; left/right vagus nerve; left/right sympathetic trunk; left/right sympathetic trunk ganglia',
     'source': 'Z-Anatomy Startup.blend (Z-Anatomy.zip) — derived, separate file', 'license': 'CC-BY-SA-4.0', 'attribution': ZA_ATTR,
     'processing_status': 'GENERATED (tools/blender/za_extract_regulation.py, --disable-autoexec)', 'source_category': 'Z-Anatomy',
     'source_version': 'Z-Anatomy.zip sha256 e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736 (downloaded 2026-11-28)',
     'verification_status': 'LICENSE_CHECKED per object (not NC items); ALIGNED by measured translation (right vagus to right CCA median 12.6 mm); NOT medically verified',
     'notes': 'BodyParts3D 자산과 합치지 않은 별도 파일(CC BY-SA). 척수(White matter of spinal cord)는 Readme의 출처 불명 "White matter"와 관계를 확인하지 못해 넣지 않았다.',
     'modifications': 'modifiers applied (mirror/solidify/subsurf); curves to tube meshes (original bevel 0.5 mm); translated by -T=(-0.0013,-0.0975,-0.0643) m to BodyParts3D frame; Z-up->Y-up; materials recolored',
     'license_file': 'assets/licenses/z-anatomy.md', 'technical_status': 'BUILT; loaded in Sandbox (RP)'},
    {'asset_id': 'organui-heart-3d', 'file_name': 'NOT_DOWNLOADED', 'anatomical_system': 'cardiovascular',
     'anatomical_structure': 'heart (11 structures incl. ventricular wall FJ2428), recentred and scaled 0.02',
     'source': 'OrganUI heart-3d (survey only)', 'license': 'code MIT; model CC-BY-4.0 (BodyParts3D)', 'attribution': BP_ATTR,
     'processing_status': 'SURVEYED (not used)', 'source_category': 'OrganUI', 'source_version': 'heart.glb 2,524,400 bytes sha256 b80a727d…a946 (site survey)',
     'verification_status': 'SURVEY: same BodyParts3D geometry; recentred (incompatible with project origin) → not merged',
     'notes': '같은 FJ2428을 원본 아카이브에서 직접 꺼내 heart-v2에 썼다. OrganUI 모델·React UI를 쓰지 않았다.', 'modifications': 'n/a', 'license_file': '',
     'technical_status': 'NOT_USED'},
]


def main():
    with open(REG, encoding='utf-8') as f:
        rd = csv.DictReader(f)
        fields = list(rd.fieldnames)
        rows = list(rd)
    for c in NEW_COLS + ['license_file', 'sha256']:
        if c not in fields:
            fields.append(c)
    by = {r['asset_id']: r for r in rows}
    for e in EXTRA:
        r = by.get(e['asset_id'])
        if not r:
            r = {'asset_id': e['asset_id']}
            rows.append(r)
            by[e['asset_id']] = r
        r.update(e)
        if e['file_name'].endswith('.glb'):
            info = glb_info(e['file_name'])
            r.update({'file_format': 'GLB (glTF 2.0 binary)', 'file_size': info['bytes'], 'mesh_count': info['meshes'], 'triangle_count': info['triangles'],
                      'sha256': info['sha256'], 'coordinate_system': COORD if not e['asset_id'].startswith('nf-micro') else 'glTF Y-up (concept model space)',
                      'unit': 'm', 'animation': ', '.join(info['clips']) or 'none',
                      'rig': ('shape keys: ' + ', '.join(info['morph_targets'])) if info['morph_targets'] else 'none'})
            meta = {k: e[k] for k in e}
            meta.update({'glb': info})
            mp = e['file_name'][:-4] + '.meta.json'
            json.dump(meta, open(os.path.join(ROOT, mp), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
            r['metadata_file'] = mp
    # Z-Anatomy 원본 행: 내려받음
    if 'z-anatomy-models' in by:
        z = by['z-anatomy-models']
        z.update({'file_name': 'raw-models/z-anatomy/Z-Anatomy.zip', 'processing_status': 'DOWNLOADED 2026-11-28 (raw, git-ignored); extracted Startup.blend',
                  'file_size': 86734957, 'sha256': 'e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736',
                  'source_category': 'Z-Anatomy', 'source_version': 'GitHub release Z-Anatomy.zip (Startup.blend 306,838,281 bytes, 7,184 objects)'})
    for r in rows:
        aid = r['asset_id']
        fn = r.get('file_name', '')
        if not r.get('source_category'):
            r['source_category'] = ('BodyParts3D' if aid.startswith('bp3d') else 'Z-Anatomy' if aid.startswith(('za-', 'z-anatomy')) else
                                    'Self-made' if aid.startswith('nf-') else 'Other public' if aid.startswith('test-') else 'UNKNOWN')
        if not r.get('source_version'):
            r['source_version'] = '4.0 obj_99' if aid.startswith('bp3d') else ('project' if aid.startswith('nf-') else 'UNKNOWN')
        if not r.get('animation'):
            if fn.endswith('.glb') and os.path.exists(os.path.join(ROOT, fn)):
                info = glb_info(fn)
                r['animation'] = ', '.join(info['clips']) or 'none'
                r['rig'] = ('shape keys: ' + ', '.join(info['morph_targets'])) if info['morph_targets'] else ('none')
                r.setdefault('sha256', info['sha256'])
                if not r.get('sha256'):
                    r['sha256'] = info['sha256']
            else:
                r['animation'] = r.get('animation') or ('runtime (content/animations)' if 'procedural' in fn or 'runtime' in r.get('processing_status', '') else 'n/a')
                r['rig'] = r.get('rig') or 'n/a'
        if not r.get('technical_status'):
            ps = r.get('processing_status', '')
            r['technical_status'] = ('RAW (not deployed)' if fn.startswith('raw-models') or 'ARCHIVED' in ps else
                                     'CONVERTED; roundtrip diff 0' if 'CONVERTED' in ps else ps.split(' ')[0] or 'UNKNOWN')
        r['anatomy_review_status'] = ('NOT_APPLICABLE (test asset)' if r['source_category'] == 'Other public' or aid in ('nf-test-rig', 'nf-anim-test') else
                                      'CONCEPTUAL (not an anatomical model)' if aid.startswith('nf-') else 'NOT_REVIEWED (no expert review)')
        lic = r.get('license', '')
        raw = fn.startswith(('raw-models', 'assets/test-models')) or fn in ('PENDING', 'NOT_DOWNLOADED')
        nc = 'NC' in lic
        r['deployable'] = ('NO (NC license)' if nc and aid.startswith('test-') else 'NO (not used)' if r.get('technical_status') == 'NOT_USED' else
                           'NO (raw/source archive, git-ignored)' if raw else
                           'YES' if lic.startswith(('CC-BY-4.0', 'CC-BY-SA-4.0', 'Project-made')) else 'NO (license not confirmed)')
        if not r.get('license_file'):
            r['license_file'] = ('assets/licenses/bodyparts3d.md' if r['source_category'] == 'BodyParts3D' and not raw else
                                 'assets/licenses/nf-actor-models.md' if aid == 'nf-actor-models' else
                                 'assets/licenses/nf-animation-models.md' if aid in ('nf-anim-test', 'nf-cardiac-concept') else
                                 'assets/licenses/nf-micro-concept.md' if aid == 'nf-micro-concept' else
                                 'assets/licenses/nf-test-rig.md' if aid == 'nf-test-rig' else '')
    with open(REG, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator='\n')
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, '') for k in fields})
    print('registry rows', len(rows), 'cols', len(fields))
    for r in rows:
        print('  {:30s} {:12s} {:28s} {}'.format(r['asset_id'], r['source_category'], r['deployable'][:28], r.get('triangle_count', '')))


if __name__ == '__main__':
    main()
