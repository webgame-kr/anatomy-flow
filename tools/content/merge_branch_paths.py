# STEP 04-B+ 개발 도구 (수업 범위 밖): 브라우저에서 만든 가지 혈관 경로를 별도 파일로 저장한다
# 입력: tools/out/browser/branch-paths.json (tools/validation/trace-branch-paths.mjs 결과를 receive_json.py로 저장)
# 출력: content/anatomy/cardiovascular/paths-branches.json
#   - 기존 paths.json(학습 게임이 쓰는 9개)과 나눈다. 가지 경로는 지연 로딩 자산(systemic-vessels.glb)을 가리키므로
#     Play가 함께 읽으면 "없는 객체" 오류가 난다. Explorer 개발자 모드만 자산을 불러온 뒤 이 파일을 더한다.
# 실행: python tools/content/merge_branch_paths.py
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'tools', 'out', 'browser', 'branch-paths.json')
DST = os.path.join(ROOT, 'content', 'anatomy', 'cardiovascular', 'paths-branches.json')
STRUCT = os.path.join(ROOT, 'tools', 'asset-processing', 'anatomy', 'cardiovascular.structures.src.json')

new = json.load(open(SRC, encoding='utf-8'))['paths']
names = {s['id']: s['ko'] for s in json.load(open(STRUCT, encoding='utf-8'))['structures']}

for p in new:
    for c in p.get('checkpoints', []):
        if not c.get('label'):
            c['label'] = names.get(c.get('anatomical_id'), c.get('anatomical_id'))
    p.get('geometry_check', {}).pop('runs', None)
    p['step'] = '04-B+'

doc = {
    'version': 1, 'scene_id': 'anatomy_cardiovascular',
    'description': 'STEP 04-B+ 가지 혈관 경로(폐정맥 3개, 목·팔·다리 동맥, 팔·다리·목 정맥). 학습 게임(Play)은 쓰지 않는다. Explorer 개발자 모드에서 paths.json 뒤에 더한다.',
    'coordinate_note': '중심선 점은 해당 혈관 메시의 object-local 좌표(m). 폐정맥 경로 끝은 Anchor(a.la.cavity).',
    'requires_assets': sorted({q['object_id'].split('/')[0] for p in new for q in p['points'] if q.get('object_id')}),
    'paths': new,
    'generator': 'tools/validation/trace-branch-paths.mjs (centerline-tracer + checkPathGeometryAsync) → tools/content/merge_branch_paths.py',
}
json.dump(doc, open(DST, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
cnt = {}
for p in new:
    cnt[p['verification_status']] = cnt.get(p['verification_status'], 0) + 1
print('branch paths', len(new), cnt, '->', DST)
