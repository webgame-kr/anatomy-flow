// Morph Controller (STEP 04-B): Morph Target 가중치 읽기·쓰기·혼합·복원
// - 대상은 레지스트리 ID. 그 아래 Mesh 중 morphTargetDictionary가 있는 것에 적용한다.
// - 원래 가중치를 처음 바꿀 때 기억해 두고 restore()로 되돌린다.
// - 변형된 정점 위치 계산(deformedVertex): Object-local Anchor는 객체 Transform만 따라가고 Mesh 변형은 모른다.
//   그래서 변형을 따라가야 하는 점은 정점 번호로 묶고(경로 점 space 'mesh_vertex'), 이 함수로 위치를 구한다.

import * as THREE from 'three';

export function createMorphController({ registry }) {
  const base = new Map();      // mesh → 처음 가중치 복사본
  const listeners = new Set();
  let version = 0;             // 가중치가 바뀔 때마다 증가 (경로 캐시 무효화용)

  function meshes(id) {
    return registry.meshesOf(id).filter((m) => m.morphTargetDictionary && m.morphTargetInfluences);
  }

  function names(id) {
    const out = new Set();
    for (const m of meshes(id)) for (const n of Object.keys(m.morphTargetDictionary)) out.add(n);
    return [...out];
  }

  function remember(m) { if (!base.has(m)) base.set(m, [...m.morphTargetInfluences]); }

  // name: Morph Target 이름 또는 번호. 없으면 false
  function set(id, name, weight) {
    const w = Math.max(0, Math.min(1, Number(weight)));
    if (!Number.isFinite(w)) return false;
    let hit = false;
    for (const m of meshes(id)) {
      const i = typeof name === 'number' ? name : m.morphTargetDictionary[name];
      if (i === undefined || i >= m.morphTargetInfluences.length) continue;
      remember(m);
      m.morphTargetInfluences[i] = w;
      hit = true;
    }
    if (hit) { version += 1; for (const fn of listeners) fn(id, name, w); }
    return hit;
  }

  function get(id, name) {
    for (const m of meshes(id)) {
      const i = typeof name === 'number' ? name : m.morphTargetDictionary[name];
      if (i !== undefined) return m.morphTargetInfluences[i];
    }
    return null;
  }

  // 여러 Target 한 번에 (혼합): {name: weight}
  function setMany(id, weights) {
    let ok = true;
    for (const [n, w] of Object.entries(weights || {})) ok = set(id, n, w) && ok;
    return ok;
  }

  function restore(id) {
    for (const m of meshes(id)) {
      const b = base.get(m);
      if (!b) continue;
      for (let i = 0; i < b.length; i += 1) m.morphTargetInfluences[i] = b[i];
      base.delete(m);
    }
    version += 1;
    for (const fn of listeners) fn(id, null, null);
  }

  // 변형이 반영된 정점의 월드 좌표 (상대 Morph Target 기준, three의 기본 morphTargetsRelative 또는 절대 둘 다 처리)
  function deformedVertex(mesh, index, out = new THREE.Vector3()) {
    const g = mesh.geometry;
    const pos = g.attributes.position;
    if (!pos || index < 0 || index >= pos.count) return null;
    out.fromBufferAttribute(pos, index);
    const targets = g.morphAttributes.position;
    const inf = mesh.morphTargetInfluences;
    if (targets && inf) {
      const rel = g.morphTargetsRelative;
      const v = new THREE.Vector3();
      const baseV = out.clone();
      for (let k = 0; k < targets.length; k += 1) {
        const w = inf[k] || 0;
        if (!w) continue;
        v.fromBufferAttribute(targets[k], index);
        if (rel) out.addScaledVector(v, w);
        else out.addScaledVector(v.sub(baseV), w);
      }
    }
    mesh.updateWorldMatrix(true, false);
    return out.applyMatrix4(mesh.matrixWorld);
  }

  return {
    meshes,
    names,
    set,
    get,
    setMany,
    restore,
    deformedVertex,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get version() { return version; },
  };
}
