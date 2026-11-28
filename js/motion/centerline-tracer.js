// 내강 중심선 추적 (STEP 04-A, 개발자 도구): 혈관 메시의 단면 중심을 따라 Waypoint를 만든다.
//
// 방법 (단면 중심 행진, cross-section centroid marching)
//   1) 현재 점 p와 진행 방향 d로 정한 평면이 자르는 삼각형마다 교차 선분을 구한다 (p에서 maxRadius 안의 선분만).
//      정점만 쓰면 혈관처럼 길쭉한 삼각형에서 단면 정점이 3~5개뿐이라 중심이 치우쳤다.
//   2) 선분 중점을 길이로 가중 평균 = 단면 중심 c, 평균 거리 = 단면 반지름 r
//   3) 방향을 (c - 이전 c)로 부드럽게 갱신하고, c에서 step만큼 나아간다.
//   4) 정점이 minVerts보다 적으면(관 끝이 열림) 멈춘다. 가지가 갈라지는 곳에서는 maxRadius가 다른 가지를 덜 섞게 한다.
//
// 한계
//   - 표면 정점만 쓴다. 정점 분포가 고르지 않으면 중심이 조금 치우칠 수 있다.
//   - 분기점에서는 어느 가지로 갈지 정하지 못한다. 방향(prefer)으로 유도하고, 결과는 기하 검사로 확인한다.
//   - 결과는 "기하 근거"다. 해부학 검토 전까지 ANATOMY_REVIEWED로 올리지 않는다.

import * as THREE from 'three';

// 메시의 월드 좌표 정점 (Float32Array, xyz 반복)
export function worldVertices(meshes) {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  let n = 0;
  for (const m of list) n += m.geometry.attributes.position.count;
  const out = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  let k = 0;
  for (const m of list) {
    m.updateWorldMatrix(true, false);
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      out[k] = v.x; out[k + 1] = v.y; out[k + 2] = v.z;
      k += 3;
    }
  }
  return out;
}

// 주축 분석: 정점 평균과 가장 긴 축 (거듭제곱법)
export function principalAxis(verts) {
  const n = verts.length / 3;
  const c = new THREE.Vector3();
  for (let i = 0; i < verts.length; i += 3) c.x += verts[i], c.y += verts[i + 1], c.z += verts[i + 2];
  c.multiplyScalar(1 / n);
  const m = [0, 0, 0, 0, 0, 0];   // xx xy xz yy yz zz
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i] - c.x; const y = verts[i + 1] - c.y; const z = verts[i + 2] - c.z;
    m[0] += x * x; m[1] += x * y; m[2] += x * z; m[3] += y * y; m[4] += y * z; m[5] += z * z;
  }
  const a = new THREE.Vector3(1, 0.3, 0.2).normalize();
  for (let it = 0; it < 50; it += 1) {
    const x = m[0] * a.x + m[1] * a.y + m[2] * a.z;
    const y = m[1] * a.x + m[3] * a.y + m[4] * a.z;
    const z = m[2] * a.x + m[4] * a.y + m[5] * a.z;
    a.set(x, y, z).normalize();
  }
  // 축 방향 끝점
  let lo = Infinity; let hi = -Infinity;
  for (let i = 0; i < verts.length; i += 3) {
    const t = (verts[i] - c.x) * a.x + (verts[i + 1] - c.y) * a.y + (verts[i + 2] - c.z) * a.z;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return { center: c, axis: a, min: lo, max: hi };
}

// 월드 좌표 삼각형 (Float32Array, 삼각형당 9개)
export function worldTriangles(meshes) {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  let n = 0;
  for (const m of list) { const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; }
  const out = new Float32Array(n * 9);
  const v = new THREE.Vector3();
  let k = 0;
  for (const m of list) {
    m.updateWorldMatrix(true, false);
    const g = m.geometry;
    const pos = g.attributes.position;
    const cnt = g.index ? g.index.count : pos.count;
    for (let i = 0; i < cnt; i += 1) {
      v.fromBufferAttribute(pos, g.index ? g.index.getX(i) : i).applyMatrix4(m.matrixWorld);
      out[k] = v.x; out[k + 1] = v.y; out[k + 2] = v.z;
      k += 3;
    }
  }
  return out;
}

