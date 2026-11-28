// 미세 구조 개념 장면 (STEP 04-A): 폐포-모세혈관, 조직 모세혈관
// - 해부 모델(BodyParts3D)에 폐포·모세혈관이 없어서 직접 만든 단순 형태다. 화면에 "개념 모델(CONCEPTUAL)"로 표시한다.
// - 장면 데이터는 content/micro/*.json에 있다. 여기에는 의료 콘텐츠를 넣지 않고 데이터대로 도형만 만든다.
// - 좌표: 장면마다 origin(장면 좌표, m)을 두고 그 안에서 로컬 좌표로 만든다. 기관 장면과 멀리 떨어뜨리고
//   안쪽을 향한 배경 구로 둘러싸서 기관 모델이 보이지 않게 한다 (레지스트리의 표시 상태를 건드리지 않는다).
// - 객체는 레지스트리에 등록하지 않는다(선택·조작 대상이 아님). 만든 geometry/material은 destroy()에서 직접 해제한다.
// - 경로는 이동 엔진(path-engine)에 CONCEPTUAL 경로로 등록한다 → 같은 Actor가 같은 이동 명령으로 움직인다.

import * as THREE from 'three';

export function createMicroScene({ scene, paths, def, labelContainer = null }) {
  const root = new THREE.Group();
  root.name = `micro:${def.scene_id}`;
  root.position.fromArray(def.origin);
  root.visible = false;
  scene.add(root);
  const owned = [];   // 해제할 geometry/material
  const own = (x) => { owned.push(x); return x; };
  const mat = (color, extra = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra }));

  // 배경 구 (안쪽 면): 기관 장면을 가린다
  const bg = new THREE.Mesh(own(new THREE.SphereGeometry(def.backdrop_radius || 8, 32, 16)), own(new THREE.MeshBasicMaterial({ color: def.background || '#1c1f2b', side: THREE.BackSide })));
  bg.name = 'backdrop';
  root.add(bg);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x334055, 1.1);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2, 3, 2);
  root.add(hemi, key);

  // 모세혈관: 경로 곡선을 따라 만든 반투명 관
  const local = def.capillary.points.map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(local, false, 'centripetal');
  const tube = new THREE.Mesh(own(new THREE.TubeGeometry(curve, 160, def.capillary.radius, 24, false)),
    mat(def.capillary.color || '#d65a5a', { transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
  tube.name = 'capillary';
  tube.renderOrder = 2;
  root.add(tube);

  // 주변 구조: 폐포(구) 또는 조직 세포(납작한 구 여러 개)
  for (const s of def.structures || []) {
    if (s.shape === 'sphere') {
      const m = new THREE.Mesh(own(new THREE.SphereGeometry(s.radius, 48, 24)), mat(s.color, { transparent: true, opacity: s.opacity ?? 0.35, depthWrite: false, side: THREE.DoubleSide }));
      m.position.fromArray(s.center);
      m.name = s.id;
      m.renderOrder = 1;
      root.add(m);
    } else if (s.shape === 'cells') {
      const g = own(new THREE.SphereGeometry(1, 20, 12));
      const mm = mat(s.color, { transparent: true, opacity: s.opacity ?? 0.85 });
      for (const c of s.cells) {
        const m = new THREE.Mesh(g, mm);
        m.position.fromArray(c.center);
        m.scale.fromArray(c.size);
        m.name = s.id;
        root.add(m);
      }
    }
  }

  // 기체 입자 (장식용 반복 연출, 소수): from → to 직선 왕복이 아니라 한 방향으로만 흘러간다
  const gasGroups = [];
  for (const g of def.gases || []) {
    const geo = own(new THREE.SphereGeometry(g.size || 0.012, 10, 8));
    const m = own(new THREE.MeshBasicMaterial({ color: g.color }));
    const inst = new THREE.InstancedMesh(geo, m, g.count);
    inst.name = `gas:${g.id}`;
    inst.frustumCulled = false;
    root.add(inst);
    const lanes = [];
    for (let i = 0; i < g.count; i += 1) {
      const t = (i + 0.5) / g.count;
      const a = new THREE.Vector3().lerpVectors(new THREE.Vector3(...g.from[0]), new THREE.Vector3(...g.from[1]), t);
      const b = new THREE.Vector3().lerpVectors(new THREE.Vector3(...g.to[0]), new THREE.Vector3(...g.to[1]), t);
      lanes.push({ a, b, phase: (i * 0.37) % 1 });
    }
    gasGroups.push({ def: g, inst, lanes });
  }
  const tmp = new THREE.Object3D();
  let time = 0;
  let motionScale = 1;

  // 라벨 (DOM): 장면이 보일 때만
  const labels = [];
  let layer = null;
  if (labelContainer) {
    layer = document.createElement('div');
    layer.className = 'micro-labels';
    layer.hidden = true;
    labelContainer.appendChild(layer);
    for (const l of def.labels || []) {
      const el = document.createElement('div');
      el.className = `micro-label ${l.kind || ''}`;
      el.textContent = l.text;
      layer.appendChild(el);
      labels.push({ el, pos: new THREE.Vector3(...l.position) });
    }
  }

  // 경로 (이동 엔진): 장면 좌표로 등록
  function addPaths() {
    const p = def.path;
    if (paths.has(p.path_id)) paths.remove(p.path_id);
    const world = def.capillary.points.map((q) => [q[0] + def.origin[0], q[1] + def.origin[1], q[2] + def.origin[2]]);
    paths.create({
      path_id: p.path_id, name_ko: p.name_ko, curve_type: 'catmull_rom', verification_status: 'CONCEPTUAL',
      points: world.map((position) => ({ space: 'scene', position })),
      checkpoints: p.checkpoints, default_speed: p.default_speed || 0.2,
      source: 'project concept scene', notes: def.notes || '',
    });
  }

  const box = new THREE.Box3();
  function bounds() {
    box.setFromObject(tube);
    for (const c of root.children) if (c.name !== 'backdrop' && c.isMesh) box.union(new THREE.Box3().setFromObject(c));
    // 여백: 관 입구·출구와 라벨이 화면 가장자리에서 잘리지 않게
    const size = box.getSize(new THREE.Vector3());
    box.expandByVector(size.multiplyScalar(0.12));
    return box;
  }

  function tick(dt, camera) {
    if (!root.visible) return;
    time += dt * motionScale;
    for (const g of gasGroups) {
      const speed = g.def.speed || 0.35;
      for (let i = 0; i < g.lanes.length; i += 1) {
        const l = g.lanes[i];
        const f = (l.phase + time * speed) % 1;
        tmp.position.lerpVectors(l.a, l.b, f);
        const s = f < 0.1 ? f / 0.1 : (f > 0.9 ? (1 - f) / 0.1 : 1);
        tmp.scale.setScalar(Math.max(0.001, s));
        tmp.updateMatrix();
        g.inst.setMatrixAt(i, tmp.matrix);
      }
      g.inst.instanceMatrix.needsUpdate = true;
    }
    if (layer && camera) {
      const w = labelContainer.clientWidth;
      const h = labelContainer.clientHeight;
      const v = new THREE.Vector3();
      for (const l of labels) {
        v.copy(l.pos).add(root.position).project(camera);
        const vis = v.z < 1 && v.z > -1;
        l.el.hidden = !vis;
        if (vis) l.el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      }
    }
  }

  return {
    def,
    root,
    addPaths,
    bounds,
    tick,
    setVisible(on) { root.visible = on; if (layer) layer.hidden = !on; },
    setReducedMotion(on) { motionScale = on ? 0 : 1; },
    get visible() { return root.visible; },
    destroy() {
      if (paths.has(def.path.path_id)) paths.remove(def.path.path_id);
      scene.remove(root);
      for (const g of gasGroups) g.inst.dispose();
      for (const x of owned) x.dispose();
      if (layer) layer.remove();
    },
  };
}
