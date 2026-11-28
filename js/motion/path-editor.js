// Path Editor (STEP 03-C): 개발자용 경량 경로 편집기 + 이동 미리보기 패널
// - 개발자 화면(Sandbox 오른쪽 패널, Explorer 개발자 모드)에서만 붙인다.
// - 편집용 핸들은 레지스트리에 등록하지 않는다 → 해부학 구조 선택을 방해하지 않는다.
//   핸들 클릭은 편집기가 먼저(capture 단계) 받아서 처리하고, 다른 선택으로 넘기지 않는다.
// - TransformControls를 드래그하는 동안 OrbitControls를 끈다(카메라 조작과 좌표 편집 충돌 방지).

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ACTOR_MODELS } from './actor-manager.js';
import { checkPathGeometryAsync } from './path-geometry-check.js';
import { PATH_STATUS } from './path-engine.js';
import { worldTriangles, traceCenterline, resample } from './centerline-tracer.js';

const STATE_KO = { idle: '대기', moving: '이동 중', paused: '일시정지', waiting_at_checkpoint: 'Checkpoint 대기', completed: '완료', cancelled: '취소' };

export function createPathEditor({ container, kit, camera3d, renderer, controls, cameraCtl, scene, anchors = null, registry = null, log, getFps = () => '-', onDownload = null }) {
  const { paths, actors, motion } = kit;
  let actorId = null;
  let enabled = true;
  let errors = 0;
  let lastErrors = [];
  const lastGeometry = new Map();

  // ---------- 되돌리기 (STEP 04-A) ----------
  // 편집 하나 = {id, before, after} (경로 정의 전체 복사본). 드래그는 시작·끝을 한 번으로 묶는다.
  const history = { undo: [], redo: [], limit: 100 };
  function pushHistory(id, before) {
    const after = paths.snapshot(id);
    if (!before || !after || JSON.stringify(before) === JSON.stringify(after)) return;
    history.undo.push({ id, before, after });
    if (history.undo.length > history.limit) history.undo.shift();
    history.redo.length = 0;
  }
  // 편집 동작을 감싼다: 선택 경로의 이전 상태를 기록한 뒤 실행
  const ed = (fn) => (...args) => {
    const id = paths.selected;
    const before = id ? paths.snapshot(id) : null;
    const r = fn(...args);
    if (id) pushHistory(id, before);
    return r;
  };
  function undo() {
    const h = history.undo.pop();
    if (!h) { log('되돌릴 편집이 없습니다', 'warn'); return; }
    paths.restore(h.before);
    history.redo.push(h);
    paths.select(h.id, Math.min(paths.selectedPoint, paths.get(h.id).points.length - 1));
    log(`되돌리기: ${h.id}`);
    render();
  }
  function redo() {
    const h = history.redo.pop();
    if (!h) { log('다시 할 편집이 없습니다', 'warn'); return; }
    paths.restore(h.after);
    history.undo.push(h);
    log(`다시 하기: ${h.id}`);
    render();
  }

  // ---------- 이전 버전 비교 (STEP 04-A) ----------
  // 비교용 경로 JSON(예: paths.v1-approx.json)의 같은 ID 경로를 회색 점선으로 겹쳐 보여 준다.
  let compareDoc = null;
  const compareGroup = new THREE.Group();
  compareGroup.name = 'path-compare';
  scene.add(compareGroup);
  const compareMat = new THREE.LineDashedMaterial({ color: 0x8a8f99, dashSize: 0.002, gapSize: 0.0015, depthTest: false, transparent: true, opacity: 0.9 });
  function clearCompare() {
    for (const c of [...compareGroup.children]) { compareGroup.remove(c); c.geometry.dispose(); }
  }
  function renderCompare() {
    clearCompare();
    const id = paths.selected;
    if (!compareDoc || !id) return null;
    const old = (compareDoc.paths || []).find((p) => p.path_id === id);
    if (!old) return { missing: true };
    const pts = [];
    const all = [...(old.source_anchor_id && !(old.points[0] && old.points[0].anchor_id === old.source_anchor_id) ? [{ anchor_id: old.source_anchor_id }] : []),
      ...old.points, ...(old.target_anchor_id && !(old.points.at(-1) && old.points.at(-1).anchor_id === old.target_anchor_id) ? [{ anchor_id: old.target_anchor_id }] : [])];
    for (const p of all) { const w = paths.resolvePoint(p); if (w) pts.push(w.clone()); }
    if (pts.length < 2) return { missing: true };
    const curve = old.curve_type === 'linear' ? null : new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve ? curve.getSpacedPoints(120) : pts), compareMat);
    line.computeLineDistances();
    line.renderOrder = 998;
    compareGroup.add(line);
    // 새 경로와의 최대 거리 (새 경로 표본 → 옛 곡선 표본 최근접)
    const c = paths.cache(id);
    const oldS = curve ? curve.getSpacedPoints(200) : pts;
    let maxD = 0;
    for (const q of c.curve.getSpacedPoints(100)) {
      let best = Infinity;
      for (const o of oldS) best = Math.min(best, o.distanceToSquared(q));
      maxD = Math.max(maxD, Math.sqrt(best));
    }
    return { old_status: old.verification_status, old_length: curve ? curve.getLength() : null, max_deviation_m: maxD };
  }

  // 기하 검사에서 문제가 난 표본 위치 표시 (빨간 점, 레지스트리 밖)
  const flagGroup = new THREE.Group();
  flagGroup.name = 'geometry-flags';
  scene.add(flagGroup);
  const flagGeo = new THREE.SphereGeometry(1, 10, 8);
  const flagMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false, transparent: true, opacity: 0.9 });
  function showFlags(g) {
    for (const c of [...flagGroup.children]) flagGroup.remove(c);
    if (!g || !g.flagged) return;
    const r = paths.markerSize * 0.6;
    for (const f of g.flagged) {
      const m = new THREE.Mesh(flagGeo, flagMat);
      m.position.fromArray(f.position);
      m.scale.setScalar(r);
      m.renderOrder = 999;
      flagGroup.add(m);
    }
  }

  // ---------- TransformControls (Waypoint 이동) ----------
  const proxy = new THREE.Object3D();
  proxy.name = 'waypoint-proxy';
  scene.add(proxy);
  const tc = new TransformControls(camera3d, renderer.domElement);
  tc.setSize(0.7);
  let lastDrag = 0;
  let dragBefore = null;
  tc.addEventListener('dragging-changed', (e) => {
    controls.enabled = !e.value;
    if (e.value) dragBefore = paths.selected ? paths.snapshot(paths.selected) : null;
    if (!e.value) {
      lastDrag = performance.now();
      if (paths.selected && dragBefore) pushHistory(paths.selected, dragBefore);
      dragBefore = null;
      renderPoints(); renderProps(); renderStatus();
    }
  });
  tc.addEventListener('objectChange', () => {
    const id = paths.selected;
    const i = paths.selectedPoint;
    if (id && i >= 0) paths.setPointWorld(id, i, proxy.position, { notify: false });
  });
  scene.add(tc);

  function attachGizmo() {
    const id = paths.selected;
    const i = paths.selectedPoint;
    const d = id ? paths.get(id) : null;
    if (!enabled || !d || i < 0 || !d.points[i] || !paths.showHandles) { tc.detach(); return; }
    const w = paths.resolvePoint(d.points[i]);
    if (!w) { tc.detach(); return; }
    proxy.position.copy(w);
    tc.attach(proxy);
  }

  // ---------- 핸들 클릭 ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  function onDown(e) { down = { x: e.clientX, y: e.clientY }; }
  function onUp(e) {
    const d = down;
    down = null;
    if (!enabled || !paths.showHandles || !d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) return;
    if (tc.dragging || performance.now() - lastDrag < 150) { e.stopImmediatePropagation(); return; }
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera3d);
    const hits = raycaster.intersectObjects(paths.handleMeshes(), false);
    if (!hits.length) return;
    e.stopImmediatePropagation();
    const h = hits[0].object.userData;
    paths.select(h.pathId, h.pointIndex);
    render();
  }
  renderer.domElement.addEventListener('pointerdown', onDown, true);
  renderer.domElement.addEventListener('pointerup', onUp, true);

  // ---------- DOM ----------
  container.innerHTML = '';
  container.classList.add('pe');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const btn = (label, fn, cls = '') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const section = (title) => { const s = el('div', 'pe-sec'); s.appendChild(el('h3', '', title)); container.appendChild(s); return s; };

  const status = el('dl', 'kv pe-status');
  container.appendChild(status);

  // 이동 조작
  const sPlay = section('미리보기');
  const actorSel = el('select');
  actorSel.setAttribute('aria-label', 'Actor 선택');
  actorSel.addEventListener('change', () => { actorId = actorSel.value || null; renderStatus(); renderActorRow(); });
  const modelSel = el('select');
  modelSel.setAttribute('aria-label', 'Actor 모델');
  for (const [k, m] of Object.entries(ACTOR_MODELS)) { const o = el('option', '', m.name_ko); o.value = k; modelSel.appendChild(o); }
  modelSel.addEventListener('change', () => swapModel(modelSel.value));
  const r1 = el('div', 'row'); r1.append(el('span', 'muted', 'Actor'), actorSel, modelSel);
  const run = (fn) => () => { const a = cur(); if (!a) { log('Actor를 고르세요', 'warn'); return; } const r = fn(a); if (r && r.error) log(r.error, 'warn'); renderStatus(); };
  const r2 = el('div', 'row btns');
  r2.append(
    btn('▶ Play', run((a) => { if (!a.path_id && paths.selected) motion.setPath(a.actor_id, paths.selected); watch(motion.move(a.actor_id, { until: 'end' })); }), 'primary'),
    btn('⏸ Pause', run((a) => motion.pause(a.actor_id))),
    btn('Resume', run((a) => motion.resume(a.actor_id))),
    btn('■ Stop', run((a) => motion.stop(a.actor_id))),
    btn('Next ▸', run((a) => watch(motion.next(a.actor_id)))),
    btn('Reset', run((a) => motion.reset(a.actor_id))),
    btn('⇄ 방향', run((a) => motion.reverse(a.actor_id))),
  );
  const speed = el('input'); speed.type = 'range'; speed.min = '-3'; speed.max = '1'; speed.step = '0.05'; speed.value = '0';
  const speedVal = el('span', 'muted');
  speed.addEventListener('input', () => { const a = cur(); const v = 10 ** Number(speed.value); speedVal.textContent = `${fmtSpeed(v)}`; if (a) motion.setSpeed(a.actor_id, v); });
  const r3 = el('div', 'row'); r3.append(el('label', '', '속도'), speed, speedVal);
  const prog = el('input'); prog.type = 'range'; prog.min = '0'; prog.max = '1000'; prog.value = '0';
  prog.setAttribute('aria-label', '진행률');
  let seeking = false;
  prog.addEventListener('input', () => { const a = cur(); seeking = true; if (a) motion.seek(a.actor_id, Number(prog.value) / 1000); });
  prog.addEventListener('change', () => { seeking = false; });
  const progVal = el('span', 'muted', '0%');
  const r4 = el('div', 'row'); r4.append(el('label', '', '진행'), prog, progVal);
  const r5 = el('div', 'row btns');
  r5.append(
    btn('카메라 추적', run((a) => { cameraCtl.startFollow(a.actor_id); log(`카메라 추적: ${a.actor_id}`); })),
    btn('1인칭', run((a) => { cameraCtl.startFollow(a.actor_id, { firstPerson: true }); log(`1인칭 추적: ${a.actor_id}`); })),
    btn('추적 재개', () => cameraCtl.resumeFollow()),
    btn('추적 끝·전체 보기', () => { cameraCtl.stopFollow(); cameraCtl.overview(); }),
  );
  const cpFocus = el('input'); cpFocus.type = 'checkbox';
  const r6 = el('div', 'row'); const lab = el('label', 'chk'); lab.append(cpFocus, document.createTextNode(' Checkpoint 도착 시 초점')); r6.appendChild(lab);
  sPlay.append(r1, r2, r3, r4, r5, r6);

  // 편집 기록·비교
  const sHist = section('편집 기록 · 이전 버전 비교');
  const histInfo = el('span', 'muted');
  const rh = el('div', 'row btns');
  rh.append(btn('↶ 되돌리기', undo), btn('↷ 다시 하기', redo), histInfo);
  const cmpIn = el('input'); cmpIn.type = 'file'; cmpIn.accept = '.json,application/json';
  const cmpLab = el('label', 'btn file-btn', '비교 JSON 파일'); cmpLab.appendChild(cmpIn);
  cmpIn.addEventListener('change', async () => {
    const f = cmpIn.files[0]; cmpIn.value = '';
    if (!f) return;
    try { compareDoc = JSON.parse(await f.text()); log(`비교 경로 불러옴: ${f.name} (${(compareDoc.paths || []).length}개)`); renderProps(); } catch (err) { log(`비교 JSON 오류: ${err.message}`, 'error'); }
  });
  const rc2 = el('div', 'row btns');
  rc2.append(btn('이전 버전 불러오기', async () => {
    const prev = kit.data && kit.data.previous_version;
    const base = kit.url;
    if (!prev || !base) { log('이 경로 데이터에는 previous_version이 없습니다. 파일로 고르세요.', 'warn'); return; }
    const file = String(prev).split(' ')[0];
    try {
      compareDoc = await (await fetch(new URL(file, new URL(base, location.href)), { cache: 'no-cache' })).json();
      log(`비교 경로 불러옴: ${file} (${(compareDoc.paths || []).length}개)`);
      renderProps();
    } catch (err) { log(`이전 버전을 읽지 못했습니다: ${err.message}`, 'error'); }
  }), cmpLab, btn('비교 끄기', () => { compareDoc = null; clearCompare(); renderProps(); }));
  sHist.append(rh, rc2);
  const onKey = (ev) => {
    if (!enabled || container.offsetParent === null) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const k = ev.key.toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && k === 'z' && !ev.shiftKey) { ev.preventDefault(); undo(); }
    else if ((ev.ctrlKey || ev.metaKey) && (k === 'y' || (k === 'z' && ev.shiftKey))) { ev.preventDefault(); redo(); }
  };
  window.addEventListener('keydown', onKey);

  // 경로 목록
  const sPaths = section('경로 (Path Hierarchy)');
  const pathList = el('ul', 'pe-list');
  const showP = el('input'); showP.type = 'checkbox'; showP.checked = paths.showPaths;
  showP.addEventListener('change', () => paths.setShowPaths(showP.checked));
  const showH = el('input'); showH.type = 'checkbox'; showH.checked = paths.showHandles;
  showH.addEventListener('change', () => { paths.setShowHandles(showH.checked); attachGizmo(); });
  const rp = el('div', 'row');
  const l1 = el('label', 'chk'); l1.append(showP, document.createTextNode(' 경로 표시'));
  const l2 = el('label', 'chk'); l2.append(showH, document.createTextNode(' 편집 핸들'));
  rp.append(l1, l2, btn('+ 새 경로', newPath), btn('삭제', () => { if (paths.selected && confirmDel(paths.selected)) { paths.remove(paths.selected); render(); } }, 'danger'));
  sPaths.append(rp, pathList);

  // 경로 속성
  const sProps = section('선택 경로');
  const props = el('div');
  sProps.appendChild(props);

  // Waypoint
  const sPts = section('Waypoint');
  const ptList = el('ol', 'pe-list pe-pts');
  const ptInspector = el('div');
  sPts.append(ptList, ptInspector);

  // Checkpoint
  const sCps = section('Checkpoint');
  const cpList = el('ul', 'pe-list');
  const cpBtns = el('div', 'row btns');
  cpBtns.append(
    btn('+ Actor 위치에', ed(() => addCpAt('actor'))),
    btn('+ 선택 Waypoint에', ed(() => addCpAt('point'))),
  );
  sCps.append(cpBtns, cpList);

  // 파일
  const sFile = section('JSON');
  const fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = '.json,application/json';
  const fileLab = el('label', 'btn file-btn', '경로 JSON 불러오기'); fileLab.appendChild(fileIn);
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const res = kit.apply({ ...(kit.data || {}), ...json, actors: json.actors || (kit.data && kit.data.actors) || [] });
      if (!res.ok) log(`경로 JSON 거부: ${res.errors.join(' / ')}`, 'error');
      else log(`경로 JSON 불러옴: ${paths.ids().length}개`);
      render();
    } catch (err) {
      log(`경로 JSON 오류: ${err.message}`, 'error');
    }
  });
  const rf = el('div', 'row btns');
  rf.append(btn('경로 JSON 내보내기', () => {
    const text = paths.exportJson(kit.data && kit.data.scene_id);
    if (onDownload) onDownload(text);
    else download(text, 'paths.json');
    log(`경로 ${paths.ids().length}개 내보냄`);
  }), fileLab, btn('기술 검증', () => { const r = paths.validateAll(); report(r); }));
  if (registry) {
    let checking = false;
    const geoBtn = btn('기하 검사 (선택 경로)', async () => {
      const id = paths.selected;
      if (!id) { log('경로를 고르세요', 'warn'); return; }
      if (checking) return;
      checking = true;
      geoBtn.disabled = true;
      try {
        const g = await checkPathGeometryAsync({ paths, registry, pathId: id, onProgress: (f) => { geoBtn.textContent = `기하 검사 ${(f * 100).toFixed(0)}%`; } });
        lastGeometry.set(id, g);
        showFlags(g);
        log(`기하 검사 ${id} (${g.ms}ms, 최대 정지 ${g.blocked_max_ms}ms${g.cached ? ', 캐시' : ''}): 메시 밖 ${(g.outside_ratio * 100).toFixed(0)}% · 관통 ${g.crossings} · ${g.runs.map((r) => `${(r.from * 100).toFixed(0)}% ${r.inside}`).join(' | ')} — ${g.note}`, g.outside_ratio > 0 ? 'warn' : '');
        renderProps();
      } finally {
        checking = false;
        geoBtn.disabled = false;
        geoBtn.textContent = '기하 검사 (선택 경로)';
      }
    });
    rf.appendChild(geoBtn);
  }
  sFile.appendChild(rf);

  function download(text, name) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function report(r) {
    lastErrors = r.errors;
    if (r.errors.length === 0 && r.warnings.length === 0) log('경로 기술 검증: 문제 없음');
    for (const e of r.errors) log(`경로 검증: ${e}`, 'error');
    for (const w of r.warnings) log(`경로 검증: ${w}`, 'warn');
    renderStatus();
  }

  function confirmDel(id) { return window.confirm(`경로 ${id}를 삭제할까요? (내보내기 전에는 파일에 반영되지 않습니다)`); }

  // ---------- 동작 ----------
  function cur() { return actorId ? actors.get(actorId) : null; }

  function watch(c) {
    if (!c) return;
    if (c.result) { errors += 1; renderStatus(); return; }
    c.promise.then((r) => { if (r.status === 'failed') errors += 1; renderStatus(); });
  }

  function swapModel(modelId) {
    const a = cur();
    if (!a || a.model_id === modelId) return;
    const spec = { actor_id: a.actor_id, actor_type: a.actor_type, model_id: modelId, display_size: a.display_size, biological_state: { ...a.biological_state }, speed: a.speed, rotation_mode: a.rotation_mode };
    const pathId = a.path_id;
    const progress = a.progress;
    const following = cameraCtl.followTarget === a.actor_id;
    motion.stop(a.actor_id);
    actors.remove(a.actor_id);
    actors.create(spec);
    if (pathId) motion.setPath(spec.actor_id, pathId, { progress });
    if (following) cameraCtl.startFollow(spec.actor_id);
    log(`Actor 모델 변경: ${spec.actor_id} → ${modelId}`);
  }

  function fillCenterline(id) {
    const d = paths.get(id);
    const i = paths.selectedPoint;
    const p = d && d.points[i];
    if (!p || p.space !== 'object_local' || !registry.has(p.object_id)) { log('혈관 메시에 붙은 점(object_local)을 고르세요', 'warn'); return; }
    const meshes = registry.meshesOf(p.object_id);
    if (!meshes.length) { log(`메시 없음: ${p.object_id}`, 'warn'); return; }
    const start = paths.resolvePoint(p).clone();
    const next = d.points[i + 1] ? paths.resolvePoint(d.points[i + 1]) : null;
    const dir = next ? next.clone().sub(start) : paths.tangentAt(id, Math.min(paths.length(id), 0.0001));
    if (!dir || dir.lengthSq() === 0) { log('진행 방향을 정할 수 없습니다 (다음 점이 필요)', 'warn'); return; }
    const t0 = performance.now();
    const r = traceCenterline({ tris: worldTriangles(meshes), start, dir, step: 0.003, maxRadius: 0.02, maxSteps: 300, minVerts: 4, stopNear: next ? { point: next, distance: 0.004 } : null });
    const pts = resample(r.points.slice(1), 0.006);
    const obj = registry.get(p.object_id).object3D;
    obj.updateWorldMatrix(true, false);
    let k = i + 1;
    for (const q of pts) {
      const local = obj.worldToLocal(new THREE.Vector3(...q)).toArray().map((n) => Math.round(n * 1e6) / 1e6);
      paths.insertPoint(id, k, { space: 'object_local', object_id: p.object_id, position: local });
      k += 1;
    }
    log(`중심선 Waypoint ${pts.length}개 삽입 (${p.object_id}, 추적 ${fmtLen(r.length)}, 멈춘 이유 ${r.stop_reason}, ${Math.round(performance.now() - t0)}ms). 기하 검사를 다시 하세요.`);
    render();
  }

  function newPath() {
    let n = paths.ids().length + 1;
    while (paths.has(`path_${String(n).padStart(3, '0')}`)) n += 1;
    const id = `path_${String(n).padStart(3, '0')}`;
    // 카메라 초점 근처에 짧은 직선 두 점으로 시작
    const c = controls.target.clone();
    const s = paths.markerSize * 6;
    paths.create({ path_id: id, name_ko: id, curve_type: 'catmull_rom', verification_status: 'TEST_PATH', points: [
      { space: 'scene', position: [c.x - s, c.y, c.z] }, { space: 'scene', position: [c.x + s, c.y, c.z] },
    ] });
    paths.select(id, 0);
    if (!paths.showHandles) { showH.checked = true; paths.setShowHandles(true); }
    log(`새 경로: ${id}`);
    render();
  }

  function addCpAt(where) {
    const id = paths.selected;
    if (!id) { log('경로를 고르세요', 'warn'); return; }
    const len = paths.length(id);
    let progress = null;
    if (where === 'actor') {
      const a = cur();
      if (!a || a.path_id !== id) { log('선택 경로 위에 있는 Actor가 없습니다', 'warn'); return; }
      progress = a.progress;
    } else {
      const i = paths.selectedPoint;
      const d = paths.get(id);
      const w = i >= 0 ? paths.resolvePoint(d.points[i]) : null;
      if (!w) { log('Waypoint를 고르세요', 'warn'); return; }
      const c = paths.cache(id);
      let best = 0; let bestD = Infinity;
      for (let k = 0; k <= 400; k += 1) { const dd = c.curve.getPointAt(k / 400).distanceToSquared(w); if (dd < bestD) { bestD = dd; best = k / 400; } }
      progress = best;
    }
    const cp = paths.addCheckpoint(id, { path_progress: Math.round(progress * 10000) / 10000, stop_on_arrival: true });
    log(`Checkpoint 추가: ${cp.checkpoint_id} (${(progress * 100).toFixed(1)}%, ${(progress * len).toFixed(4)} m)`);
    render();
  }

  // ---------- 그리기 ----------
  function render() {
    renderActors();
    renderPaths();
    renderProps();
    renderPoints();
    renderCps();
    renderStatus();
    attachGizmo();
  }

  function renderActors() {
    const ids = actors.ids();
    if (actorId && !ids.includes(actorId)) actorId = null;
    if (!actorId && ids.length) actorId = ids[0];
    actorSel.innerHTML = '';
    for (const id of ids) {
      const a = actors.get(id);
      const o = el('option', '', `${id} · ${a.actor_type}`);
      o.value = id;
      actorSel.appendChild(o);
    }
    actorSel.value = actorId || '';
    renderActorRow();
  }

  function renderActorRow() {
    const a = cur();
    if (!a) return;
    modelSel.value = a.model_id;
    speed.value = String(Math.log10(a.speed));
    speedVal.textContent = fmtSpeed(a.speed);
  }

  function renderPaths() {
    pathList.innerHTML = '';
    for (const d of paths.list()) {
      const li = el('li');
      const row = el('div', `pe-row${d.path_id === paths.selected ? ' active' : ''}`);
      const eye = btn(paths.isVisible(d.path_id) ? '●' : '○', () => { paths.setPathVisible(d.path_id, !paths.isVisible(d.path_id)); renderPaths(); }, 'eye');
      const name = btn(`${d.name_ko}`, () => { paths.select(d.path_id, -1); const a = cur(); if (a && !a.path_id) motion.setPath(a.actor_id, d.path_id); render(); }, 'nm');
      name.title = `${d.path_id} · ${d.verification_status}`;
      const meta = el('span', 'muted', `${fmtLen(paths.length(d.path_id))}${d.closed ? ' · 순환' : ''}${d.links.length ? ` → ${d.links.map((l) => l.to).join(' | ')}` : ''}`);
      const st = el('span', `vs ${d.verification_status}`, d.verification_status);
      const g = lastGeometry.get(d.path_id);
      const v = paths.validatePath(d.path_id);
      if (v.errors.length || (g && g.outside_ratio > 0)) row.classList.add('err');
      st.title = `${d.verification_status}${d.geometry_check && d.geometry_check.stale ? ' · 편집 뒤 기하 검사 안 함' : ''}${g ? ` · 이번 검사 메시 밖 ${(g.outside_ratio * 100).toFixed(0)}%` : ''}${v.errors.length ? ` · 오류 ${v.errors.length}` : ''}`;
      row.append(eye, name, st, meta);
      li.appendChild(row);
      pathList.appendChild(li);
    }
    if (!paths.list().length) pathList.appendChild(el('li', 'muted', '(경로 없음)'));
  }

  function anchorSelect(value, onChange) {
    const s = el('select');
    const none = el('option', '', '(없음)'); none.value = ''; s.appendChild(none);
    if (anchors) for (const a of anchors.list()) { const o = el('option', '', `${a.anchor_id} · ${a.name_ko}`); o.value = a.anchor_id; s.appendChild(o); }
    s.value = value || '';
    s.addEventListener('change', () => onChange(s.value || null));
    return s;
  }

  function renderProps() {
    props.innerHTML = '';
    const id = paths.selected;
    const d = id ? paths.get(id) : null;
    if (!d) { props.appendChild(el('p', 'muted', '경로를 고르세요.')); return; }
    const dl = el('dl', 'kv');
    const kv = (k, v) => { dl.append(el('dt', '', k), typeof v === 'string' ? el('dd', '', v) : (() => { const dd = el('dd'); dd.appendChild(v); return dd; })()); };
    kv('Path ID', d.path_id);
    const nm = el('input'); nm.type = 'text'; nm.value = d.name_ko; nm.addEventListener('change', () => { paths.update(id, { name_ko: nm.value }); renderPaths(); });
    kv('이름', nm);
    const ct = el('select');
    for (const [v, t] of [['catmull_rom', '곡선 (Catmull-Rom)'], ['linear', '직선 구간']]) { const o = el('option', '', t); o.value = v; ct.appendChild(o); }
    ct.value = d.curve_type;
    ct.addEventListener('change', ed(() => { paths.update(id, { curve_type: ct.value }); render(); }));
    kv('곡선', ct);
    const cl = el('input'); cl.type = 'checkbox'; cl.checked = d.closed;
    cl.addEventListener('change', ed(() => { paths.update(id, { closed: cl.checked }); render(); }));
    kv('순환', cl);
    if (anchors) {
      kv('시작 Anchor', anchorSelect(d.source_anchor_id, ed((v) => setEndAnchor(id, 'start', v))));
      kv('종료 Anchor', anchorSelect(d.target_anchor_id, ed((v) => setEndAnchor(id, 'end', v))));
    }
    kv('길이', fmtLen(paths.length(id)));
    const vs = el('select');
    for (const k of PATH_STATUS) { const o = el('option', '', k); o.value = k; vs.appendChild(o); }
    if (!PATH_STATUS.includes(d.verification_status)) { const o = el('option', '', d.verification_status); o.value = d.verification_status; vs.appendChild(o); }
    vs.value = d.verification_status;
    vs.title = 'ANATOMY_REVIEWED는 전공자 검토를 받은 뒤에만 고른다. 기하 검사로 올리지 않는다.';
    vs.addEventListener('change', ed(() => {
      if (vs.value === 'ANATOMY_REVIEWED' && !window.confirm('전공자 검토를 받은 경로인가요? 기하 검사만으로는 ANATOMY_REVIEWED가 아닙니다.')) { vs.value = d.verification_status; return; }
      paths.update(id, { verification_status: vs.value });
      renderPaths();
    }));
    kv('검증 상태', vs);
    if (d.geometry_check) kv('저장된 기하 검사', `${d.geometry_check.date || ''} · 메시 밖 ${((d.geometry_check.outside_ratio || 0) * 100).toFixed(0)}%${d.geometry_check.stale ? ' · 편집 뒤 다시 검사 필요' : ''}`);
    if (d.method) kv('만든 방법', d.method);
    const cmp = renderCompare();
    if (cmp) kv('이전 버전', cmp.missing ? '같은 ID 경로 없음' : `${cmp.old_status} · 길이 ${fmtLen(cmp.old_length)} → ${fmtLen(paths.length(id))} · 최대 차이 ${fmtLen(cmp.max_deviation_m)}`);
    const g = lastGeometry.get(id);
    kv('기하 검사', g ? `메시 밖 ${(g.outside_ratio * 100).toFixed(0)}% · 관통 ${g.crossings} · 표시 ${g.flagged.length}점` : '(실행 안 함)');
    showFlags(g || null);
    const v = paths.validatePath(id);
    kv('기술 검사', v.errors.length ? v.errors.join(' / ') : (v.warnings.length ? v.warnings.join(' / ') : '문제 없음'));
    props.appendChild(dl);
    if (d.notes) props.appendChild(el('p', 'note', d.notes));
  }

  function setEndAnchor(id, which, anchorId) {
    const d = paths.get(id);
    if (which === 'start') {
      d.source_anchor_id = anchorId;
      if (anchorId) { if (d.points[0] && d.points[0].anchor_id) paths.setPointAnchor(id, 0, anchorId); else paths.insertPoint(id, 0, { anchor_id: anchorId, role: 'start' }); }
    } else {
      d.target_anchor_id = anchorId;
      const last = d.points.length - 1;
      if (anchorId) { if (d.points[last] && d.points[last].anchor_id) paths.setPointAnchor(id, last, anchorId); else paths.insertPoint(id, d.points.length, { anchor_id: anchorId, role: 'end' }); }
    }
    render();
  }

  function pointLabel(p) {
    if (p.anchor_id) return `Anchor ${p.anchor_id}`;
    const v = p.position.map((n) => n.toFixed(3)).join(', ');
    return p.space === 'object_local' ? `${p.object_id} 로컬 (${v})` : `장면 (${v})`;
  }

  function renderPoints() {
    ptList.innerHTML = '';
    ptInspector.innerHTML = '';
    const id = paths.selected;
    const d = id ? paths.get(id) : null;
    if (!d) return;
    d.points.forEach((p, i) => {
      const li = el('li');
      const row = el('div', `pe-row${i === paths.selectedPoint ? ' active' : ''}`);
      const nm = btn(pointLabel(p), () => { paths.select(id, i); if (!paths.showHandles) { showH.checked = true; paths.setShowHandles(true); } render(); }, 'nm');
      row.append(nm,
        btn('↑', ed(() => { paths.movePoint(id, i, -1); render(); }), 'mini'),
        btn('↓', ed(() => { paths.movePoint(id, i, 1); render(); }), 'mini'),
        btn('+', ed(() => { if (i < d.points.length - 1) { const k = paths.insertMidpoint(id, i); paths.select(id, k); render(); } }), 'mini'),
        btn('✕', ed(() => { paths.removePoint(id, i); render(); }), 'mini danger'));
      row.children[3].title = '다음 점과의 중간에 삽입';
      li.appendChild(row);
      ptList.appendChild(li);
    });
    const add = el('div', 'row btns');
    add.append(btn('+ 카메라 초점 위치에 추가', ed(() => {
      const t = controls.target;
      const k = paths.insertPoint(id, d.points.length, { space: 'scene', position: [t.x, t.y, t.z].map((n) => Math.round(n * 1e6) / 1e6) });
      paths.select(id, k);
      render();
    })));
    if (registry) {
      // 반자동: 선택한 점(혈관 메시의 object_local 점)에서 다음 점 방향으로 단면 중심선을 따라가 Waypoint를 채운다
      add.append(btn('단면 중심선으로 채우기', ed(() => fillCenterline(id))));
    }
    ptInspector.appendChild(add);
    const i = paths.selectedPoint;
    const p = d.points[i];
    if (!p) return;
    const w = paths.resolvePoint(p);
    const xyz = (label, vals, onSet, disabled = false) => {
      const g = el('div', 'xyz');
      g.appendChild(el('span', '', label));
      vals.forEach((v, k) => {
        const inp = el('input'); inp.type = 'number'; inp.step = String(paths.markerSize / 4); inp.value = Number.isFinite(v) ? v.toFixed(4) : '';
        inp.disabled = disabled;
        inp.addEventListener('change', () => {
          const all = [...g.querySelectorAll('input')].map((x) => Number(x.value));
          if (!all.every(Number.isFinite)) { log('좌표는 숫자여야 합니다', 'warn'); return; }
          ed(() => onSet(all))();
          render();
        });
        g.appendChild(inp);
      });
      return g;
    };
    ptInspector.appendChild(el('p', 'muted', `점 ${i + 1}: ${p.anchor_id ? 'Anchor 좌표(장면 좌표 수정 시 Anchor 연결이 풀림)' : (p.space === 'object_local' ? `${p.object_id}의 로컬 좌표` : '장면 좌표')}`));
    ptInspector.appendChild(xyz('장면', w ? w.toArray() : [NaN, NaN, NaN], (v) => paths.setPointWorld(id, i, new THREE.Vector3(...v))));
    if (p.space === 'object_local') ptInspector.appendChild(xyz('로컬', p.position, (v) => paths.setPointLocal(id, i, v)));
    if (anchors) {
      const r = el('div', 'row');
      r.append(el('span', 'muted', 'Anchor로 지정'), anchorSelect(p.anchor_id, ed((v) => { if (v) paths.setPointAnchor(id, i, v); render(); })));
      ptInspector.appendChild(r);
    }
  }

  function renderCps() {
    cpList.innerHTML = '';
    const id = paths.selected;
    if (!id) return;
    for (const cp of paths.checkpoints(id)) {
      const li = el('li');
      const row = el('div', 'pe-row');
      const stop = el('input'); stop.type = 'checkbox'; stop.checked = !!cp.stop_on_arrival; stop.title = '도착 시 정지';
      stop.addEventListener('change', ed(() => { paths.updateCheckpoint(id, cp.checkpoint_id, { stop_on_arrival: stop.checked }); renderCps(); }));
      const pct = cp.distance !== null ? `${((cp.distance / paths.length(id)) * 100).toFixed(1)}%` : '위치 오류';
      const nm = btn(`${cp.label || cp.checkpoint_id}`, () => {
        const a = cur();
        if (a) watch(motion.moveToCheckpoint(a.actor_id, cp.checkpoint_id));
      }, 'nm');
      nm.title = `${cp.checkpoint_id} · ${cp.anatomical_id || ''} · 클릭: Actor를 이 Checkpoint까지 이동`;
      row.append(stop, nm, el('span', 'muted', `${pct}${cp.trigger && cp.trigger !== 'both' ? ` · ${cp.trigger === 'forward' ? '정방향' : '역방향'}만` : ''}`),
        btn('✕', ed(() => { paths.removeCheckpoint(id, cp.checkpoint_id); renderCps(); }), 'mini danger'));
      li.appendChild(row);
      cpList.appendChild(li);
    }
    if (!paths.checkpoints(id).length) cpList.appendChild(el('li', 'muted', '(Checkpoint 없음)'));
  }

  function renderStatus() {
    const a = cur();
    const nx = a && a.path_id ? motion.nextCheckpoint(a.actor_id) : null;
    const rows = [
      ['Actor', a ? `${a.actor_id} (${a.actor_type})` : '-'],
      ['Path', a && a.path_id ? a.path_id : '-'],
      ['진행', a ? `${(a.progress * 100).toFixed(1)}% · ${fmtLen(a.distance)} / ${fmtLen(a.path_id ? paths.length(a.path_id) : 0)}` : '-'],
      ['상태', a ? `${STATE_KO[a.movement_state] || a.movement_state}${a.direction < 0 ? ' · 역방향' : ''}` : '-'],
      ['다음 CP', nx ? `${nx.label || nx.checkpoint_id}${nx.stop_on_arrival ? ' (정지)' : ''}` : '-'],
      ['FPS', String(getFps())],
      ['카메라', `${cameraCtl.mode}${cameraCtl.followTarget ? ` → ${cameraCtl.followTarget}${cameraCtl.followSuspended ? ' (수동 조작으로 일시 해제)' : ''}` : ''}`],
      ['오류', `${errors}${lastErrors.length ? ` · 검증 ${lastErrors.length}` : ''}`],
    ];
    status.innerHTML = '';
    for (const [k, v] of rows) status.append(el('dt', '', k), el('dd', '', v));
    histInfo.textContent = `되돌리기 ${history.undo.length} · 다시 ${history.redo.length}`;
    if (a && document.activeElement !== speed) { speed.value = String(Math.log10(a.speed)); speedVal.textContent = fmtSpeed(a.speed); }
    showH.checked = paths.showHandles;
    showP.checked = paths.showPaths;
    if (a && !seeking) { prog.value = String(Math.round(a.progress * 1000)); progVal.textContent = `${(a.progress * 100).toFixed(1)}%`; }
  }

  // 이동 이벤트 → 로그, Checkpoint 초점
  motion.onEvent((kind, ev) => {
    if (kind === 'checkpoint') log(`CP ${ev.checkpoint_id} 통과 · ${ev.actor_id} · ${ev.direction === 'forward' ? '정방향' : '역방향'}${ev.lap ? ` · ${ev.lap + 1}바퀴` : ''}${ev.event_ids.length ? ` · 이벤트 ${ev.event_ids.join(',')}` : ''}`);
    if (kind === 'arrive') {
      log(`도착·정지: ${ev.actor_id} @ ${ev.checkpoint_id}`);
      if (cpFocus.checked && ev.actor_id === actorId) focusCheckpoint(ev);
    }
    if (kind === 'completed') log(`이동 완료: ${ev.actor_id} (${ev.path_id})`);
    if (kind === 'path_switch') log(`경로 전환: ${ev.actor_id} ${ev.from} → ${ev.to}`);
    if (kind === 'lap') log(`순환: ${ev.actor_id} ${ev.lap}바퀴`);
    if (kind === 'command_done' && ev.status === 'failed') { errors += 1; }
    if (kind === 'state' || kind === 'path_set' || kind === 'command_done') renderStatus();
  });

  let focusHandler = null;
  function focusCheckpoint(ev) {
    if (focusHandler && focusHandler(ev)) return;
    const a = actors.get(ev.actor_id);
    if (!a) return;
    const s = paths.markerSize * 8;
    const box = new THREE.Box3().setFromCenterAndSize(a.object3D.position, new THREE.Vector3(s, s, s));
    cameraCtl.stopFollow();
    cameraCtl.focusBox(box);
  }

  paths.onChange((kind) => { if (kind === 'load' || kind === 'clear') render(); });
  actors.onChange((kind) => { if (kind === 'created' || kind === 'removed') renderActors(); });

  // 0.25초마다 상태 표시 갱신 (프레임마다 DOM을 바꾸지 않는다)
  setInterval(() => { if (enabled && container.offsetParent !== null) renderStatus(); }, 250);

  render();

  return {
    render,
    setEnabled(on) {
      enabled = on;
      if (!on) { tc.detach(); paths.setShowHandles(false); showH.checked = false; }
    },
    selectActor(id) { actorId = id; render(); },
    undo,
    redo,
    get history() { return { undo: history.undo.length, redo: history.redo.length }; },
    setCompare(doc) { compareDoc = doc; renderProps(); },
    setCheckpointFocus(fn) { focusHandler = fn; },
    get actorId() { return actorId; },
    gizmo: tc,
  };
}

function fmtLen(m) {
  if (!Number.isFinite(m)) return '-';
  return m < 1 ? `${(m * 1000).toFixed(1)} mm` : `${m.toFixed(3)} m`;
}
function fmtSpeed(v) { return v < 1 ? `${(v * 1000).toFixed(1)} mm/s` : `${v.toFixed(2)} m/s`; }
