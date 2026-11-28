// STEP 04-B+ 개발 도구 (수업 범위 밖): 혈관 가지 중심선 경로 만들기 + 기하 검사
// Explorer(개발자 모드)에서 콘솔로 실행한다:
//   const m = await import('/tools/validation/trace-branch-paths.mjs'); const out = await m.run(window.__nfx);
//   → out.paths (paths.json 형식), out.report (검사 요약). 결과는 tools/content/merge_branch_paths.py로 paths.json에 합친다.
// 방법: 혈관 메시를 순서대로 이은 사슬(chain)마다
//   1) 메시 주축 양 끝 중 이전 끝점(또는 기준점)에 가까운 끝에서 시작, 반대 끝 방향으로 centerline-tracer.traceCenterline
//   2) 단면 반지름이 사슬 중앙값의 RADIUS_JUMP배를 넘는 끝부분(다른 혈관·심방으로 넓어지는 입구)을 잘라낸다
//   3) 메시마다 결과를 이어 붙이고 6 mm 간격으로 줄인 뒤 object_local 점으로 만든다
//   4) checkPathGeometryAsync로 검사: 메시 밖 표본 0이면 GEOMETRY_CHECKED, 아니면 APPROXIMATE (이유를 notes에)
// 폐정맥: 메시에 폐 안 가지가 모두 들어 있어 좌심방 쪽에서 7 cm(max_length)까지만 따라간다(04-A cv.pv_to_la와 같은 방식).
// 한계: 메시 사이 이음부(서로 다른 element가 만나는 곳)는 표면이 겹치거나 틈이 있다. 해부학 검토 전이다.
import * as THREE from 'three';
import { worldTriangles, worldVertices, principalAxis, traceCenterline, resample } from '../../js/motion/centerline-tracer.js';
import { checkPathGeometryAsync } from '../../js/motion/path-geometry-check.js';

const SV = 'bp3d-cv-systemic-vessels/';
const PV = 'bp3d-cv-pulmonary-vessels/';
const RADIUS_JUMP = 1.8;
const SPACING = 0.006;

