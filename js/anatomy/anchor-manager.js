// Anchor Manager: 이후 혈액·음식물 등의 이동 경로를 만들 공간 기준점
// - 위치는 연결 객체(asset_id + node)의 로컬 좌표로 저장한다. 장면 좌표 = 객체 matrixWorld × 로컬.
//   객체가 이동·회전하거나 상위 계층 변환이 바뀌어도 Anchor는 그 구조를 따라간다.
// - 표면 위치: Raycaster로 모델 표면을 클릭해 만든다.
// - 내부 위치: 표면 클릭만으로는 정할 수 없으므로 XYZ 직접 입력, TransformControls 드래그, 단면 관찰로 조정한다.
// - Anchor가 항상 모델 내부나 혈관 내강에 있다고 가정하지 않는다(verification_status로 구분).

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { isShown } from '../engine/object-registry.js';

const REQUIRED = ['anchor_id', 'scene_id', 'name_ko', 'position', 'coordinate_space'];

export function createAnchorManager({ scene, camera, renderer, controls, registry, anatomy, log }) {
  const group = new THREE.Group();
  group.name = 'anchors';
  group.visible = false;
  scene.add(group);
  const geo = new THREE.SphereGeometry(0.0035, 16, 12);
  const mats = {
    normal: new THREE.MeshBasicMaterial({ color: 0x12a594, depthTest: false, transparent: true, opacity: 0.95 }),
    selected: new THREE.MeshBasicMaterial({ color: 0xf5a00a, depthTest: false }),
  };
  let doc = { version: 1, scene_id: '', anchors: [], candidates: [] };
  const markers = new Map();     // anchor_id → Mesh
  let selectedId = null;
  let placeMode = false;
  const listeners = new Set();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  let lastDrag = 0;

  const tc = new TransformControls(camera, renderer.domElement);
  tc.setSize(0.7);
  tc.addEventListener('dragging-changed', (e) => { controls.enabled = !e.value; if (!e.value) lastDrag = performance.now(); });
  tc.addEventListener('objectChange', () => {
    const a = get(selectedId);
    if (a) setWorld(a, tc.object.position, false);
  });
  scene.add(tc);

  function emit(kind, data) { for (const fn of listeners) fn(kind, data); }
  function get(id) { return doc.anchors.find((a) => a.anchor_id === id) || null; }

  // 연결 객체 찾기: GLB 노드 이름으로 (UUID 아님)
  function objectOf(a) {
    if (!a.object) return null;
    for (const id of registry.ids()) {
      const e = registry.get(id);
      if (e.sourceAssetId === a.object.asset_id && e.displayName === a.object.node) return e.object3D;
    }
    return null;
  }

  function worldOf(a) {
    const v = new THREE.Vector3(...a.position);
    if (a.coordinate_space === 'scene') return v;
    const obj = objectOf(a);
    if (!obj) return null;
    obj.updateWorldMatrix(true, false);
    return obj.localToWorld(v);
  }

  function setWorld(a, world, notify = true) {
    const w = world.clone();
    if (a.coordinate_space !== 'scene') {
      const obj = objectOf(a);
      if (!obj) return false;
      obj.updateWorldMatrix(true, false);
      obj.worldToLocal(w);
    }
    a.position = w.toArray().map((n) => Math.round(n * 1e6) / 1e6);
    if (a.verification_status && !/EDITED/.test(a.verification_status)) a.verification_status = `${a.verification_status}; EDITED`;
    if (notify) emit('change', { id: a.anchor_id });
    else emit('move', { id: a.anchor_id });
    return true;
  }

  function marker(a) {
    let m = markers.get(a.anchor_id);
    if (!m) {
      m = new THREE.Mesh(geo, mats.normal);
      m.renderOrder = 20;
      m.userData.anchorId = a.anchor_id;
      group.add(m);
      markers.set(a.anchor_id, m);
    }
    return m;
  }

  // 매 프레임: 객체를 따라 표시 위치 갱신
  function tick() {
    if (!group.visible) return;
    for (const a of doc.anchors) {
      const m = marker(a);
      const w = worldOf(a);
      m.visible = !!w;
      if (w && !(tc.dragging && a.anchor_id === selectedId)) m.position.copy(w);
      m.material = a.anchor_id === selectedId ? mats.selected : mats.normal;
    }
  }

  function load(json) {
    const res = validate(json);
    if (!res.ok) return res;
    clearMarkers();
    doc = { version: json.version || 1, scene_id: json.scene_id, coordinate_note: json.coordinate_note,
      anchors: res.anchors, candidates: json.candidates || [] };
    select(null);
    emit('load', { count: doc.anchors.length });
    return res;
  }

  function validate(json) {
    const errors = [];
    if (!json || !Array.isArray(json.anchors)) return { ok: false, errors: ['anchors 배열이 없습니다'], anchors: [] };
    const anchors = [];
    const ids = new Set();
    json.anchors.forEach((a, i) => {
      const miss = REQUIRED.filter((k) => !(k in a));
      if (miss.length) { errors.push(`#${i + 1}: 필수 항목 없음 ${miss.join(', ')}`); return; }
      if (!Array.isArray(a.position) || a.position.length !== 3 || !a.position.every((n) => Number.isFinite(n))) {
        errors.push(`#${i + 1} ${a.anchor_id}: position은 숫자 3개여야 합니다`); return;
      }
      if (!['object_local', 'scene'].includes(a.coordinate_space)) { errors.push(`#${i + 1} ${a.anchor_id}: coordinate_space 오류`); return; }
      if (a.coordinate_space === 'object_local' && !(a.object && a.object.asset_id && a.object.node)) {
        errors.push(`#${i + 1} ${a.anchor_id}: object_local에는 object(asset_id, node)가 필요합니다`); return;
      }
      if (ids.has(a.anchor_id)) { errors.push(`#${i + 1}: 중복 anchor_id ${a.anchor_id}`); return; }
      ids.add(a.anchor_id);
      anchors.push({ ...a, position: [...a.position] });
    });
    return { ok: true, errors, anchors };
  }

  function clearMarkers() {
    tc.detach();
    for (const m of markers.values()) group.remove(m);
    markers.clear();
  }

  function select(id) {
    selectedId = id && get(id) ? id : null;
    const m = selectedId ? marker(get(selectedId)) : null;
    if (m && m.visible !== false && group.visible) {
      const w = worldOf(get(selectedId));
      if (w) m.position.copy(w);
      tc.attach(m);
    } else {
      tc.detach();
    }
    emit('select', { id: selectedId });
  }

  function create({ anatomical_id = null, object = null, position, coordinate_space = 'object_local', name_ko, name_en, notes = '', status = 'MANUAL (surface pick); NOT anatomically verified' }) {
    let n = doc.anchors.length + 1;
    let id = `a.user.${n}`;
    while (get(id)) { n += 1; id = `a.user.${n}`; }
    const a = {
      anchor_id: id, scene_id: doc.scene_id, anatomical_id, object,
      object_id: object ? `${object.asset_id}/${object.node}` : null,
      name_ko: name_ko || `Anchor ${n}`, name_en: name_en || `Anchor ${n}`,
      position: position.map((v) => Math.round(v * 1e6) / 1e6), coordinate_space,
      optional_direction: null, verification_status: status, notes,
    };
    doc.anchors.push(a);
    emit('change', { id });
    return a;
  }

  function remove(id) {
    const i = doc.anchors.findIndex((a) => a.anchor_id === id);
    if (i < 0) return false;
    doc.anchors.splice(i, 1);
    const m = markers.get(id);
    if (m) { if (tc.object === m) tc.detach(); group.remove(m); markers.delete(id); }
    if (selectedId === id) select(null);
    emit('change', { id });
    return true;
  }

  function update(id, fields) {
    const a = get(id);
    if (!a) return false;
    for (const k of ['name_ko', 'name_en', 'notes', 'anatomical_id', 'optional_direction']) if (k in fields) a[k] = fields[k];
    emit('change', { id });
    return true;
  }

  // XYZ 수정: space = 'local'(연결 객체 기준) | 'scene'(장면 좌표)
  function setPosition(id, xyz, space = 'local') {
    const a = get(id);
    if (!a || !xyz.every((n) => Number.isFinite(n))) return false;
    if (space === 'scene') return setWorld(a, new THREE.Vector3(...xyz));
    a.position = xyz.map((v) => Math.round(v * 1e6) / 1e6);
    emit('change', { id });
    return true;
  }

  // 연결 객체 바꾸기: 장면 위치는 그대로 두고 새 객체의 로컬 좌표로 다시 계산
  function setObject(id, object) {
    const a = get(id);
    if (!a) return false;
    const w = worldOf(a);
    a.object = object;
    a.object_id = `${object.asset_id}/${object.node}`;
    a.coordinate_space = 'object_local';
    return w ? setWorld(a, w) : false;
  }

  function exportJson() {
    return JSON.stringify({ ...doc, exported_at: new Date().toISOString() }, null, 2);
  }

  // ---------- 화면 클릭 ----------
  function pickPoint(clientX, clientY, objects, recursive = false) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(objects, recursive);
  }

  function onDown(e) { down = { x: e.clientX, y: e.clientY }; }

  function onUp(e) {
    const d = down;
    down = null;
    if (!d || Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) return;
    if (tc.dragging || performance.now() - lastDrag < 150) { e.stopImmediatePropagation(); return; }
    // 1) Anchor 마커 클릭 → 선택
    if (group.visible) {
      const hits = pickPoint(e.clientX, e.clientY, [...markers.values()].filter((m) => m.visible));
      if (hits.length) {
        select(hits[0].object.userData.anchorId);
        e.stopImmediatePropagation();
        return;
      }
    }
    // 2) 배치 모드: 보이는 해부학 Mesh 표면에 새 Anchor
    if (placeMode) {
      e.stopImmediatePropagation();
      const meshes = registry.allMeshes().filter((m) => isShown(m) && m.visible);
      const hit = pickPoint(e.clientX, e.clientY, meshes).find((h) => {
        const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material];
        const clip = mats[0] && mats[0].clippingPlanes;
        return !(clip && clip.some((p) => p.distanceToPoint(h.point) < 0));
      });
      if (!hit) { log('Anchor: 클릭한 곳에 모델 표면이 없습니다', 'warn'); return; }
      const entryId = registry.resolvePick(hit.object, 'part');
      const entry = registry.get(entryId);
      const sid = anatomy.structureForObject(entryId);
      const local = entry.object3D.worldToLocal(hit.point.clone());
      const s = sid ? anatomy.get(sid) : null;
      const a = create({
        anatomical_id: sid, object: { asset_id: entry.sourceAssetId, node: entry.displayName },
        position: local.toArray(), name_ko: s ? `${s.name_ko} 표면` : undefined, name_en: s ? `${s.name_en} surface` : undefined,
      });
      select(a.anchor_id);
      log(`Anchor 생성: ${a.anchor_id} (${s ? s.name_ko : entry.displayName} 표면)`);
    }
  }

  // 선택 컨트롤러보다 먼저 받도록 capture 단계에서 듣는다
  renderer.domElement.addEventListener('pointerdown', onDown, true);
  renderer.domElement.addEventListener('pointerup', onUp, true);

  return {
    load,
    validate,
    tick,
    select,
    create,
    remove,
    update,
    setPosition,
    setObject,
    worldOf: (id) => { const a = get(id); return a ? worldOf(a) : null; },
    exportJson,
    get: (id) => get(id),
    list: () => [...doc.anchors],
    candidates: () => [...doc.candidates],
    setVisible(on) { group.visible = on; tc.visible = on; if (!on) tc.detach(); else if (selectedId) select(selectedId); },
    setPlaceMode(on) { placeMode = on; emit('mode', { placeMode }); },
    setGizmoMode(m) { tc.setMode(m); },
    onChange(fn) { listeners.add(fn); },
    get selectedId() { return selectedId; },
    get placeMode() { return placeMode; },
    get visible() { return group.visible; },
  };
}
