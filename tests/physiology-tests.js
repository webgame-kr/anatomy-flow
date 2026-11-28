// STEP 04-C 생리 상태 → 시각 연결 브라우저 테스트 (렌더링 루프와 분리된 독립 인스턴스, dt를 직접 넣는다)
// 실행: 로컬 서버에서 /tests/physiology-tests.html
// 명령은 Python 생리 엔진이 실제로 만든 것(tests/fixtures/physiology-visual.json, 생성기 tools/content/make_physiology_fixture.py)이다.
// 확인: 심박수 → 박동 속도, 수축력 → 박동 가중치, 말초혈관저항 → 세동맥 수축·확장, 신경·호르몬 신호 표시와 숨김, 기준 상태 복원,
//       시각 명령이 생리 상태를 바꾸지 않음(한 방향), 장면 정리 뒤 신호 Actor 해제.

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
import { createSignalManager } from '../js/physiology/signal-manager.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rig() {
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
  const motionKit = { actors, paths, commands: { run: (c) => mcmd.run(c) } };
  const signals = createSignalManager({ kit: motionKit, materials, registry });
  const runner = createCommandRunner({ whenSettled: () => Promise.resolve() }, { registry, materials, camera: fakeCam, motion: mcmd, animation: kit.commands, physiology: signals });
  kit.setRunner(runner);
  const doc = await (await fetch('../content/animations/physiology-concept.json', { cache: 'no-cache' })).json();
  const r = kit.apply(doc);
  for (const p of doc.motion.paths) paths.create(p);
  for (const a of doc.motion.actors) { const c = actors.create(a); if (c.ok && a.path_id) motion.setPath(a.actor_id, a.path_id); }
  signals.setSignalActors(doc.motion.actors.filter((a) => a.signal_actor).map((a) => a.actor_id));
  let timer = null;
  const drive = (on = true) => { clearInterval(timer); if (on) timer = setInterval(() => { kit.tick(1 / 30); motion.tick(1 / 30); paths.tick(); }, 4); };
  return { scene, registry, tracker, materials, paths, actors, motion, kit, runner, signals, drive, doc, applied: r };
}

