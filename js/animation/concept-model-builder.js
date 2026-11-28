// Concept Model Builder (STEP 04-B): JSON 정의로 교육용·시험용 모델을 만들고 레지스트리에 등록한다
// - 실제 해부학 모델(BodyParts3D)이 아니다. 만든 객체는 type 'concept'로 등록하고, 장면 정의의
//   verification_status(CONCEPTUAL·TEST)를 화면에 표시한다.
// - Morph Target은 코드로 만든다: 기준 모양을 중심점 기준으로 늘이거나 줄인 모양(scale), 또는 판막 첨판을 경첩축으로 돌린 모양(open).
// - 관(tube)은 deformation-controller로 만들어 중심선을 유지한 지름 변형을 쓴다.
//
// 정의 { group_id, origin:[m], backdrop:{radius,color}|null, verification_status, objects:[...] }
// 객체 shape
//   ellipsoid {radius:[x,y,z], center, morphs:{이름:{scale:[sx,sy,sz]}}}       심방·심실(개념), 팽창 구, 장기 덩어리
//   leaflets  {count, radius, center, normal, length, morphs:{open:{angle_deg}}}  판막(개념): 첨판을 한 Geometry로 합치고 open 모양을 Morph로
//   tube      {points, radius}                                                 혈관(개념), 지름 변형 가능
//   box       {size:[x,y,z], center}
// 공통: id, name_ko, color, opacity, logical_id(논리 해부 ID, 선택)

import * as THREE from 'three';

function scaledMorph(geo, center, scale) {
  const pos = geo.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i).sub(center);
    v.set(v.x * scale[0], v.y * scale[1], v.z * scale[2]).add(center);
    out.set([v.x, v.y, v.z], i * 3);
  }
  return new THREE.BufferAttribute(out, 3);
}

