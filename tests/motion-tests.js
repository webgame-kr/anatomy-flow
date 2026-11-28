// STEP 03-C 이동 엔진 브라우저 테스트 (렌더링 루프와 분리된 독립 인스턴스로 dt를 직접 넣어 검사)
// 실행: 로컬 서버에서 Sandbox를 연 뒤 개발자 도구 콘솔에서
//   const t = await import('./tests/motion-tests.js'); await t.run();
// 또는 tests/motion-tests.html을 연다.

import * as THREE from 'three';
import { createResourceTracker } from '../js/engine/resource-tracker.js';
import { createRegistry } from '../js/engine/object-registry.js';
import { createMaterialController } from '../js/engine/material-controller.js';
import { createPathEngine } from '../js/motion/path-engine.js';
import { createActorManager } from '../js/motion/actor-manager.js';
import { createMotionController } from '../js/motion/motion-controller.js';
import { createMotionCommands } from '../js/motion/motion-commands.js';
import { createCommandRunner } from '../js/engine/command-runner.js';

function rig() {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  const tracker = createResourceTracker();
  const registry = createRegistry(world, tracker);
  const materials = createMaterialController({ registry });
  const paths = createPathEngine({ scene, registry });
  const actors = createActorManager({ registry, tracker, materials });
  const motion = createMotionController({ paths, actors });
  const fakeCam = { followTarget: null, startFollow: (id) => { fakeCam.followTarget = id; return true; }, stopFollow: () => { fakeCam.followTarget = null; } };
  const commands = createMotionCommands({ paths, actors, motion, camera: fakeCam });
  const runner = createCommandRunner({ whenSettled: () => Promise.resolve() }, { registry, materials, camera: fakeCam, motion: commands });
  return { scene, world, tracker, registry, materials, paths, actors, motion, commands, runner, fakeCam };
}

const CURVE = {
  path_id: 'p.curve', curve_type: 'catmull_rom', points: [
    { space: 'scene', position: [-3, 0.4, 1.2] }, { space: 'scene', position: [-1.5, 0.4, 2.6] },
    { space: 'scene', position: [-0.2, 0.4, 1.0] }, { space: 'scene', position: [0.4, 2.2, 1.0] },
    { space: 'scene', position: [1.2, 0.4, 1.05] }, { space: 'scene', position: [3, 0.4, 2.4] }],
};

const CP_PATH = {
  path_id: 'path_001', points: [
    { space: 'scene', position: [-3.5, 0.5, 0] }, { space: 'scene', position: [-1.8, 1.4, -1.2] }, { space: 'scene', position: [0, 0.5, 0] },
    { space: 'scene', position: [1.8, 1.4, 1.2] }, { space: 'scene', position: [3.5, 0.5, 0] }],
  checkpoints: [
    { checkpoint_id: 'checkpoint_01', path_progress: 0.2, stop_on_arrival: true },
    { checkpoint_id: 'checkpoint_pass', path_progress: 0.35, stop_on_arrival: false },
    { checkpoint_id: 'checkpoint_02', path_progress: 0.5, stop_on_arrival: true },
    { checkpoint_id: 'checkpoint_back', path_progress: 0.65, stop_on_arrival: false, trigger: 'backward' },
    { checkpoint_id: 'checkpoint_03', path_progress: 0.8, stop_on_arrival: true },
  ],
};

// 정해진 dt 목록으로 끝날 때까지 돌린다 → 걸린 시간, 프레임 수
function runUntil(r, id, dts, maxFrames = 200000) {
  const a = r.actors.get(id);
  let t = 0;
  let f = 0;
  while (a.movement_state === 'moving' && f < maxFrames) {
    const dt = typeof dts === 'function' ? dts(f) : dts;
    r.motion.tick(dt);
    t += dt;
    f += 1;
  }
  return { t, f };
}

