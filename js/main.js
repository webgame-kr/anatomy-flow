// 개발자 Sandbox (STEP 02): 엔진 모듈 연결과 UI
// 렌더링·객체 상태 = JavaScript(Three.js) / 게임 판단·명령 = Python(Pyodide Worker)

import * as THREE from 'three';
import { checkWebGL, createViewport } from './engine/viewport.js';
import { createResourceTracker } from './engine/resource-tracker.js';
import { createRegistry } from './engine/object-registry.js';
import { createObjectManager } from './engine/object-manager.js';
import { createMaterialController } from './engine/material-controller.js';
import { createCameraController } from './engine/camera-controller.js';
import { createSelectionController } from './engine/selection-controller.js';
import { createClippingController } from './engine/clipping-controller.js';
import { createModelLoader } from './engine/model-loader.js';
import { createSceneManager } from './engine/scene-manager.js';
import { createCommandRunner } from './engine/command-runner.js';
import { createPythonClient } from './python/py-client.js';
import { createPythonBridge } from './python/python-bridge.js';
import { createHierarchyPanel } from './ui/hierarchy-panel.js';
import { createInspectorPanel } from './ui/inspector-panel.js';
import { createDebugPanel } from './ui/debug-panel.js';
import { createMotionKit } from './motion/motion-kit.js';
import { createPathEditor } from './motion/path-editor.js';
import { createAnimationKit } from './animation/animation-kit.js';
import { createAnimationEditor } from './animation/animation-editor.js';

window.__nf3dBooted = true;

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const simulate = params.get('simulate') || '';     // 개발용: nowebgl, nopython
const dbg = createDebugPanel();
const log = dbg.log;

window.addEventListener('unhandledrejection', (e) => {
  log(`처리되지 않은 오류: ${e.reason && e.reason.message ? e.reason.message : e.reason}`, 'error');
  e.preventDefault();
});

function showFatal(title, body) {
  const box = $('fatal');
  box.hidden = false;
  box.innerHTML = `<h2>${title}</h2><p>${body}</p>`;
}

// ---------- 1. Python Worker (3D와 별개로 시작) ----------
const client = createPythonClient({
  simulateFailure: simulate === 'nopython',
  onStatus: (state, text) => { dbg.python(state, text); renderPythonPanel(); },
});

// ---------- 2. WebGL과 엔진 ----------
const gl = simulate === 'nowebgl' ? { ok: false, reason: '(개발용 시뮬레이션) WebGL을 사용할 수 없는 환경입니다.' } : checkWebGL();
let engine = null;

if (!gl.ok) {
  showFatal('이 환경에서는 3D 화면을 표시할 수 없습니다',
    `${gl.reason}<br>최신 Chrome, Edge, Safari, Firefox를 사용하고 브라우저 설정에서 하드웨어 가속을 켜 주세요.`);
  log('WebGL 미지원: 3D 화면을 시작하지 않음', 'error');
} else {
  try {
    engine = buildEngine();
    log(`3D 화면 시작 (${gl.version}, three.js r${THREE.REVISION})`);
  } catch (err) {
    showFatal('3D 엔진을 시작하지 못했습니다', String(err.message || err));
    log(`3D 초기화 실패: ${err.message}`, 'error');
  }
}

