// Path Engine (STEP 03-C): 3차원 경로 데이터 · 곡선 · 길이 캐시 · Waypoint · Checkpoint · 검증 · 표시
//
// 좌표 원칙
// - 경로 곡선은 항상 "장면(world) 좌표"로 계산한다. 경로 데이터의 각 점은 자기 좌표계를 따로 적는다.
//     { anchor_id }                                  → Anchor Manager가 장면 좌표로 바꿔 준다(object-local Anchor 포함)
//     { space: 'object_local', object_id, position } → 레지스트리 객체의 matrixWorld × position
//     { space: 'scene', position }                   → 그대로
// - 모델 가공 때 적용한 축·단위 변환(glTF)은 이미 GLB에 들어 있으므로 여기서 다시 적용하지 않는다.
// - 점이 참조하는 객체가 움직이면(matrixWorld 변경) 다음 프레임에 곡선과 길이 캐시를 다시 만든다.
//
// 곡선 길이 기반 이동: 진행은 "거리(m)"로 다룬다. distance → u(0~1) → getPointAt(u)
// getPointAt/getTangentAt은 호(arc) 길이 기준이라 구간마다 속도가 달라지지 않는다.

import * as THREE from 'three';

// 경로 검증 상태 (STEP 04-A)
//   PENDING: 경로 없음·작성 중 / APPROXIMATE: Anchor 평균을 이은 근사 / GEOMETRY_CHECKED: 기하 검사 통과(메시 밖 0%, 연결·순서 정상)
//   ANATOMY_REVIEWED: 전공자 검토 완료(사람만 올린다) / CONCEPTUAL: 해부 모델이 없는 개념 장면 경로 / TEST_PATH: 엔진 시험용
//   VERIFIED_GEOMETRY(STEP 03-C 이름)는 GEOMETRY_CHECKED로 읽는다.
export const PATH_STATUS = ['PENDING', 'APPROXIMATE', 'GEOMETRY_CHECKED', 'ANATOMY_REVIEWED', 'CONCEPTUAL', 'TEST_PATH'];
const STATUS_ALIAS = { VERIFIED_GEOMETRY: 'GEOMETRY_CHECKED' };
const REQUIRED = ['path_id', 'points'];
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);

