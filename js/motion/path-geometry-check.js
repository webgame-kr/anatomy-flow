// 경로 기하 검사 (STEP 03-C 도입, STEP 04-A 개선): 경로 표본점이 메시 "안쪽"에 있는지 추정한다.
//
// 검사 두 가지
//   1) 닫힌 면 안쪽(parity): 6방향 광선의 교차 횟수 홀짝, 5/6 다수결 (심방·심실 내강처럼 닫힌 메시)
//   2) 옆으로 둘러싸임(lateral): 진행 방향에 수직인 8방향 광선이 가까운 거리(radius) 안에서 벽에 닿는 비율
//      (끝이 열린 혈관 관 메시는 홀짝이 틀릴 수 있어 이것으로 판단한다)
//   + 연속 표본 사이 선분이 메시 표면을 몇 번 지나는지(관통) 기록
//
// 성능 (STEP 04-A)
//   - 표본점이 메시의 경계 상자 안에 있을 때만 그 메시를 parity 후보로 쓴다(점을 감쌀 수 없는 메시 제외)
//   - lateral·관통 광선은 길이를 제한하고, 경로 근처 메시만 쓴다
//   - 광선 교차는 삼각형 격자 색인(triangle-grid.js)으로 지나가는 칸의 삼각형만 검사한다 (양면 판정이라 재질 side를 바꾸지 않는다)
//   - 한 번에 시간 예산(budgetMs) 안에서만 일하고 작업 큐로 양보한다 → 검사 중에도 화면과 카메라가 움직인다
//   - 같은 경로 모양·같은 메시 조합이면 결과를 캐시한다
//
// 한계: 표면 메시 기하만 본다. 해부학적 내강 검증이 아니다(결과를 GEOMETRY_CHECKED 판단의 근거로만 쓴다).

import * as THREE from 'three';
import { buildTriangleGrid, gridRaycast } from './triangle-grid.js';

const PARITY_DIRS = [[1, 0.13, 0.07], [-1, 0.05, 0.11], [0.1, 1, 0.03], [0.07, -1, 0.12], [0.05, 0.09, 1], [0.12, 0.03, -1]]
  .map((d) => new THREE.Vector3(...d).normalize());
const cache = new Map();
const grids = new Map();
// 양보: 작업 큐로 넘겨서 브라우저가 그리기·입력을 처리하게 한다.
// rAF로 기다리지 않는 이유: 한 프레임에 한 조각만 하게 되어 전체 시간이 길어지고, 창이 가려지면 rAF가 거의 멈춘다.
const chan = typeof MessageChannel === 'function' ? new MessageChannel() : null;
const waiters = [];
if (chan) chan.port1.onmessage = () => { const r = waiters.shift(); if (r) r(); };
const nextFrame = () => new Promise((r) => { if (chan) { waiters.push(r); chan.port2.postMessage(0); } else setTimeout(r, 0); });

function meshName(registry, m) {
  const e = registry.get(registry.resolvePick(m, 'part'));
  return e ? e.displayName : m.name;
}

// 경로 모양 서명 (캐시 키)
function signature(paths, pathId, samples) {
  const c = paths.cache(pathId);
  if (!c || !c.curve) return '';
  const pts = c.points.map((p) => p.toArray().map((n) => n.toFixed(5)).join(',')).join(';');
  return `${pathId}|${c.length.toFixed(6)}|${samples}|${pts}`;
}

/**
 * opts: { paths, registry, pathId, samples=60, radius=0.03, budgetMs=8, ignore(entry), onProgress(f) }
 * 결과: { path_id, samples, outside_ratio, enclosed_ratio, crossings, runs, flagged:[{progress, position, reason}], ms, blocked_max_ms, cached }
 */