// 단면: p를 지나고 d에 수직인 평면이 자르는 삼각형 선분들의 길이 가중 중심
export function crossSection(tris, p, d, maxRadius) {
  const c = new THREE.Vector3();
  let w = 0;
  let segs = 0;
  const r2 = maxRadius * maxRadius;
  const mids = [];
  const q = [0, 0, 0, 0, 0, 0];
  for (let o = 0; o < tris.length; o += 9) {
    const s0 = (tris[o] - p.x) * d.x + (tris[o + 1] - p.y) * d.y + (tris[o + 2] - p.z) * d.z;
    const s1 = (tris[o + 3] - p.x) * d.x + (tris[o + 4] - p.y) * d.y + (tris[o + 5] - p.z) * d.z;
    const s2 = (tris[o + 6] - p.x) * d.x + (tris[o + 7] - p.y) * d.y + (tris[o + 8] - p.z) * d.z;
    if ((s0 > 0 && s1 > 0 && s2 > 0) || (s0 < 0 && s1 < 0 && s2 < 0)) continue;
    let k = 0;
    const sv = [s0, s1, s2];
    for (let a = 0; a < 3 && k < 6; a += 1) {
      const b = (a + 1) % 3;
      const sa = sv[a]; const sb = sv[b];
      if ((sa > 0) === (sb > 0) && sa !== 0 && sb !== 0) continue;
      const t = sa === sb ? 0 : sa / (sa - sb);
      const oa = o + a * 3; const ob = o + b * 3;
      q[k] = tris[oa] + (tris[ob] - tris[oa]) * t;
      q[k + 1] = tris[oa + 1] + (tris[ob + 1] - tris[oa + 1]) * t;
      q[k + 2] = tris[oa + 2] + (tris[ob + 2] - tris[oa + 2]) * t;
      k += 3;
    }
    if (k < 6) continue;
    const mx = (q[0] + q[3]) / 2; const my = (q[1] + q[4]) / 2; const mz = (q[2] + q[5]) / 2;
    const dx = mx - p.x; const dy = my - p.y; const dz = mz - p.z;
    if (dx * dx + dy * dy + dz * dz > r2) continue;
    const len = Math.hypot(q[3] - q[0], q[4] - q[1], q[5] - q[2]);
    if (len <= 0) continue;
    c.x += mx * len; c.y += my * len; c.z += mz * len;
    w += len;
    segs += 1;
    mids.push(mx, my, mz, len);
  }
  if (!w) return { count: 0, centroid: null, radius: 0, perimeter: 0 };
  c.multiplyScalar(1 / w);
  let r = 0;
  for (let i = 0; i < mids.length; i += 4) r += Math.hypot(mids[i] - c.x, mids[i + 1] - c.y, mids[i + 2] - c.z) * mids[i + 3];
  return { count: segs, centroid: c, radius: r / w, perimeter: w };
}

// 한 단면 (정점판 방식, 비교용): p를 지나고 d에 수직인 판 안의 정점 평균
export function sliceCentroid(verts, p, d, slab, maxRadius) {
  const c = new THREE.Vector3();
  let k = 0;
  const half = slab / 2;
  const r2 = maxRadius * maxRadius;
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i] - p.x; const y = verts[i + 1] - p.y; const z = verts[i + 2] - p.z;
    const t = x * d.x + y * d.y + z * d.z;
    if (t > half || t < -half) continue;
    if (x * x + y * y + z * z > r2) continue;
    c.x += verts[i]; c.y += verts[i + 1]; c.z += verts[i + 2];
    k += 1;
  }
  if (!k) return { count: 0, centroid: null, radius: 0 };
  c.multiplyScalar(1 / k);
  let r = 0;
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i] - p.x; const y = verts[i + 1] - p.y; const z = verts[i + 2] - p.z;
    const t = x * d.x + y * d.y + z * d.z;
    if (t > half || t < -half) continue;
    if (x * x + y * y + z * z > r2) continue;
    r += Math.hypot(verts[i] - c.x, verts[i + 1] - c.y, verts[i + 2] - c.z);
  }
  return { count: k, centroid: c, radius: r / k };
}

/**
 * opts: { tris(worldTriangles) | verts, start:[x,y,z]|Vector3, dir:[x,y,z]|Vector3, step=0.004, slab=0.003, maxRadius=0.02,
 *         maxSteps=200, minVerts=6, maxLength=Infinity, stopNear:{point, distance}, prefer:{dir, weight} }
 * 결과: { points:[[x,y,z]], radii:[m], stop_reason, length }
 */
