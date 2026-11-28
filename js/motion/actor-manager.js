// Actor Manager (STEP 03-C): 이동 객체(적혈구, 림프액 입자, 음식물, 신경 신호 등)를 공통 형식으로 관리
// - 3D 객체는 기존 Object Registry에 type 'actor'로 등록한다(선택, 재질, Python 스냅샷, 해제 경로를 그대로 쓴다).
// - 같은 모델의 Geometry와 상태별 Material은 공유하고, Resource Tracker가 참조 수로 해제한다.
// - 모델은 모두 Three.js로 직접 만든 교육용 형태다. 실제 세포 구조를 재현한 모델이 아니다.
// - 크기: real_size_m(실제 크기 참고값)과 display_size(화면 표시 크기, 교육용 확대)를 분리한다.

import * as THREE from 'three';

// 적혈구 단면: Evans & Fung(1972) 양면 오목 원반 식을 정규화해 쓴다 (반지름 1 기준)
// 반두께 z(x) = 0.5 · sqrt(1 − x²) · (c0 + c1·x² + c2·x⁴)
function rbcGeometry() {
  const c0 = 0.207161;
  const c1 = 2.002558;
  const c2 = -1.122762;
  const n = 24;
  const top = [];
  for (let i = 0; i <= n; i += 1) {
    const x = Math.min(0.999, i / n);
    const z = 0.5 * Math.sqrt(1 - x * x) * (c0 + c1 * x * x + c2 * x ** 4);
    top.push(new THREE.Vector2(x * 0.5, z * 0.5));          // 지름 1이 되도록 0.5배
  }
  const profile = [...top, ...top.slice().reverse().map((p) => new THREE.Vector2(p.x, -p.y))];
  profile[0].x = 0.0001;
  profile[profile.length - 1].x = 0.0001;
  const g = new THREE.LatheGeometry(profile, 40);
  g.rotateX(Math.PI / 2);        // 원반 면이 진행 방향(+Z)을 향하지 않도록, 원반 축을 Z로
  g.computeVertexNormals();
  return g;
}

// 모델 표: geometry는 만드는 함수, states는 biological_state에 따른 색
export const ACTOR_MODELS = {
  rbc: {
    name_ko: '적혈구 (교육용 형태)', real_size_m: 7.8e-6, make: rbcGeometry,
    states: { oxygenated: '#d62839', deoxygenated: '#8a1c3c', default: '#c7253e' },
    state_key: 'oxygenation',
    note: '양면 오목 원반 근사(Evans–Fung 식). 색은 교육용 구분이며 혈액은 산소 상태와 무관하게 붉은색이다.',
  },
  wbc: { name_ko: '백혈구 (단순 형태)', real_size_m: 12e-6, make: () => new THREE.IcosahedronGeometry(0.5, 2), states: { default: '#eef0f4' } },
  platelet: { name_ko: '혈소판 (단순 형태)', real_size_m: 2.5e-6, make: () => new THREE.SphereGeometry(0.5, 16, 8).scale(1, 0.35, 1), states: { default: '#f0c27a' } },
  lymph: { name_ko: '림프액 입자 (표시용)', real_size_m: null, make: () => new THREE.SphereGeometry(0.5, 16, 10), states: { default: '#f3e7a1' } },
  food: { name_ko: '음식물 덩어리 (표시용)', real_size_m: 0.02, make: () => new THREE.DodecahedronGeometry(0.5, 1), states: { default: '#b7895a' } },
  nutrient: { name_ko: '영양소 (표시용)', real_size_m: null, make: () => new THREE.TetrahedronGeometry(0.5), states: { default: '#46a758' } },
  hormone: { name_ko: '호르몬 (표시용)', real_size_m: null, make: () => new THREE.OctahedronGeometry(0.5), states: { default: '#8e4ec6' } },
  nerve_signal: { name_ko: '신경 신호 (표시용)', real_size_m: null, make: () => new THREE.SphereGeometry(0.5, 16, 10), states: { default: '#ffd23f' }, emissive: true },
  marker: { name_ko: '테스트 표식 (화살촉)', real_size_m: null, make: () => new THREE.ConeGeometry(0.35, 1, 16).rotateX(Math.PI / 2), states: { default: '#2f6fde', alt: '#e5484d' } },
};

export const ACTOR_TYPES = ['red_blood_cell', 'lymph_particle', 'food', 'nutrient', 'white_blood_cell', 'platelet', 'hormone', 'nerve_signal', 'custom'];
const TYPE_MODEL = { red_blood_cell: 'rbc', lymph_particle: 'lymph', food: 'food', nutrient: 'nutrient', white_blood_cell: 'wbc', platelet: 'platelet', hormone: 'hormone', nerve_signal: 'nerve_signal', custom: 'marker' };
export const MOVEMENT_STATES = ['idle', 'moving', 'paused', 'waiting_at_checkpoint', 'completed', 'cancelled'];