// 판막 첨판: 고리(annulus) 둘레에 첨판 n개. 닫힘 = 첨판 끝이 중심으로 모임, 열림 = 경첩(고리 가장자리)을 축으로 흐름 방향으로 젖혀짐
function leafletGeometry({ count = 3, radius = 0.1, length = null, center = [0, 0, 0], normal = [0, 1, 0], segments = 6, angle_deg = 70 }) {
  const N = new THREE.Vector3(...normal).normalize();
  const C = new THREE.Vector3(...center);
  const U = new THREE.Vector3(1, 0, 0);
  if (Math.abs(U.dot(N)) > 0.9) U.set(0, 0, 1);
  U.cross(N).normalize();
  const V = new THREE.Vector3().crossVectors(N, U);
  const L = length || radius;
  const closed = [];
  const open = [];
  const index = [];
  for (let k = 0; k < count; k += 1) {
    const a0 = (k / count) * Math.PI * 2;
    const a1 = ((k + 1) / count) * Math.PI * 2;
    const base = closed.length / 3;
    for (let s = 0; s <= segments; s += 1) {
      const a = a0 + ((a1 - a0) * s) / segments;
      const rim = C.clone().addScaledVector(U, Math.cos(a) * radius).addScaledVector(V, Math.sin(a) * radius);
      // 닫힘: 가운데(살짝 흐름 방향으로 볼록)로 모임
      const tip = C.clone().addScaledVector(N, 0.15 * L).lerp(rim, 0.04);
      const mid = rim.clone().lerp(tip, 0.5).addScaledVector(N, 0.08 * L);
      // 열림: 경첩축(고리 접선) 기준으로 첨판을 angle만큼 돌린 모양
      const axis = U.clone().multiplyScalar(-Math.sin(a)).addScaledVector(V, Math.cos(a)).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(angle_deg));
      const rot = (p) => p.clone().sub(rim).applyQuaternion(q).add(rim);
      for (const p of [rim, mid, tip]) closed.push(p.x, p.y, p.z);
      for (const p of [rim, rot(mid), rot(tip)]) open.push(p.x, p.y, p.z);
    }
    for (let s = 0; s < segments; s += 1) {
      const r0 = base + s * 3;
      const r1 = base + (s + 1) * 3;
      for (let j = 0; j < 2; j += 1) index.push(r0 + j, r1 + j, r0 + j + 1, r1 + j, r1 + j + 1, r0 + j + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(closed, 3));
  geo.setIndex(index);
  geo.morphAttributes.position = [new THREE.Float32BufferAttribute(open, 3)];
  geo.computeVertexNormals();
  return geo;
}

export function createConceptBuilder({ scene, registry, tracker, deform = null, log = () => {} }) {
  const built = new Map();     // group_id → { root, ids, def }

  function material(o) {
    return new THREE.MeshStandardMaterial({ color: o.color || '#c8a0a0', roughness: 0.7, metalness: 0, side: o.double_side ? THREE.DoubleSide : THREE.FrontSide,
      transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1, depthWrite: (o.opacity ?? 1) >= 1 });
  }

  function build(def) {
    if (!def || !def.group_id) return { ok: false, errors: ['group_id 없음'] };
    if (built.has(def.group_id)) destroy(def.group_id);
    const root = new THREE.Group();
    root.name = def.group_id;
    root.position.fromArray(def.origin || [0, 0, 0]);
    registry.attach(root, null);
    const rootId = registry.register(root, { id: def.group_id, displayName: def.name_ko || def.group_id, type: 'group', selectable: false });
    const ids = [rootId];
    const errors = [];
    if (def.backdrop) {
      const bg = new THREE.Mesh(new THREE.SphereGeometry(def.backdrop.radius || 6, 32, 16), new THREE.MeshBasicMaterial({ color: def.backdrop.color || '#1c1f2b', side: THREE.BackSide }));
      bg.name = 'backdrop';
      root.add(bg);
      tracker.retain(bg);
      if (def.lights !== false) {
        const hemi = new THREE.HemisphereLight(0xffffff, 0x334055, 1.1);
        const key = new THREE.DirectionalLight(0xffffff, 1.1);
        key.position.set(2, 3, 2);
        root.add(hemi, key);
      }
    }
    for (const o of def.objects || []) {
      let mesh = null;
      const center = new THREE.Vector3(...(o.center || [0, 0, 0]));
      if (o.shape === 'ellipsoid' || o.shape === 'sphere') {
        const r = o.shape === 'sphere' ? [o.radius, o.radius, o.radius] : o.radius;
        const geo = new THREE.SphereGeometry(1, o.segments || 40, Math.round((o.segments || 40) * 0.6));
        geo.scale(r[0], r[1], r[2]);
        geo.translate(center.x, center.y, center.z);
        const names = Object.keys(o.morphs || {});
        if (names.length) {
          geo.morphAttributes.position = names.map((n) => scaledMorph(geo, center, o.morphs[n].scale));
        }
        mesh = new THREE.Mesh(geo, material(o));
        if (names.length) { mesh.updateMorphTargets(); names.forEach((n, i) => { mesh.morphTargetDictionary[n] = i; }); }
      } else if (o.shape === 'leaflets') {
        const geo = leafletGeometry({ ...o, angle_deg: (o.morphs && o.morphs.open && o.morphs.open.angle_deg) || 70 });
        mesh = new THREE.Mesh(geo, material({ ...o, double_side: true }));
        mesh.updateMorphTargets();
        mesh.morphTargetDictionary.open = 0;
      } else if (o.shape === 'tube') {
        if (!deform) { errors.push(`${o.id}: 변형 컨트롤러 없음`); continue; }
        const t = deform.createTube({ points: o.points, radius: o.radius, material: material({ ...o, double_side: true }) });
        mesh = t.mesh;
        mesh.userData.tube = t;
      } else if (o.shape === 'box') {
        const geo = new THREE.BoxGeometry(...o.size);
        geo.translate(center.x, center.y, center.z);
        mesh = new THREE.Mesh(geo, material(o));
      } else {
        errors.push(`${o.id}: 알 수 없는 shape ${o.shape}`);
        continue;
      }
      mesh.name = o.name_ko || o.id;
      registry.attach(mesh, rootId);
      const id = registry.register(mesh, { id: o.id, displayName: o.name_ko || o.id, type: 'concept', parentId: rootId });
      if (id !== o.id) errors.push(`ID 중복: ${o.id} → ${id}`);
      tracker.retain(mesh);
      mesh.userData.logicalId = o.logical_id || null;
      mesh.userData.conceptStatus = def.verification_status || 'CONCEPTUAL';
      if (o.shape === 'tube') deform.register(id, mesh.userData.tube);
      ids.push(id);
    }
    // 새 루트의 월드 행렬을 바로 계산한다 (첫 렌더링 전에 범위·경로를 계산해도 원점 기준으로 틀리지 않게)
    root.updateMatrixWorld(true);
    built.set(def.group_id, { root, ids, def });
    return { ok: !errors.length, errors, ids, root };
  }

  function destroy(groupId) {
    const b = built.get(groupId);
    if (!b) return false;
    for (const id of b.ids) if (deform) deform.unregister(id);
    registry.unregister(groupId);
    built.delete(groupId);
    return true;
  }

  function bounds(groupId) {
    const b = built.get(groupId);
    if (!b) return null;
    const box = new THREE.Box3();
    b.root.updateMatrixWorld(true);
    for (const id of b.ids.slice(1)) { const e = registry.get(id); if (e) box.union(new THREE.Box3().setFromObject(e.object3D)); }
    return box;
  }

  return {
    build,
    destroy,
    destroyAll() { for (const id of [...built.keys()]) destroy(id); },
    bounds,
    has: (id) => built.has(id),
    root: (id) => (built.has(id) ? built.get(id).root : null),
    ids: (id) => (built.has(id) ? [...built.get(id).ids] : []),
    groups: () => [...built.keys()],
    setVisible(groupId, on) { const b = built.get(groupId); if (b) b.root.visible = on; },
  };
}