function buildEngine() {
  const e = {};
  e.viewport = createViewport($('viewport'), {
    onFrame: (dt) => {
      e.objects.tick(dt);
      e.anim.tick(dt);         // STEP 04-B: 애니메이션 (Morph 변형이 경로 점에 반영되도록 경로 갱신보다 먼저)
      e.kit.tick(dt);          // STEP 03-C: 경로 갱신과 Actor 이동 (카메라 추적보다 먼저)
      e.camera.tick(dt);
      e.selection.tick();
    },
    onStats: (s) => {
      e.fps = s.fps;
      dbg.stats(s);
      dbg.objects(e.registry.size);
      if (e.selection.selectedId) e.inspector.show(e.registry.info(e.selection.selectedId));
      if (dbg.debugOn) dbg.debug(debugText(e, s));
    },
    onContextLost: () => {
      showFatal('그래픽 컨텍스트를 잃었습니다', '그래픽 드라이버가 재설정되었거나 GPU 메모리가 부족합니다. 페이지를 새로고침하세요.');
      log('WebGL 컨텍스트 손실', 'error');
    },
  });
  const { scene, renderer, camera, controls } = e.viewport;
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
  e.selection = createSelectionController({
    renderer, camera, registry: e.registry, materials: e.materials, getClipPlanes: () => e.clipping.planes(),
  });
  scene.add(e.selection.helper);
  e.loader = createModelLoader({ onStatus: (state, d) => {
    dbg.loading(state, d);
    if (state === 'warn') log(`모델 경고: ${d.message}`, 'warn');
  } });
  e.scenes = createSceneManager({
    viewport: e.viewport, registry: e.registry, tracker: e.tracker, objects: e.objects, materials: e.materials,
    selection: e.selection, clipping: e.clipping, camera: e.camera, loader: e.loader, log,
  });
  // STEP 03-C: 경로·Actor·이동 (Sandbox에는 Anchor가 없어 scene/object_local 좌표만 쓴다)
  e.kit = createMotionKit({ scene, registry: e.registry, tracker: e.tracker, materials: e.materials, camera: e.camera, log });
  // STEP 04-B: 애니메이션·타임라인·Morph·변형·구조 상태
  e.anim = createAnimationKit({ scene, registry: e.registry, tracker: e.tracker, materials: e.materials, log });
  e.kit.paths.setVertexResolver((mesh, i) => e.anim.morph.deformedVertex(mesh, i));
  e.runner = createCommandRunner(e.objects, {
    registry: e.registry, materials: e.materials, camera: e.camera, scenes: e.scenes, onLog: log,
    motion: e.kit.commands,
    animation: e.anim.commands,
  });
  e.anim.setRunner(e.runner);
  e.bridge = createPythonBridge({ client, runner: e.runner, log, guard: () => e.kit.motion.session });

  e.hierarchy = createHierarchyPanel($('hierarchy'), $('hier-count'), {
    registry: e.registry,
    onSelect: (id) => e.selection.select(id),
    onToggleVisible: (id, v) => { e.materials.setVisible(id, v); e.hierarchy.render(); },
    onFocus: (id) => e.camera.focus(id),
  });
  e.inspector = createInspectorPanel({
    onTransform: (id, kind, values) => e.objects.update(id, { [kind]: values }, 0),
    onOpacity: (id, v) => e.materials.setOpacity(id, v),
    onVisible: (id, v) => { e.materials.setVisible(id, v); e.hierarchy.render(); },
    onColor: (id, c) => e.materials.setColor(id, c),
    onFocus: (id) => e.camera.focus(id),
    onIsolate: (id) => { e.materials.isolate(id); log(`Isolation: ${id}만 표시`); },
    onGhost: (id) => { e.materials.ghostOthers(id); log(`${id} 외 객체 투명화`); },
    onShowAll: () => { e.materials.showAll(); e.hierarchy.render(); log('전체 표시 (격리·투명화 해제)'); },
    onRestore: (id) => { e.materials.restore(id); log(`${id} 원래 재질 복원`); },
  });
  return e;
}

function camera3d(e) { return e.viewport.camera; }

function debugText(e, s) {
  const t = e.tracker.stats();
  const cam = e.camera.state();
  const r = (a) => a.map((n) => n.toFixed(2)).join(', ');
  const c = e.clipping.state;
  return [
    `scene      ${e.scenes.current ? e.scenes.current.scene_id : '-'} (history ${e.scenes.historySize})`,
    `registry   ${e.registry.size} · roots ${e.registry.roots().length}`,
    `tracked    geo ${t.geometries} · mat ${t.materials} · tex ${t.textures}`,
    `gpu memory geo ${s.geometries} · tex ${s.textures}`,
    `owned mats ${e.materials.ownedCount()} · tweens ${e.objects.tweenCount}`,
    `camera     pos ${r(cam.position)}`,
    `           target ${r(cam.target)}${e.camera.animating ? ' (이동 중)' : ''}`,
    `selected   ${e.selection.selectedId || '-'} · hover ${e.selection.hoverId || '-'} · level ${e.selection.level}`,
    `isolate    ${e.materials.isolatedId || '-'} · ghost ${e.materials.ghostId || '-'}`,
    `clipping   ${c.enabled ? `${c.axis} ${Math.round(c.t * 100)}%${c.flip ? ' flip' : ''} · ${c.scope}` : 'off'}`,
    `canvas     ${s.size} · pixelRatio ${e.viewport.renderer.getPixelRatio()}`,
    `motion     paths ${e.kit.paths.ids().length} · actors ${e.kit.actors.ids().length} · session ${e.kit.motion.session} · camera ${e.camera.mode}${e.camera.followTarget ? ` → ${e.camera.followTarget}` : ''}`,
  ].join('\n');
}