export function createActorManager({ registry, tracker, materials = null, log = () => {} }) {
  const actors = new Map();            // actor_id → record
  const geoCache = new Map();          // model_id → Geometry
  const matCache = new Map();          // model_id:state → Material
  const listeners = new Set();

  tracker.onDispose((res) => {
    for (const [k, g] of geoCache) if (g === res) geoCache.delete(k);
    for (const [k, m] of matCache) if (m === res) matCache.delete(k);
  });

  // 레지스트리에서 지워지면(장면 전환 등) 기록도 지운다
  registry.onBeforeRemove((entry) => {
    if (entry.type !== 'actor') return;
    const id = entry.id;
    if (actors.has(id)) {
      actors.delete(id);
      emit('removed', { id });
    }
  });

  function emit(kind, data) { for (const fn of listeners) fn(kind, data); }

  function geometryOf(modelId) {
    if (!geoCache.has(modelId)) geoCache.set(modelId, ACTOR_MODELS[modelId].make());
    return geoCache.get(modelId);
  }

  function stateColorKey(model, bio) {
    const key = model.state_key && bio ? bio[model.state_key] : null;
    return key && model.states[key] ? key : 'default';
  }

  function materialOf(modelId, stateKey) {
    const k = `${modelId}:${stateKey}`;
    if (!matCache.has(k)) {
      const model = ACTOR_MODELS[modelId];
      const color = model.states[stateKey] || model.states.default;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.0 });
      if (model.emissive) { mat.emissive = new THREE.Color(color); mat.emissiveIntensity = 0.8; }
      mat.name = `actor:${k}`;
      matCache.set(k, mat);
    }
    return matCache.get(k);
  }

  // spec: { actor_id, actor_type, model_id, display_size, biological_state, rotation_mode, visible, speed, path_id }
  function create(spec) {
    if (!spec || typeof spec.actor_id !== 'string' || !spec.actor_id) return { ok: false, error: 'actor_id가 없습니다' };
    if (registry.has(spec.actor_id) || actors.has(spec.actor_id)) return { ok: false, error: `이미 있는 ID: ${spec.actor_id}` };
    const type = ACTOR_TYPES.includes(spec.actor_type) ? spec.actor_type : 'custom';
    const modelId = ACTOR_MODELS[spec.model_id] ? spec.model_id : TYPE_MODEL[type];
    const model = ACTOR_MODELS[modelId];
    const bio = { ...(spec.biological_state || {}) };
    const mesh = new THREE.Mesh(geometryOf(modelId), materialOf(modelId, stateColorKey(model, bio)));
    mesh.name = spec.name || spec.actor_id;
    const size = Number.isFinite(spec.display_size) && spec.display_size > 0 ? spec.display_size : 0.3;
    mesh.scale.setScalar(size);
    mesh.visible = spec.visible !== false;
    registry.attach(mesh, null);
    tracker.retain(mesh);
    registry.register(mesh, { id: spec.actor_id, displayName: spec.name || spec.actor_id, type: 'actor', sourceAssetId: 'actors', selectable: true });
    registry.notify('structure');
    const rec = {
      actor_id: spec.actor_id,
      actor_type: type,
      model_id: modelId,
      source_asset_id: 'project-made (js/motion/actor-manager.js)',
      path_id: spec.path_id || null,
      progress: 0,                  // 0~1 (표시·Python용). 실제 진행은 distance(m)
      distance: 0,
      direction: spec.direction === -1 ? -1 : 1,
      speed: Number.isFinite(spec.speed) && spec.speed > 0 ? spec.speed : 0.5,
      visible: spec.visible !== false,
      rotation_mode: ['tangent', 'fixed'].includes(spec.rotation_mode) ? spec.rotation_mode : 'tangent',
      movement_state: 'idle',
      biological_state: bio,
      display_size: size,
      real_size_m: model.real_size_m,
      object3D: mesh,
      baseMaterial: mesh.material,
    };
    actors.set(rec.actor_id, rec);
    emit('created', { id: rec.actor_id });
    return { ok: true, actor: rec };
  }

  function remove(id) {
    if (!actors.has(id)) return false;
    return registry.unregister(id);   // onBeforeRemove에서 기록 삭제, Tracker가 공유 리소스 참조 감소
  }

  // 생물학적 상태 변경 → 공유 재질 교체 (예: 산소화 상태)
  function setBiologicalState(id, fields) {
    const a = actors.get(id);
    if (!a) return false;
    Object.assign(a.biological_state, fields);
    const model = ACTOR_MODELS[a.model_id];
    const next = materialOf(a.model_id, stateColorKey(model, a.biological_state));
    const mesh = a.object3D;
    const base = a.baseMaterial;
    if (base !== next) {
      tracker.retainResource(next);
      if (materials) materials.setBaseMaterial(mesh, next);
      else mesh.material = next;
      a.baseMaterial = next;
      tracker.releaseResource(base);
    }
    emit('state', { id });
    return true;
  }

  function setDisplaySize(id, size) {
    const a = actors.get(id);
    if (!a || !(size > 0)) return false;
    a.display_size = size;
    a.object3D.scale.setScalar(size);
    return true;
  }

  function clear() {
    for (const id of [...actors.keys()]) remove(id);
  }

  // Python 스냅샷용 (논리 상태만)
  function snapshot() {
    return [...actors.values()].map((a) => ({
      id: a.actor_id, type: 'actor', visible: a.visible, parent: null,
      actor_type: a.actor_type, path_id: a.path_id, movement_state: a.movement_state,
      progress: Math.round(a.progress * 1000) / 1000, direction: a.direction,
    }));
  }

  function publicInfo(a) {
    const { object3D, baseMaterial, ...rest } = a;
    return { ...rest };
  }

  return {
    create,
    remove,
    clear,
    setBiologicalState,
    setDisplaySize,
    snapshot,
    get: (id) => actors.get(id) || null,
    has: (id) => actors.has(id),
    ids: () => [...actors.keys()],
    list: () => [...actors.values()],
    info: (id) => (actors.has(id) ? publicInfo(actors.get(id)) : null),
    sharedCounts: () => ({ geometries: geoCache.size, materials: matCache.size }),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    models: ACTOR_MODELS,
  };
}