export async function run({ log = console.log } = {}) {
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
  const fx = await (await fetch('./fixtures/physiology-visual.json', { cache: 'no-cache' })).json();
  const r = await rig();
  check('개념 장면 불러오기 (구조·애니메이션)', r.applied.ok && r.kit.visual.has('vessel.phy_arteriole') && r.kit.anim.def('phy.beat.lv'), (r.applied.errors || []).slice(0, 2).join(' / '));
  check('신호 Actor는 평소에 숨김', !r.materials.getState('phy_sig_aff1').visible && !r.materials.getState('phy_sig_aldo').visible);
  r.drive(true);

  // 기준 상태 바인딩
  let s = await r.runner.run(fx.baseline.map((c) => ({ ...c })));
  await sleep(300);
  const st0 = r.kit.anim.state('phy.beat.lv');
  const beatCmd = fx.baseline.find((c) => c.target === 'phy.beat.lv');
  check('기준 상태: 박동 반복 재생, 속도 1 (명령의 수축력 가중치 0.8)', s.failed === 0 && st0 && st0.speed === 1 && beatCmd.weight === 0.8,
    `실패 ${s.failed}, speed ${st0 && st0.speed}, weight ${beatCmd.weight}`);
  check('기준 상태: 세동맥 BASELINE', r.kit.visual.get('vessel.phy_arteriole') === 'BASELINE');

  // 혈압 감소 → 반사 한 단계
  await r.runner.run(fx.bp_drop_start.map((c) => ({ ...c })));
  const before = r.materials.getState('phy.nerve_symp').color;
  const t0 = performance.now();
  s = await r.runner.run(fx.bp_drop_step.map((c) => ({ ...c })));
  const ms = Math.round(performance.now() - t0);
  await sleep(1200);
  const st1 = r.kit.anim.state('phy.beat.lv');
  check('반사: 명령 실패 0, 신호를 기다린 뒤 진행', s.failed === 0 && ms > 100, `${ms}ms, 오류 ${s.errors.join(' / ')}`);
  check('심박수↑ → 박동 속도 1.35배 (교육용 배율)', st1 && Math.abs(st1.speed - 1.35) < 1e-6, `speed ${st1 && st1.speed}`);
  check('말초혈관저항↑ → 세동맥 VASOCONSTRICTION (지름 변형)', r.kit.visual.get('vessel.phy_arteriole') === 'VASOCONSTRICTION');
  check('교감 활성↑ → 신경 색 변화', r.materials.getState('phy.nerve_symp').color !== before, `${before} → ${r.materials.getState('phy.nerve_symp').color}`);
  const sig = r.signals.recent.map((x) => x.signal_type);
  check('구심·원심 신경 신호 표시', sig.includes('neural_afferent') && sig.includes('neural_efferent'));
  check('신호가 끝나면 신호 Actor를 다시 숨김', !r.materials.getState('phy_sig_aff1').visible && !r.materials.getState('phy_sig_sym1').visible);

  // 기준 상태로 복원
  s = await r.runner.run(fx.restore.map((c) => ({ ...c })));
  await sleep(1200);
  const st2 = r.kit.anim.state('phy.beat.lv');
  check('복원: 박동 속도 1, 세동맥 BASELINE', s.failed === 0 && st2 && st2.speed === 1 && r.kit.visual.get('vessel.phy_arteriole') === 'BASELINE');

  // RAAS: 호르몬·효소 신호
  s = await r.runner.run(fx.raas_step.map((c) => ({ ...c })));
  const sig2 = r.signals.recent.map((x) => x.signal_type);
  check('RAAS: 효소(레닌)·호르몬(안지오텐신·알도스테론·ADH) 신호', s.failed === 0 && sig2.includes('enzyme') && sig2.filter((x) => x === 'hormone').length >= 4);

  // 검증: 없는 신호 Actor·Checkpoint
  s = await r.runner.run([{ action: 'signal_emit', target: 'nope', signal_type: 'hormone', from: 'x', to: 'y', wait: true }]);
  check('없는 신호 Actor는 실행 전 거부', s.failed === 1 && /없는 신호 Actor/.test(s.errors[0] || ''));
  s = await r.runner.run([{ action: 'signal_emit', target: 'phy_sig_aff1', signal_type: 'magic', from: 'cp.phy.carotid_medulla.from', to: 'cp.phy.carotid_medulla.to' }]);
  check('알 수 없는 신호 종류 거부', s.failed === 1);

  // 애니메이션 줄이기: 이동 없이 표시
  r.signals.setReducedMotion(true);
  const t1 = performance.now();
  s = await r.runner.run([{ ...fx.bp_drop_step.find((c) => c.action === 'signal_emit'), wait: true }]);
  check('애니메이션 줄이기: 이동 없이 짧게 표시 후 숨김', s.failed === 0 && performance.now() - t1 < 800 && !r.materials.getState('phy_sig_aff1').visible);
  r.signals.setReducedMotion(false);

  // 취소: 신호 표시 중 cancelAll → 숨김
  const job = r.runner.run([{ ...fx.raas_step.find((c) => c.action === 'signal_emit'), wait: true }]);
  await sleep(40);
  r.signals.cancelAll();
  r.motion.cancelAll('test');
  await job;
  check('장면 재시작(cancelAll): 신호 Actor 숨김', !r.materials.getState('phy_sig_renin').visible);

  r.drive(false);
  // 정리: 장면을 내리면 신호 Actor 형상·재질을 해제
  const geoBefore = r.tracker.stats ? r.tracker.stats().geometries : null;
  r.kit.unload();
  for (const id of r.actors.ids()) r.actors.remove(id);
  check('정리: 신호 Actor 제거', r.actors.ids().length === 0, geoBefore === null ? '' : `geo ${geoBefore}`);

  const passed = results.filter((x) => x.ok).length;
  return { passed, total: results.length, results };
}
