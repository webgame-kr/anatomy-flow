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
import { createScaleManager } from '../scale/scale-manager.js';
import { createMicroScene } from '../scale/micro-scene.js';

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
      for (const m of e.micro) m.tick(dt, camera);
      viewTick(dt);
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
  // STEP 04-A 다중 스케일: 전환 때 덮는 막(페이드)과 스케일 관리자
  const fadeEl = document.createElement('div');
  fadeEl.className = 'scale-fade';
  container.appendChild(fadeEl);
  e.micro = [];
  e.scale = createScaleManager({
    camera: e.camera, actors: e.kit.actors, motion: e.kit.motion, paths: e.kit.paths, overlay: fadeEl, log,
    hooks: { onChanged: (id, spec) => { if (e.labels) e.labels.setVisible(spec.level === 'ORGAN' && e.userLabels !== false); } },
  });
  e.runner = createCommandRunner(e.objects, {
    registry: e.registry, materials: e.materials, camera: e.camera, scenes: e.scenes, onLog: log,
    resolve: (t) => (e.manager ? e.manager.resolveTargets(t) : []), focusMany: (ids) => (e.manager ? e.manager.focusObjects(ids) : null),
    motion: e.kit.commands,
    scale: e.scale.commands,
  });
  e.client = createPythonClient({ onStatus: onPythonStatus });
  e.selection.onSelect(() => e.selection.select(null));   // Play 화면은 클릭 선택을 쓰지 않는다 (Hover만)

  let sceneInfo = null;

  // 개념 장면(content/micro/*.json) 불러오기: 경로는 이동 엔진에, 장면은 스케일 관리자에 등록
  async function loadMicro(url) {
    for (const m of e.micro) { e.scale.unregister(m.def.scene_id); m.destroy(); }
    e.micro = [];
    if (!url) return;
    const doc = await (await fetch(url, { cache: 'no-cache' })).json();
    for (const def of doc.scenes || []) {
      const m = createMicroScene({ scene, paths: e.kit.paths, def, labelContainer });
      m.addPaths();
      e.micro.push(m);
      e.scale.register(def.scene_id, {
        level: def.level, conceptual: def.verification_status === 'CONCEPTUAL', title_ko: def.title_ko,
        unit_note: def.unit_note, magnification_note: def.magnification_note, notes: def.notes,
        actor_display_size: def.actor_display_size, follow: def.follow, view_direction: def.view_direction,
        enter: () => m.setVisible(true), exit: () => m.setVisible(false), bounds: () => m.bounds(),
        setReducedMotion: (on) => m.setReducedMotion(on), path_ids: [def.path.path_id],
      });
    }
  }

  function registerOrgan(def) {
    const actor = e.kit.actors.list()[0];
    const size = actor ? actor.display_size : null;
    e.scale.register(def.scene_id || 'organ', {
      level: 'ORGAN', conceptual: false, title_ko: def.title_ko || def.name_ko || '기관 (BodyParts3D)',
      unit_note: '1 장면 m = 실제 1 m (BodyParts3D 실제 크기)',
      magnification_note: 'Actor(적혈구)만 보이도록 크게 표시한다 (약 385배). 기관 모델은 실제 크기다.',
      actor_display_size: size, follow: { ...e.camera.followOptions },
      enter: () => {}, exit: () => {},
      // 도착 확대: Actor 주변 4 cm
      bounds: () => { const a = e.kit.actors.list()[0]; return a ? new THREE.Box3().setFromCenterAndSize(a.object3D.position, new THREE.Vector3(0.04, 0.04, 0.04)) : null; },
    });
    organSceneId = def.scene_id || 'organ';
  }
  let organSceneId = null;

  async function loadAnatomy(url, { micro = null } = {}) {
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
    registerOrgan(def);
    await loadMicro(micro);
    sceneInfo.micro = micro;
    e.scale.reset(organSceneId);
    e.kit.paths.setShowPaths(false);
    e.labels.setMode('both');
    // 물질이 심장·혈관 안쪽을 지나므로 기본으로 반투명하게 둔다 (설정에서 바꿀 수 있음)
    viewSt.heartBox = null;
    viewSt.applied = null;
    e.setWallOpacity(viewSt.opacity);
    applyView(wantedView());
    return ms;
  }

  async function loadSandbox(catalogUrl, sceneId) {
    e.kind = 'sandbox';
    await loadMicro(null);
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
    if (e.kind === 'anatomy') {
      await e.kit.loadUrl(sceneInfo.motion.paths, sceneInfo.motion.actors);
      for (const m of e.micro) m.addPaths();
      e.scale.reset(organSceneId);
    } else await e.kit.loadUrl(sceneInfo.motion.paths);
    e.kit.paths.setShowPaths(e.kind === 'sandbox');
  }

  function structureBox(id) {
    if (!e.manager || !id || !e.anatomy.has(id)) return null;
    const box = e.anatomy.worldBox(id);
    return box.isEmpty() ? null : box;
  }

  const rawWallOpacity = (v) => { if (e.manager) for (const l of WALL_LAYERS) e.manager.setLayerOpacity(l, v); };

  // ---------- 심장 내부 보기 (STEP 04-A) ----------
  // normal: 불투명 / translucent: 사용자 투명도(기본 0.55) / ghost: 아주 옅게(0.2)
  // cutaway: 켤 때의 카메라 방향으로 심장·혈관의 앞쪽 절반을 자른다(고정)
  // dynamic: Actor와 카메라 사이를 자르는 평면이 Actor를 따라 움직인다
  // section_x: 좌우(x축) 단면 (STEP 03-D 설정)
  // auto: Actor가 심장 상자 안에 있으면 dynamic, 밖이면 translucent. 개념 장면(TISSUE)에서는 적용하지 않는다.
  // 학습 Actor는 자르지 않는다(clipping excludeTypes: actor). 모드를 바꿀 때마다 clipping.reset()으로 재질 단면을 되돌린다.
  const CLIP_STRUCTURES = ['cv.heart', 'cv.aorta', 'cv.pulmonary_trunk', 'cv.pulmonary_arteries', 'cv.superior_vena_cava', 'cv.inferior_vena_cava', 'cv.pulmonary_veins'];
  const viewSt = { mode: 'auto', applied: null, opacity: DEFAULT_WALL_OPACITY, sectionT: 0.5, acc: 0, heartBox: null };
  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  function clipTargets() {
    if (!e.manager) return [];
    return [...new Set(CLIP_STRUCTURES.filter((id) => e.anatomy.has(id)).flatMap((id) => e.anatomy.objectIdsOf(id)))];
  }
  function heartBox() {
    if (!viewSt.heartBox && e.manager && e.anatomy.has('cv.heart')) {
      const b = e.anatomy.worldBox('cv.heart');
      if (!b.isEmpty()) viewSt.heartBox = b.clone();
    }
    return viewSt.heartBox;
  }
  function actorObj() { const a = e.kit.actors.list()[0]; return a ? a.object3D : null; }
  function cutPlane(point) {
    const toCam = tmpV.copy(camera.position).sub(point).normalize();
    return { normal: toCam.clone().negate(), point };
  }
  function applyView(kind) {
    viewSt.applied = kind;
    e.clipping.reset();
    if (kind === 'normal') rawWallOpacity(1);
    else if (kind === 'ghost') rawWallOpacity(0.2);
    else rawWallOpacity(viewSt.opacity);
    if (kind === 'cutaway') {
      const hb = heartBox();
      if (hb) { const pl = cutPlane(hb.getCenter(new THREE.Vector3())); e.clipping.set({ enabled: true, scope: 'selected', targetIds: clipTargets(), custom: { normal: pl.normal.toArray(), point: pl.point.toArray() }, showHelper: false }); }
    } else if (kind === 'dynamic') {
      const a = actorObj();
      if (a) { const pl = dynamicPlane(a); e.clipping.set({ enabled: true, scope: 'selected', targetIds: clipTargets(), custom: { normal: pl.normal.toArray(), point: pl.point.toArray() }, showHelper: false }); }
    } else if (kind === 'section_x') {
      e.clipping.set({ enabled: true, scope: 'all', axis: 'x', t: viewSt.sectionT, flip: false, showHelper: true });
    }
  }
  function dynamicPlane(a) {
    const p = a.getWorldPosition(tmpC);
    const toCam = tmpV.copy(camera.position).sub(p);
    const dist = toCam.length();
    toCam.normalize();
    const actor = e.kit.actors.list()[0];
    const gap = Math.min(dist * 0.5, Math.max((actor ? actor.display_size : 0.003) * 2.5, 0.003));
    return { normal: toCam.clone().negate(), point: p.clone().addScaledVector(toCam, gap) };
  }
  function wantedView() {
    if (viewSt.mode !== 'auto') return viewSt.mode;
    const sp = e.scale.currentSpec;
    if (sp && sp.level !== 'ORGAN') return 'translucent';
    const hb = heartBox();
    const a = actorObj();
    if (hb && a && hb.containsPoint(a.getWorldPosition(tmpC))) return 'dynamic';
    return 'translucent';
  }
  function viewTick(dt) {
    if (e.kind !== 'anatomy' || !e.manager) return;
    viewSt.acc += dt;
    if (viewSt.acc > 0.2) {          // 자동 판단은 0.2초마다 (프레임마다 재질을 바꾸지 않는다)
      viewSt.acc = 0;
      const w = wantedView();
      if (w !== viewSt.applied) applyView(w);
    }
    if (viewSt.applied === 'dynamic') { const a = actorObj(); if (a) { const pl = dynamicPlane(a); e.clipping.movePlane(pl.normal, pl.point); } }
  }
  e.setViewMode = (mode) => { viewSt.mode = mode; applyView(wantedView()); };
  e.viewState = () => ({ mode: viewSt.mode, applied: viewSt.applied, opacity: viewSt.opacity, clipped: e.clipping.appliedCount });
  e.setSectionPosition = (t) => { viewSt.sectionT = t; if (viewSt.applied === 'section_x') applyView('section_x'); };
  e.setWallOpacity = (v) => {
    viewSt.opacity = v;
    if (viewSt.applied !== 'normal' && viewSt.applied !== 'ghost') rawWallOpacity(v);
  };

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
      const s = size || Math.max(e.kit.paths.markerSize * 10, a.display_size * 6);
      const box = new THREE.Box3().setFromCenterAndSize(a.object3D.position, new THREE.Vector3(s, s, s));
      return e.camera.focusBox(box, { duration });
    },
    overview(duration = 700) {
      const sp = e.scale.currentSpec;
      if (sp && sp.level !== 'ORGAN') { const b = sp.bounds(); return b ? e.camera.focusBox(b, { duration, direction: sp.view_direction ? new THREE.Vector3(...sp.view_direction) : null }) : false; }
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
