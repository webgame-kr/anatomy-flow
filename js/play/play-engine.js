// Play 화면용 엔진 조립 (STEP 03-D)
// STEP 02 엔진 + STEP 03-B 해부학 레이어 + STEP 03-C 이동 엔진을 그대로 조립한다. 새 렌더링 루프를 만들지 않는다.
// 장면 종류
//   anatomy: 해부학 scene.json (Anatomy Manager, 라벨, Anchor, 경로·Actor)
//   sandbox: content/sandbox/scenes.json의 시험 장면(교육용 개념 장면)

import * as THREE from 'three';
import { checkWebGL, createViewport } from '../engine/viewport.js';
import { createResourceTracker } from '../engine/resource-tracker.js';
import { createRegistry } from '../engine/object-registry.js';
import { createObjectManager } from '../engine/object-manager.js';
import { createMaterialController } from '../engine/material-controller.js';
import { createCameraController } from '../engine/camera-controller.js';
import { createSelectionController } from '../engine/selection-controller.js';
import { createClippingController } from '../engine/clipping-controller.js';
import { createModelLoader } from '../engine/model-loader.js';
import { createSceneManager } from '../engine/scene-manager.js';
import { createCommandRunner } from '../engine/command-runner.js';
import { createPythonClient } from '../python/py-client.js';
import { createAnatomyRegistry } from '../anatomy/anatomy-registry.js';
import { createAnatomyManager } from '../anatomy/anatomy-manager.js';
import { createAnatomyLabels } from '../anatomy/anatomy-labels.js';
import { createAnchorManager } from '../anatomy/anchor-manager.js';
import { createMotionKit } from '../motion/motion-kit.js';

export { checkWebGL };
export const DEFAULT_WALL_OPACITY = 0.55;
const WALL_LAYERS = ['heart', 'heart_internal', 'arteries', 'veins'];

