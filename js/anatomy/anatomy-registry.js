// Anatomy Registry: Object Registry 위에 해부학 의미 정보를 연결하는 데이터 층
// - 구조(structures.json)는 GLB 노드 이름(asset_id + node)으로 객체를 명시적으로 가리킨다.
//   Three.js UUID나 레지스트리 내부 번호를 영구 ID로 쓰지 않는다.
// - 렌더링 상태(표시, 투명도, 위치)는 저장하지 않는다. 그건 Object Registry / Material Controller가 가진다.
// - 한 구조가 여러 Mesh로 되어 있어도 하나의 논리 구조로 선택·조작한다.

import * as THREE from 'three';
import { isShown } from '../engine/object-registry.js';

export function createAnatomyRegistry({ registry }) {
  let data = { system: '', structures: [] };
  const byId = new Map();          // anatomical_id → structure
  const objectsOf = new Map();     // anatomical_id → [registry object id]
  const structuresOf = new Map();  // registry object id → [anatomical_id] (작은 구조 먼저)

  function load(json) {
    data = json;
    byId.clear();
    for (const s of json.structures) byId.set(s.anatomical_id, s);
    resolve();
    return data;
  }

  // GLB가 레지스트리에 등록·해제될 때마다 다시 연결한다
  function resolve() {
    objectsOf.clear();
    structuresOf.clear();
    const index = new Map();       // "asset:node" → registry id
    for (const id of registry.ids()) {
      const e = registry.get(id);
      if (e.type === 'mesh' && e.sourceAssetId) index.set(`${e.sourceAssetId}:${e.displayName}`, id);
    }
    for (const s of byId.values()) {
      const ids = s.objects.map((o) => index.get(`${o.asset_id}:${o.node}`)).filter(Boolean);
      objectsOf.set(s.anatomical_id, ids);
      for (const id of ids) {
        if (!structuresOf.has(id)) structuresOf.set(id, []);
        structuresOf.get(id).push(s.anatomical_id);
      }
    }
    // 같은 객체를 담은 구조는 작은(구체적인) 것부터
    for (const list of structuresOf.values()) {
      list.sort((a, b) => byId.get(a).objects.length - byId.get(b).objects.length || depth(b) - depth(a));
    }
  }

  function depth(id) {
    let d = 0;
    let cur = byId.get(id);
    while (cur && cur.parent_id) { d += 1; cur = byId.get(cur.parent_id); }
    return d;
  }

  // 구조 상태: AVAILABLE(모두 불러옴) · NOT_LOADED(지연 로딩 전) · PARTIAL · MISSING
  function status(id) {
    const s = byId.get(id);
    if (!s) return 'UNKNOWN';
    if (s.model_status === 'MISSING') return 'MISSING';
    const loaded = (objectsOf.get(id) || []).length;
    if (loaded === 0) return 'NOT_LOADED';
    if (loaded < s.objects.length) return 'PARTLY_LOADED';
    return s.model_status;
  }

  function meshesOf(id) {
    return (objectsOf.get(id) || []).flatMap((oid) => registry.meshesOf(oid));
  }

  // 화면 클릭으로 고른 객체 → 그 객체를 가장 구체적으로 나타내는 구조
  function structureForObject(objectId) {
    const list = structuresOf.get(objectId);
    return list && list.length ? list[0] : null;
  }

  function worldBox(id, visibleOnly = false) {
    const box = new THREE.Box3();
    for (const mesh of meshesOf(id)) {
      if (visibleOnly && !isShown(mesh)) continue;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
    return box;
  }

  function isVisible(id) {
    return meshesOf(id).some((m) => isShown(m) && m.visible);
  }

  // Python에 보낼 스냅샷 (해부학 ID만)
  function snapshot() {
    return [...byId.values()].map((s) => ({ id: s.anatomical_id, type: 'anatomy', visible: isVisible(s.anatomical_id), parent: s.parent_id }));
  }

  return {
    load,
    resolve,
    status,
    meshesOf,
    worldBox,
    isVisible,
    structureForObject,
    snapshot,
    get: (id) => byId.get(id) || null,
    has: (id) => byId.has(id),
    list: () => [...byId.values()],
    roots: () => [...byId.values()].filter((s) => !s.parent_id).map((s) => s.anatomical_id),
    objectIdsOf: (id) => [...(objectsOf.get(id) || [])],
    structuresForObject: (oid) => [...(structuresOf.get(oid) || [])],
    get system() { return data.system; },
  };
}