export async function checkPathGeometryAsync(opts) {
  const { paths, registry, pathId, samples = 60, radius = 0.03, budgetMs = 8, ignore = (entry) => entry.type === 'actor', onProgress = null } = opts;
  const c = paths.cache(pathId);
  if (!c || !c.curve || !(c.length > 0)) return { path_id: pathId, error: '경로 없음' };
  const meshes = registry.allMeshes().filter((m) => {
    const e = registry.get(registry.resolvePick(m, 'part'));
    return m.visible && !(e && ignore(e));
  });
  const key = signature(paths, pathId, samples) + '|' + meshes.map((m) => m.uuid).join(',');
  if (cache.has(key)) return { ...cache.get(key), cached: true, ms: 0, blocked_max_ms: 0 };

  // 경로 근처 메시만 (경로 상자 + radius와 겹치는 메시)
  // 경계 상자: geometry.boundingBox(한 번 계산해 캐시됨)를 월드로 변환. setFromObject는 정점을 모두 돌아 느리다.
  const boxes = meshes.map((m) => {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    m.updateWorldMatrix(true, false);
    return m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
  });
  const pathBox = new THREE.Box3();
  for (const p of c.curve.getSpacedPoints(64)) pathBox.expandByPoint(p);
  pathBox.expandByScalar(radius * 1.5);
  const near = meshes.filter((m, i) => boxes[i].intersectsBox(pathBox));
  const nearBoxes = near.map((m) => boxes[meshes.indexOf(m)]);
  const names = near.map((m) => meshName(registry, m));

  const t0 = performance.now();
  let sliceStart = performance.now();
  let blockedMax = 0;
  const pause = async () => {
    const spent = performance.now() - sliceStart;
    if (spent > budgetMs) { blockedMax = Math.max(blockedMax, spent); await nextFrame(); sliceStart = performance.now(); }
  };
  // 삼각형 격자 색인: 보이는 메시 전체로 한 번 만들고 모든 경로에서 재사용 (메시 번호 → near 번호로 바꿔 쓴다)
  const gkey = meshes.map((m) => m.uuid + ':' + m.matrixWorld.elements.map((n) => n.toFixed(5)).join(',')).join('|');
  let G = grids.get(gkey);
  const built = !G;
  if (!G) { grids.clear(); G = await buildTriangleGrid(meshes, { yieldFn: pause }); grids.set(gkey, G); }
  const toNear = meshes.map((m) => near.indexOf(m));
  const buildMs = built ? Math.round(performance.now() - t0) : 0;

  const rows = [];
  let crossings = 0;
  const tan = new THREE.Vector3();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let prev = null;
  for (let i = 0; i <= samples; i += 1) {
    const d = (c.length * i) / samples;
    const p = paths.pointAt(pathId, d).clone();
    paths.tangentAt(pathId, d, tan);
    const o = [p.x, p.y, p.z];
    // 1) parity: 이 점을 경계 상자로 감싸는 메시만 센다
    const cand = new Set();
    for (let k = 0; k < near.length; k += 1) if (nearBoxes[k].containsPoint(p)) cand.add(k);
    const votes = new Map();
    if (cand.size) {
      for (const dd of PARITY_DIRS) {
        const per = new Map();
        for (const h of gridRaycast(G, o, [dd.x, dd.y, dd.z])) { const k = toNear[h.mesh]; if (cand.has(k)) per.set(k, (per.get(k) || 0) + 1); }
        for (const [k, n] of per) if (n % 2 === 1) votes.set(k, (votes.get(k) || 0) + 1);
      }
    }
    const inside = [...votes].filter(([, n]) => n >= 5).map(([k]) => names[k]);
    // 2) lateral: 진행 방향에 수직인 8방향, radius 안에서 가장 가까운 벽
    u.set(0, 1, 0);
    if (Math.abs(u.dot(tan)) > 0.9) u.set(1, 0, 0);
    u.cross(tan).normalize();
    v.crossVectors(tan, u).normalize();
    let hit = 0;
    let clearance = Infinity;
    for (let k = 0; k < 8; k += 1) {
      const ang = (k / 8) * Math.PI * 2;
      dir.copy(u).multiplyScalar(Math.cos(ang)).addScaledVector(v, Math.sin(ang)).normalize();
      const h = gridRaycast(G, o, [dir.x, dir.y, dir.z], radius, true)[0];
      if (h) { hit += 1; clearance = Math.min(clearance, h.t); }
    }
    // 3) 관통: 이전 표본에서 이 표본까지 선분이 면을 지나는 횟수
    let cross = 0;
    if (prev) {
      const seg = p.clone().sub(prev);
      const len = seg.length();
      if (len > 0) {
        seg.multiplyScalar(1 / len);
        cross = gridRaycast(G, [prev.x, prev.y, prev.z], [seg.x, seg.y, seg.z], len).length;
        crossings += cross;
      }
    }
    prev = p;
    rows.push({ progress: i / samples, position: p.toArray(), inside, enclosed: hit / 8, clearance: Number.isFinite(clearance) ? clearance : null, cross });
    if (onProgress) onProgress((i + 1) / (samples + 1));
    await pause();
  }
  blockedMax = Math.max(blockedMax, performance.now() - sliceStart);
  const outside = rows.filter((r) => r.inside.length === 0 && r.enclosed < 0.75);
  const runs = [];
  for (const r of rows) {
    const label = r.inside.length ? r.inside.join('+') : (r.enclosed >= 0.75 ? 'ENCLOSED' : 'OUTSIDE');
    if (!runs.length || runs.at(-1).inside !== label) runs.push({ from: r.progress, inside: label });
  }
  const flagged = rows.filter((r) => r.inside.length === 0 && r.enclosed < 0.75).map((r) => ({ progress: r.progress, position: r.position, reason: '메시 안쪽이 아님' }));
  const result = {
    path_id: pathId,
    samples: rows.length,
    outside_ratio: rows.length ? outside.length / rows.length : 1,
    enclosed_ratio: rows.length ? rows.filter((r) => r.enclosed >= 0.75).length / rows.length : 0,
    crossings,
    min_clearance_m: Math.min(...rows.map((r) => r.clearance ?? Infinity)),
    runs,
    flagged,
    rows,
    method: 'parity 6방향(경계 상자 후보) + 수직 8방향 둘러싸임(radius) + 선분 관통, 삼각형 격자 색인',
    note: '표면 기하 근거일 뿐 해부학적 내강 검증이 아님',
    ms: Math.round(performance.now() - t0),
    blocked_max_ms: Math.round(blockedMax),
    near_meshes: near.length,
    index_build_ms: buildMs,
    triangles: G.triCount,
  };
  cache.set(key, result);
  return result;
}

export function clearGeometryCache() { cache.clear(); grids.clear(); }
