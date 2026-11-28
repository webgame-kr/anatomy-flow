// Path Editor (STEP 03-C): 개발자용 경량 경로 편집기 + 이동 미리보기 패널
// - 개발자 화면(Sandbox 오른쪽 패널, Explorer 개발자 모드)에서만 붙인다.
// - 편집용 핸들은 레지스트리에 등록하지 않는다 → 해부학 구조 선택을 방해하지 않는다.
//   핸들 클릭은 편집기가 먼저(capture 단계) 받아서 처리하고, 다른 선택으로 넘기지 않는다.
// - TransformControls를 드래그하는 동안 OrbitControls를 끈다(카메라 조작과 좌표 편집 충돌 방지).

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ACTOR_MODELS } from './actor-manager.js';
import { checkPathGeometry } from './path-geometry-check.js';

const STATE_KO = { idle: '대기', moving: '이동 중', paused: '일시정지', waiting_at_checkpoint: 'Checkpoint 대기', completed: '완료', cancelled: '취소' };

export function createPathEditor({ container, kit, camera3d, renderer, controls, cameraCtl, scene, anchors = null, registry = null, log, getFps = () => '-', onDownload = null }) {
  const { paths, actors, motion } = kit;
  let actorId = null;
  let enabled = true;
  let errors = 0;
  let lastErrors = [];

  // ---------- TransformControls (Waypoint 이동) ----------
  const proxy = new THREE.Object3D();
  proxy.name = 'waypoint-proxy';
  scene.add(proxy);
  const tc = new TransformControls(camera3d, renderer.domElement);
  tc.setSize(0.7);
  let lastDrag = 0;
  tc.addEventListener('dragging-changed', (e) => {
    controls.enabled = !e.value;
    if (!e.value) { lastDrag = performance.now(); renderPoints(); renderStatus(); }
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
    btn('+ Actor 위치에', () => addCpAt('actor')),
    btn('+ 선택 Waypoint에', () => addCpAt('point')),
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
    rf.appendChild(btn('기하 검사 (선택 경로)', () => {
      const id = paths.selected;
      if (!id) { log('경로를 고르세요', 'warn'); return; }
      const t0 = performance.now();
      const g = checkPathGeometry({ paths, registry, pathId: id });
      log(`기하 검사 ${id} (${Math.round(performance.now() - t0)}ms): 메시 밖 ${(g.outside_ratio * 100).toFixed(0)}% · ${g.runs.map((r) => `${(r.from * 100).toFixed(0)}% ${r.inside}`).join(' | ')} — ${g.note}`, g.outside_ratio > 0 ? 'warn' : '');
    }));
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
      row.append(eye, name, meta);
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
    ct.addEventListener('change', () => { paths.update(id, { curve_type: ct.value }); render(); });
    kv('곡선', ct);
    const cl = el('input'); cl.type = 'checkbox'; cl.checked = d.closed;
    cl.addEventListener('change', () => { paths.update(id, { closed: cl.checked }); render(); });
    kv('순환', cl);
    if (anchors) {
      kv('시작 Anchor', anchorSelect(d.source_anchor_id, (v) => setEndAnchor(id, 'start', v)));
      kv('종료 Anchor', anchorSelect(d.target_anchor_id, (v) => setEndAnchor(id, 'end', v)));
    }
    kv('길이', fmtLen(paths.length(id)));
    kv('검증 상태', d.verification_status);
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
        btn('↑', () => { paths.movePoint(id, i, -1); render(); }, 'mini'),
        btn('↓', () => { paths.movePoint(id, i, 1); render(); }, 'mini'),
        btn('+', () => { if (i < d.points.length - 1) { const k = paths.insertMidpoint(id, i); paths.select(id, k); render(); } }, 'mini'),
        btn('✕', () => { paths.removePoint(id, i); render(); }, 'mini danger'));
      row.children[3].title = '다음 점과의 중간에 삽입';
      li.appendChild(row);
      ptList.appendChild(li);
    });
    const add = el('div', 'row btns');
    add.append(btn('+ 카메라 초점 위치에 추가', () => {
      const t = controls.target;
      const k = paths.insertPoint(id, d.points.length, { space: 'scene', position: [t.x, t.y, t.z].map((n) => Math.round(n * 1e6) / 1e6) });
      paths.select(id, k);
      render();
    }));
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
          onSet(all);
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
      r.append(el('span', 'muted', 'Anchor로 지정'), anchorSelect(p.anchor_id, (v) => { if (v) paths.setPointAnchor(id, i, v); render(); }));
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
      stop.addEventListener('change', () => { paths.updateCheckpoint(id, cp.checkpoint_id, { stop_on_arrival: stop.checked }); renderCps(); });
      const pct = cp.distance !== null ? `${((cp.distance / paths.length(id)) * 100).toFixed(1)}%` : '위치 오류';
      const nm = btn(`${cp.label || cp.checkpoint_id}`, () => {
        const a = cur();
        if (a) watch(motion.moveToCheckpoint(a.actor_id, cp.checkpoint_id));
      }, 'nm');
      nm.title = `${cp.checkpoint_id} · ${cp.anatomical_id || ''} · 클릭: Actor를 이 Checkpoint까지 이동`;
      row.append(stop, nm, el('span', 'muted', `${pct}${cp.trigger && cp.trigger !== 'both' ? ` · ${cp.trigger === 'forward' ? '정방향' : '역방향'}만` : ''}`),
        btn('✕', () => { paths.removeCheckpoint(id, cp.checkpoint_id); renderCps(); }, 'mini danger'));
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
