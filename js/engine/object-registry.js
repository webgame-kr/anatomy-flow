// Object Registry: 3D 공간에서 조작할 수 있는 모든 객체를 고유 ID로 관리한다.
// 실제 렌더링 상태(위치, 재질 등)는 여기(JavaScript)에 있다. Python에는 스냅샷만 보낸다.

import * as THREE from 'three';

const DEG = 180 / Math.PI;
const r3 = (n) => Math.round(n * 1000) / 1000;

function slug(text) {
  const s = String(text || '').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '');
  return s || 'object';
}

// 보이는 Mesh만 포함한 월드 좌표 Bounding Box
export function boxOf(object3D, visibleOnly = true) {
  const box = new THREE.Box3();
  object3D.updateWorldMatrix(true, true);
  object3D.traverse((o) => {
    if (!o.isMesh) return;
    if (visibleOnly && !isShown(o)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    box.union(b);
  });
  return box;
}

// 자신과 모든 조상이 보이는지
export function isShown(o) {
  let cur = o;
  while (cur) {
    if (!cur.visible) return false;
    cur = cur.parent;
  }
  return true;
}

export function createRegistry(root, tracker) {
  const entries = new Map();       // id -> entry
  const order = [];                // 등록 순서
  const listeners = new Set();
  const beforeRemove = new Set();

  function emit(kind, id) {
    for (const fn of listeners) fn(kind, id);
  }

  function uniqueId(base) {
    let id = base;
    let n = 2;
    while (entries.has(id)) {
      id = `${base}_${n}`;
      n += 1;
    }
    return id;
  }

  // object3D 하나를 등록한다. meta.id가 이미 있으면 번호를 붙여 고유하게 만든다.
  function register(object3D, meta = {}) {
    const id = uniqueId(meta.id ? String(meta.id) : slug(meta.displayName || object3D.name || object3D.type));
    const parentId = meta.parentId || null;
    const entry = {
      id,
      displayName: meta.displayName || object3D.name || id,
      type: meta.type || (object3D.isMesh ? 'mesh' : 'group'),
      sourceAssetId: meta.sourceAssetId || null,
      parentId,
      children: [],
      selectable: meta.selectable !== false,
      animationNames: meta.animationNames || [],
      object3D,
    };
    object3D.userData.nfId = id;
    entries.set(id, entry);
    order.push(id);
    if (parentId && entries.has(parentId)) entries.get(parentId).children.push(id);
    return id;
  }

  // GLB/glTF 장면을 통째로 등록한다. 원본 계층과 상대 위치는 그대로 둔다.
  // 이름이 같은 노드가 있어도 ID는 "모델ID/이름_번호"로 고유하게 만든다.
  function registerModel(modelRoot, { assetId, displayName, animationNames = [], parentId = null }) {
    const modelId = register(modelRoot, {
      id: slug(assetId || displayName), displayName, type: 'model', sourceAssetId: assetId,
      parentId, animationNames,
    });
    const walk = (node, parentEntryId) => {
      for (const child of node.children) {
        if (child.isBone || child.isCamera || child.isLight) continue;
        const kind = child.isMesh ? 'mesh' : 'group';
        const id = register(child, {
          id: `${modelId}/${slug(child.name || kind)}`,
          displayName: child.name || `(${child.type})`,
          type: kind,
          sourceAssetId: assetId,
          parentId: parentEntryId,
        });
        walk(child, id);
      }
    };
    walk(modelRoot, modelId);
    emit('structure');
    return modelId;
  }

  function attach(object3D, parentId) {
    const parent = parentId && entries.has(parentId) ? entries.get(parentId).object3D : root;
    parent.add(object3D);
  }

  // 객체와 자식을 모두 해제한다 (리소스는 참조 수가 0일 때만 dispose)
  function unregister(id, { dispose = true, silent = false } = {}) {
    const entry = entries.get(id);
    if (!entry) return false;
    for (const fn of beforeRemove) fn(entry);
    for (const childId of [...entry.children]) dropEntry(childId);
    if (entry.parentId && entries.has(entry.parentId)) {
      const siblings = entries.get(entry.parentId).children;
      siblings.splice(siblings.indexOf(id), 1);
    }
    if (entry.object3D.parent) entry.object3D.parent.remove(entry.object3D);
    if (dispose && tracker) tracker.release(entry.object3D);
    removeEntry(id);
    if (!silent) emit('structure');
    return true;
  }

  function dropEntry(id) {
    const entry = entries.get(id);
    if (!entry) return;
    for (const childId of [...entry.children]) dropEntry(childId);
    removeEntry(id);
  }

  function removeEntry(id) {
    const entry = entries.get(id);
    if (entry) delete entry.object3D.userData.nfId;
    entries.delete(id);
    const i = order.indexOf(id);
    if (i >= 0) order.splice(i, 1);
  }

  function clear() {
    for (const id of roots()) unregister(id, { silent: true });
    emit('structure');
  }

  function roots() {
    return order.filter((id) => !entries.get(id).parentId);
  }

  // Raycaster가 맞힌 Mesh → 레지스트리의 논리 객체 ID
  // level 'part': 가장 가까운 선택 가능한 등록 객체, 'model': 최상위 객체
  function resolvePick(object3D, level = 'part') {
    let cur = object3D;
    let found = null;
    while (cur) {
      const id = cur.userData && cur.userData.nfId;
      if (id && entries.has(id) && entries.get(id).selectable) {
        found = id;
        if (level === 'part') break;
      }
      cur = cur.parent;
    }
    return found;
  }

  function meshesOf(id) {
    const entry = entries.get(id);
    const list = [];
    if (!entry) return list;
    entry.object3D.traverse((o) => { if (o.isMesh) list.push(o); });
    return list;
  }

  function allMeshes() {
    const list = [];
    for (const id of roots()) list.push(...meshesOf(id));
    return list;
  }

  function info(id) {
    const e = entries.get(id);
    if (!e) return null;
    const o = e.object3D;
    const box = boxOf(o, false);
    const mats = [];
    o.traverse((n) => {
      if (!n.isMesh) return;
      const arr = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of arr) if (m && !mats.includes(m)) mats.push(m);
    });
    const first = mats[0];
    return {
      object_id: e.id,
      display_name: e.displayName,
      object_type: e.type,
      source_asset_id: e.sourceAssetId,
      parent_id: e.parentId,
      children: [...e.children],
      position: [r3(o.position.x), r3(o.position.y), r3(o.position.z)],
      rotation: [r3(o.rotation.x * DEG), r3(o.rotation.y * DEG), r3(o.rotation.z * DEG)],
      scale: [r3(o.scale.x), r3(o.scale.y), r3(o.scale.z)],
      visible: o.visible,
      opacity: o.userData.nfOpacity === undefined ? 1 : o.userData.nfOpacity,
      material: {
        count: mats.length,
        types: [...new Set(mats.map((m) => m.type))],
        color: first && first.color ? `#${first.color.getHexString()}` : null,
      },
      bounding_box: box.isEmpty() ? null : {
        min: box.min.toArray().map(r3),
        max: box.max.toArray().map(r3),
        size: box.getSize(new THREE.Vector3()).toArray().map(r3),
      },
      selectable: e.selectable,
      animation_names: [...e.animationNames],
    };
  }

  // Python에 보낼 가벼운 스냅샷 (ID, 종류, 표시, 부모)
  function snapshot() {
    return order.map((id) => {
      const e = entries.get(id);
      return { id, type: e.type, visible: e.object3D.visible, parent: e.parentId };
    });
  }

  return {
    rootObject: root,
    register,
    registerModel,
    attach,
    unregister,
    clear,
    roots,
    resolvePick,
    meshesOf,
    allMeshes,
    info,
    snapshot,
    get: (id) => entries.get(id) || null,
    has: (id) => entries.has(id),
    ids: () => [...order],
    get size() { return entries.size; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onBeforeRemove(fn) { beforeRemove.add(fn); },
    notify: emit,
  };
}
