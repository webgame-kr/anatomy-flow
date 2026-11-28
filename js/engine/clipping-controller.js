// Clipping Controller: X/Y/Z 축 단면 (Three.js 로컬 클리핑 평면)
// 표면 Mesh를 잘라 보여 줄 뿐, 원본에 없는 내부 구조를 만들지 않는다.
// STEP 04-A: 임의 평면(custom: {normal, point}) — Cutaway(고정)와 Dynamic Clipping(Actor를 따라 움직임)에 쓴다.
//   excludeTypes: 자르지 않을 레지스트리 type (기본 actor: 학습 물질은 잘리지 않는다)
//   movePlane(normal, point): 재질을 다시 적용하지 않고 평면만 옮긴다 (프레임마다 불러도 가볍다)

import * as THREE from 'three';
import { boxOf } from './object-registry.js';

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

export function createClippingController({ renderer, scene, registry, materials }) {
  renderer.localClippingEnabled = true;
  const plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  const helper = new THREE.PlaneHelper(plane, 4, 0xd63c3f);
  helper.visible = false;
  scene.add(helper);

  const DEFAULT = { enabled: false, axis: 'x', t: 0.5, flip: false, scope: 'all', targetId: null, targetIds: null, custom: null, excludeTypes: ['actor'], showHelper: true };
  const st = { ...DEFAULT };
  let applied = [];          // 현재 단면이 적용된 Mesh

  // 선택 범위: targetIds(여러 객체, STEP 03-B 논리 구조)가 있으면 그것을, 없으면 targetId 하나
  function selectedIds() {
    const ids = st.targetIds && st.targetIds.length ? st.targetIds : (st.targetId ? [st.targetId] : []);
    return ids.filter((id) => registry.has(id));
  }

  function excluded(mesh) {
    if (!st.excludeTypes || !st.excludeTypes.length) return false;
    const id = registry.resolvePick ? registry.resolvePick(mesh, 'part') : null;
    const e = id ? registry.get(id) : null;
    return !!(e && st.excludeTypes.includes(e.type));
  }

  function scopeMeshes() {
    const list = st.scope === 'selected' ? selectedIds().flatMap((id) => registry.meshesOf(id)) : registry.allMeshes();
    return list.filter((m) => !excluded(m));
  }

  function scopeBox() {
    if (st.scope === 'selected') {
      const box = new THREE.Box3();
      for (const id of selectedIds()) box.union(boxOf(registry.get(id).object3D, false));
      return box;
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
    if (st.custom) {
      setPlane(st.custom.normal, st.custom.point);
      for (const mesh of scopeMeshes()) { materials.setClip(mesh, [plane]); applied.push(mesh); }
      const size = box.getSize(new THREE.Vector3());
      helper.size = Math.max(size.x, size.y, size.z) * 1.2 || 1;
      helper.visible = !!st.showHelper;
      return { active: true, custom: true, meshes: applied.length };
    }
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
    helper.visible = !!st.showHelper;
    return { active: true, position: Math.round(pos * 1000) / 1000, min, max, meshes: applied.length };
  }

  function set(changes) {
    Object.assign(st, changes);
    return update();
  }

  function reset() {
    Object.assign(st, DEFAULT);
    return update();
  }

  const tmpN = new THREE.Vector3();
  const tmpP = new THREE.Vector3();
  function setPlane(normal, point) {
    tmpN.set(...(normal.isVector3 ? normal.toArray() : normal)).normalize();
    tmpP.set(...(point.isVector3 ? point.toArray() : point));
    plane.setFromNormalAndCoplanarPoint(tmpN, tmpP);
  }
  // 이미 적용된 평면만 옮긴다 (Dynamic Clipping). 같은 Plane 객체를 재질이 참조하므로 다시 적용할 필요가 없다
  function movePlane(normal, point) {
    if (!st.enabled || !st.custom) return false;
    st.custom = { normal: normal.isVector3 ? normal.toArray() : normal, point: point.isVector3 ? point.toArray() : point };
    setPlane(st.custom.normal, st.custom.point);
    return true;
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
    movePlane,
    get appliedCount() { return applied.length; },
    planes: () => (st.enabled ? [plane] : null),
    get state() { return { ...st }; },
    helper,
  };
}