// from: 'anchor:<id>' | 'mesh:<id>' (그 메시 중심에서 먼 끝에서 시작) | [x,y,z]
const CHAINS = [
  { path_id: 'cv.pv_ri_to_la', name_ko: '폐정맥(오른아래폐정맥) → 좌심방', chain: [PV + 'right_inferior_pulmonary_vein'], from: 'anchor:a.la.cavity', reverse: true, max_length: 0.07,
    end_anchor: 'a.la.cavity', link_to: 'cv.la_to_lv', start_cp: ['cp.pv_ri_lung', 'cv.pv.right_inferior', '오른아래폐정맥 (폐 안)'], end_cp: ['cp.pv_ri_la', 'cv.left_atrium', '좌심방 도착'] },
  { path_id: 'cv.pv_ls_to_la', name_ko: '폐정맥(왼위폐정맥) → 좌심방', chain: [PV + 'left_superior_pulmonary_vein'], from: 'anchor:a.la.cavity', reverse: true, max_length: 0.07,
    end_anchor: 'a.la.cavity', link_to: 'cv.la_to_lv', start_cp: ['cp.pv_ls_lung', 'cv.pv.left_superior', '왼위폐정맥 (폐 안)'], end_cp: ['cp.pv_ls_la', 'cv.left_atrium', '좌심방 도착'] },
  { path_id: 'cv.pv_li_to_la', name_ko: '폐정맥(왼아래폐정맥) → 좌심방', chain: [PV + 'left_inferior_pulmonary_vein'], from: 'anchor:a.la.cavity', reverse: true, max_length: 0.07,
    end_anchor: 'a.la.cavity', link_to: 'cv.la_to_lv', start_cp: ['cp.pv_li_lung', 'cv.pv.left_inferior', '왼아래폐정맥 (폐 안)'], end_cp: ['cp.pv_li_la', 'cv.left_atrium', '좌심방 도착'] },
  { path_id: 'cv.arch_to_r_carotid', name_ko: '대동맥활 → 팔머리동맥 → 오른온목동맥', chain: [SV + 'brachiocephalic_artery', SV + 'right_common_carotid_artery'], from: 'mesh:bp3d-cv-aorta/aorta',
    cps: ['cv.brachiocephalic_artery', 'cv.right_common_carotid_artery'] },
  { path_id: 'cv.bca_to_r_arm', name_ko: '팔머리동맥 → 오른빗장밑동맥 → 겨드랑동맥 → 위팔동맥', chain: [SV + 'right_subclavian_artery', SV + 'right_axillary_artery', SV + 'right_brachial_artery'], from: 'mesh:' + SV + 'brachiocephalic_artery',
    cps: ['cv.right_subclavian_artery', 'cv.right_axillary_artery', 'cv.right_brachial_artery'] },
  { path_id: 'cv.arch_to_l_carotid', name_ko: '대동맥활 → 왼온목동맥', chain: [SV + 'left_common_carotid_artery'], from: 'mesh:bp3d-cv-aorta/aorta', cps: ['cv.left_common_carotid_artery'] },
  { path_id: 'cv.arch_to_l_subclavian', name_ko: '대동맥활 → 왼빗장밑동맥', chain: [SV + 'left_subclavian_artery'], from: 'mesh:bp3d-cv-aorta/aorta', cps: ['cv.left_subclavian_artery'] },
  { path_id: 'cv.aorta_to_r_leg', name_ko: '배대동맥 끝 → 오른온엉덩동맥 → 바깥엉덩동맥 → 넙다리동맥', chain: [SV + 'right_common_iliac_artery', SV + 'right_external_iliac_artery', SV + 'right_femoral_artery'], from: 'mesh:bp3d-cv-aorta/aorta',
    cps: ['cv.right_common_iliac_artery', 'cv.right_external_iliac_artery', 'cv.right_femoral_artery'] },
  { path_id: 'cv.r_arm_vein_to_svc', name_ko: '오른자쪽피부정맥 → 겨드랑정맥 → 빗장밑정맥 → 오른팔머리정맥 → 상대정맥', chain: [SV + 'right_basilic_vein', SV + 'right_axillary_vein', SV + 'right_subclavian_vein', SV + 'right_brachiocephalic_vein'],
    from: 'far:bp3d-cv-vena-cava/superior_vena_cava', link_to: 'cv.svc_to_ra',
    cps: ['cv.right_basilic_vein', 'cv.right_axillary_vein', 'cv.right_subclavian_vein', 'cv.right_brachiocephalic_vein'] },
  { path_id: 'cv.r_ij_to_svc', name_ko: '오른속목정맥 → 오른팔머리정맥 → 상대정맥', chain: [SV + 'right_internal_jugular_vein', SV + 'right_brachiocephalic_vein'], from: 'far:bp3d-cv-vena-cava/superior_vena_cava', link_to: 'cv.svc_to_ra',
    cps: ['cv.right_internal_jugular_vein', 'cv.right_brachiocephalic_vein'] },
  { path_id: 'cv.l_bcv_to_svc', name_ko: '왼팔머리정맥 → 상대정맥', chain: [SV + 'left_brachiocephalic_vein'], from: 'far:bp3d-cv-vena-cava/superior_vena_cava', link_to: 'cv.svc_to_ra', cps: ['cv.left_brachiocephalic_vein'] },
  { path_id: 'cv.r_leg_vein_to_ivc', name_ko: '오른넙다리정맥 → 바깥엉덩정맥 → 온엉덩정맥 → 하대정맥', chain: [SV + 'right_femoral_vein', SV + 'right_external_iliac_vein', SV + 'right_common_iliac_vein'],
    from: 'far:bp3d-cv-vena-cava/inferior_vena_cava', link_to: 'cv.ivc_to_ra', cps: ['cv.right_femoral_vein', 'cv.right_external_iliac_vein', 'cv.right_common_iliac_vein'] },
  { path_id: 'cv.l_iliac_vein_to_ivc', name_ko: '왼온엉덩정맥 → 하대정맥', chain: [SV + 'left_common_iliac_vein'], from: 'far:bp3d-cv-vena-cava/inferior_vena_cava', link_to: 'cv.ivc_to_ra', cps: ['cv.left_common_iliac_vein'] },
];

function meshesOf(e, id) { return e.registry.meshesOf(id); }
function centroid(e, id) {
  const v = worldVertices(meshesOf(e, id));
  const c = new THREE.Vector3();
  for (let i = 0; i < v.length; i += 3) c.x += v[i], c.y += v[i + 1], c.z += v[i + 2];
  return c.multiplyScalar(3 / v.length);
}
function nearestVertex(e, id, p) {
  const v = worldVertices(meshesOf(e, id));
  let best = null;
  let bd = Infinity;
  for (let i = 0; i < v.length; i += 3) {
    const d = (v[i] - p.x) ** 2 + (v[i + 1] - p.y) ** 2 + (v[i + 2] - p.z) ** 2;
    if (d < bd) { bd = d; best = new THREE.Vector3(v[i], v[i + 1], v[i + 2]); }
  }
  return best;
}
function axisEnds(e, id) {
  const pa = principalAxis(worldVertices(meshesOf(e, id)));
  const a = pa.center.clone().addScaledVector(pa.axis, pa.min * 0.97);
  const b = pa.center.clone().addScaledVector(pa.axis, pa.max * 0.97);
  return [a, b];
}

