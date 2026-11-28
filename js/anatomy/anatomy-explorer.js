// Anatomy Explorer (STEP 03-B): 사용자용 해부학 탐색 화면
// STEP 02 엔진 모듈을 그대로 조립하고, 그 위에 해부학 레지스트리·레이어·라벨·검색·Anchor를 얹는다.

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
import { createPythonBridge } from '../python/python-bridge.js';
import { createAnatomyRegistry } from './anatomy-registry.js';
import { createAnatomyManager } from './anatomy-manager.js';
import { createAnatomyLabels } from './anatomy-labels.js';
import { createAnatomySearch } from './anatomy-search.js';
import { createAnchorManager } from './anchor-manager.js';
import { createMotionKit } from '../motion/motion-kit.js';
import { createPathEditor } from '../motion/path-editor.js';

window.__nf3dBooted = true;
const $ = (id) => document.getElementById(id);
const SCENE_URL = 'content/anatomy/cardiovascular/scene.json';
const STATUS_KO = { AVAILABLE: '모델 있음', PARTIAL: '일부만 있음', MISSING: '모델 없음', NOT_LOADED: '불러오기 전', PARTLY_LOADED: '일부 불러옴' };
const GROUP_KO = { heart: '심장', heart_internal: '심장 내부 구조', valves: '심장판막', arteries: '주요 동맥', veins: '주요 정맥', lungs: '폐', body: '인체 외형', skeleton: '흉곽' };

// UI 상태 (boot보다 먼저 선언)
let E = null;
let statsOf = () => ({});
const devOn = () => $('set-dev').checked;