// ---------- 3. 화면 연결 ----------
if (engine) wireUi(engine);

function wireUi(e) {
  let renderQueued = false;
  e.registry.onChange((kind) => {
    if (kind !== 'structure' || renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      e.hierarchy.render();
      renderModelList();
      dbg.objects(e.registry.size);
    });
  });

  e.selection.onSelect((id) => {
    e.hierarchy.setSelected(id);
    e.inspector.show(id ? e.registry.info(id) : null);
    if (e.clipping.state.scope === 'selected') applyClip({ targetId: id });
  });
  const tip = $('hover-tip');
  e.selection.onHover((id) => {
    e.hierarchy.setHover(id);
    tip.hidden = !id;
    if (id) tip.textContent = `${e.registry.get(id).displayName} · ${id}`;
  });

  // 장면
  const sceneSelect = $('scene-select');
  sceneSelect.addEventListener('change', () => switchScene(sceneSelect.value));
  $('btn-back').addEventListener('click', async () => {
    const d = await e.scenes.back();
    if (d) log(`이전 장면으로 복귀: ${d.scene_id}`);
  });
  $('btn-reset').addEventListener('click', async () => {
    await e.scenes.reset();
    log('장면 초기화 (객체·카메라 복원)');
  });
  e.scenes.onChange((kind, data) => {
    if (kind === 'loading') {
      e.anim.unload();         // STEP 04-B: 재생·타임라인 취소, 개념 모델·Mixer 해제
      e.kit.unload();          // 이전 장면의 이동·이벤트·경로 정리 (session 증가)
      $('btn-reset').disabled = true;
      sceneSelect.disabled = true;
    }
    if (kind === 'ready') {
      sceneSelect.value = data.scene.scene_id;
      sceneSelect.disabled = false;
      $('btn-reset').disabled = false;
      $('btn-back').disabled = e.scenes.historySize === 0;
      clipUi.sync();
      // 장면에 외부 모델 출처 표기가 있으면 화면에 표시 (CC BY 출처 표시)
      $('credits').hidden = !data.scene.credits;
      $('credits').textContent = data.scene.credits || '';
      log(`장면 준비: ${data.scene.scene_name} · 객체 ${e.registry.size}개`);
      loadMotion(data.scene).then(() => onSceneReady(data.scene));
    }
    if (kind === 'model') {
      const n = e.anim.registerClips(data.id, data.root, data.clips);
      if (n) log(`GLB 애니메이션 클립 ${n}개 연결: ${e.anim.anim.clipNames(data.id).join(', ')}`);
      if (data.report.meshes > 12) e.hierarchy.collapseDeep(data.id, 1);
      if (data.report.duplicateNames.length) log(`같은 이름 노드: ${data.report.duplicateNames.join(', ')} (ID는 고유하게 부여)`, 'warn');
    }
  });

  // 카메라
  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!e.camera.preset(btn.dataset.preset, e.selection.selectedId)) log('카메라 프리셋: 볼 객체가 없습니다', 'warn');
    });
  });
  $('btn-overview').addEventListener('click', () => e.camera.overview());
  $('btn-home').addEventListener('click', () => e.camera.resetHome(600));

  $('pick-level').addEventListener('change', (ev) => e.selection.setLevel(ev.target.value));
  $('opt-grid').addEventListener('change', (ev) => { e.viewport.grid.visible = ev.target.checked; });
  $('opt-axes').addEventListener('change', (ev) => { e.viewport.axes.visible = ev.target.checked; });

  // 키보드: F 초점, Esc 선택 해제
  window.addEventListener('keydown', (ev) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (ev.key === 'f' || ev.key === 'F') { if (e.selection.selectedId) e.camera.focus(e.selection.selectedId); }
    if (ev.key === 'Escape') e.selection.select(null);
  });

  // 모바일 패널 접기
  const left = $('panel-left');
  const right = $('panel-right');
  $('toggle-left').addEventListener('click', () => { left.classList.toggle('open'); right.classList.remove('open'); });
  $('toggle-right').addEventListener('click', () => { right.classList.toggle('open'); left.classList.remove('open'); });

  // 로컬 GLB / glTF 불러오기 (브라우저 안에서만 읽음)
  $('import-file').addEventListener('change', async (ev) => {
    // FileList는 input 값과 연결되어 있으므로, 값을 비우기 전에 배열로 복사한다
    const files = [...(ev.target.files || [])];
    ev.target.value = '';
    if (files.length === 0) return;
    const main = files.find((f) => /\.(glb|gltf)$/i.test(f.name));
    const assetId = `local_${main ? main.name.replace(/\.(glb|gltf)$/i, '') : 'model'}`;
    const existing = e.registry.ids().find((id) => e.registry.get(id).sourceAssetId === assetId && e.registry.get(id).type === 'model');
    if (existing) {
      log(`이미 불러온 모델입니다: ${existing} (중복 로딩 안 함)`, 'warn');
      e.selection.select(existing);
      e.camera.focus(existing);
      return;
    }
    try {
      const result = await e.loader.loadFiles(files);
      const id = e.scenes.addModel(result, assetId, { display_name: result.label });
      e.selection.select(id);
      e.camera.focus(id);
    } catch (err) {
      log(`Import 실패: ${err.message}`, 'error');
    }
  });

  // 불러온 모델 목록 (Focus / 제거)
  function renderModelList() {
    const ul = $('model-list');
    ul.innerHTML = '';
    const models = e.registry.roots().filter((id) => e.registry.get(id).type === 'model');
    if (models.length === 0) ul.innerHTML = '<li class="muted">(불러온 모델 없음)</li>';
    for (const id of models) {
      const entry = e.registry.get(id);
      const li = document.createElement('li');
      li.innerHTML = `<div class="row"><b></b><span class="muted"></span></div><div class="row"></div>`;
      li.querySelector('b').textContent = entry.displayName;
      li.querySelector('.muted').textContent = entry.sourceAssetId;
      const btns = li.querySelectorAll('.row')[1];
      const focusBtn = document.createElement('button');
      focusBtn.textContent = 'Focus';
      focusBtn.addEventListener('click', () => { e.selection.select(id); e.camera.focus(id); });
      const rm = document.createElement('button');
      rm.textContent = '제거';
      rm.className = 'danger';
      rm.addEventListener('click', () => removeModel(id));
      btns.append(focusBtn, rm);
      ul.appendChild(li);
    }
  }

  function removeModel(id) {
    const before = e.viewport.renderer.info.memory;
    const b = { geo: before.geometries, tex: before.textures };
    e.registry.unregister(id);
    // GPU 메모리 수치는 다음 렌더링 후 갱신된다
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const after = e.viewport.renderer.info.memory;
      log(`모델 제거: ${id} · GPU geo ${b.geo}→${after.geometries}, tex ${b.tex}→${after.textures}`);
    }));
  }

  // STEP 03-C: 이동 데이터와 경로 편집기
  e.editor = createPathEditor({
    container: $('motion-panel'), kit: e.kit, camera3d: camera3d(e), renderer: e.viewport.renderer, controls: e.viewport.controls,
    cameraCtl: e.camera, scene: e.viewport.scene, log, getFps: () => e.fps ?? '-',
  });
  // STEP 04-B: 애니메이션 편집기 (Sandbox 오른쪽 패널)
  e.animEditor = createAnimationEditor({ container: $('anim-panel'), kit: e.anim, motionKit: e.kit, registry: e.registry, camera: e.camera, log });
  async function loadMotion(sceneDef) {
    // 애니메이션 데이터를 먼저: 개념 모델이 있어야 경로 점(object_local, mesh_vertex)이 계산된다
    if (sceneDef.animation) {
      try {
        const r = await e.anim.loadUrl(sceneDef.animation);
        if (!r.ok) log(`애니메이션 데이터 오류 ${r.errors.length}개`, 'error');
        if (e.anim.data && e.anim.data.motion) e.kit.apply(e.anim.data.motion);
      } catch (err) {
        log(`애니메이션 데이터를 읽지 못했습니다: ${err.message}`, 'error');
      }
    }
    e.animEditor.render();
    if (!sceneDef.motion) { e.editor.render(); return; }
    try {
      await e.kit.loadUrl(sceneDef.motion);
    } catch (err) {
      log(`이동 데이터를 읽지 못했습니다: ${err.message}`, 'error');
    }
    e.editor.render();
  }

  // 단면 UI
  const clipUi = setupClipUi(e);
  function applyClip(changes) { clipUi.apply(changes); }

  // 시작: 장면 정의 불러오기
  e.scenes.loadCatalog('content/sandbox/scenes.json').then((catalog) => {
    sceneSelect.innerHTML = '';
    for (const s of catalog.scenes) {
      const opt = document.createElement('option');
      opt.value = s.scene_id;
      opt.textContent = s.scene_name;
      sceneSelect.appendChild(opt);
    }
    const first = params.get('scene') && e.scenes.has(params.get('scene')) ? params.get('scene') : catalog.default_scene;
    return switchScene(first);
  }).catch((err) => log(`장면 정의 오류: ${err.message}`, 'error'));

  async function switchScene(id) {
    try {
      await e.scenes.load(id);
    } catch (err) {
      log(`장면 전환 실패: ${err.message}`, 'error');
    }
  }
}