export function createPlayEngine({ container, labelContainer, log, onStats = () => {}, onPythonStatus = () => {} }) {
  const e = { kind: null, stats: { fps: 0 } };
  e.viewport = createViewport(container, {
    onFrame: (dt) => {
      e.objects.tick(dt);
      e.kit.tick(dt);
      e.camera.tick(dt);
      if (e.manager) e.manager.tick();
      if (e.anchors) e.anchors.tick();
      if (e.labels) e.labels.update();
    },
    onStats: (s) => { e.stats = s; onStats(s); },
    onContextLost: () => log('그래픽 컨텍스트를 잃었습니다. 페이지를 새로고침하세요.', 'error'),
  });
  const { scene, renderer, camera, controls } = e.viewport;
  e.viewport.grid.visible = false;
  e.viewport.axes.visible = false;
  const world = new THREE.Group();
  world.name = 'world';
  scene.add(world);

  e.tracker = createResourceTracker();
  e.registry = createRegistry(world, e.tracker);
  e.objects = createObjectManager({ registry: e.registry, tracker: e.tracker });
  e.materials = createMaterialController({ registry: e.registry });
  e.objects.setMaterialController(e.materials);
  e.camera = createCameraController({ camera, controls, registry: e.registry });
  e.clipping = createClippingController({ renderer, scene, registry: e.registry, materials: e.materials });
  e.selection = createSelectionController({ renderer, camera, registry: e.registry, materials: e.materials, getClipPlanes: () => e.clipping.planes() });
  e.loader = createModelLoader({ onStatus: (state, d) => { if (state === 'error') log(`모델 오류: ${d.message}`, 'error'); } });
  e.scenes = createSceneManager({
    viewport: e.viewport, registry: e.registry, tracker: e.tracker, objects: e.objects, materials: e.materials,
    selection: e.selection, clipping: e.clipping, camera: e.camera, loader: e.loader, log,
  });
  e.anatomy = createAnatomyRegistry({ registry: e.registry });
  e.anchors = createAnchorManager({ scene, camera, renderer, controls, registry: e.registry, anatomy: e.anatomy, log });
  e.kit = createMotionKit({ scene, registry: e.registry, tracker: e.tracker, materials: e.materials, camera: e.camera, anchors: e.anchors, log });
  e.kit.paths.setShowPaths(false);
  e.runner = createCommandRunner(e.objects, {
    registry: e.registry, materials: e.materials, camera: e.camera, scenes: e.scenes, onLog: log,
    resolve: (t) => (e.manager ? e.manager.resolveTargets(t) : []), focusMany: (ids) => (e.manager ? e.manager.focusObjects(ids) : null),
    motion: e.kit.commands,
  });
  e.client = createPythonClient({ onStatus: onPythonStatus });
  e.selection.onSelect(() => e.selection.select(null));   // Play 화면은 클릭 선택을 쓰지 않는다 (Hover만)

  let sceneInfo = null;

  async function loadAnatomy(url) {
    e.kind = 'anatomy';
    if (!e.manager) {
      e.manager = createAnatomyManager({
        scene, registry: e.registry, anatomy: e.anatomy, scenes: e.scenes, loader: e.loader, materials: e.materials,
        camera: e.camera, clipping: e.clipping, selection: e.selection, log,
      });
      e.labels = createAnatomyLabels({ container: labelContainer, camera, anatomy: e.anatomy });
    }
    const def = await e.manager.loadScene(url);
    const anchors = await (await fetch(def.anchors, { cache: 'no-cache' })).json();
    e.anchors.load(anchors);
    e.anchors.setVisible(false);
    const ms = await e.manager.start();
    sceneInfo = { def, motion: def.motion, credits: def.credits };
    await e.kit.loadUrl(def.motion.paths, def.motion.actors);
    e.kit.paths.setShowPaths(false);
    e.labels.setMode('both');
    // 물질이 심장·혈관 안쪽을 지나므로 기본으로 반투명하게 둔다 (설정에서 바꿀 수 있음)
    e.setWallOpacity(DEFAULT_WALL_OPACITY);
    return ms;
  }

  async function loadSandbox(catalogUrl, sceneId) {
    e.kind = 'sandbox';
    e.viewport.grid.visible = true;
    const t0 = performance.now();
    await e.scenes.loadCatalog(catalogUrl);
    const def = await e.scenes.load(sceneId, { remember: false });
    sceneInfo = { def, motion: { paths: def.motion }, credits: def.credits || '' };
    await e.kit.loadUrl(def.motion);
    e.kit.paths.setShowPaths(true);
    return Math.round(performance.now() - t0);
  }

  // 시작 위치로 (Actor·경로·카메라). 모델은 다시 불러오지 않는다
  async function resetMotion() {
    e.kit.unload();
    if (e.kind === 'anatomy') await e.kit.loadUrl(sceneInfo.motion.paths, sceneInfo.motion.actors);
    else await e.kit.loadUrl(sceneInfo.motion.paths);
    e.kit.paths.setShowPaths(e.kind === 'sandbox');
  }

  function structureBox(id) {
    if (!e.manager || !id || !e.anatomy.has(id)) return null;
    const box = e.anatomy.worldBox(id);
    return box.isEmpty() ? null : box;
  }

  e.setWallOpacity = (v) => { if (e.manager) for (const l of WALL_LAYERS) e.manager.setLayerOpacity(l, v); };

  return Object.assign(e, {
    loadAnatomy,
    loadSandbox,
    resetMotion,
    get sceneInfo() { return sceneInfo; },
    // 구조 초점: 지연 로딩 레이어면 불러온다(manager.focus)
    async focusStructure(id, duration = 700) {
      if (e.manager && id && e.anatomy.has(id)) {
        if (e.anatomy.objectIdsOf(id).length === 0) return e.manager.focus(id);
        const box = structureBox(id);
        return box ? e.camera.focusBox(box, { duration }) : false;
      }
      return false;
    },
    focusActor(actorId, size, duration = 700) {
      const a = e.kit.actors.get(actorId);
      if (!a) return false;
      const s = size || e.kit.paths.markerSize * 10;
      const box = new THREE.Box3().setFromCenterAndSize(a.object3D.position, new THREE.Vector3(s, s, s));
      return e.camera.focusBox(box, { duration });
    },
    overview(duration = 700) {
      if (e.manager) return e.manager.view('heart');
      return e.camera.overview({ duration });
    },
    // 구조 강조 (다음 위치 안내): 이전 강조는 지운다
    highlightStructures(ids) {
      if (!e.manager) return;
      for (const oid of e.registry.ids()) e.materials.setHighlight(oid, 'event', false);
      for (const id of ids || []) for (const oid of e.anatomy.objectIdsOf(id)) e.materials.setHighlight(oid, 'event', true);
    },
  });
}