export function createPathEngine({ scene, registry, anchors = null, log = () => {} }) {
  const paths = new Map();          // path_id → { def, cache }
  const listeners = new Set();
  const group = new THREE.Group();
  group.name = 'paths(overlay)';    // 레지스트리에 등록하지 않는다 → 해부학 선택을 방해하지 않음
  scene.add(group);
  const mats = {
    line: new THREE.LineBasicMaterial({ color: 0x2f6fde, depthTest: false, transparent: true, opacity: 0.85 }),
    lineSel: new THREE.LineBasicMaterial({ color: 0xf5a00a, depthTest: false }),
    handle: new THREE.MeshBasicMaterial({ color: 0x2f6fde, depthTest: false }),
    handleAnchor: new THREE.MeshBasicMaterial({ color: 0x12a594, depthTest: false }),
    handleSel: new THREE.MeshBasicMaterial({ color: 0xf5a00a, depthTest: false }),
    cp: new THREE.MeshBasicMaterial({ color: 0xe5484d, depthTest: false }),
    cpStop: new THREE.MeshBasicMaterial({ color: 0x8e4ec6, depthTest: false }),
  };
  const handleGeo = new THREE.SphereGeometry(1, 12, 8);
  const cpGeo = new THREE.OctahedronGeometry(1);
  let markerSize = 0.06;             // 장면 크기에 맞춰 바꾼다(심장 장면은 수 mm)
  let selectedPath = null;
  let selectedPoint = -1;
  let showPaths = true;
  let showHandles = false;
  const tmp = new THREE.Vector3();

  function emit(kind, data) { for (const fn of listeners) fn(kind, data); }

  // ---------- 점 해석 ----------
  function objectOfPoint(p) {
    if (p.anchor_id) return null;
    if (p.space === 'object_local' && p.object_id && registry.has(p.object_id)) return registry.get(p.object_id).object3D;
    return null;
  }

  function resolvePoint(p, out = new THREE.Vector3()) {
    if (!p) return null;
    if (p.anchor_id) {
      if (!anchors) return null;
      const w = anchors.worldOf(p.anchor_id);
      return w ? out.copy(w) : null;
    }
    if (!isVec3(p.position)) return null;
    if (p.space === 'object_local') {
      const obj = objectOfPoint(p);
      if (!obj) return null;
      obj.updateWorldMatrix(true, false);
      return out.set(...p.position).applyMatrix4(obj.matrixWorld);
    }
    return out.set(...p.position);
  }

  // 점이 참조하는 객체들의 matrixWorld (변경 감지용)
  function referencedObjects(def) {
    const list = [];
    for (const p of def.points) {
      if (p.anchor_id && anchors) {
        const a = anchors.get(p.anchor_id);
        const obj = a && a.object ? findAssetNode(a.object) : null;
        if (obj) list.push(obj);
      } else {
        const obj = objectOfPoint(p);
        if (obj) list.push(obj);
      }
    }
    return list;
  }

  function findAssetNode(o) {
    for (const id of registry.ids()) {
      const e = registry.get(id);
      if (e.sourceAssetId === o.asset_id && e.displayName === o.node) return e.object3D;
    }
    return null;
  }

  // ---------- 곡선과 캐시 ----------
  function build(id) {
    const rec = paths.get(id);
    if (!rec) return null;
    const def = rec.def;
    const pts = [];
    const missing = [];
    def.points.forEach((p, i) => {
      const v = resolvePoint(p);
      if (v && isNum(v.x) && isNum(v.y) && isNum(v.z)) pts.push(v);
      else missing.push(i);
    });
    let curve = null;
    if (pts.length >= 2) {
      if (def.curve_type === 'linear') {
        curve = new THREE.CurvePath();
        for (let i = 0; i < pts.length - 1; i += 1) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
        if (def.closed) curve.add(new THREE.LineCurve3(pts[pts.length - 1], pts[0]));
      } else {
        curve = new THREE.CatmullRomCurve3(pts, !!def.closed, 'centripetal', 0.5);
        // 호 길이 표본 수: 구간당 64개 (기본 200개보다 긴 경로에서 정확)
        curve.arcLengthDivisions = Math.max(200, pts.length * 64);
      }
    }
    const length = curve ? curve.getLength() : 0;
    const objs = referencedObjects(def);
    rec.cache = {
      curve, points: pts, missing, length,
      objects: objs, matrices: objs.map((o) => { o.updateWorldMatrix(true, false); return o.matrixWorld.clone(); }),
      checkpoints: resolveCheckpoints(def, curve, length),
    };
    updateView(id);
    return rec.cache;
  }

  // Checkpoint 위치를 거리(m)로 정한다: path_distance > path_progress > anchor 투영
  function resolveCheckpoints(def, curve, length) {
    const out = [];
    for (const cp of def.checkpoints || []) {
      let d = null;
      if (isNum(cp.path_distance)) d = cp.path_distance;
      else if (isNum(cp.path_progress)) d = cp.path_progress * length;
      else if (cp.anchor_id && curve) {
        const w = anchors ? anchors.worldOf(cp.anchor_id) : null;
        if (w) d = closestDistance(curve, length, w);
      }
      out.push({ ...cp, distance: d, valid: d !== null && d >= 0 && d <= length + 1e-9 });
    }
    out.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    return out;
  }

  function closestDistance(curve, length, point) {
    const n = 400;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i <= n; i += 1) {
      const d = curve.getPointAt(i / n, tmp).distanceToSquared(point);
      if (d < bestD) { bestD = d; best = i / n; }
    }
    return best * length;
  }

  function cacheOf(id) {
    const rec = paths.get(id);
    if (!rec) return null;
    if (!rec.cache) build(id);
    return rec.cache;
  }

  // 매 프레임: 참조 객체가 움직였으면 다시 만든다 (객체 수가 적어 비교 비용이 작다)
  function tick() {
    for (const [id, rec] of paths) {
      const c = rec.cache;
      if (!c) continue;
      for (let i = 0; i < c.objects.length; i += 1) {
        const o = c.objects[i];
        o.updateWorldMatrix(true, false);
        if (!o.matrixWorld.equals(c.matrices[i])) { build(id); emit('rebuild', { id }); break; }
      }
    }
  }

  // 보이는 경로 전체 범위 (카메라 전체 보기용)
  function bounds() {
    const box = new THREE.Box3();
    for (const [id, rec] of paths) {
      if (!showPaths || rec.visible === false || !rec.cache) continue;
      for (const p of rec.cache.points) box.expandByPoint(p);
    }
    return box;
  }

  // Anchor 위치가 편집되면 그 Anchor를 쓰는 경로를 다시 만든다
  function refreshAnchor(anchorId) {
    for (const [id, rec] of paths) {
      if (rec.def.points.some((p) => p.anchor_id === anchorId) || (rec.def.checkpoints || []).some((c) => c.anchor_id === anchorId)) {
        build(id);
        emit('rebuild', { id });
      }
    }
  }

  // ---------- 조회 ----------
  function pointAt(id, distance, out = new THREE.Vector3()) {
    const c = cacheOf(id);
    if (!c || !c.curve || c.length === 0) return null;
    return c.curve.getPointAt(THREE.MathUtils.clamp(distance / c.length, 0, 1), out);
  }

  function tangentAt(id, distance, out = new THREE.Vector3()) {
    const c = cacheOf(id);
    if (!c || !c.curve || c.length === 0) return null;
    return c.curve.getTangentAt(THREE.MathUtils.clamp(distance / c.length, 0, 1), out).normalize();
  }

  // ---------- 데이터 ----------
  function normalize(raw, sceneId) {
    const def = {
      path_id: raw.path_id,
      scene_id: raw.scene_id || sceneId || '',
      name_ko: raw.name_ko || raw.path_id,
      name_en: raw.name_en || '',
      source_anchor_id: raw.source_anchor_id || null,
      target_anchor_id: raw.target_anchor_id || null,
      points: (raw.points || []).map((p) => ({ ...p, position: p.position ? [...p.position] : undefined })),
      checkpoints: (raw.checkpoints || []).map((c) => ({ event_ids: [], stop_on_arrival: false, ...c, path_id: raw.path_id })),
      coordinate_space: 'scene',
      curve_type: raw.curve_type === 'linear' ? 'linear' : 'catmull_rom',
      direction: raw.direction === -1 || raw.direction === 'reverse' ? -1 : 1,
      closed: !!raw.closed,
      default_duration: isNum(raw.default_duration) ? raw.default_duration : null,
      default_speed: isNum(raw.default_speed) ? raw.default_speed : null,
      links: (raw.links || []).map((l) => (typeof l === 'string' ? { to: l } : { ...l })),
      verification_status: STATUS_ALIAS[raw.verification_status] || raw.verification_status || 'PENDING',
      source: raw.source || '',
      notes: raw.notes || '',
      method: raw.method || '',
      geometry_check: raw.geometry_check ? JSON.parse(JSON.stringify(raw.geometry_check)) : null,
    };
    return def;
  }

  // 시작·끝 Anchor가 있으면 첫 점·끝 점으로 쓴다 (points에 없으면 붙인다)
  function applyEndAnchors(def) {
    if (def.source_anchor_id && !(def.points[0] && def.points[0].anchor_id === def.source_anchor_id)) {
      def.points.unshift({ anchor_id: def.source_anchor_id, role: 'start' });
    }
    const last = def.points[def.points.length - 1];
    if (def.target_anchor_id && !(last && last.anchor_id === def.target_anchor_id)) {
      def.points.push({ anchor_id: def.target_anchor_id, role: 'end' });
    }
  }

  function load(json, { replace = true } = {}) {
    const res = validateDoc(json);
    if (!res.ok) return res;
    if (replace) clear();
    for (const raw of json.paths) {
      const def = normalize(raw, json.scene_id);
      applyEndAnchors(def);
      paths.set(def.path_id, { def, cache: null, view: null });
    }
    for (const id of paths.keys()) build(id);
    const tech = validateAll();
    emit('load', { count: paths.size });
    return { ok: true, errors: [...res.errors, ...tech.errors], warnings: tech.warnings };
  }

  // JSON 형식 검사 (불러오기 전)
  function validateDoc(json) {
    const errors = [];
    if (!json || !Array.isArray(json.paths)) return { ok: false, errors: ['paths 배열이 없습니다'] };
    const ids = new Set();
    json.paths.forEach((p, i) => {
      const miss = REQUIRED.filter((k) => !(k in p));
      if (miss.length) errors.push(`#${i + 1}: 필수 항목 없음 ${miss.join(', ')}`);
      if (ids.has(p.path_id)) errors.push(`#${i + 1}: 경로 ID 중복 ${p.path_id}`);
      ids.add(p.path_id);
      (p.points || []).forEach((pt, j) => {
        if (!pt.anchor_id && !isVec3(pt.position)) errors.push(`${p.path_id} 점 ${j + 1}: 좌표가 숫자 3개가 아닙니다 (NaN·무한대 포함)`);
      });
    });
    return { ok: errors.length === 0, errors };
  }

  // 기술적 검증 (해부학적 검증과 별개)
  function validatePath(id) {
    const errors = [];
    const warnings = [];
    const rec = paths.get(id);
    if (!rec) return { errors: [`없는 경로: ${id}`], warnings };
    const def = rec.def;
    const c = cacheOf(id);
    for (const p of def.points) {
      if (p.anchor_id && anchors && !anchors.get(p.anchor_id)) errors.push(`${id}: 없는 Anchor ${p.anchor_id}`);
      if (p.space === 'object_local' && !registry.has(p.object_id)) errors.push(`${id}: 없는 객체 ${p.object_id}`);
      if (!p.anchor_id && p.position && !isVec3(p.position)) errors.push(`${id}: 잘못된 좌표`);
    }
    if (c.missing.length) errors.push(`${id}: 계산할 수 없는 점 ${c.missing.map((i) => i + 1).join(', ')}번`);
    if (!PATH_STATUS.includes(def.verification_status)) warnings.push(`${id}: 알 수 없는 검증 상태 ${def.verification_status}`);
    if (c.points.length < 2) errors.push(`${id}: 점이 2개 미만`);
    else if (!(c.length > 1e-6)) errors.push(`${id}: 길이가 0인 경로`);
    if (!isNum(c.length)) errors.push(`${id}: 길이가 숫자가 아님`);
    const cpIds = new Set();
    for (const cp of c.checkpoints) {
      if (cpIds.has(cp.checkpoint_id)) errors.push(`${id}: Checkpoint ID 중복 ${cp.checkpoint_id}`);
      cpIds.add(cp.checkpoint_id);
      if (isNum(cp.path_progress) && (cp.path_progress < 0 || cp.path_progress > 1)) errors.push(`${id}/${cp.checkpoint_id}: 진행률은 0~1`);
      else if (!cp.valid) errors.push(`${id}/${cp.checkpoint_id}: 위치를 정할 수 없거나 범위 밖`);
      if (cp.anchor_id && anchors && !anchors.get(cp.anchor_id)) errors.push(`${id}/${cp.checkpoint_id}: 없는 Anchor ${cp.anchor_id}`);
    }
    for (const l of def.links) {
      if (!paths.has(l.to)) { errors.push(`${id}: 연결 대상 경로 없음 ${l.to}`); continue; }
      // 연결: 이 경로의 끝과 다음 경로의 시작이 가까워야 한다 (허용 오차: 짧은 경로 길이의 2% 또는 1 mm)
      const next = cacheOf(l.to);
      if (c.points.length && next.points.length && !def.closed) {
        const gap = c.points[c.points.length - 1].distanceTo(next.points[0]);
        const tol = Math.max(0.001, Math.min(c.length, next.length) * 0.02);
        if (gap > tol) warnings.push(`${id} → ${l.to}: 끝점과 시작점이 ${(gap * 1000).toFixed(1)} mm 떨어져 있습니다 (연결되지 않음)`);
      }
    }
    return { errors, warnings };
  }

  function validateAll() {
    const errors = [];
    const warnings = [];
    for (const id of paths.keys()) {
      const r = validatePath(id);
      errors.push(...r.errors);
      warnings.push(...r.warnings);
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  function exportJson(sceneId) {
    const list = [...paths.values()].map(({ def }) => {
      const out = { ...def, points: def.points.map((p) => ({ ...p })), checkpoints: def.checkpoints.map((c) => { const x = { ...c }; delete x.path_id; return x; }) };
      return out;
    });
    return JSON.stringify({ version: 2, scene_id: sceneId || (list[0] && list[0].scene_id) || '', coordinate_note: '곡선은 장면 좌표로 계산. 점마다 anchor_id / object_local / scene 좌표계를 적는다.', paths: list, exported_at: new Date().toISOString() }, null, 2);
  }

  // ---------- Waypoint 편집 ----------
  function def(id) { const r = paths.get(id); return r ? r.def : null; }

  function changed(id) {
    build(id);
    emit('change', { id });
  }

  // 모양이 바뀌면 이전 기하 검사·검토는 더 이상 이 경로를 설명하지 않는다 → 상태를 낮추고 표시한다
  function edited(id) {
    const d = def(id);
    if (!d) return;
    if (d.geometry_check && !d.geometry_check.stale) d.geometry_check.stale = true;
    if (d.verification_status === 'GEOMETRY_CHECKED' || d.verification_status === 'ANATOMY_REVIEWED') {
      d.notes = `${d.notes ? `${d.notes} ` : ''}[편집됨: ${d.verification_status}에서 APPROXIMATE로 낮춤. 기하 검사를 다시 해야 한다]`;
      d.verification_status = 'APPROXIMATE';
    }
  }

  // 되돌리기용: 경로 정의 전체 복사본과 복원 (Path Editor가 Undo/Redo 기록에 쓴다)
  function snapshot(id) {
    const d = def(id);
    return d ? JSON.parse(JSON.stringify(d)) : null;
  }
  function restore(snap) {
    if (!snap || !snap.path_id) return false;
    const rec = paths.get(snap.path_id);
    const d = JSON.parse(JSON.stringify(snap));
    if (rec) rec.def = d;
    else paths.set(d.path_id, { def: d, cache: null, view: null });
    changed(d.path_id);
    return true;
  }

  function create(raw) {
    if (!raw || !raw.path_id || paths.has(raw.path_id)) return null;
    const d = normalize(raw);
    applyEndAnchors(d);
    paths.set(d.path_id, { def: d, cache: null, view: null });
    changed(d.path_id);
    return d;
  }

  function remove(id) {
    const rec = paths.get(id);
    if (!rec) return false;
    if (rec.view) { group.remove(rec.view); disposeView(rec.view); }
    paths.delete(id);
    if (selectedPath === id) { selectedPath = null; selectedPoint = -1; }
    emit('change', { id, removed: true });
    return true;
  }

  function update(id, fields) {
    const d = def(id);
    if (!d) return false;
    const shape = ('curve_type' in fields && fields.curve_type !== d.curve_type) || ('closed' in fields && fields.closed !== d.closed);
    for (const k of ['name_ko', 'name_en', 'curve_type', 'closed', 'direction', 'default_speed', 'default_duration', 'verification_status', 'notes', 'links']) if (k in fields) d[k] = fields[k];
    if (shape) edited(id);
    changed(id);
    return true;
  }

  // 장면 좌표로 점 삽입 (index 위치에)
  function insertPoint(id, index, point) {
    const d = def(id);
    if (!d) return false;
    const i = THREE.MathUtils.clamp(index, 0, d.points.length);
    d.points.splice(i, 0, point);
    edited(id);
    changed(id);
    return i;
  }

  // 두 점 사이 중간(곡선 위)에 새 Waypoint
  function insertMidpoint(id, afterIndex) {
    const d = def(id);
    const c = cacheOf(id);
    if (!d || !c || c.points.length < 2) return -1;
    const i = THREE.MathUtils.clamp(afterIndex, 0, d.points.length - 2);
    const a = resolvePoint(d.points[i]);
    const b = resolvePoint(d.points[i + 1]);
    if (!a || !b) return -1;
    const mid = a.add(b).multiplyScalar(0.5);
    return insertPoint(id, i + 1, { space: 'scene', position: mid.toArray().map(r6) });
  }

  function removePoint(id, index) {
    const d = def(id);
    if (!d || index < 0 || index >= d.points.length) return false;
    d.points.splice(index, 1);
    if (selectedPath === id) selectedPoint = Math.min(selectedPoint, d.points.length - 1);
    edited(id);
    changed(id);
    return true;
  }

  function movePoint(id, index, delta) {
    const d = def(id);
    const j = index + delta;
    if (!d || index < 0 || j < 0 || j >= d.points.length) return false;
    const [p] = d.points.splice(index, 1);
    d.points.splice(j, 0, p);
    if (selectedPath === id && selectedPoint === index) selectedPoint = j;
    edited(id);
    changed(id);
    return true;
  }

  // 점 좌표 바꾸기: space 'scene' 또는 'local'(점 자신의 좌표계). Anchor 점은 장면 좌표 점으로 풀어서 고친다.
  function setPointWorld(id, index, world, { notify = true } = {}) {
    const d = def(id);
    if (!d || !d.points[index]) return false;
    const p = d.points[index];
    if (p.space === 'object_local') {
      const obj = objectOfPoint(p);
      if (!obj) return false;
      obj.updateWorldMatrix(true, false);
      p.position = obj.worldToLocal(world.clone()).toArray().map(r6);
    } else {
      d.points[index] = { space: 'scene', position: world.toArray().map(r6), ...(p.anchor_id ? { detached_from: p.anchor_id } : {}) };
    }
    edited(id);
    build(id);
    emit(notify ? 'change' : 'move', { id, index });
    return true;
  }

  function setPointLocal(id, index, xyz) {
    const d = def(id);
    if (!d || !d.points[index] || !isVec3(xyz)) return false;
    const p = d.points[index];
    if (p.anchor_id) return false;
    p.position = xyz.map(r6);
    edited(id);
    changed(id);
    return true;
  }

  function setPointAnchor(id, index, anchorId) {
    const d = def(id);
    if (!d || !d.points[index] || !anchors || !anchors.get(anchorId)) return false;
    d.points[index] = { anchor_id: anchorId };
    edited(id);
    changed(id);
    return true;
  }

  // ---------- Checkpoint 편집 ----------
  function addCheckpoint(id, cp) {
    const d = def(id);
    if (!d) return null;
    let n = d.checkpoints.length + 1;
    let cid = cp.checkpoint_id || `${id}.cp${n}`;
    while (d.checkpoints.some((c) => c.checkpoint_id === cid)) { n += 1; cid = `${id}.cp${n}`; }
    const c = { checkpoint_id: cid, path_id: id, anchor_id: null, anatomical_id: null, stop_on_arrival: true, event_ids: [], label: cid, verification_status: 'TEST', ...cp, checkpoint_id: cid };
    d.checkpoints.push(c);
    changed(id);
    return c;
  }

  function updateCheckpoint(id, cid, fields) {
    const d = def(id);
    const c = d && d.checkpoints.find((x) => x.checkpoint_id === cid);
    if (!c) return false;
    Object.assign(c, fields);
    changed(id);
    return true;
  }

  function removeCheckpoint(id, cid) {
    const d = def(id);
    if (!d) return false;
    const i = d.checkpoints.findIndex((x) => x.checkpoint_id === cid);
    if (i < 0) return false;
    d.checkpoints.splice(i, 1);
    changed(id);
    return true;
  }

  function findCheckpoint(cid) {
    for (const [id] of paths) {
      const c = cacheOf(id);
      const cp = c && c.checkpoints.find((x) => x.checkpoint_id === cid);
      if (cp) return { pathId: id, cp };
    }
    return null;
  }

  // ---------- 표시 ----------
  function disposeView(v) {
    v.traverse((o) => { if (o.isLine) o.geometry.dispose(); });
  }

  function updateView(id) {
    const rec = paths.get(id);
    if (!rec) return;
    if (rec.view) { group.remove(rec.view); disposeView(rec.view); }
    const v = new THREE.Group();
    v.name = `path:${id}`;
    v.userData.pathId = id;
    const c = rec.cache;
    if (c && c.curve && c.length > 0) {
      const n = Math.min(2000, Math.max(32, Math.round(c.points.length * 40)));
      const geo = new THREE.BufferGeometry().setFromPoints(c.curve.getSpacedPoints(n));
      const line = new THREE.Line(geo, id === selectedPath ? mats.lineSel : mats.line);
      line.renderOrder = 15;
      v.add(line);
      for (const cp of c.checkpoints) {
        if (cp.distance === null) continue;
        const m = new THREE.Mesh(cpGeo, cp.stop_on_arrival ? mats.cpStop : mats.cp);
        c.curve.getPointAt(THREE.MathUtils.clamp(cp.distance / c.length, 0, 1), m.position);
        m.scale.setScalar(markerSize * 0.6);
        m.renderOrder = 16;
        m.userData.checkpointId = cp.checkpoint_id;
        v.add(m);
      }
    }
    const handles = new THREE.Group();
    handles.name = 'handles';
    handles.visible = showHandles;
    rec.def.points.forEach((p, i) => {
      const w = resolvePoint(p);
      if (!w) return;
      const sel = id === selectedPath && i === selectedPoint;
      const m = new THREE.Mesh(handleGeo, sel ? mats.handleSel : (p.anchor_id ? mats.handleAnchor : mats.handle));
      m.position.copy(w);
      m.scale.setScalar(markerSize * (sel ? 0.75 : 0.55));
      m.renderOrder = 17;
      m.userData.pathId = id;
      m.userData.pointIndex = i;
      handles.add(m);
    });
    v.add(handles);
    v.visible = showPaths && rec.visible !== false;
    rec.view = v;
    group.add(v);
  }

  function handleMeshes() {
    const list = [];
    for (const rec of paths.values()) {
      if (!rec.view || !rec.view.visible) continue;
      const h = rec.view.getObjectByName('handles');
      if (h && h.visible) list.push(...h.children);
    }
    return list;
  }

  function setPathVisible(id, on) {
    const rec = paths.get(id);
    if (!rec) return false;
    rec.visible = on;
    if (rec.view) rec.view.visible = showPaths && on;
    return true;
  }

  function clear() {
    for (const rec of paths.values()) if (rec.view) { group.remove(rec.view); disposeView(rec.view); }
    paths.clear();
    selectedPath = null;
    selectedPoint = -1;
    emit('clear', {});
  }

  function select(id, index = -1) {
    const prev = selectedPath;
    selectedPath = id && paths.has(id) ? id : null;
    selectedPoint = selectedPath ? index : -1;
    if (prev && paths.has(prev)) updateView(prev);
    if (selectedPath) updateView(selectedPath);
    emit('select', { id: selectedPath, index: selectedPoint });
  }

  function handleOf(id, index) {
    const rec = paths.get(id);
    const h = rec && rec.view && rec.view.getObjectByName('handles');
    return h ? h.children.find((m) => m.userData.pointIndex === index) || null : null;
  }

  return {
    load,
    validateDoc,
    validatePath,
    validateAll,
    exportJson,
    build,
    tick,
    refreshAnchor,
    bounds,
    pointAt,
    tangentAt,
    resolvePoint,
    create,
    snapshot,
    restore,
    remove,
    update,
    insertPoint,
    insertMidpoint,
    removePoint,
    movePoint,
    setPointWorld,
    setPointLocal,
    setPointAnchor,
    addCheckpoint,
    updateCheckpoint,
    removeCheckpoint,
    findCheckpoint,
    select,
    handleOf,
    handleMeshes,
    setPathVisible,
    clear,
    has: (id) => paths.has(id),
    get: (id) => def(id),
    cache: (id) => cacheOf(id),
    length: (id) => { const c = cacheOf(id); return c ? c.length : 0; },
    checkpoints: (id) => { const c = cacheOf(id); return c ? c.checkpoints : []; },
    ids: () => [...paths.keys()],
    list: () => [...paths.values()].map((r) => r.def),
    isVisible: (id) => { const r = paths.get(id); return !!r && r.visible !== false; },
    setShowPaths(on) { showPaths = on; for (const [id, r] of paths) if (r.view) r.view.visible = on && r.visible !== false; },
    setShowHandles(on) { showHandles = on; for (const id of paths.keys()) updateView(id); },
    setMarkerSize(s) { markerSize = s; for (const id of paths.keys()) updateView(id); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get selected() { return selectedPath; },
    get selectedPoint() { return selectedPoint; },
    get showPaths() { return showPaths; },
    get showHandles() { return showHandles; },
    get markerSize() { return markerSize; },
    group,
  };
}

function r6(n) { return Math.round(n * 1e6) / 1e6; }
