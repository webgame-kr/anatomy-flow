// STEP 04-B 애니메이션 엔진 브라우저 테스트 (렌더링 루프와 분리된 독립 인스턴스, dt를 직접 넣는다)
// 실행: 로컬 서버에서 /tests/animation-tests.html

import * as THREE from 'three';
import { createResourceTracker } from '../js/engine/resource-tracker.js';
import { createRegistry } from '../js/engine/object-registry.js';
import { createMaterialController } from '../js/engine/material-controller.js';
import { createCommandRunner } from '../js/engine/command-runner.js';
import { createPathEngine } from '../js/motion/path-engine.js';
import { createActorManager } from '../js/motion/actor-manager.js';
import { createMotionController } from '../js/motion/motion-controller.js';
import { createMotionCommands } from '../js/motion/motion-commands.js';
import { createAnimationKit } from '../js/animation/animation-kit.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const fakeCam = { followTarget: null, startFollow() { return true; }, stopFollow() {} };
  const mcmd = createMotionCommands({ paths, actors, motion, camera: fakeCam });
  const kit = createAnimationKit({ scene, registry, tracker, materials });
  const runner = createCommandRunner({ whenSettled: () => Promise.resolve() }, { registry, materials, camera: fakeCam, motion: mcmd, animation: kit.commands });
  kit.setRunner(runner);
  paths.setVertexResolver((m, i) => kit.morph.deformedVertex(m, i));
  // 시간 진행기: 실제 시간 대신 5 ms마다 1/30초씩 (테스트 속도·결정성)
  let timer = null;
  const drive = (on = true) => { clearInterval(timer); if (on) timer = setInterval(() => { kit.tick(1 / 30); motion.tick(1 / 30); paths.tick(); }, 4); };
  return { scene, world, tracker, registry, materials, paths, actors, motion, kit, runner, drive };
}

function addBox(r, id, pos = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#888888' }));
  m.position.fromArray(pos);
  r.registry.attach(m, null);
  r.registry.register(m, { id, type: 'mesh' });
  r.tracker.retain(m);
  return m;
}