function traceOne(e, id, from, notes, maxLength = Infinity) {
  const [a, b] = axisEnds(e, id);
  let start = a.distanceTo(from) <= b.distanceTo(from) ? a : b;
  const other = start === a ? b : a;
  // 주축 끝점은 휜 혈관에서 내강 밖일 수 있다 → 기준점에 가장 가까운 정점 쪽으로 옮긴 뒤 시작
  const nv = nearestVertex(e, id, from);
  if (nv && nv.distanceTo(from) < start.distanceTo(from)) start = nv.clone().lerp(start, 0.15);
  const dir = other.clone().sub(start).normalize();
  const tris = worldTriangles(meshesOf(e, id));
  const r = traceCenterline({ tris, start: start.toArray(), dir: dir.toArray(), step: 0.003, maxRadius: 0.02, maxSteps: 400, minVerts: 4, smooth: 0.6, maxLength });
  notes.push(`${id.split('/')[1]}: ${r.points.length}점, ${(r.length * 100).toFixed(1)} cm, 멈춤 ${r.stop_reason}`);
  return r;
}

function trimJumps(pts, radii, notes, label) {
  if (pts.length < 6) return { pts, radii };
  const sorted = [...radii].sort((x, y) => x - y);
  const med = sorted[Math.floor(sorted.length / 2)];
  let s = 0;
  let t = pts.length;
  while (s < t - 3 && radii[s] > med * RADIUS_JUMP) s += 1;
  while (t > s + 3 && radii[t - 1] > med * RADIUS_JUMP) t -= 1;
  if (s || t < pts.length) notes.push(`${label}: 반지름이 중앙값(${(med * 1000).toFixed(1)} mm)의 ${RADIUS_JUMP}배를 넘는 끝 ${s}+${pts.length - t}점 잘라냄`);
  return { pts: pts.slice(s, t), radii: radii.slice(s, t) };
}

// Anchor 월드 좌표 (object_local이면 레지스트리 객체 기준)
function anchorWorld(e, id) {
  const a = e.anchors.get(id);
  if (!a) return null;
  const v = new THREE.Vector3(...a.position);
  if (a.coordinate_space === 'scene') return v;
  const ent = e.registry.get(a.object_id);
  if (!ent) return null;
  ent.object3D.updateWorldMatrix(true, false);
  return ent.object3D.localToWorld(v);
}

function fromPoint(e, spec) {
  const f = spec.from;
  if (Array.isArray(f)) return new THREE.Vector3(...f);
  if (f.startsWith('anchor:')) return anchorWorld(e, f.slice(7));
  const id = f.slice(f.indexOf(':') + 1);
  if (f.startsWith('mesh:')) {
    // 사슬 첫 메시의 두 끝 중 그 메시에 가까운 끝이 시작
    const [a, b] = axisEnds(e, spec.chain[0]);
    const na = nearestVertex(e, id, a).distanceTo(a);
    const nb = nearestVertex(e, id, b).distanceTo(b);
    return na <= nb ? a : b;
  }
  if (f.startsWith('far:')) {
    // 말초에서 시작: 사슬 첫 메시의 두 끝 중 그 메시(대정맥)에서 먼 끝
    const c = centroid(e, id);
    const [a, b] = axisEnds(e, spec.chain[0]);
    return a.distanceTo(c) >= b.distanceTo(c) ? a : b;
  }
  return null;
}

