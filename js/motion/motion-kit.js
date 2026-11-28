// Motion Kit (STEP 03-C): 경로·Actor·이동·명령 모듈을 한 번에 조립하고, 장면 이동 데이터(JSON)를 불러온다.
// Sandbox(main.js)와 Anatomy Explorer(anatomy-explorer.js)가 같은 방식으로 쓴다.
//
// 장면 이동 데이터 형식 (content/sandbox/motion/*.json, content/anatomy/cardiovascular/paths.json + actors.json)
//   { scene_id, marker_size, follow: {distance, height, side}, paths: [...], actors: [...] }

import { createPathEngine } from './path-engine.js';
import { createActorManager } from './actor-manager.js';
import { createMotionController } from './motion-controller.js';
import { createMotionCommands } from './motion-commands.js';

export function createMotionKit({ scene, registry, tracker, materials, camera, anchors = null, log = () => {} }) {
  const paths = createPathEngine({ scene, registry, anchors, log });
  const actors = createActorManager({ registry, tracker, materials, log });
  const motion = createMotionController({ paths, actors, log });
  const commands = createMotionCommands({ paths, actors, motion, camera });
  camera.setExtraBounds(() => paths.bounds());   // 전체 보기·프리셋에 경로 범위 포함
  let data = null;

  // 장면 이동 데이터 적용: 경로 → Actor 생성 → 경로 지정
  function apply(doc, actorDoc = null) {
    motion.cancelAll('scene_load');
    camera.stopFollow();
    actors.clear();
    data = doc;
    if (Number.isFinite(doc.marker_size)) paths.setMarkerSize(doc.marker_size);
    if (doc.follow) camera.setFollowOptions(doc.follow);
    const res = paths.load(doc);
    if (!res.ok) {
      log(`경로 데이터 오류: ${res.errors.join(' / ')}`, 'error');
      return res;
    }
    for (const e of res.errors) log(`경로 검사: ${e}`, 'error');
    for (const w of res.warnings || []) log(`경로 검사: ${w}`, 'warn');
    const list = (actorDoc && actorDoc.actors) || doc.actors || [];
    for (const spec of list) {
      const r = actors.create(spec);
      if (!r.ok) { log(`Actor 생성 실패 (${spec.actor_id}): ${r.error}`, 'error'); continue; }
      if (spec.path_id) {
        const p = motion.setPath(spec.actor_id, spec.path_id, { progress: spec.progress, direction: spec.direction });
        if (!p.ok) log(`Actor 경로 지정 실패 (${spec.actor_id}): ${p.error}`, 'error');
      }
    }
    log(`이동 데이터: 경로 ${paths.ids().length}개 · Actor ${actors.ids().length}개`);
    return res;
  }

  async function loadUrl(url, actorsUrl = null) {
    const doc = await (await fetch(url, { cache: 'no-cache' })).json();
    const actorDoc = actorsUrl ? await (await fetch(actorsUrl, { cache: 'no-cache' })).json() : null;
    return apply(doc, actorDoc);
  }

  // 장면 전환 전에 부른다: 이동·이벤트 취소, 경로 제거 (Actor는 레지스트리 정리 때 함께 해제)
  function unload() {
    motion.cancelAll('scene_change');
    camera.stopFollow();
    paths.clear();
    data = null;
  }

  // Python에 보낼 경로·Checkpoint ID (좌표 없음)
  function pathSnapshot() {
    return paths.ids().map((id) => ({ id, checkpoints: paths.checkpoints(id).map((c) => c.checkpoint_id) }));
  }

  return {
    paths, actors, motion, commands,
    apply, loadUrl, unload, pathSnapshot,
    tick(dt) { paths.tick(); motion.tick(dt); },
    get data() { return data; },
  };
}