// ---------- 로그 ----------
let logCount = 0;
function log(text, level = '') {
  logCount += 1;
  const li = document.createElement('li');
  li.value = logCount;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  li.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${text}`;
  if (level) li.className = level;
  $('log').prepend(li);
  while ($('log').children.length > 200) $('log').lastChild.remove();
  if (level === 'error') console.warn(text);
}
window.addEventListener('unhandledrejection', (e) => { log(`처리되지 않은 오류: ${e.reason && e.reason.message ? e.reason.message : e.reason}`, 'error'); e.preventDefault(); });

function fatal(title, body) {
  $('fatal').hidden = false;
  $('fatal').innerHTML = `<h2>${title}</h2><p>${body}</p>`;
  $('ex-loading').hidden = true;
}

// ---------- 엔진 조립 ----------
const gl = checkWebGL();
if (!gl.ok) {
  fatal('이 환경에서는 3D 화면을 표시할 수 없습니다', `${gl.reason}<br>최신 Chrome, Edge, Safari, Firefox에서 하드웨어 가속을 켜고 열어 주세요.`);
} else {
  try {
    boot();
  } catch (err) {
    fatal('3D 화면을 시작하지 못했습니다', String(err.message || err));
  }
}

function boot() {
  const e = {};
  let stats = { fps: 0, calls: 0, triangles: 0 };
  e.viewport = createViewport($('viewport'), {
    onFrame: (dt) => {
      e.objects.tick(dt);
      e.kit.tick(dt);          // STEP 03-C: 경로·Actor 이동 (카메라 추적보다 먼저)
      e.camera.tick(dt);
      e.manager.tick();
      e.anchors.tick();
      e.labels.update();
    },
    onStats: (s) => { stats = s; if (devOn()) renderDev(); },
    onContextLost: () => fatal('그래픽 컨텍스트를 잃었습니다', 'GPU 메모리가 부족하거나 드라이버가 재설정되었습니다. 페이지를 새로고침하세요.'),
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
  e.manager = createAnatomyManager({
    scene, registry: e.registry, anatomy: e.anatomy, scenes: e.scenes, loader: e.loader, materials: e.materials,
    camera: e.camera, clipping: e.clipping, selection: e.selection, log,
  });
  e.labels = createAnatomyLabels({ container: $('viewport'), camera, anatomy: e.anatomy });
  e.search = createAnatomySearch({ anatomy: e.anatomy });
  e.anchors = createAnchorManager({ scene, camera, renderer, controls, registry: e.registry, anatomy: e.anatomy, log });
  // STEP 03-C: 경로·Actor·이동. 경로 점은 Anchor(object-local)를 그대로 참조한다.
  e.kit = createMotionKit({ scene, registry: e.registry, tracker: e.tracker, materials: e.materials, camera: e.camera, anchors: e.anchors, log });
  e.runner = createCommandRunner(e.objects, {
    registry: e.registry, materials: e.materials, camera: e.camera, scenes: e.scenes, onLog: log,
    resolve: (t) => e.manager.resolveTargets(t), focusMany: (ids) => e.manager.focusObjects(ids),
    motion: e.kit.commands,
  });
  e.client = createPythonClient({ onStatus: (state, text) => { $('py-status').textContent = text; $('py-test').disabled = $('py-clear').disabled = $('py-motion').disabled = state !== 'ready'; } });
  e.bridge = createPythonBridge({ client: e.client, runner: e.runner, log, guard: () => e.kit.motion.session });

  // 화면에서 객체를 고르면 → 해부학 구조로 바꿔 선택 (선택 컨트롤러 자체 강조는 쓰지 않음)
  let guard = false;
  e.selection.onSelect((oid) => {
    if (guard) return;
    guard = true;
    e.selection.select(null);
    guard = false;
    e.manager.select(oid ? e.anatomy.structureForObject(oid) : null);
  });
  e.selection.onHover((oid) => {
    const sid = oid ? e.anatomy.structureForObject(oid) : null;
    const s = sid ? e.anatomy.get(sid) : null;
    e.labels.setHover(sid);
    $('hover-tip').hidden = !s;
    if (s) $('hover-tip').textContent = `${s.name_ko} · ${s.name_en}`;
  });

  e.manager.onChange((kind, data) => {
    if (kind === 'select') { e.labels.setSelected(data.id); renderInfo(); markActive(); if (data.id) openRight(); }
    if (kind === 'state' || kind === 'layer' || kind === 'assets') { renderLayers(); renderInfo(); }
  });
  e.anchors.onChange((kind, data) => {
    if (kind !== 'move') renderAnchors(); else renderAnchorEdit();
    if ((kind === 'change' || kind === 'move') && data && data.id) e.kit.paths.refreshAnchor(data.id);   // Anchor를 쓰는 경로 갱신
  });
  e.editor = createPathEditor({
    container: $('motion-panel'), kit: e.kit, camera3d: camera, renderer, controls, cameraCtl: e.camera, scene, anchors: e.anchors, registry: e.registry, log,
    getFps: () => stats.fps,
  });
  // Checkpoint 도착 초점: 해부학 구조가 있으면 그 구조로
  e.editor.setCheckpointFocus((ev) => {
    if (!ev.anatomical_id || !e.anatomy.has(ev.anatomical_id)) return false;
    e.camera.stopFollow();
    e.manager.select(ev.anatomical_id);
    e.manager.focus(ev.anatomical_id);
    return true;
  });

  wireUi(e, () => stats);
  window.__nfx = e;
  start(e);
}

async function start(e) {
  try {
    const def = await e.manager.loadScene(SCENE_URL);
    $('credits').textContent = def.credits;
    $('credits').hidden = false;
    e.labels.setMajor(def.labels.major);
    e.labels.setMode(def.labels.default_mode);
    e.labels.setScope(def.labels.default_scope);
    renderCameraBar(def);
    const anchorsJson = await (await fetch(def.anchors, { cache: 'no-cache' })).json();
    e.anchors.load(anchorsJson);
    const ms = await e.manager.start();
    $('ex-loading').hidden = true;
    log(`장면 준비: ${def.scene_name} · ${ms}ms · 구조 ${e.anatomy.list().length}개`);
    renderLayers();
    renderInfo();
    renderAnchors();
  } catch (err) {
    fatal('해부학 장면을 불러오지 못했습니다', String(err.message || err));
    log(err.message, 'error');
    return;
  }
  e.client.start().then(() => {
    log('Python 준비 완료');
    sendSnapshot(e);
  }).catch(() => log('Python을 불러오지 못했습니다 (3D 탐색은 계속 쓸 수 있음)', 'warn'));
}

// STEP 03-C: 이동 시험 데이터(경로·적혈구)는 개발자 모드에서만 불러온다 (학습자 화면에 노출하지 않음)
let motionLoaded = false;
async function syncMotion() {
  if (!E || !E.manager.scene || !E.manager.scene.motion) return;
  const m = E.manager.scene.motion;
  if (devOn() && !motionLoaded) {
    motionLoaded = true;
    try {
      await E.kit.loadUrl(m.paths, m.actors);
      E.editor.render();
    } catch (err) {
      motionLoaded = false;
      log(`이동 데이터를 읽지 못했습니다: ${err.message}`, 'error');
    }
  } else if (!devOn() && motionLoaded) {
    motionLoaded = false;
    E.kit.unload();
    E.kit.actors.clear();
    E.editor.render();
  }
}

async function sendSnapshot(e) {
  const objs = [...e.anatomy.snapshot(), ...e.anchors.list().map((a) => ({ id: a.anchor_id, type: 'anchor', visible: e.anchors.visible, parent: a.anatomical_id })), ...e.kit.actors.snapshot()];
  try {
    await e.bridge.call('scene_commands.set_paths', e.kit.pathSnapshot());
    const r = await e.bridge.call('scene_commands.set_snapshot', objs, [e.manager.scene.scene_id], e.manager.scene.scene_id);
    log(`Python 스냅샷: ${r.count}개 ${JSON.stringify(r.types)}`);
  } catch (err) {
    log(`스냅샷 실패: ${err.message}`, 'error');
  }
}

// ---------- UI ----------
function wireUi(e, getStats) {
  E = e;
  statsOf = getStats;
  $('btn-whole').addEventListener('click', () => e.manager.view('whole'));
  $('btn-reset').addEventListener('click', async () => {
    e.manager.select(null);
    e.clipping.reset();
    syncClip();
    $('ex-loading').hidden = false;
    e.kit.unload();                 // 이동·이벤트 취소(session 증가), 경로 제거
    motionLoaded = false;
    const ms = await e.manager.start();
    $('ex-loading').hidden = true;
    syncMotion();
    const ov = (id) => e.manager.layerState(id).visible;
    e.labels.setVisible(ov('labels'));
    e.anchors.setVisible(ov('anchors'));
    $('an-show').checked = ov('anchors');
    renderLayers();
    log(`초기화 (${ms}ms)`);
  });
  $('btn-settings').addEventListener('click', () => {
    const s = $('settings');
    s.hidden = !s.hidden;
    $('btn-settings').setAttribute('aria-expanded', String(!s.hidden));
  });
  $('set-label-mode').addEventListener('change', (ev) => e.labels.setMode(ev.target.value));
  $('set-label-scope').addEventListener('change', (ev) => e.labels.setScope(ev.target.value));
  $('set-dev').addEventListener('change', () => { $('dev').hidden = !devOn(); renderDev(); syncMotion(); });
  $('tg-left').addEventListener('click', () => { $('ex-left').classList.toggle('open'); $('ex-right').classList.remove('open'); });
  $('tg-right').addEventListener('click', () => { $('ex-right').classList.toggle('open'); $('ex-left').classList.remove('open'); });

  // 검색
  $('search').addEventListener('input', () => renderSearch());
  $('search').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { const first = $('search-results').querySelector('button'); if (first) first.click(); }
  });

  // 선택 구조 조작
  $('a-focus').addEventListener('click', () => e.manager.selected && e.manager.focus(e.manager.selected));
  $('a-isolate').addEventListener('click', () => e.manager.selected && e.manager.isolate(e.manager.selected));
  $('a-ghost').addEventListener('click', () => e.manager.selected && e.manager.ghostOthers(e.manager.selected));
  $('a-restore').addEventListener('click', () => e.manager.restoreAll());
  $('a-hide').addEventListener('click', () => {
    const id = e.manager.selected;
    if (id) e.manager.setStructureVisible(id, e.manager.isHidden(id));
  });
  $('a-opacity').addEventListener('input', (ev) => {
    const v = Number(ev.target.value);
    $('a-opacity-val').textContent = v.toFixed(2);
    if (e.manager.selected) e.manager.setStructureOpacity(e.manager.selected, v);
  });

  // 단면
  const clip = () => {
    const res = e.manager.setClip({
      enabled: $('c-on').checked, flip: $('c-flip').checked, scope: $('c-scope').value,
      axis: document.querySelector('input[name="c-axis"]:checked').value, t: Number($('c-pos').value) / 100,
    });
    $('c-val').textContent = res.active ? `${res.position} m · ${res.meshes} Mesh` : (res.reason || '꺼짐');
  };
  for (const el of [$('c-on'), $('c-flip'), $('c-scope'), ...document.querySelectorAll('input[name="c-axis"]')]) el.addEventListener('change', clip);
  $('c-pos').addEventListener('input', clip);

  // Anchor
  $('an-show').addEventListener('change', (ev) => { e.anchors.setVisible(ev.target.checked); renderAnchors(); });
  $('an-place').addEventListener('change', (ev) => {
    if (ev.target.checked && !$('an-show').checked) { $('an-show').checked = true; e.anchors.setVisible(true); }
    e.anchors.setPlaceMode(ev.target.checked);
    e.selection.setEnabled(!ev.target.checked);
  });
  $('an-ko').addEventListener('change', (ev) => e.anchors.update(e.anchors.selectedId, { name_ko: ev.target.value }));
  $('an-en').addEventListener('change', (ev) => e.anchors.update(e.anchors.selectedId, { name_en: ev.target.value }));
  document.querySelectorAll('[data-an]').forEach((input) => input.addEventListener('change', () => {
    const space = input.dataset.an;
    const vals = [...document.querySelectorAll(`[data-an="${space}"]`)].map((i) => Number(i.value));
    e.anchors.setPosition(e.anchors.selectedId, vals, space === 'scene' ? 'scene' : 'local');
  }));
  $('an-link').addEventListener('click', () => {
    const sid = e.manager.selected;
    const oid = sid ? e.anatomy.objectIdsOf(sid)[0] : null;
    if (!oid || !e.anchors.selectedId) return;
    const entry = e.registry.get(oid);
    e.anchors.setObject(e.anchors.selectedId, { asset_id: entry.sourceAssetId, node: entry.displayName });
    e.anchors.update(e.anchors.selectedId, { anatomical_id: sid });
    log(`Anchor 연결 변경: ${e.anchors.selectedId} → ${sid}`);
  });
  $('an-del').addEventListener('click', () => e.anchors.selectedId && e.anchors.remove(e.anchors.selectedId));
  $('an-export').addEventListener('click', () => {
    const blob = new Blob([e.anchors.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'anchors.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    log(`Anchor ${e.anchors.list().length}개 내보냄`);
  });
  $('an-import').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const res = e.anchors.load(JSON.parse(await file.text()));
      if (!res.ok) log(`Anchor 불러오기 실패: ${res.errors.join(' / ')}`, 'error');
      else log(`Anchor ${res.anchors.length}개 불러옴${res.errors.length ? ` · 건너뜀 ${res.errors.length}: ${res.errors.join(' / ')}` : ''}`, res.errors.length ? 'warn' : '');
    } catch (err) {
      log(`Anchor JSON 오류: ${err.message}`, 'error');
    }
  });

  // Python
  $('py-test').addEventListener('click', async () => {
    await sendSnapshot(e);
    e.bridge.run('scene_commands.build', [
      { action: 'highlight', target: 'cv.left_ventricle', value: true },
      { action: 'camera_focus', target: 'cv.left_ventricle' },
    ]);
  });
  $('py-clear').addEventListener('click', () => e.bridge.run('scene_commands.build', [{ action: 'highlight', target: 'cv.left_ventricle', value: false }]));
  $('py-motion').addEventListener('click', async () => {
    const a = e.kit.actors.list()[0];
    if (!a || !a.path_id) { log('개발자 모드에서 이동 데이터가 불러와져야 합니다', 'warn'); return; }
    const cp = e.kit.paths.checkpoints(a.path_id).find((c) => c.stop_on_arrival);
    if (!cp) { log('정지 Checkpoint가 없습니다', 'warn'); return; }
    await sendSnapshot(e);
    e.bridge.run('scene_commands.route_demo', a.actor_id, a.path_id, cp.checkpoint_id);
  });

  window.addEventListener('keydown', (ev) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (ev.key === 'Escape') e.manager.select(null);
    if ((ev.key === 'f' || ev.key === 'F') && e.manager.selected) e.manager.focus(e.manager.selected);
  });
}

function renderCameraBar(def) {
  const views = $('views');
  views.innerHTML = '';
  for (const v of def.views) views.appendChild(btn(v.name_ko, () => E.manager.view(v.id)));
  const dirs = $('dirs');
  dirs.innerHTML = '';
  for (const d of def.directions) {
    const b = btn(d.name_ko.replace('해부학적 ', '해부학 '), () => E.manager.direction(d.id));
    if (d.note) b.title = d.note;
    dirs.appendChild(b);
  }
}

function btn(label, onClick, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

function openRight() {
  if (window.matchMedia('(max-width: 900px)').matches) { $('ex-right').classList.add('open'); $('ex-left').classList.remove('open'); }
}

function renderSearch() {
  const ul = $('search-results');
  ul.innerHTML = '';
  const q = $('search').value;
  if (!q.trim()) return;
  const rows = E.search.search(q);
  if (rows.length === 0) { ul.innerHTML = '<li class="muted" style="padding:4px 6px">검색 결과 없음</li>'; return; }
  for (const r of rows) {
    const li = document.createElement('li');
    const b = btn('', async () => {
      if (r.status === 'MISSING') { E.manager.select(r.id); log(`${r.name_ko}: 사용 가능한 3D 모델이 없습니다`, 'warn'); return; }
      await E.manager.focus(r.id);
      E.manager.select(r.id);
    });
    b.innerHTML = `<span>${r.name_ko} <span class="en">${r.name_en}</span></span>`;
    if (r.status !== 'AVAILABLE') {
      const badge = document.createElement('span');
      badge.className = `badge ${r.status}`;
      badge.textContent = STATUS_KO[r.status] || r.status;
      b.appendChild(badge);
    }
    li.appendChild(b);
    ul.appendChild(li);
  }
}

function renderLayers() {
  if (!E) return;
  const box = $('layers');
  const open = new Set([...box.querySelectorAll('details[open]')].map((d) => d.dataset.layer));
  box.innerHTML = '';
  for (const l of E.manager.layersList()) {
    const wrap = document.createElement('details');
    wrap.className = 'layer';
    wrap.dataset.layer = l.id;
    if (open.has(l.id) || (open.size === 0 && ['heart', 'valves'].includes(l.id))) wrap.open = true;
    const head = document.createElement('summary');
    head.className = 'layer-head';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = l.visible;
    cb.setAttribute('aria-label', `${l.name_ko} 표시`);
    cb.addEventListener('click', (ev) => ev.stopPropagation());
    cb.addEventListener('change', async () => {
      if (l.kind === 'overlay') {
        const st = E.manager.layerState(l.id);
        st.visible = cb.checked;
        if (l.id === 'labels') E.labels.setVisible(cb.checked);
        if (l.id === 'anchors') { E.anchors.setVisible(cb.checked); $('an-show').checked = cb.checked; renderAnchors(); }
        return;
      }
      $('ex-loading').hidden = false;
      await E.manager.setLayerVisible(l.id, cb.checked);
      $('ex-loading').hidden = true;
    });
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = l.name_ko;
    head.append(cb, name);
    if (!l.kind) {
      const op = document.createElement('input');
      op.type = 'range'; op.min = '0.05'; op.max = '1'; op.step = '0.05'; op.value = String(l.opacity);
      op.setAttribute('aria-label', `${l.name_ko} 투명도`);
      op.addEventListener('click', (ev) => ev.stopPropagation());
      op.addEventListener('input', () => E.manager.setLayerOpacity(l.id, Number(op.value)));
      head.appendChild(op);
    }
    wrap.appendChild(head);
    if (!l.kind) wrap.appendChild(structureTree(l));
    box.appendChild(wrap);
  }
  markActive();
}

function structureTree(layer) {
  const inLayer = E.anatomy.list().filter((s) => layer.groups.includes(s.anatomical_group));
  const ids = new Set(inLayer.map((s) => s.anatomical_id));
  const ul = document.createElement('ul');
  const add = (parentUl, s) => {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 's-row';
    row.dataset.id = s.anatomical_id;
    const status = E.anatomy.status(s.anatomical_id);
    const hiddenNow = E.manager.isHidden(s.anatomical_id);
    if (hiddenNow) row.classList.add('off');
    const eye = btn(hiddenNow ? '○' : '●', () => E.manager.setStructureVisible(s.anatomical_id, hiddenNow), 'eye');
    eye.title = hiddenNow ? '보이기' : '숨기기';
    eye.disabled = status === 'MISSING';
    const nm = btn(s.name_ko, async () => {
      if (status === 'MISSING') { E.manager.select(s.anatomical_id); return; }
      E.manager.select(s.anatomical_id);
      await E.manager.focus(s.anatomical_id);
    }, 'nm');
    nm.title = `${s.name_en} · ${s.anatomical_id}`;
    row.append(eye, nm);
    if (status !== 'AVAILABLE') {
      const b = document.createElement('span');
      b.className = `badge ${status}`;
      b.textContent = STATUS_KO[status] || status;
      row.appendChild(b);
    }
    li.appendChild(row);
    const kids = s.children.map((c) => E.anatomy.get(c)).filter((c) => c && ids.has(c.anatomical_id));
    if (kids.length) {
      const sub = document.createElement('ul');
      kids.forEach((k) => add(sub, k));
      li.appendChild(sub);
    }
    parentUl.appendChild(li);
  };
  for (const s of inLayer) if (!s.parent_id || !ids.has(s.parent_id)) add(ul, s);
  return ul;
}

function markActive() {
  const sel = E && E.manager.selected;
  document.querySelectorAll('.s-row').forEach((r) => r.classList.toggle('active', r.dataset.id === sel));
}

function renderInfo() {
  if (!E) return;
  const id = E.manager.selected;
  const box = $('info');
  $('info-actions').hidden = !id;
  if (!id) {
    box.innerHTML = '<p class="empty">3D 화면이나 목록에서 구조를 선택하세요.</p>';
    if (devOn()) renderDev();
    return;
  }
  const s = E.anatomy.get(id);
  const status = E.anatomy.status(id);
  const parent = s.parent_id ? E.anatomy.get(s.parent_id) : null;
  box.innerHTML = '';
  const h = document.createElement('h2');
  h.textContent = s.name_ko;
  const en = document.createElement('p');
  en.className = 'en-name';
  en.textContent = s.name_en + (s.aliases.length ? ` · ${s.aliases.join(', ')}` : '');
  const dl = document.createElement('dl');
  dl.className = 'kv';
  const rows = [
    ['분류', GROUP_KO[s.anatomical_group] || s.anatomical_group],
    ['3D 모델', STATUS_KO[status] || status],
    ['FMA', s.fma_id || '-'],
    ['내부 구조', s.internal_structure_available ? '있음 (원본 모델)' : '없음'],
    ['구성 파일', s.element_file_ids.length ? `BodyParts3D element ${s.element_file_ids.length}개` : '-'],
    ['출처', s.source ? 'BodyParts3D (CC BY 4.0)' : '-'],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
  box.append(h, en, dl);
  if (s.notes) {
    const n = document.createElement('p');
    n.className = 'note';
    n.textContent = s.notes;
    box.appendChild(n);
  }
  const chips = document.createElement('div');
  chips.className = 'chips';
  if (parent) chips.appendChild(btn(`↑ ${parent.name_ko}`, () => E.manager.select(parent.anatomical_id)));
  for (const c of s.children) {
    const k = E.anatomy.get(c);
    if (k) chips.appendChild(btn(k.name_ko, () => E.manager.select(c)));
  }
  if (chips.children.length) box.appendChild(chips);
  $('a-hide').textContent = E.manager.isHidden(id) ? '보이기' : '숨기기';
  const op = E.manager.opacityOf(id);
  $('a-opacity').value = String(op);
  $('a-opacity-val').textContent = op.toFixed(2);
  const missing = status === 'MISSING';
  for (const b of ['a-focus', 'a-isolate', 'a-ghost', 'a-hide']) $(b).disabled = missing;
  if (devOn()) renderDev();
}

function syncClip() {
  const s = E.clipping.state;
  $('c-on').checked = s.enabled;
  $('c-flip').checked = s.flip;
  $('c-val').textContent = '꺼짐';
}

function renderDev() {
  if (!E || !devOn()) return;
  const st = statsOf();
  const mem = E.viewport.renderer.info.memory;
  const id = E.manager.selected;
  const kv = [
    ['FPS', String(st.fps ?? '-')],
    ['그리기', `draw ${st.calls ?? '-'} · 삼각형 ${(st.triangles ?? 0).toLocaleString()}`],
    ['GPU', `geometry ${mem.geometries} · texture ${mem.textures} · pixelRatio ${E.viewport.renderer.getPixelRatio()}`],
    ['레지스트리', `${E.registry.size}개 · 추적 ${JSON.stringify(E.tracker.stats())}`],
  ];
  if (id) {
    const s = E.anatomy.get(id);
    const box = E.anatomy.worldBox(id);
    const r = (v) => v.toArray().map((n) => n.toFixed(3)).join(', ');
    kv.push(['구조 ID', id], ['객체 ID', E.anatomy.objectIdsOf(id).join(' ') || '(없음)'],
      ['삼각형', s.triangle_count.toLocaleString()], ['검증', s.verification_status]);
    if (!box.isEmpty()) kv.push(['BBox min', r(box.min)], ['BBox max', r(box.max)]);
  }
  const dl = $('dev-kv');
  dl.innerHTML = '';
  for (const [k, v] of kv) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
}

function renderAnchors() {
  if (!E) return;
  const ul = $('an-list');
  ul.innerHTML = '';
  for (const a of E.anchors.list()) {
    const li = document.createElement('li');
    const b = btn('', () => { if (!E.anchors.visible) { $('an-show').checked = true; E.anchors.setVisible(true); } E.anchors.select(a.anchor_id); });
    b.className = a.anchor_id === E.anchors.selectedId ? 'active' : '';
    b.innerHTML = `<span>${a.name_ko}</span><span class="muted">${a.anchor_id}</span>`;
    li.appendChild(b);
    ul.appendChild(li);
  }
  renderAnchorEdit();
}

function renderAnchorEdit() {
  const a = E.anchors.selectedId ? E.anchors.get(E.anchors.selectedId) : null;
  $('an-edit').hidden = !a;
  if (!a) return;
  $('an-id').textContent = a.anchor_id;
  if (document.activeElement !== $('an-ko')) $('an-ko').value = a.name_ko;
  if (document.activeElement !== $('an-en')) $('an-en').value = a.name_en;
  const s = a.anatomical_id ? E.anatomy.get(a.anatomical_id) : null;
  $('an-struct').textContent = `${s ? s.name_ko : '(구조 없음)'} · ${a.object_id || a.coordinate_space}`;
  $('an-status').textContent = a.verification_status;
  const w = E.anchors.worldOf(a.anchor_id);
  const set = (space, vals) => document.querySelectorAll(`[data-an="${space}"]`).forEach((input, i) => {
    if (document.activeElement !== input) input.value = vals ? vals[i].toFixed(4) : '';
  });
  set('local', a.position);
  set('scene', w ? w.toArray() : null);
}
