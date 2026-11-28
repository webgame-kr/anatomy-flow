// Deformation Controller (STEP 04-B): 중심선을 유지한 채 관(혈관) 내강 지름을 바꾼다
// - 관 Geometry를 중심선 곡선으로 만들고, 정점마다 (중심점, 바깥 방향, 기준 반지름)을 기억한다.
// - 반지름 배율을 바꾸면 정점 = 중심점 + 방향 × 기준 반지름 × 배율 → 중심선과 길이는 그대로다.
//   (객체 전체 Scale을 바꾸면 혈관이 이동하거나 길어진다. 그렇게 하지 않는다.)
// - 이동 경로는 같은 중심선 위에 두므로 변형해도 Actor 위치가 바뀌지 않는다. 필요하면 Actor 표시 크기만 줄인다.
// - profile: 관 길이 방향(0~1)으로 배율을 다르게 줄 수 있다 (예: 가운데만 수축).

import * as THREE from 'three';

export function createDeformationController({ registry }) {
  const tubes = new Map();     // 레지스트리 ID → { mesh, centers, dirs, r0, segs, rad, scale, profile }
  const listeners = new Set();

  // points: 장면 좌표가 아니라 관 객체의 로컬 좌표. 만든 Mesh는 호출한 쪽이 레지스트리에 등록한다.
  function createTube({ points, radius = 0.05, tubularSegments = 96, radialSegments = 20, material }) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
    const mesh = new THREE.Mesh(geo, material);
    const pos = geo.attributes.position;
    const n = pos.count;
    const centers = new Float32Array(n * 3);
    const dirs = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i <= tubularSegments; i += 1) {
      curve.getPointAt(i / tubularSegments, c);
      for (let j = 0; j <= radialSegments; j += 1) {
        const k = i * (radialSegments + 1) + j;
        v.fromBufferAttribute(pos, k).sub(c);
        const len = v.length() || 1;
        v.multiplyScalar(1 / len);
        centers.set([c.x, c.y, c.z], k * 3);
        dirs.set([v.x, v.y, v.z], k * 3);
      }
    }
    return { mesh, curve, data: { centers, dirs, r0: radius, segs: tubularSegments, rad: radialSegments, scale: 1, profile: null } };
  }

  function register(id, built) {
    tubes.set(id, { mesh: built.mesh, curve: built.curve, ...built.data });
  }

  function apply(t) {
    const pos = t.mesh.geometry.attributes.position;
    for (let i = 0; i <= t.segs; i += 1) {
      const u = i / t.segs;
      const s = t.profile ? 1 + (t.scale - 1) * t.profile(u) : t.scale;
      const r = t.r0 * s;
      for (let j = 0; j <= t.rad; j += 1) {
        const k = i * (t.rad + 1) + j;
        pos.setXYZ(k, t.centers[k * 3] + t.dirs[k * 3] * r, t.centers[k * 3 + 1] + t.dirs[k * 3 + 1] * r, t.centers[k * 3 + 2] + t.dirs[k * 3 + 2] * r);
      }
    }
    pos.needsUpdate = true;
    t.mesh.geometry.computeVertexNormals();
    t.mesh.geometry.computeBoundingSphere();
  }

  // 배율 설정 (1 = 기준). profile: 'uniform' | 'middle'(가운데 40% 구간 중심으로 매끈하게)
  function setRadiusScale(id, scale, profile = null) {
    const t = tubes.get(id);
    if (!t || !(scale > 0)) return false;
    t.scale = scale;
    if (profile !== null) t.profile = profile === 'middle' ? (u) => Math.exp(-((u - 0.5) ** 2) / 0.02) : null;
    apply(t);
    for (const fn of listeners) fn(id, scale);
    return true;
  }

  return {
    createTube,
    register,
    unregister(id) { tubes.delete(id); },
    setRadiusScale,
    getRadiusScale: (id) => (tubes.has(id) ? tubes.get(id).scale : null),
    radius: (id) => (tubes.has(id) ? tubes.get(id).r0 * tubes.get(id).scale : null),
    curveOf: (id) => (tubes.has(id) ? tubes.get(id).curve : null),
    has: (id) => tubes.has(id) && registry.has(id),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