export async function run({ log = console.log } = {}) {
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

  // 1. 호 길이 기반 일정 속도
  {
    const r = rig();
    r.paths.load({ paths: [CURVE] });
    r.actors.create({ actor_id: 'a', actor_type: 'custom', speed: 1 });
    r.motion.setPath('a', 'p.curve');
    r.motion.move('a', { until: 'end' });
    const a = r.actors.get('a');
    const prev = new THREE.Vector3().copy(a.object3D.position);
    const steps = [];
    while (a.movement_state === 'moving') {
      r.motion.tick(1 / 60);
      steps.push(a.object3D.position.distanceTo(prev));
      prev.copy(a.object3D.position);
    }
    const inner = steps.slice(1, -1);
    const min = Math.min(...inner);
    const max = Math.max(...inner);
    // 비교: 매개변수 t를 선형 증가시켰을 때의 프레임 이동량 편차
    const c = r.paths.cache('p.curve').curve;
    const n = steps.length;
    const raw = [];
    for (let i = 1; i < n; i += 1) raw.push(c.getPoint(i / n).distanceTo(c.getPoint((i - 1) / n)));
    const rawRatio = Math.max(...raw) / Math.min(...raw);
    check('곡선 구간별 속도 일정 (호 길이 기반)', max / min < 1.05, `프레임당 이동 최대/최소 ${(max / min).toFixed(4)} · 비교: 매개변수 선형 증가 ${rawRatio.toFixed(2)}`);
  }

  // 2. 프레임 속도와 무관한 이동 시간
  {
    const out = [];
    for (const [label, dts] of [['30fps', 1 / 30], ['60fps', 1 / 60], ['144fps', 1 / 144], ['불규칙 5~100ms', (f) => 0.005 + ((f * 7919) % 96) / 1000]]) {
      const r = rig();
      r.paths.load({ paths: [CURVE] });
      r.actors.create({ actor_id: 'a', actor_type: 'custom', speed: 2 });
      r.motion.setPath('a', 'p.curve');
      r.motion.move('a', { until: 'end' });
      const { t, f } = runUntil(r, 'a', dts);
      out.push({ label, t, f });
    }
    const len = 10.4928;
    const expect = len / 2;
    const worst = Math.max(...out.map((o) => Math.abs(o.t - expect)));
    check('프레임 속도와 무관한 전체 이동 시간', worst < 0.11, out.map((o) => `${o.label} ${o.t.toFixed(3)}s/${o.f}프레임`).join(', ') + ` · 기대 ${expect.toFixed(3)}s`);
  }

  // 3. Checkpoint: 큰 이동량에서도 건너뛰지 않고 정확히 정지, 이벤트 순서·방향
  {
    const r = rig();
    r.paths.load({ paths: [CP_PATH] });
    r.actors.create({ actor_id: 'rbc', actor_type: 'red_blood_cell', speed: 80 });   // dt 0.1이면 한 프레임 8 m (경로 전체보다 김)
    r.motion.setPath('rbc', 'path_001');
    const evs = [];
    r.motion.onEvent((k, e) => { if (k === 'checkpoint') evs.push(`${e.checkpoint_id}:${e.direction}`); });
    const L = r.paths.length('path_001');
    const stops = [];
    let res = null;
    for (let i = 0; i < 4; i += 1) {
      const c = r.motion.next('rbc');
      runUntil(r, 'rbc', 0.1);
      res = await c.promise;
      stops.push(`${res.status}:${res.checkpoint_id || '-'}@${(r.actors.get('rbc').distance / L).toFixed(4)}`);
    }
    const okStops = stops[0] === 'arrived:checkpoint_01@0.2000' && stops[1] === 'arrived:checkpoint_02@0.5000' && stops[2] === 'arrived:checkpoint_03@0.8000' && stops[3].startsWith('completed');
    check('큰 dt(한 프레임 8 m)에서도 정지 Checkpoint를 건너뛰지 않음', okStops, stops.join(' → '));
    check('통과 Checkpoint 이벤트, 역방향 전용은 정방향에서 무시', evs.join(',') === 'checkpoint_01:forward,checkpoint_pass:forward,checkpoint_02:forward,checkpoint_03:forward', evs.join(','));
    // 역방향
    evs.length = 0;
    r.motion.reverse('rbc');
    r.motion.move('rbc', { until: 'end', pass_stops: true });
    runUntil(r, 'rbc', 0.1);
    check('역방향 이벤트 구분 (역방향 전용 CP 실행)', evs.join(',') === 'checkpoint_03:backward,checkpoint_back:backward,checkpoint_02:backward,checkpoint_pass:backward,checkpoint_01:backward', evs.join(','));
    // 같은 바퀴·방향에서는 반복 실행하지 않음
    evs.length = 0;
    r.motion.seek('rbc', 0.3);
    r.motion.move('rbc', { until: 'end', pass_stops: true });
    runUntil(r, 'rbc', 0.1);
    check('같은 Checkpoint 이벤트 중복 실행 방지', evs.length === 0, `seek 후 다시 역방향 이동 이벤트 ${evs.length}개`);
    r.motion.reset('rbc');
    r.motion.move('rbc', { until: 'end', pass_stops: true });
    runUntil(r, 'rbc', 0.016);
    check('reset 후 Checkpoint 다시 활성화', evs.length === 4, `정방향 재실행 이벤트 ${evs.length}개 (역방향 전용 제외)`);
  }

  // 4. 일시정지·재개
  {
    const r = rig();
    r.paths.load({ paths: [CURVE] });
    r.actors.create({ actor_id: 'a', actor_type: 'custom', speed: 1 });
    r.motion.setPath('a', 'p.curve');
    const c = r.motion.move('a', { until: 'end' });
    for (let i = 0; i < 60; i += 1) r.motion.tick(1 / 60);
    const d1 = r.actors.get('a').distance;
    r.motion.pause('a');
    for (let i = 0; i < 120; i += 1) r.motion.tick(1 / 60);
    const d2 = r.actors.get('a').distance;
    r.motion.resume('a');
    for (let i = 0; i < 60; i += 1) r.motion.tick(1 / 60);
    const d3 = r.actors.get('a').distance;
    check('일시정지 중 정지, 재개 후 이어서 이동', Math.abs(d1 - 1) < 1e-6 && d2 === d1 && Math.abs(d3 - 2) < 1e-6, `1초 ${d1.toFixed(4)} m → 정지 2초 ${d2.toFixed(4)} m → 재개 1초 ${d3.toFixed(4)} m`);
    r.motion.stop('a');
    const res = await c.promise;
    check('정지 명령 → cancelled 결과', res.status === 'cancelled', JSON.stringify({ status: res.status, reason: res.reason }));
  }

  // 5. 회전: 접선 방향, 급커브에서 뒤집힘 없음
  {
    const r = rig();
    r.paths.load({ paths: [CURVE] });
    r.actors.create({ actor_id: 'a', actor_type: 'custom', speed: 1 });
    r.motion.setPath('a', 'p.curve');
    r.motion.move('a', { until: 'end' });
    const a = r.actors.get('a');
    let worstAngle = 0;
    let minDot = 1;
    const prevQ = new THREE.Quaternion();
    const fwd = new THREE.Vector3();
    const tan = new THREE.Vector3();
    let first = true;
    while (a.movement_state === 'moving') {
      r.motion.tick(1 / 60);
      const q = a.m.quat;
      fwd.set(0, 0, 1).applyQuaternion(q);
      r.paths.tangentAt('p.curve', a.distance, tan);
      worstAngle = Math.max(worstAngle, fwd.angleTo(tan));
      if (!first) minDot = Math.min(minDot, Math.abs(prevQ.dot(q)));
      prevQ.copy(q);
      first = false;
    }
    check('Actor 앞쪽이 경로 접선을 따름', worstAngle < 0.01, `최대 오차 ${(worstAngle * 180 / Math.PI).toFixed(3)}°`);
    const maxDeg = 2 * Math.acos(Math.min(1, minDot)) * 180 / Math.PI;
    check('프레임 사이 회전 뒤집힘 없음', minDot > 0.9, `한 프레임 최대 회전 ${maxDeg.toFixed(1)}° (급커브 꼭짓점, 1.7 cm 이동) · 180° 뒤집힘이면 내적≈0`);
  }

  // 6. 분기·순환·종료 조건, 경로 전환
  {
    const r = rig();
    r.paths.load({ paths: [
      { path_id: 'trunk', points: [{ position: [0, 0, 0] }, { position: [1, 0, 0] }], curve_type: 'linear', links: [{ to: 'left', when: 'left' }, { to: 'right', when: 'right' }] },
      { path_id: 'left', points: [{ position: [1, 0, 0] }, { position: [2, 0, -1] }], curve_type: 'linear', links: [{ to: 'loop' }] },
      { path_id: 'right', points: [{ position: [1, 0, 0] }, { position: [2, 0, 1] }], curve_type: 'linear' },
      { path_id: 'loop', closed: true, points: [{ position: [2, 0, -1] }, { position: [3, 0, -1] }, { position: [3, 0, -2] }, { position: [2, 0, -2] }], curve_type: 'linear', checkpoints: [{ checkpoint_id: 'gate', path_progress: 0.5 }] },
    ] });
    const v = r.paths.validateAll();
    check('연결 경로 기술 검증 통과', v.errors.length === 0 && v.warnings.length === 0, JSON.stringify(v));
    r.actors.create({ actor_id: 'L', actor_type: 'red_blood_cell', speed: 1, biological_state: { branch: 'left' } });
    r.actors.create({ actor_id: 'R', actor_type: 'red_blood_cell', speed: 1, biological_state: { branch: 'right' } });
    const sw = [];
    let gates = 0;
    r.motion.onEvent((k, e) => { if (k === 'path_switch') sw.push(`${e.actor_id}:${e.from}>${e.to}`); if (k === 'checkpoint' && e.checkpoint_id === 'gate') gates += 1; });
    r.motion.setPath('L', 'trunk');
    r.motion.setPath('R', 'trunk');
    const cl = r.motion.move('L', { until: 'end', loops: 3 });
    const cr = r.motion.move('R', { until: 'end' });
    for (let i = 0; i < 2000 && (r.actors.get('L').movement_state === 'moving' || r.actors.get('R').movement_state === 'moving'); i += 1) r.motion.tick(1 / 30);
    check('분기: 상태값으로 다른 가지 선택', sw.includes('L:trunk>left') && sw.includes('R:trunk>right'), sw.join(', '));
    check('순환: 지정 바퀴 수(3) 뒤 완료, 관문 이벤트 바퀴마다 1회', (await cl.promise).status === 'completed' && gates === 3 && r.actors.get('L').path_id === 'loop', `L ${r.actors.get('L').movement_state}, 관문 ${gates}회`);
    check('끝 경로에서 완료', (await cr.promise).status === 'completed' && r.actors.get('R').path_id === 'right', r.actors.get('R').path_id);
  }

  // 7. 여러 Actor 독립 제어 + 리소스 공유와 해제
  {
    const r = rig();
    r.paths.load({ paths: [CURVE] });
    for (let i = 0; i < 50; i += 1) {
      r.actors.create({ actor_id: `rbc_${i}`, actor_type: 'red_blood_cell', speed: 0.5 + (i % 5) * 0.3, biological_state: { oxygenation: i % 2 ? 'oxygenated' : 'deoxygenated' } });
      r.motion.setPath(`rbc_${i}`, 'p.curve');
      r.motion.move(`rbc_${i}`, { until: 'end' });
    }
    r.motion.pause('rbc_3');
    for (let i = 0; i < 60; i += 1) r.motion.tick(1 / 60);
    const d = (id) => r.actors.get(id).distance;
    const st = r.tracker.stats();
    check('Actor별 속도·정지 독립', Math.abs(d('rbc_0') - 0.5) < 1e-6 && Math.abs(d('rbc_1') - 0.8) < 1e-6 && d('rbc_3') === 0, `rbc_0 ${d('rbc_0').toFixed(3)} m, rbc_1 ${d('rbc_1').toFixed(3)} m, rbc_3(일시정지) ${d('rbc_3')} m`);
    check('50개 Actor가 Geometry 1개·Material 2개 공유', st.geometries === 1 && st.materials === 2, JSON.stringify(st));
    r.actors.setBiologicalState('rbc_0', { oxygenation: 'oxygenated' });
    check('산소화 상태 변경 → 공유 재질 교체', r.actors.get('rbc_0').object3D.material === r.actors.get('rbc_1').object3D.material);
    r.actors.clear();
    const st2 = r.tracker.stats();
    check('Actor 전부 제거 후 공유 리소스 해제', st2.geometries === 0 && st2.materials === 0 && r.registry.size === 0, JSON.stringify(st2));
  }

  // 8. 명령 검증과 session
  {
    const r = rig();
    r.paths.load({ paths: [CP_PATH] });
    const s = await r.runner.run([
      { action: 'actor_create', target: 'rbc_01', value: { actor_type: 'red_blood_cell', path_id: 'path_001' } },
      { action: 'actor_set_path', target: 'rbc_01', path_id: 'path_001' },
      { action: 'actor_move_to_checkpoint', target: 'rbc_01', checkpoint_id: 'checkpoint_02', duration: 2000 },
      { action: 'actor_move', target: 'ghost' },
      { action: 'actor_set_path', target: 'rbc_01', path_id: 'nope' },
      { action: 'actor_move_to_checkpoint', target: 'rbc_01', checkpoint_id: 'nope' },
      { action: 'actor_seek', target: 'rbc_01', value: 3 },
      { action: 'path_show', target: 'nope' },
      { action: 'camera_follow', target: 'rbc_01' },
    ]);
    check('JS 명령 검증: 정상 4 / 오류 5, 실행 계속', s.applied === 4 && s.failed === 5, `applied ${s.applied}, failed ${s.failed}`);
    // duration 2000ms → 2초에 도착
    const { t } = runUntil(r, 'rbc_01', 1 / 60);
    check('duration 지정 이동 시간 (중간 정지 CP는 이벤트만 실행하고 통과)', Math.abs(t - 2) < 0.02 && r.actors.get('rbc_01').m.fired.has('checkpoint_01|0|forward'), `${t.toFixed(3)}s`);
    // session: 장면 전환 후 이전 session 명령 거부, 진행 중 명령 cancelled
    r.motion.setPath('rbc_01', 'path_001');
    const c = r.motion.move('rbc_01', { until: 'end' });
    const old = r.motion.session;
    r.motion.cancelAll('scene_change');
    const res = await c.promise;
    const s2 = await r.runner.run([{ action: 'actor_move', target: 'rbc_01', session: old }]);
    check('초기화·장면 전환: 진행 중 이동 cancelled, 이전 session 명령 거부', res.status === 'cancelled' && s2.failed === 1, `${res.status} · ${s2.errors[0] || ''}`);
    // wait: 결과를 기다린 뒤 다음 명령 실행 (렌더링 대신 타이머로 tick)
    const timer = setInterval(() => r.motion.tick(0.05), 5);
    const w = await r.runner.run([
      { action: 'actor_set_path', target: 'rbc_01', path_id: 'path_001', session: r.motion.session },
      { action: 'actor_move', target: 'rbc_01', until: 'next_stop', speed: 20, wait: true },
      { action: 'actor_set_speed', target: 'rbc_01', value: 3 },
    ]);
    clearInterval(timer);
    const o = w.results[1] && w.results[1].outcome;
    check('wait 명령: 도착 결과를 받은 뒤 다음 명령 실행', o && o.status === 'arrived' && o.checkpoint_id === 'checkpoint_01' && w.applied === 3 && r.actors.get('rbc_01').speed === 3, JSON.stringify(o));
  }

  // 9. 객체 로컬 좌표 경로: 부모 객체 이동·회전 반영
  {
    const r = rig();
    const g = new THREE.Group();
    r.registry.attach(g, null);
    r.registry.register(g, { id: 'turntable', type: 'group' });
    r.paths.load({ paths: [{ path_id: 'p.local', closed: true, points: [
      { space: 'object_local', object_id: 'turntable', position: [1, 0, 0] }, { space: 'object_local', object_id: 'turntable', position: [0, 0, 1] },
      { space: 'object_local', object_id: 'turntable', position: [-1, 0, 0] }, { space: 'object_local', object_id: 'turntable', position: [0, 0, -1] }] }] });
    const p0 = r.paths.pointAt('p.local', 0).clone();
    g.position.set(5, 0, 0);
    g.rotation.y = Math.PI / 2;
    g.updateMatrixWorld(true);
    r.paths.tick();
    const p1 = r.paths.pointAt('p.local', 0).clone();
    const expect = new THREE.Vector3(1, 0, 0).applyMatrix4(g.matrixWorld);
    check('객체 로컬 경로가 부모 이동·회전을 따라감', p1.distanceTo(expect) < 1e-9 && p0.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-9, `${p0.toArray().map((n) => n.toFixed(3))} → ${p1.toArray().map((n) => n.toFixed(3))}`);
  }

  // 10. 경로 데이터 검증 (기술)
  {
    const r = rig();
    const bad = r.paths.validateDoc({ paths: [{ path_id: 'x', points: [{ position: [0, NaN, 0] }] }, { path_id: 'x', points: [] }, { points: [] }] });
    check('형식 검증: NaN, ID 중복, 필수 항목', !bad.ok && bad.errors.length === 3, bad.errors.join(' / '));
    r.paths.load({ paths: [{ path_id: 'zero', points: [{ position: [1, 1, 1] }, { position: [1, 1, 1] }], checkpoints: [{ checkpoint_id: 'c', path_progress: 1.5 }], links: [{ to: 'nowhere' }] }] });
    const v = r.paths.validatePath('zero');
    check('기술 검증: 길이 0, 진행률 범위, 없는 연결', v.errors.length === 3, v.errors.join(' / '));
    // Waypoint 편집 → 길이 캐시 갱신
    r.paths.load({ paths: [{ path_id: 'w', curve_type: 'linear', points: [{ position: [0, 0, 0] }, { position: [2, 0, 0] }] }] });
    const l0 = r.paths.length('w');
    r.paths.insertPoint('w', 1, { space: 'scene', position: [1, 1, 0] });
    const l1 = r.paths.length('w');
    r.paths.movePoint('w', 1, 1);
    const order = r.paths.get('w').points.map((p) => p.position.join(',')).join(' | ');
    r.paths.removePoint('w', 2);
    const l2 = r.paths.length('w');
    check('Waypoint 삽입·순서 변경·삭제 시 길이 캐시 갱신', Math.abs(l0 - 2) < 1e-9 && Math.abs(l1 - 2 * Math.SQRT2) < 1e-9 && Math.abs(l2 - 2) < 1e-9, `${l0.toFixed(3)} → ${l1.toFixed(3)} → 순서 [${order}] → ${l2.toFixed(3)}`);
    // JSON 왕복
    const json = r.paths.exportJson('t');
    const r2 = rig();
    r2.paths.load(JSON.parse(json));
    check('경로 JSON 내보내기 → 불러오기 동일', JSON.stringify(r2.paths.get('w').points) === JSON.stringify(r.paths.get('w').points) && r2.paths.length('w') === l2);
  }

  const passed = results.filter((x) => x.ok).length;
  log(`결과: ${passed}/${results.length} 통과`);
  return { passed, total: results.length, results };
}