function setupClipUi(e) {
  const on = $('c-on');
  const flip = $('c-flip');
  const scope = $('c-scope');
  const pos = $('c-pos');
  const val = $('c-val');
  const axes = [...document.querySelectorAll('input[name="c-axis"]')];

  function apply(changes = {}) {
    const res = e.clipping.set({
      enabled: on.checked,
      flip: flip.checked,
      scope: scope.value,
      axis: axes.find((a) => a.checked).value,
      t: Number(pos.value) / 100,
      targetId: e.selection.selectedId,
      ...changes,
    });
    if (res.active) val.textContent = `${res.position} (${res.meshes} Mesh)`;
    else val.textContent = res.reason || '꺼짐';
    if (res.reason && on.checked) log(`단면: ${res.reason}`, 'warn');
  }
  for (const el of [on, flip, scope, ...axes]) el.addEventListener('change', () => apply());
  pos.addEventListener('input', () => apply());
  $('c-reset').addEventListener('click', () => {
    e.clipping.reset();
    sync();
    log('단면 초기화');
  });
  function sync() {
    const s = e.clipping.state;
    on.checked = s.enabled;
    flip.checked = s.flip;
    scope.value = s.scope;
    pos.value = Math.round(s.t * 100);
    axes.forEach((a) => { a.checked = a.value === s.axis; });
    val.textContent = s.enabled ? val.textContent : '꺼짐';
  }
  return { apply, sync };
}

