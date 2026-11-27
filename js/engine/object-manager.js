// 기본 도형(정육면체·구체·원통)과 그룹 생성, 변환(위치·회전·크기) 보간
// STEP 01 API(create / update / remove / clear / tick / info)를 유지하면서
// 생성한 객체를 공통 Object Registry에 등록한다. (STEP 02 확장)

import * as THREE from 'three';

const DEG = Math.PI / 180;

function toVec3(value, fallback) {
  if (Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && isFinite(n))) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return fallback.clone();
}

function toScale(value, fallback) {
  if (typeof value === 'number' && isFinite(value) && value > 0) return new THREE.Vector3(value, value, value);
  if (Array.isArray(value)) return toVec3(value, fallback);
  return fallback.clone();
}

export function createObjectManager({ registry, tracker }) {
  const root = registry.rootObject;
  const tweens = new Map();
  const geometryCache = new Map();   // 종류 → 공유 Geometry (참조 수는 tracker가 관리)
  let materials = null;              // material-controller (나중에 연결)

  // 공유 Geometry가 dispose되면 캐시에서도 지운다
  tracker.onDispose((res) => {
    for (const [kind, geo] of geometryCache) if (geo === res) geometryCache.delete(kind);
  });

  function geometry(kind) {
    if (geometryCache.has(kind)) return geometryCache.get(kind);
    let geo = null;
    if (kind === 'box') geo = new THREE.BoxGeometry(1, 1, 1);
    else if (kind === 'sphere') geo = new THREE.SphereGeometry(0.5, 48, 24);
    else if (kind === 'cylinder') geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 48);
    else if (kind === 'torus') geo = new THREE.TorusGeometry(0.4, 0.15, 24, 64);
    if (geo) geometryCache.set(kind, geo);
    return geo;
  }

  function newMaterial(color) {
    return new THREE.MeshStandardMaterial({ color: color || '#9aa4b2', roughness: 0.55, metalness: 0.05 });
  }

  function applyTransform(obj, spec) {
    obj.position.copy(toVec3(spec.position, new THREE.Vector3()));
    const rot = toVec3(spec.rotation, new THREE.Vector3());
    obj.rotation.set(rot.x * DEG, rot.y * DEG, rot.z * DEG);
    obj.scale.copy(toScale(spec.scale, new THREE.Vector3(1, 1, 1)));
  }

  // spec: { id, kind, name, position, rotation, scale, color, visible, parent, material(공유 재질 객체), materials(배열) }
  function create(spec) {
    if (!spec || typeof spec.id !== 'string' || spec.id === '') throw new Error('객체 ID가 없습니다.');
    if (registry.has(spec.id)) throw new Error(`이미 있는 ID: ${spec.id}`);
    const geo = geometry(spec.kind);
    if (!geo) throw new Error(`알 수 없는 종류: ${spec.kind}`);
    let material = spec.material || null;
    if (Array.isArray(spec.materials)) material = spec.materials;
    if (!material) material = newMaterial(spec.color);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = spec.name || spec.id;
    applyTransform(mesh, spec);
    mesh.visible = spec.visible !== false;
    registry.attach(mesh, spec.parent);
    tracker.retain(mesh);
    registry.register(mesh, {
      id: spec.id, displayName: spec.name || spec.id, type: 'primitive',
      parentId: spec.parent || null, selectable: spec.selectable !== false,
      sourceAssetId: spec.sourceAssetId || null,
    });
    registry.notify('structure');
    return mesh;
  }

  function createGroup(spec) {
    if (registry.has(spec.id)) throw new Error(`이미 있는 ID: ${spec.id}`);
    const group = new THREE.Group();
    group.name = spec.name || spec.id;
    applyTransform(group, spec);
    registry.attach(group, spec.parent);
    registry.register(group, {
      id: spec.id, displayName: spec.name || spec.id, type: 'group',
      parentId: spec.parent || null, selectable: spec.selectable !== false,
    });
    registry.notify('structure');
    return group;
  }

  // props: position[3], rotation[3](도), scale(숫자 또는 [3]), color, visible / duration(ms)
  function update(id, props, duration = 0) {
    const entry = registry.get(id);
    if (!entry) throw new Error(`없는 객체: ${id}`);
    const obj = entry.object3D;
    if (typeof props.color === 'string' && materials) materials.setColor(id, props.color);
    if (typeof props.visible === 'boolean') {
      if (materials) materials.setVisible(id, props.visible);
      else obj.visible = props.visible;
    }

    const to = {};
    if (props.position) to.position = toVec3(props.position, obj.position);
    if (props.rotation) {
      const r = toVec3(props.rotation, new THREE.Vector3());
      to.rotation = new THREE.Vector3(r.x * DEG, r.y * DEG, r.z * DEG);
    }
    if (props.scale !== undefined) to.scale = toScale(props.scale, obj.scale);
    if (Object.keys(to).length === 0) return;

    // 진행 중인 보간이 있으면, 새 명령에 없는 속성의 목표는 이어서 가져간다
    const running = tweens.get(id);
    const carried = {};
    if (running) {
      for (const key of Object.keys(running.to)) if (!(key in to)) carried[key] = running.to[key];
    }
    if (duration > 0) {
      tweens.set(id, { t: 0, duration: duration / 1000, from: currentState(obj), to: { ...carried, ...to } });
    } else {
      applyTarget(obj, to, 1, null);
      if (Object.keys(carried).length > 0) {
        running.to = carried;
        running.from = currentState(obj);
        running.t = 0;
      } else {
        tweens.delete(id);
      }
    }
  }

  function currentState(obj) {
    return {
      position: obj.position.clone(),
      rotation: new THREE.Vector3(obj.rotation.x, obj.rotation.y, obj.rotation.z),
      scale: obj.scale.clone(),
    };
  }

  function applyTarget(obj, to, k, from) {
    if (to.position) {
      if (from) obj.position.lerpVectors(from.position, to.position, k);
      else obj.position.copy(to.position);
    }
    if (to.rotation) {
      if (from) {
        const v = new THREE.Vector3().lerpVectors(from.rotation, shortest(from.rotation, to.rotation), k);
        obj.rotation.set(v.x, v.y, v.z);
      } else {
        obj.rotation.set(to.rotation.x, to.rotation.y, to.rotation.z);
      }
    }
    if (to.scale) {
      if (from) obj.scale.lerpVectors(from.scale, to.scale, k);
      else obj.scale.copy(to.scale);
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

  const settleWaiters = new Map();   // id -> [resolve] (보간이 끝나기를 기다리는 쪽)

  function settled(id) {
    const list = settleWaiters.get(id);
    if (!list) return;
    settleWaiters.delete(id);
    for (const fn of list) fn();
  }

  // 객체(또는 조상)의 보간이 끝날 때까지 기다린다 (카메라 초점을 최종 위치에 맞추기 위해)
  function whenSettled(id, timeoutMs = 5000) {
    const busy = [...tweens.keys()].filter((tid) => {
      const e = registry.get(tid);
      const target = registry.get(id);
      if (!e || !target) return false;
      let cur = target.object3D;
      while (cur) { if (cur === e.object3D) return true; cur = cur.parent; }
      return false;
    });
    if (busy.length === 0) return Promise.resolve();
    return Promise.race([
      Promise.all(busy.map((tid) => new Promise((resolve) => {
        if (!settleWaiters.has(tid)) settleWaiters.set(tid, []);
        settleWaiters.get(tid).push(resolve);
      }))),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  function tick(dt) {
    for (const [id, tw] of tweens) {
      const entry = registry.get(id);
      if (!entry) { tweens.delete(id); settled(id); continue; }
      tw.t = Math.min(tw.duration, tw.t + dt);
      const p = tw.t / tw.duration;
      const k = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      applyTarget(entry.object3D, tw.to, k, tw.from);
      if (p >= 1) {
        tweens.delete(id);
        settled(id);
      }
    }
  }

  function remove(id) {
    tweens.delete(id);
    settled(id);
    return registry.unregister(id);
  }

  function clear() {
    tweens.clear();
    registry.clear();
  }

  return {
    root,
    create,
    createGroup,
    update,
    remove,
    clear,
    tick,
    newMaterial,
    info: (id) => registry.info(id),
    has: (id) => registry.has(id),
    ids: () => registry.ids(),
    setMaterialController(mc) { materials = mc; },
    whenSettled,
    cancelTweens() {
      const ids = [...tweens.keys()];
      tweens.clear();
      for (const id of ids) settled(id);
    },
    get tweenCount() { return tweens.size; },
  };
}
