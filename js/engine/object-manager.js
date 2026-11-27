// 공통 객체 관리 모듈: 모든 3D 객체는 고유 ID로 만들고, 바꾸고, 지운다.
// 이 모듈만 Three.js Mesh를 직접 다룬다.

import * as THREE from 'three';

const DEG = Math.PI / 180;

function makeGeometry(kind) {
  if (kind === 'box') return new THREE.BoxGeometry(1, 1, 1);
  if (kind === 'sphere') return new THREE.SphereGeometry(0.5, 32, 16);
  if (kind === 'cylinder') return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
  return null;
}

function toVec3(value, fallback) {
  if (Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && isFinite(n))) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return fallback.clone();
}

export function createObjectManager(scene) {
  const root = new THREE.Group();
  root.name = 'objects';
  scene.add(root);

  const items = new Map();     // id -> { mesh, kind, name }
  const tweens = new Map();    // id -> 보간 정보

  // 선택 표시 (객체를 감싸는 상자)
  const selectBox = new THREE.BoxHelper(undefined, 0x1d2330);
  selectBox.visible = false;
  scene.add(selectBox);
  let selectedId = null;

  function create(spec) {
    if (!spec || typeof spec.id !== 'string' || spec.id === '') throw new Error('객체 ID가 없습니다.');
    if (items.has(spec.id)) throw new Error(`이미 있는 ID: ${spec.id}`);
    const geometry = makeGeometry(spec.kind);
    if (!geometry) throw new Error(`알 수 없는 종류: ${spec.kind}`);
    const material = new THREE.MeshStandardMaterial({ color: spec.color || '#9aa4b2', roughness: 0.55, metalness: 0.05 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = spec.id;
    mesh.userData.id = spec.id;
    mesh.position.copy(toVec3(spec.position, new THREE.Vector3()));
    const rot = toVec3(spec.rotation, new THREE.Vector3());
    mesh.rotation.set(rot.x * DEG, rot.y * DEG, rot.z * DEG);
    mesh.scale.setScalar(typeof spec.scale === 'number' ? spec.scale : 1);
    mesh.visible = spec.visible !== false;
    root.add(mesh);
    items.set(spec.id, { mesh, kind: spec.kind, name: spec.name || spec.kind });
    return mesh;
  }

  // props: position[3], rotation[3](도), scale, color, visible / duration(ms)이 있으면 부드럽게 보간
  function update(id, props, duration = 0) {
    const item = items.get(id);
    if (!item) throw new Error(`없는 객체: ${id}`);
    const mesh = item.mesh;
    if (typeof props.color === 'string') mesh.material.color.set(props.color);
    if (typeof props.visible === 'boolean') mesh.visible = props.visible;

    const to = {};
    if (props.position) to.position = toVec3(props.position, mesh.position);
    if (props.rotation) {
      const r = toVec3(props.rotation, new THREE.Vector3());
      to.rotation = new THREE.Vector3(r.x * DEG, r.y * DEG, r.z * DEG);
    }
    if (typeof props.scale === 'number') to.scale = props.scale;
    if (Object.keys(to).length === 0) return;

    // 진행 중인 보간이 있으면, 새 명령에 없는 속성의 목표는 이어서 가져간다
    const running = tweens.get(id);
    const carried = {};
    if (running) {
      for (const key of Object.keys(running.to)) {
        if (!(key in to)) carried[key] = running.to[key];
      }
    }

    if (duration > 0) {
      tweens.set(id, {
        t: 0,
        duration: duration / 1000,
        from: currentState(mesh),
        to: { ...carried, ...to },
      });
    } else {
      applyTarget(mesh, to, 1, null);
      if (Object.keys(carried).length > 0) {
        running.to = carried;
        running.from = currentState(mesh);
        running.t = 0;
      } else {
        tweens.delete(id);
      }
    }
  }

  function currentState(mesh) {
    return {
      position: mesh.position.clone(),
      rotation: new THREE.Vector3(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z),
      scale: mesh.scale.x,
    };
  }

  function applyTarget(mesh, to, k, from) {
    if (to.position) {
      if (from) mesh.position.lerpVectors(from.position, to.position, k);
      else mesh.position.copy(to.position);
    }
    if (to.rotation) {
      if (from) {
        const v = new THREE.Vector3().lerpVectors(from.rotation, shortest(from.rotation, to.rotation), k);
        mesh.rotation.set(v.x, v.y, v.z);
      } else {
        mesh.rotation.set(to.rotation.x, to.rotation.y, to.rotation.z);
      }
    }
    if (typeof to.scale === 'number') {
      mesh.scale.setScalar(from ? from.scale + (to.scale - from.scale) * k : to.scale);
    }
  }

  // 각도는 가까운 방향으로 돈다 (350° → 10°는 +20°)
  function shortest(from, to) {
    const out = to.clone();
    for (const axis of ['x', 'y', 'z']) {
      let diff = to[axis] - from[axis];
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      out[axis] = from[axis] + diff;
    }
    return out;
  }

  // 렌더링 루프에서 매 프레임 호출 (보간 진행)
  function tick(dt) {
    for (const [id, tw] of tweens) {
      const item = items.get(id);
      if (!item) { tweens.delete(id); continue; }
      tw.t = Math.min(tw.duration, tw.t + dt);
      const p = tw.t / tw.duration;
      const k = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      applyTarget(item.mesh, tw.to, k, tw.from);
      if (p >= 1) tweens.delete(id);
    }
    if (selectedId && items.has(selectedId)) {
      const mesh = items.get(selectedId).mesh;
      selectBox.visible = mesh.visible;
      selectBox.setFromObject(mesh);
    } else {
      selectBox.visible = false;
    }
  }

  function remove(id) {
    const item = items.get(id);
    if (!item) return false;
    root.remove(item.mesh);
    item.mesh.geometry.dispose();
    item.mesh.material.dispose();
    items.delete(id);
    tweens.delete(id);
    if (selectedId === id) selectedId = null;
    return true;
  }

  function clear() {
    for (const id of [...items.keys()]) remove(id);
    selectedId = null;
  }

  function info(id) {
    const item = items.get(id);
    if (!item) return null;
    const m = item.mesh;
    const r2 = (n) => Math.round(n * 100) / 100;
    return {
      id,
      kind: item.kind,
      name: item.name,
      position: [r2(m.position.x), r2(m.position.y), r2(m.position.z)],
      rotation: [r2(m.rotation.x / DEG), r2(m.rotation.y / DEG), r2(m.rotation.z / DEG)],
      scale: r2(m.scale.x),
      color: `#${m.material.color.getHexString()}`,
      visible: m.visible,
    };
  }

  return {
    create,
    update,
    remove,
    clear,
    tick,
    info,
    has: (id) => items.has(id),
    ids: () => [...items.keys()],
    list: () => [...items.keys()].map(info),
    meshes: () => [...items.values()].map((it) => it.mesh),
    select(id) { selectedId = id && items.has(id) ? id : null; },
    get selectedId() { return selectedId; },
    get tweenCount() { return tweens.size; },
  };
}
