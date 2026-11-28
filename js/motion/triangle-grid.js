// 삼각형 격자 색인 (STEP 04-A): 기하 검사용 광선-삼각형 교차를 빠르게 한다.
// - 월드 좌표 삼각형을 균일 격자 칸에 넣고, 광선은 지나가는 칸의 삼각형만 검사한다 (3D DDA).
// - Three.js Raycaster는 메시마다 모든 삼각형을 검사해서 표본 하나에 약 100ms가 걸렸다.
// - 메시가 움직이면 색인을 다시 만들어야 한다 (기하 검사는 정지한 해부학 메시만 대상으로 한다).

const EPS = 1e-9;

export async function buildTriangleGrid(meshes, { targetCells = 48, yieldFn = null } = {}) {
  // 삼각형 수 세기
  let triCount = 0;
  for (const m of meshes) {
    const g = m.geometry;
    triCount += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  }
  const tri = new Float32Array(triCount * 9);
  const owner = new Uint16Array(triCount);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let t = 0;
  const e = new Float32Array(16);
  for (let mi = 0; mi < meshes.length; mi += 1) {
    const m = meshes[mi];
    m.updateWorldMatrix(true, false);
    e.set(m.matrixWorld.elements);
    const pos = m.geometry.attributes.position.array;
    const stride = m.geometry.attributes.position.itemSize;
    const idx = m.geometry.index ? m.geometry.index.array : null;
    const n = idx ? idx.length : pos.length / stride;
    for (let k = 0; k < n; k += 3) {
      for (let j = 0; j < 3; j += 1) {
        const vi = (idx ? idx[k + j] : k + j) * stride;
        const x = pos[vi]; const y = pos[vi + 1]; const z = pos[vi + 2];
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
        const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        const o = t * 9 + j * 3;
        tri[o] = wx; tri[o + 1] = wy; tri[o + 2] = wz;
        if (wx < min[0]) min[0] = wx; if (wy < min[1]) min[1] = wy; if (wz < min[2]) min[2] = wz;
        if (wx > max[0]) max[0] = wx; if (wy > max[1]) max[1] = wy; if (wz > max[2]) max[2] = wz;
      }
      owner[t] = mi;
      t += 1;
      if (yieldFn && (t & 4095) === 0) await yieldFn();
    }
  }
  // 격자 크기: 가장 긴 변을 targetCells칸으로
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map((s) => Math.max(s, 1e-6));
  const cell = Math.max(...size) / targetCells;
  const dims = size.map((s) => Math.max(1, Math.ceil(s / cell)));
  const nCells = dims[0] * dims[1] * dims[2];
  const counts = new Uint32Array(nCells + 1);
  const cellRange = (o, a) => Math.min(dims[a] - 1, Math.max(0, Math.floor((o - min[a]) / cell)));
  const forCells = (ti, fn) => {
    const o = ti * 9;
    const lo = [0, 1, 2].map((a) => cellRange(Math.min(tri[o + a], tri[o + 3 + a], tri[o + 6 + a]), a));
    const hi = [0, 1, 2].map((a) => cellRange(Math.max(tri[o + a], tri[o + 3 + a], tri[o + 6 + a]), a));
    for (let z = lo[2]; z <= hi[2]; z += 1) for (let y = lo[1]; y <= hi[1]; y += 1) for (let x = lo[0]; x <= hi[0]; x += 1) fn(x + dims[0] * (y + dims[1] * z));
  };
  for (let ti = 0; ti < triCount; ti += 1) { forCells(ti, (c) => { counts[c + 1] += 1; }); if (yieldFn && (ti & 8191) === 8191) await yieldFn(); }
  for (let c = 0; c < nCells; c += 1) counts[c + 1] += counts[c];
  const items = new Uint32Array(counts[nCells]);
  const fill = counts.slice(0, nCells);
  for (let ti = 0; ti < triCount; ti += 1) { forCells(ti, (c) => { items[fill[c]] = ti; fill[c] += 1; }); if (yieldFn && (ti & 8191) === 8191) await yieldFn(); }
  return { tri, owner, triCount, min, max, cell, dims, start: counts, items, stamp: new Uint32Array(triCount), ray: 0, meshCount: meshes.length };
}