// ---------- 4. Python 패널 (장면마다 다름) ----------
function pyReady() {
  return client.state === 'ready' && !!engine;
}

function onSceneReady(sceneDef) {
  renderPythonPanel();
  if (!pyReady()) return;
  if (sceneDef.python === 'step01') {
    engine.bridge.run('reset').then(({ result }) => step01Sync(result));
  } else {
    sendSnapshot(false);
  }
}

async function sendSnapshot(verbose = true) {
  if (!pyReady()) return null;
  const e = engine;
  const scenes = e.scenes.list().map((s) => s.id);
  try {
    const r = await e.bridge.call('scene_commands.set_snapshot', e.registry.snapshot(), scenes, e.scenes.current.scene_id);
    await e.bridge.call('scene_commands.set_paths', e.kit.pathSnapshot());
    if (verbose) log(`Python 스냅샷: ${r.count}개 · 종류 ${JSON.stringify(r.types)}`);
    return r;
  } catch (err) {
    log(`스냅샷 전송 실패: ${err.message}`, 'error');
    return null;
  }
}

// STEP 01: Python(sandbox3d)의 객체 목록과 3D 장면이 같은지 확인
function step01Sync(result) {
  if (!result || !result.objects) return;
  const pyIds = result.objects.map((o) => o.id).join(',');
  const jsIds = engine.registry.roots().filter((id) => engine.registry.get(id).sourceAssetId === 'step01').join(',');
  if (pyIds !== jsIds) log(`STEP 01 상태 불일치! Python [${pyIds}] / 3D [${jsIds}]`, 'error');
}