export async function run({ log = console.log } = {}) {
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

  // 1. Transform Keyframe: 중간값, 일시정지, 재개, 완료, 복원
  {
    const r = rig();
    const box = addBox(r, 'box');
    const A = r.kit.anim;
    A.define({ animation_id: 'mv', target_id: 'box', animation_type: 'transform', duration_ms: 1000, keyframes: [{ time: 0, value: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 } }, { time: 1, value: { position: [0, 2, 0], rotation: [0, 90, 0], scale: 2 } }] });
    const h = A.play('mv');
    for (let i = 0; i < 2; i += 1) r.kit.tick(0.25);
    const mid = box.position.y;
    A.pause('mv');
    r.kit.tick(0.25);
    const paused = box.position.y === mid;
    A.resume('mv');
    for (let i = 0; i < 3; i += 1) r.kit.tick(0.25);
    const res = await h.promise;
    check('Transform: 중간값 보간, 일시정지 중 정지, 재개 후 완료', Math.abs(mid - 1) < 1e-6 && paused && res.status === 'completed' && Math.abs(box.position.y - 2) < 1e-6 && Math.abs(box.scale.x - 2) < 1e-6 && Math.abs(THREE.MathUtils.radToDeg(box.rotation.y) - 90) < 1e-4,
      `0.5초 y=${mid.toFixed(3)}, 끝 y=${box.position.y.toFixed(3)} scale=${box.scale.x}`);
    // 역방향·구간 이동·속도
    box.position.set(0, 0, 0);
    const h2 = A.play('mv', { direction: -1, speed: 2 });
    r.kit.tick(0.25);
    const rev = box.position.y;
    A.seek('mv', 0.25);
    const seeked = box.position.y;
    A.stop('mv');
    const rs = await h2.promise;
    check('역방향·속도 2배·구간 이동·정지 시 복원', Math.abs(rev - 1) < 1e-6 && Math.abs(seeked - 0.5) < 1e-6 && rs.status === 'cancelled' && box.position.y === 0,
      `역방향 0.25초(2배) y=${rev}, seek 0.25 → ${seeked}, 정지 후 y=${box.position.y}`);
  }

  // 2. 반복·누적 방지·대상 삭제·cancelAll session
  {
    const r = rig();
    addBox(r, 'b1');
    const A = r.kit.anim;
    A.define({ animation_id: 'loop', target_id: 'b1', animation_type: 'transform', duration_ms: 200, loop: 2, keyframes: [{ time: 0, value: { position: [0, 0, 0] } }, { time: 1, value: { position: [1, 0, 0] } }] });
    const events = [];
    A.onEvent((k, d) => events.push(`${k}:${d.animation_id || ''}`));
    const h = A.play('loop');
    for (let i = 0; i < 20 && A.isPlaying('loop'); i += 1) r.kit.tick(0.05);
    const res = await h.promise;
    const loops = events.filter((x) => x.startsWith('loop:')).length;
    check('반복 2회 추가 후 완료 (총 3번 재생)', res.status === 'completed' && loops === 2, `loop 이벤트 ${loops}`);
    const h1 = A.play('loop', { loop: true });
    const h2 = A.play('loop', { loop: true });
    const r1 = await h1.promise;
    check('같은 애니메이션 다시 재생 → 이전 재생 replaced (누적 없음)', r1.status === 'cancelled' && r1.reason === 'replaced' && A.playingIds().length === 1);
    r.registry.unregister('b1');
    r.kit.tick(0.05);
    const r2 = await h2.promise;
    check('재생 중 대상 객체 삭제 → failed, 다음 프레임 오류 없음', r2.status === 'failed' && /사라짐/.test(r2.reason), r2.reason);
    addBox(r, 'b2');
    A.define({ animation_id: 'l2', target_id: 'b2', animation_type: 'transform', duration_ms: 500, loop: true, keyframes: [{ time: 0, value: { position: [0, 0, 0] } }, { time: 1, value: { position: [0, 1, 0] } }] });
    const h3 = A.play('l2');
    const s0 = A.session;
    A.cancelAll('scene_change');
    const r3 = await h3.promise;
    check('cancelAll: 진행 중 취소, session 증가', r3.status === 'cancelled' && A.session === s0 + 1 && r3.session === s0);
  }

  // 3. AnimationClip (코드로 만든 클립 = GLB 클립과 같은 경로): Mixer 하나, 시간 직접 지정
  {
    const r = rig();
    const g = new THREE.Group();
    g.name = 'clipRoot';
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    m.name = 'mover';
    g.add(m);
    r.registry.attach(g, null);
    r.registry.registerModel(g, { assetId: 'clipmodel' });
    const track = new THREE.VectorKeyframeTrack('mover.position', [0, 1], [0, 0, 0, 0, 4, 0]);
    const clip = new THREE.AnimationClip('Rise', 1, [track]);
    const n = r.kit.registerClips('clipmodel', g, [clip]);
    r.kit.registerClips('clipmodel', g, [clip]);
    const A = r.kit.anim;
    A.define({ animation_id: 'rise', target_id: 'clipmodel', animation_type: 'clip', clip_name: 'Rise' });
    const h = A.play('rise');
    r.kit.tick(0.25); r.kit.tick(0.25);
    const mid = m.position.y;
    A.seek('rise', 0.75);
    const seek = m.position.y;
    for (let i = 0; i < 4; i += 1) r.kit.tick(0.25);
    const res = await h.promise;
    check('AnimationClip: 자동 인식, 모델당 Mixer 1개, 재생·구간 이동·완료', n === 1 && A.mixerCount === 1 && Math.abs(mid - 2) < 1e-6 && Math.abs(seek - 3) < 1e-6 && res.status === 'completed',
      `0.5초 y=${mid}, seek 0.75 → ${seek}`);
    A.unload();
    check('장면 정리: Mixer 해제', A.mixerCount === 0);
  }

  // 4. Morph: 가중치, 혼합, 복원, 변형된 정점 위치와 mesh_vertex 경로
  {
    const r = rig();
    r.kit.apply({ groups: [{ group_id: 'g', objects: [{ id: 'blob', shape: 'ellipsoid', radius: [1, 1, 1], center: [0, 0, 0], morphs: { shrink: { scale: [0.5, 0.5, 0.5] }, tall: { scale: [1, 2, 1] } } }] }],
      animations: [{ animation_id: 'mix', target_id: 'blob', animation_type: 'morph', duration_ms: 1000, keyframes: [{ time: 0, value: { shrink: 0, tall: 0 } }, { time: 1, value: { shrink: 1, tall: 0 } }] }] });
    const M = r.kit.morph;
    const mesh = r.registry.get('blob').object3D;
    let top = -1;
    let topY = -Infinity;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) if (pos.getY(i) > topY) { topY = pos.getY(i); top = i; }
    const y0 = M.deformedVertex(mesh, top).y;
    M.set('blob', 'shrink', 1);
    const y1 = M.deformedVertex(mesh, top).y;
    M.set('blob', 'tall', 1);
    const y2 = M.deformedVertex(mesh, top).y;
    M.restore('blob');
    check('Morph 가중치·혼합·복원과 변형된 정점 위치', Math.abs(y0 - 1) < 1e-6 && Math.abs(y1 - 0.5) < 1e-6 && Math.abs(y2 - 1.5) < 1e-6 && mesh.morphTargetInfluences.every((w) => w === 0),
      `꼭대기 y: 기준 ${y0.toFixed(3)}, shrink ${y1.toFixed(3)}, shrink+tall ${y2.toFixed(3)}`);
    r.paths.load({ paths: [{ path_id: 'pv', curve_type: 'linear', points: [{ space: 'scene', position: [0, 3, 0] }, { space: 'mesh_vertex', object_id: 'blob', vertex_index: top }] },
      { path_id: 'pl', curve_type: 'linear', points: [{ space: 'scene', position: [0, 3, 0] }, { space: 'object_local', object_id: 'blob', position: [0, 1, 0] }] }] });
    const l0 = r.paths.length('pv');
    const h = r.kit.anim.play('mix');
    for (let i = 0; i < 5; i += 1) r.kit.tick(0.25);
    await h.promise;
    r.paths.tick();
    const l1 = r.paths.length('pv');
    const ll = r.paths.length('pl');
    check('mesh_vertex 경로 점은 Morph 변형을 따라가고, object_local 점은 따라가지 않음', Math.abs(l0 - 2) < 1e-6 && Math.abs(l1 - 2.5) < 1e-4 && Math.abs(ll - 2) < 1e-6,
      `정점 경로 ${l0.toFixed(3)} → ${l1.toFixed(3)} m, 로컬 경로 ${ll.toFixed(3)} m`);
    const v = r.paths.validatePath('pv');
    check('mesh_vertex 점 검증 (vertex_index 필요)', v.errors.length === 0 && r.paths.validateDoc({ paths: [{ path_id: 'x', points: [{ space: 'mesh_vertex', object_id: 'blob' }, { space: 'scene', position: [0, 0, 0] }] }] }).ok);
  }

  // 5. 혈관 변형: 중심선·길이 유지, 상태 전환, 혈관 안 Actor 경로 불변
  {
    const r = rig();
    const pts = [[-1, 0, 0], [0, 0.3, 0], [1, 0, 0]];
    r.kit.apply({ groups: [{ group_id: 'v', objects: [{ id: 'ves', shape: 'tube', points: pts, radius: 0.2 }] }],
      animations: [{ animation_id: 'con', target_id: 'ves', animation_type: 'deform', duration_ms: 400, keyframes: [{ time: 0, value: 1 }, { time: 1, value: 0.5 }] },
        { animation_id: 'base', target_id: 'ves', animation_type: 'deform', duration_ms: 400, keyframes: [{ time: 0, value: 0.5 }, { time: 1, value: 1 }] }],
      structures: [{ structure_id: 'tone', states: ['BASELINE', 'VASOCONSTRICTION'], initial: 'BASELINE', transitions: { 'BASELINE->VASOCONSTRICTION': { animation: 'con' }, 'VASOCONSTRICTION->BASELINE': { animation: 'base' } } }] });
    r.paths.load({ paths: [{ path_id: 'c', points: pts.map((p) => ({ space: 'scene', position: p })) }] });
    const mesh = r.registry.get('ves').object3D;
    const curve = r.kit.deform.curveOf('ves');
    const radiusAt = () => {
      const p = mesh.geometry.attributes.position;
      const c = curve.getPointAt(0.5);
      let s = 0; let n = 0;
      const segs = 96; const rad = 20;
      for (let j = 0; j <= rad; j += 1) { const k = (segs / 2) * (rad + 1) + j; s += new THREE.Vector3().fromBufferAttribute(p, k).distanceTo(c); n += 1; }
      return s / n;
    };
    // 고리마다 정점 평균 = 중심선 위의 점 (변형 뒤에도 같아야 함)
    const ringDrift = () => {
      const p = mesh.geometry.attributes.position;
      let worst = 0;
      for (let i = 0; i <= 96; i += 8) {
        const c = new THREE.Vector3();
        for (let j = 0; j < 20; j += 1) c.add(new THREE.Vector3().fromBufferAttribute(p, i * 21 + j));
        c.multiplyScalar(1 / 20);
        worst = Math.max(worst, c.distanceTo(curve.getPointAt(i / 96)));
      }
      return worst;
    };
    const r0 = radiusAt();
    const len0 = r.paths.length('c');
    r.drive(true);
    const s1 = await r.kit.visual.set('tone', 'VASOCONSTRICTION');
    const r1 = radiusAt();
    const drift1 = ringDrift();
    const s2 = await r.kit.visual.set('tone', 'BASELINE');
    r.drive(false);
    const r2 = radiusAt();
    check('혈관 수축: 반지름만 0.5배, 중심선·경로 길이 유지(고리 중심이 중심선 위), 기준 복원', s1.status === 'completed' && s2.status === 'completed' && Math.abs(r0 - 0.2) < 1e-3 && Math.abs(r1 - 0.1) < 1e-3 && Math.abs(r2 - 0.2) < 1e-3 &&
      Math.abs(r.paths.length('c') - len0) < 1e-9 && drift1 < 1e-4,
      `반지름 ${r0.toFixed(3)} → ${r1.toFixed(3)} → ${r2.toFixed(3)} m, 경로 길이 ${len0.toFixed(4)} 그대로, 수축 중 고리 중심의 중심선 이탈 최대 ${(drift1 * 1000).toFixed(3)} mm`);
  }

  // 6. 구조 상태(판막): OPENING 중간 상태, 전환 애니메이션, 취소 시 이전 상태
  {
    const r = rig();
    r.kit.apply({ groups: [{ group_id: 'h', objects: [{ id: 'leaf', shape: 'leaflets', count: 3, radius: 0.1, center: [0, 0, 0], normal: [0, 1, 0], morphs: { open: { angle_deg: 70 } } }] }],
      animations: [{ animation_id: 'v.open', target_id: 'leaf', animation_type: 'morph', morph_target: 'open', duration_ms: 300, keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }] },
        { animation_id: 'v.close', target_id: 'leaf', animation_type: 'morph', morph_target: 'open', duration_ms: 300, keyframes: [{ time: 0, value: 1 }, { time: 1, value: 0 }] }],
      structures: [{ structure_id: 'valve', states: ['CLOSED', 'OPENING', 'OPEN', 'CLOSING'], initial: 'CLOSED',
        transitions: { 'CLOSED->OPEN': { via: 'OPENING', animation: 'v.open' }, 'OPEN->CLOSED': { via: 'CLOSING', animation: 'v.close' } },
        indicators: [{ target: 'leaf', state_colors: { OPEN: '#00ff00', CLOSED: '#888888', OPENING: '#ffff00' } }] }] });
    const V = r.kit.visual;
    const seen = [];
    V.onChange((k, d) => seen.push(d.state));
    const p = V.set('valve', 'OPEN');
    const during = V.get('valve');
    const colorDuring = r.materials.getState('leaf').color;
    r.drive(true);
    const res = await p;
    const w = r.kit.morph.get('leaf', 'open');
    const p2 = V.set('valve', 'CLOSED');
    await sleep(20);
    r.kit.anim.stop('v.close');
    const res2 = await p2;
    r.drive(false);
    check('판막: OPENING → OPEN (Morph 1), 상태 색 표시', during === 'OPENING' && colorDuring === '#ffff00' && res.status === 'completed' && V.get('valve') === 'OPEN' && w === 1 && r.materials.getState('leaf').color === '#00ff00',
      seen.join(' → '));
    check('닫힘 전환 취소 → 이전 상태(OPEN)로 표시·형태 복원', res2.status === 'cancelled' && V.get('valve') === 'OPEN' && r.kit.morph.get('leaf', 'open') === 1);
  }

  // 7. 타임라인: 순차·병렬·반복·지연·Blocking/Non-blocking·닫힌 판막 통과 방지·일시정지·취소 복원
  {
    const r = rig();
    const sph = (id, x) => ({ id, shape: 'sphere', radius: 0.2, center: [x, 0, 0], morphs: { big: { scale: [1.5, 1.5, 1.5] } } });
    const pop = (id) => ({ animation_id: `p.${id}`, target_id: id, animation_type: 'morph', morph_target: 'big', duration_ms: 200, keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }] });
    r.kit.apply({ groups: [{ group_id: 't', objects: [sph('a', -1), sph('b', 0), sph('c', 1), { id: 'lf', shape: 'leaflets', count: 2, radius: 0.1, center: [0, 1, 0], normal: [0, -1, 0] }] }],
      animations: [pop('a'), pop('b'), pop('c'), { animation_id: 'decor', target_id: 'b', animation_type: 'procedural', procedure: 'pulse', duration_ms: 300, params: { period_ms: 300, amplitude: 0.1 }, loop: true },
        { animation_id: 'lf.open', target_id: 'lf', animation_type: 'morph', morph_target: 'open', duration_ms: 100, keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }] }],
      structures: [{ structure_id: 'mv', states: ['CLOSED', 'OPEN'], initial: 'CLOSED', transitions: { 'CLOSED->OPEN': { animation: 'lf.open' } } }],
      timelines: [
        { timeline_id: 'seq', steps: [{ type: 'animation', animation_id: 'p.a' }, { type: 'marker', name: 'a' }, { type: 'animation', animation_id: 'p.b' }, { type: 'marker', name: 'b' }] },
        { timeline_id: 'par', steps: [{ type: 'parallel', steps: [{ type: 'animation', animation_id: 'p.a' }, { type: 'animation', animation_id: 'p.c' }] }, { type: 'marker', name: 'par_done' }] },
        { timeline_id: 'rep', steps: [{ type: 'repeat', count: 3, steps: [{ type: 'marker', name: 'tick' }, { type: 'delay', ms: 30 }] }] },
        { timeline_id: 'decor_block', steps: [{ type: 'animation', animation_id: 'decor', wait: false }, { type: 'animation', animation_id: 'p.c' }, { type: 'marker', name: 'blocking_done' }] },
        { timeline_id: 'closed', steps: [{ type: 'command', command: { action: 'morph_set_value', target: 'a', morph: 'big', value: 0.5 }, through: ['mv'] }] },
        { timeline_id: 'open_then', steps: [{ type: 'state', set: { mv: 'OPEN' } }, { type: 'command', command: { action: 'morph_set_value', target: 'a', morph: 'big', value: 0.5 }, through: ['mv'] }] },
        { timeline_id: 'long', steps: [{ type: 'state', set: { mv: 'OPEN' } }, { type: 'delay', ms: 400 }, { type: 'marker', name: 'long_end' }] }] });
    const T = r.kit.timeline;
    const marks = [];
    T.onEvent((k, d) => { if (k === 'marker') marks.push(d.name); });
    r.drive(true);
    const seq = await T.play('seq').promise;
    const seqOrder = marks.join(',');
    const wa = r.kit.morph.get('a', 'big');
    marks.length = 0;
    const t0 = performance.now();
    const par = await T.play('par').promise;
    const parMs = performance.now() - t0;
    const rep = await T.play('rep').promise;
    check('순차: a 끝난 뒤 b, 병렬: 함께 끝, 반복 3회', seq.status === 'completed' && seqOrder === 'a,b' && wa === 1 && par.status === 'completed' && rep.status === 'completed' && marks.filter((x) => x === 'tick').length === 3,
      `순차 표시 ${seqOrder}, 병렬 ${Math.round(parMs)}ms`);
    const db = await T.play('decor_block').promise;
    const decorStill = r.kit.anim.isPlaying('decor');
    check('Blocking 타임라인은 끝나지 않는 장식(Non-blocking)과 상관없이 끝남', db.status === 'completed' && decorStill);
    r.kit.anim.stop('decor');
    const cl = await T.play('closed').promise;
    check('닫힌 판막을 지나는 이동 → 실패, 실행 안 함', cl.status === 'failed' && /닫힌/.test(cl.reason) && r.kit.morph.get('a', 'big') === 1, cl.reason);
    const ot = await T.play('open_then').promise;
    check('판막 OPEN 뒤에는 같은 이동 실행', ot.status === 'completed' && r.kit.morph.get('a', 'big') === 0.5);
    await r.kit.visual.set('mv', 'CLOSED', { instant: true });
    const h = T.play('long');
    await sleep(60);
    T.pause('long');
    const pausedMark = marks.includes('long_end');
    await sleep(500);
    const stillPaused = !marks.includes('long_end') && T.isRunning('long');
    T.cancel('long');
    const lr = await h.promise;
    r.drive(false);
    check('타임라인 일시정지 중 진행 안 함, 취소 → cancelled, 구조 상태 복원(CLOSED)', !pausedMark && stillPaused && lr.status === 'cancelled' && r.kit.visual.get('mv') === 'CLOSED', `복원 상태 ${r.kit.visual.get('mv')}`);
  }

  // 8. 재질 애니메이션: 이전 상태 층(색) 복원, 강조와 충돌 없음
  {
    const r = rig();
    addBox(r, 'm');
    r.materials.setColor('m', '#ff0000');         // 예: 산소화 상태 색
    r.materials.setHighlight('m', 'select', true);
    r.kit.anim.define({ animation_id: 'glow', target_id: 'm', animation_type: 'material', duration_ms: 300, keyframes: [{ time: 0, value: { color: '#0000ff', opacity: 1 } }, { time: 1, value: { color: '#00ff00', opacity: 0.5 } }] });
    const h = r.kit.anim.play('glow');
    r.kit.tick(0.15);
    const mid = r.materials.getState('m');
    r.kit.anim.stop('glow');
    await h.promise;
    const after = r.materials.getState('m');
    check('재질 애니메이션 취소 → 이전 색(#ff0000)·투명도 복원, 선택 강조 유지', mid.opacity < 1 && after.color === '#ff0000' && after.opacity === 1 && after.highlight.select === true,
      `중간 opacity ${mid.opacity.toFixed(2)} color ${mid.color}`);
  }

  // 9. 모델 전환: Crossfade, 논리 ID 유지
  {
    const r = rig();
    addBox(r, 'va');
    addBox(r, 'vb');
    r.kit.apply({ transitions: [{ logical_id: 'tissue', variants: { A: 'va', B: 'vb' }, initial: 'A' }] });
    const vis0 = [r.registry.get('va').object3D.visible, r.registry.get('vb').object3D.visible];
    r.drive(true);
    const res = await r.kit.transition.transition('tissue', 'B', { mode: 'crossfade', duration_ms: 200 });
    r.drive(false);
    const vis1 = [r.registry.get('va').object3D.visible, r.registry.get('vb').object3D.visible];
    check('모델 전환 Crossfade: A → B, 논리 ID 그대로, 이전 모델 숨김·투명도 복원', res.status === 'completed' && r.kit.transition.current('tissue') === 'B' && r.kit.transition.objectOf('tissue') === 'vb' &&
      vis0.join() === 'true,false' && vis1.join() === 'false,true' && r.materials.getState('vb').opacity === 1, `${vis0} → ${vis1}`);
  }

  // 10. 명령 검증과 command-runner 연결
  {
    const r = rig();
    addBox(r, 'q');
    r.kit.apply({ animations: [{ animation_id: 'qa', target_id: 'q', animation_type: 'transform', duration_ms: 200, keyframes: [{ time: 0, value: { position: [0, 0, 0] } }, { time: 1, value: { position: [1, 0, 0] } }] }] });
    r.drive(true);
    const sum = await r.runner.run([
      { action: 'animation_play', target: 'qa', wait: true },
      { action: 'animation_play', target: 'nope' },
      { action: 'animation_set_speed', target: 'qa', value: -1 },
      { action: 'morph_set_value', target: 'q', morph: 'x', value: 0.5 },
      { action: 'timeline_play', target: 'nope' },
      { action: 'set_biological_visual_state', value: { ghost: 'OPEN' } },
    ]);
    r.drive(false);
    const errs = r.kit.anim.validateDef({ animation_id: 'bad', target_id: 'q', animation_type: 'wobble', duration_ms: -1, keyframes: [{ time: 2, value: 1 }] });
    check('JS 명령 검증: 정상 1 / 오류 5, 실행 계속', sum.applied === 1 && sum.failed === 5 && r.registry.get('q').object3D.position.x === 1, sum.errors.map((e) => e.replace(/명령 #\d+ /, '')).join(' / '));
    check('정의 검증: 종류·시간·Keyframe time', errs.length === 3, errs.join(' / '));
  }

  // 11. 애니메이션 줄이기·게임 일시정지
  {
    const r = rig();
    addBox(r, 'z');
    r.kit.apply({ animations: [{ animation_id: 'once', target_id: 'z', animation_type: 'transform', duration_ms: 1000, keyframes: [{ time: 0, value: { position: [0, 0, 0] } }, { time: 1, value: { position: [3, 0, 0] } }] },
      { animation_id: 'rep', target_id: 'z', animation_type: 'procedural', procedure: 'pulse', duration_ms: 500, params: { amplitude: 0.2 }, loop: true }] });
    r.kit.setReducedMotion(true);
    const h = r.kit.anim.play('once');
    const res = await h.promise;
    r.kit.anim.play('rep');
    r.kit.tick(0.2);
    const s = r.registry.get('z').object3D.scale.x;
    r.kit.setReducedMotion(false);
    r.kit.anim.stop('rep');
    r.kit.pauseAll();
    const h2 = r.kit.anim.play('once');
    r.kit.tick(0.25);
    const held = r.kit.anim.state('once').t === 0;
    r.kit.resumeAll();
    r.kit.tick(0.25);
    const moved = r.kit.anim.state('once').t > 0;
    r.kit.anim.stop('once');
    await h2.promise;
    check('애니메이션 줄이기: 한 번 재생은 바로 끝 상태, 반복 장식은 멈춤', res.status === 'completed' && s === 1);
    check('게임 일시정지 중 시작한 애니메이션도 멈춤, 재개 후 진행', held && moved);
  }

  // 12. 뼈대(Skeleton) 리소스 해제: 장면을 내릴 때 boneTexture가 남지 않게
  {
    const r = rig();
    const bones = [new THREE.Bone(), new THREE.Bone()];
    bones[0].add(bones[1]);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const n = geo.attributes.position.count;
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    const sm = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
    sm.add(bones[0]);
    sm.bind(new THREE.Skeleton(bones));
    let disposed = 0;
    const orig = sm.skeleton.dispose.bind(sm.skeleton);
    sm.skeleton.dispose = () => { disposed += 1; orig(); };
    const g = new THREE.Group();
    g.add(sm);
    r.registry.attach(g, null);
    r.registry.registerModel(g, { assetId: 'skin' });
    r.tracker.retain(g);
    r.registry.unregister('skin');
    check('SkinnedMesh 해제 시 Skeleton(boneTexture)도 dispose', disposed === 1);
  }

  const passed = results.filter((x) => x.ok).length;
  log(`결과: ${passed}/${results.length} 통과`);
  return { passed, total: results.length, results };
}