export async function run(e, { only = null } = {}) {
  const paths = [];
  const report = [];
  for (const spec of CHAINS) {
    if (only && !only.includes(spec.path_id)) continue;
    const notes = [];
    if (!spec.chain.every((id) => e.registry.has(id))) { report.push({ path_id: spec.path_id, error: '메시 없음: ' + spec.chain.filter((id) => !e.registry.has(id)).join(', ') }); continue; }
    let from = fromPoint(e, spec);
    if (!from) { report.push({ path_id: spec.path_id, error: '시작 기준점을 못 찾음' }); continue; }
    const segs = [];
    for (const id of spec.chain) {
      const r = traceOne(e, id, from, notes, spec.max_length || Infinity);
      const t = trimJumps(r.points, r.radii, notes, id.split('/')[1]);
      if (t.pts.length >= 2) { segs.push({ id, pts: t.pts, radii: t.radii }); from = new THREE.Vector3(...t.pts.at(-1)); }
    }
    if (!segs.length) { report.push({ path_id: spec.path_id, error: '중심선 없음', notes }); continue; }
    if (spec.reverse) { segs.reverse(); for (const s of segs) { s.pts.reverse(); s.radii.reverse(); } }
    // 메시별로 줄이고 object_local 점으로
    const points = [];
    const seg_start = [];
    let total = 0;
    for (const s of segs) {
      const rs = resample(s.pts, SPACING);
      const obj = e.registry.get(s.id).object3D;
      obj.updateWorldMatrix(true, false);
      seg_start.push(points.length);
      for (const p of rs) {
        const lp = obj.worldToLocal(new THREE.Vector3(...p));
        points.push({ space: 'object_local', object_id: s.id, position: lp.toArray().map((x) => Math.round(x * 1e6) / 1e6) });
      }
    }
    if (spec.end_anchor) points.push({ anchor_id: spec.end_anchor });
    const def = { path_id: spec.path_id, name_ko: spec.name_ko, curve_type: 'catmull_rom', points, default_speed: 0.02, checkpoints: [], verification_status: 'APPROXIMATE' };
    if (spec.link_to) def.links = [{ to: spec.link_to }];
    if (e.kit.paths.has(spec.path_id)) e.kit.paths.remove(spec.path_id);
    e.kit.paths.create(def);
    total = e.kit.paths.length(spec.path_id);
    // Checkpoint: 시작·각 메시 시작·끝
    const cps = [];
    if (spec.start_cp) cps.push({ checkpoint_id: spec.start_cp[0], path_progress: 0, stop_on_arrival: false, anatomical_id: spec.start_cp[1], label: spec.start_cp[2], event_ids: [] });
    if (spec.cps) {
      let acc = 0;
      const lens = segs.map((s) => { let l = 0; for (let i = 1; i < s.pts.length; i += 1) l += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1], s.pts[i][2] - s.pts[i - 1][2]); return l; });
      const sum = lens.reduce((x, y) => x + y, 0) || 1;
      spec.cps.forEach((aid, i) => {
        cps.push({ checkpoint_id: 'cp.' + aid.replace('cv.', ''), path_progress: Math.round((acc / sum) * 1000) / 1000, stop_on_arrival: false, anatomical_id: aid, label: e.anatomy.get(aid) ? e.anatomy.get(aid).ko : aid, event_ids: [] });
        acc += lens[i] || 0;
      });
      cps.at(-1).stop_on_arrival = !spec.link_to;
    }
    if (spec.end_cp) cps.push({ checkpoint_id: spec.end_cp[0], path_progress: 1, stop_on_arrival: true, anatomical_id: spec.end_cp[1], label: spec.end_cp[2], event_ids: [] });
    def.checkpoints = cps;
    e.kit.paths.remove(spec.path_id);
    e.kit.paths.create(def);
    const chk = await checkPathGeometryAsync({ paths: e.kit.paths, registry: e.registry, pathId: spec.path_id, samples: 80, radius: 0.03 });
    const gc = {
      date: new Date().toISOString().slice(0, 10), samples: chk.samples, outside_ratio: Math.round(chk.outside_ratio * 1000) / 1000,
      enclosed_ratio: Math.round(chk.enclosed_ratio * 1000) / 1000, surface_crossings: chk.crossings,
      min_clearance_mm: Number.isFinite(chk.min_clearance_m) ? Math.round(chk.min_clearance_m * 100000) / 100 : null,
      length_m: Math.round(e.kit.paths.length(spec.path_id) * 10000) / 10000,
      outside_at: chk.flagged.map((f) => Math.round(f.progress * 1000) / 1000),
      runs: chk.runs.map((r) => `${r.from.toFixed(2)}:${r.inside}`),
      note: '표면 메시 기하 근거일 뿐 해부학적 내강 검증이 아니다',
    };
    def.verification_status = chk.outside_ratio === 0 ? 'GEOMETRY_CHECKED' : 'APPROXIMATE';
    def.method = 'centerline chain: ' + segs.map((s) => s.id.split('/')[1]).join(' → ') + (spec.reverse ? ' (traced from atrial end, reversed)' : '');
    def.geometry_check = gc;
    def.source = 'BodyParts3D 4.0 (CC BY 4.0) 메시 단면에서 계산';
    def.notes = notes.join(' / ') + (def.verification_status === 'APPROXIMATE' ? ` / 메시 밖 표본 ${chk.flagged.length}개(진행 ${gc.outside_at.slice(0, 6).join(', ')}…) — 이음부·끝부분. 그래서 APPROXIMATE` : '');
    paths.push(def);
    report.push({ path_id: spec.path_id, status: def.verification_status, length_cm: Math.round(total * 1000) / 10, outside: gc.outside_ratio, enclosed: gc.enclosed_ratio, notes: def.notes });
  }
  return { paths, report };
}