function button(label, onClick, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

function renderPythonPanel() {
  const panel = $('py-panel');
  const tag = $('py-scene-tag');
  if (!panel) return;
  panel.innerHTML = '';
  if (client.state === 'error') {
    panel.innerHTML = '<p>Python 엔진을 불러오지 못했습니다. 3D 조작은 계속 쓸 수 있습니다.</p>';
    return;
  }
  if (!pyReady() || !engine.scenes.current) {
    panel.innerHTML = '<p>Python 준비 중…</p>';
    return;
  }
  const e = engine;
  const sceneDef = e.scenes.current;
  tag.textContent = sceneDef.python === 'step01' ? '· STEP 01 sandbox3d' : '· scene_commands';
  const sel = () => e.selection.selectedId;

  if (sceneDef.python === 'step01') {
    panel.append(
      ...['box', 'sphere', 'cylinder'].map((k) => button(`+ ${k}`, async () => {
        const x = Math.round((Math.random() * 8 - 4) * 10) / 10;
        const z = Math.round((Math.random() * 8 - 4) * 10) / 10;
        const { result } = await e.bridge.run('create', k, x, 0.5, z);
        step01Sync(result);
        if (result && result.ok) e.selection.select(result.commands[0].target);
      })),
      button('X+', () => sel() && e.bridge.run('move', sel(), 1, 0, 0)),
      button('Y+', () => sel() && e.bridge.run('move', sel(), 0, 1, 0)),
      button('다음 색', () => sel() && e.bridge.run('next_color', sel())),
      button('원형 배치', () => e.bridge.run('arrange_circle', 3)),
      button('선택 제거', async () => { if (!sel()) return; const { result } = await e.bridge.run('remove', sel()); step01Sync(result); }, 'danger'),
      button('Python 초기화', async () => { const { result } = await e.bridge.run('reset'); step01Sync(result); }),
    );
    const p = document.createElement('p');
    p.textContent = 'STEP 01 기능: Python이 객체 상태를 갖고 명령을 보냅니다. 이동·색 버튼은 sandbox3d 객체(box-1 등)를 선택하고 누르세요.';
    panel.prepend(p);
    return;
  }

  if (sceneDef.python === 'motion') {
    const info = document.createElement('p');
    info.textContent = 'STEP 03-C: Python은 Actor·경로·Checkpoint ID로 이동 명령을 만들고, JavaScript가 좌표 계산과 이동을 맡습니다.';
    const firstActor = () => {
      const a = e.kit.actors.list()[0];
      if (!a || !a.path_id) return null;
      const cps = e.kit.paths.checkpoints(a.path_id);
      const cp = cps.find((c) => c.stop_on_arrival) || cps[0];
      return { a, cp };
    };
    panel.append(info, button('스냅샷 보내기', () => sendSnapshot(true)),
      button('Python: 경로 지정·Checkpoint 이동·추적', async () => {
        const f = firstActor();
        if (!f || !f.cp) { log('Checkpoint가 있는 Actor가 없습니다 (Scene MF에서 확인)', 'warn'); return; }
        await sendSnapshot(false);
        e.bridge.run('scene_commands.route_demo', f.a.actor_id, f.a.path_id, f.cp.checkpoint_id);
      }, 'primary'),
      button('Python: 잘못된 이동 명령', async () => {
        const f = firstActor();
        if (!f) return;
        await sendSnapshot(false);
        e.bridge.run('scene_commands.motion_error_test', f.a.actor_id);
      }, 'danger'),
      button('Python: 추적 해제', async () => { await sendSnapshot(false); e.bridge.run('scene_commands.build', [{ action: 'camera_unfollow' }]); }),
    );
    return;
  }

  const p = document.createElement('p');
  p.textContent = sceneDef.python === 'commands'
    ? 'Scene D: Python이 스냅샷을 보고 명령을 만들고, JavaScript가 실행합니다.'
    : 'Python에는 객체 ID·종류 스냅샷만 보냅니다.';
  panel.append(p, button('스냅샷 보내기', () => sendSnapshot(true)));
  if (sceneDef.python === 'commands') {
    panel.append(
      button('데모 명령 실행', async () => { await sendSnapshot(false); e.bridge.run('scene_commands.demo'); }, 'primary'),
      button('되돌리기', async () => { await sendSnapshot(false); e.bridge.run('scene_commands.restore_demo'); }),
      button('오류 명령 테스트', async () => { await sendSnapshot(false); e.bridge.run('scene_commands.error_test'); }, 'danger'),
      button('Python으로 장면 A 전환', async () => { await sendSnapshot(false); e.bridge.run('scene_commands.change_scene', 'scene_a'); }),
    );
  }
}

// ---------- 5. 시작 ----------
renderPythonPanel();
client.start().then((info) => {
  log(`Python 준비 완료 (Python ${info.python}, Pyodide ${info.pyodide})`);
  if (engine && engine.scenes.current) onSceneReady(engine.scenes.current);
}).catch(() => {
  log(`Python 로딩 실패: ${$('py-status').textContent}`, 'error');
  renderPythonPanel();
});

// 개발·자동 검증용
window.__nf3d = {
  get engine() { return engine; },
  client,
  sendSnapshot,
};