export function traceCenterline(opts) {
  const { tris = null, verts = null, step = 0.004, slab = 0.003, maxRadius = 0.02, maxSteps = 200, minVerts = 6, maxLength = Infinity, stopNear = null, prefer = null, smooth = 0.5 } = opts;
  const p = new THREE.Vector3().copy(toV(opts.start));
  const d = new THREE.Vector3().copy(toV(opts.dir)).normalize();
  const pref = prefer ? toV(prefer.dir).normalize() : null;
  const points = [];
  const radii = [];
  let prev = null;
  let len = 0;
  let reason = 'max_steps';
  let rad = maxRadius;
  for (let s = 0; s < maxSteps; s += 1) {
    const sl = tris ? crossSection(tris, p, d, rad) : sliceCentroid(verts, p, d, slab, rad);
    if (sl.count < minVerts) { reason = 'open_end'; break; }
    const c = sl.centroid;
    // 판 위로 다시 투영 (진행 방향 성분은 p 그대로)
    const off = c.clone().sub(p);
    c.addScaledVector(d, -off.dot(d));
    if (prev) {
      const nd = c.clone().sub(prev);
      const l = nd.length();
      if (l > 1e-6) {
        nd.multiplyScalar(1 / l);
        if (nd.dot(d) < 0.2) { reason = 'turn_back'; break; }
        d.multiplyScalar(smooth).addScaledVector(nd, 1 - smooth);
        if (pref) d.addScaledVector(pref, prefer.weight || 0.1);
        d.normalize();
        len += l;
      }
    }
    points.push(c.toArray().map(r6));
    radii.push(r6(sl.radius));
    // 반지름을 따라 탐색 범위 조절 (다른 가지 섞임 방지)
    rad = Math.min(maxRadius, Math.max(sl.radius * 1.8, step * 2));
    if (len >= maxLength) { reason = 'max_length'; break; }
    if (stopNear && c.distanceTo(toV(stopNear.point)) < stopNear.distance) { reason = 'reached'; break; }
    prev = c.clone();
    p.copy(c).addScaledVector(d, step);
  }
  return { points, radii, stop_reason: reason, length: r6(len) };
}

// 점 목록을 대략 같은 간격(spacing)으로 줄인다 (첫·끝 점 유지)
export function resample(points, spacing) {
  if (points.length < 3) return points.slice();
  const out = [points[0]];
  let acc = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    acc += dist(points[i], points[i - 1]);
    if (acc >= spacing) { out.push(points[i]); acc = 0; }
  }
  out.push(points.at(-1));
  return out;
}

// 판막 법선: 판막 정점의 가장 얇은 축 (작은 고유값 축 ~ 판막면에 수직)
export function thinAxis(verts) {
  const { center, axis } = principalAxis(verts);
  // 첫 축에 수직인 평면에서 둘째 축을 구하고, 둘의 외적이 가장 얇은 축
  const m = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < verts.length; i += 3) {
    let x = verts[i] - center.x; let y = verts[i + 1] - center.y; let z = verts[i + 2] - center.z;
    const t = x * axis.x + y * axis.y + z * axis.z;
    x -= t * axis.x; y -= t * axis.y; z -= t * axis.z;
    m[0] += x * x; m[1] += x * y; m[2] += x * z; m[3] += y * y; m[4] += y * z; m[5] += z * z;
  }
  const b = new THREE.Vector3(0.2, 1, 0.3).normalize();
  for (let it = 0; it < 50; it += 1) {
    const x = m[0] * b.x + m[1] * b.y + m[2] * b.z;
    const y = m[1] * b.x + m[3] * b.y + m[4] * b.z;
    const z = m[2] * b.x + m[4] * b.y + m[5] * b.z;
    b.set(x, y, z);
    b.addScaledVector(axis, -b.dot(axis)).normalize();
  }
  return { center, normal: new THREE.Vector3().crossVectors(axis, b).normalize() };
}

function toV(a) { return a && a.isVector3 ? a : new THREE.Vector3(a[0], a[1], a[2]); }
function r6(n) { return Math.round(n * 1e6) / 1e6; }
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
