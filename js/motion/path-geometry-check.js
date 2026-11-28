// 경로 기하 검사 (STEP 03-C): 경로 위 표본점이 어떤 메시의 "닫힌 면 안쪽"에 있는지 추정한다.
// 방법: 표본점마다 6방향 광선을 쏘아, 메시별 교차 횟수가 홀수인 방향이 5개 이상이면 그 메시 안쪽으로 본다(ray parity).
// 한계 (반드시 함께 보고한다)
// - 표면 메시 기하만 본다. 해부학적 내강·혈류 방향을 판정하지 않는다 → 결과는 APPROXIMATE 근거일 뿐 검증이 아니다.
// - 끝이 열린 관(혈관)이나 구멍 난 메시는 홀짝이 틀릴 수 있다. 단면과 여러 카메라 각도로 직접 확인해야 한다.
// - 계산 비용이 커서 버튼으로만 실행한다(프레임마다 실행하지 않음).

import * as THREE from 'three';

const DIRS = [[1, 0.13, 0.07], [-1, 0.05, 0.11], [0.1, 1, 0.03], [0.07, -1, 0.12], [0.05, 0.09, 1], [0.12, 0.03, -1]]
  .map((d) => new THREE.Vector3(...d).normalize());

export function checkPathGeometry({ paths, registry, pathId, samples = 60, ignore = (entry) => entry.type === 'actor' }) {
  const meshes = registry.allMeshes().filter((m) => {
    const e = registry.get(registry.resolvePick(m, 'part'));
    return m.visible && !(e && ignore(e));
  });
  const rc = new THREE.Raycaster();
  const nameOf = (o) => { const e = registry.get(registry.resolvePick(o, 'part')); return e ? e.displayName : o.name; };
  // 안쪽에서 쏜 광선도 면과 만나도록 잠시 양면으로 (끝나면 되돌림)
  const saved = [];
  for (const m of meshes) for (const mat of (Array.isArray(m.material) ? m.material : [m.material])) { saved.push([mat, mat.side]); mat.side = THREE.DoubleSide; }
  const L = paths.length(pathId);
  const rows = [];
  try {
    for (let i = 0; i <= samples; i += 1) {
      const p = paths.pointAt(pathId, (L * i) / samples);
      if (!p) continue;
      const votes = new Map();
      for (const d of DIRS) {
        rc.set(p, d);
        const per = new Map();
        for (const h of rc.intersectObjects(meshes, false)) { const n = nameOf(h.object); per.set(n, (per.get(n) || 0) + 1); }
        for (const [n, c] of per) if (c % 2 === 1) votes.set(n, (votes.get(n) || 0) + 1);
      }
      rows.push({ progress: i / samples, inside: [...votes].filter(([, v]) => v >= 5).map(([n]) => n) });
    }
  } finally {
    for (const [mat, side] of saved) mat.side = side;
  }
  const outside = rows.filter((r) => r.inside.length === 0);
  const runs = [];
  for (const r of rows) {
    const v = r.inside.length ? r.inside.join('+') : 'OUTSIDE';
    if (!runs.length || runs[runs.length - 1].inside !== v) runs.push({ from: r.progress, inside: v });
  }
  return {
    path_id: pathId,
    samples: rows.length,
    outside_ratio: rows.length ? outside.length / rows.length : 1,
    runs,
    method: 'ray parity, 6 directions, majority 5/6 (surface geometry only)',
    note: '닫힌 면 안쪽 추정일 뿐 해부학적 내강 검증이 아님',
  };
}
