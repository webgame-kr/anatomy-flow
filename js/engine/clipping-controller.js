// Clipping Controller: X/Y/Z 축 단면 (Three.js 로컬 클리핑 평면)
// 표면 Mesh를 잘라 보여 줄 뿐, 원본에 없는 내부 구조를 만들지 않는다.

import * as THREE from 'three';
import { boxOf } from './object-registry.js';

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

export function createClippingController({ renderer, scene, registry, materials }) {
  renderer.localClippingEnabled = true;
  const plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  const helper = new THREE.PlaneHelper(plane, 4, 0xd63c3f);
  helper.visible = false;
  scene.add(helper);

  const st = { enabled: false, axis: 'x', t: 0.5, flip: false, scope: 'all', targetId: null };
  let applied = [];          // 현재 단면이 적용된 Mesh

  function scopeMeshes() {
    if (st.scope === 'selected') return st.targetId && registry.has(st.targetId) ? registry.meshesOf(st.targetId) : [];
    return registry.allMeshes();
  }

  function scopeBox() {
    if (st.scope === 'selected') {
      return st.targetId && registry.has(st.targetId) ? boxOf(registry.get(st.targetId).object3D, false) : new THREE.Box3();
    }
    const box = new THREE.Box3();
    for (const id of registry.roots()) box.union(boxOf(registry.get(id).object3D, false));
    return box;
  }

  function clearApplied() {
    for (const mesh of applied) materials.setClip(mesh, null);
    applied = [];
  }

  // 평면 위치 = 범위의 최소 + t × (최대 - 최소). 기본은 위치보다 작은 쪽(−)을 남긴다.
  function update() {
    clearApplied();
    helper.visible = false;
    if (!st.enabled) return { active: false };
    const box = scopeBox();
    if (box.isEmpty()) return { active: false, reason: '단면을 적용할 객체가 없습니다.' };
    const axis = AXES[st.axis];
    const min = box.min[st.axis];
    const max = box.max[st.axis];
    const pos = min + (max - min) * st.t;
    const normal = axis.clone().multiplyScalar(st.flip ? 1 : -1);
    plane.normal.copy(normal);
    plane.constant = st.flip ? -pos : pos;
    for (const mesh of scopeMeshes()) {
      materials.setClip(mesh, [plane]);
      applied.push(mesh);
    }
    const size = box.getSize(new THREE.Vector3());
    helper.size = Math.max(size.x, size.y, size.z) * 1.2 || 1;
    helper.visible = true;
    return { active: true, position: Math.round(pos * 1000) / 1000, min, max, meshes: applied.length };
  }

  function set(changes) {
    Object.assign(st, changes);
    return update();
  }

  function reset() {
    Object.assign(st, { enabled: false, axis: 'x', t: 0.5, flip: false, scope: 'all', targetId: null });
    return update();
  }

  // 객체가 사라지면 적용 목록에서 뺀다
  registry.onChange((kind) => {
    if (kind !== 'structure') return;
    applied = applied.filter((m) => m.parent);
    if (st.scope === 'selected' && st.targetId && !registry.has(st.targetId)) set({ targetId: null });
  });

  return {
    set,
    reset,
    update,
    planes: () => (st.enabled ? [plane] : null),
    get state() { return { ...st }; },
    helper,
  };
}