// 광선 o + t·d (|d| = 1, 0 < t ≤ far)의 교차. first=true면 가장 가까운 하나만.
// 결과: [{t, mesh}] (mesh는 색인을 만들 때 준 meshes 배열의 번호)
export function gridRaycast(G, o, d, far = Infinity, first = false) {
  G.ray += 1;
  const stamp = G.ray;
  const hits = [];
  // 격자 상자와의 진입·이탈
  let t0 = 0;
  let t1 = far;
  for (let a = 0; a < 3; a += 1) {
    const oa = o[a]; const da = d[a];
    if (Math.abs(da) < EPS) { if (oa < G.min[a] || oa > G.max[a]) return hits; continue; }
    let ta = (G.min[a] - oa) / da;
    let tb = (G.max[a] - oa) / da;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return hits;
  }
  const { dims, cell, min } = G;
  const p = [o[0] + d[0] * t0, o[1] + d[1] * t0, o[2] + d[2] * t0];
  const c = [0, 1, 2].map((a) => Math.min(dims[a] - 1, Math.max(0, Math.floor((p[a] - min[a]) / cell))));
  const step = [0, 0, 0];
  const tMax = [Infinity, Infinity, Infinity];
  const tDelta = [Infinity, Infinity, Infinity];
  for (let a = 0; a < 3; a += 1) {
    if (d[a] > EPS) { step[a] = 1; tMax[a] = t0 + ((min[a] + (c[a] + 1) * cell) - p[a]) / d[a]; tDelta[a] = cell / d[a]; }
    else if (d[a] < -EPS) { step[a] = -1; tMax[a] = t0 + ((min[a] + c[a] * cell) - p[a]) / d[a]; tDelta[a] = -cell / d[a]; }
  }
  let best = Infinity;
  for (;;) {
    const ci = c[0] + dims[0] * (c[1] + dims[1] * c[2]);
    for (let k = G.start[ci]; k < G.start[ci + 1]; k += 1) {
      const ti = G.items[k];
      if (G.stamp[ti] === stamp) continue;
      G.stamp[ti] = stamp;
      const t = triHit(G.tri, ti * 9, o, d);
      if (t > 1e-7 && t <= far) {
        if (first) { if (t < best) best = t; } else hits.push({ t, mesh: G.owner[ti] });
      }
    }
    const exit = Math.min(tMax[0], tMax[1], tMax[2]);
    if (first && best <= exit) return [{ t: best, mesh: -1 }];
    if (exit > t1) break;
    const a = tMax[0] === exit ? 0 : (tMax[1] === exit ? 1 : 2);
    c[a] += step[a];
    if (c[a] < 0 || c[a] >= dims[a]) break;
    tMax[a] += tDelta[a];
  }
  if (first) return Number.isFinite(best) ? [{ t: best, mesh: -1 }] : [];
  return hits;
}

// Möller–Trumbore (양면)
function triHit(T, o3, o, d) {
  const ax = T[o3]; const ay = T[o3 + 1]; const az = T[o3 + 2];
  const e1x = T[o3 + 3] - ax; const e1y = T[o3 + 4] - ay; const e1z = T[o3 + 5] - az;
  const e2x = T[o3 + 6] - ax; const e2y = T[o3 + 7] - ay; const e2z = T[o3 + 8] - az;
  const px = d[1] * e2z - d[2] * e2y; const py = d[2] * e2x - d[0] * e2z; const pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -1e-12 && det < 1e-12) return -1;
  const inv = 1 / det;
  const sx = o[0] - ax; const sy = o[1] - ay; const sz = o[2] - az;
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = sy * e1z - sz * e1y; const qy = sz * e1x - sx * e1z; const qz = sx * e1y - sy * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < 0 || u + v > 1) return -1;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}
