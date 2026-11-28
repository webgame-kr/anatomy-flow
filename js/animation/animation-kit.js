// Animation Kit (STEP 04-B): 애니메이션 관련 모듈을 한 번에 조립하고 애니메이션 데이터(JSON)를 불러온다
// Sandbox(main.js)와 Play(play-engine.js)가 같은 방식으로 쓴다. 렌더링 루프에서 kit.tick(dt)만 부른다.
//
// 데이터 파일 (content/animations/*.json, FLOW_SPEC 7장)
//   { version, scene_id, verification_status, groups: [개념 모델 정의], animations: [...], structures: [...],
//     timelines: [...], transitions: [...], phases: [...](화면 표시용 단계 정보) }

import { createMorphController } from './morph-controller.js';
import { createDeformationController } from './deformation-controller.js';
import { createAnimationManager } from './animation-manager.js';
import { createVisualState } from './visual-state.js';
import { createTimelineEngine } from './animation-timeline.js';
import { createModelTransition } from './model-transition.js';
import { createConceptBuilder } from './concept-model-builder.js';
import { createAnimationCommands } from './animation-commands.js';

export function createAnimationKit({ scene, registry, tracker, materials, runner = null, resolve = null, loadModel = null, log = () => {} }) {
  const morph = createMorphController({ registry });
  const deform = createDeformationController({ registry });
  const anim = createAnimationManager({ registry, materials, morph, deform, log });
  const res = resolve || ((id) => (registry.has(id) ? [id] : []));
  const visual = createVisualState({ anim, materials, registry, resolve: res, log });
  let timeline = createTimelineEngine({ anim, visual, runner, log });
  const transition = createModelTransition({ registry, materials, anim, loadModel, log });
  const builder = createConceptBuilder({ scene, registry, tracker, deform, log });
  const commands = createAnimationCommands({ anim, morph, timeline, visual, transition, registry, resolve: res });
  let data = null;
  let dataUrl = null;
  const stats = { lastTickMs: 0, maxTickMs: 0 };

  // command-runner는 kit보다 나중에 만들어질 수 있다 (runner가 ctx.animation으로 kit.commands를 받음)
  function setRunner(r) {
    timeline = createTimelineEngine({ anim, visual, runner: r, log });
    Object.assign(commands, createAnimationCommands({ anim, morph, timeline, visual, transition, registry, resolve: res }));
    kit.timeline = timeline;
  }

  // 데이터 적용 순서: 모델 → 애니메이션 → 구조 상태 → 타임라인 → 모델 전환
  function apply(doc) {
    clearData();          // GLB Mixer(클립)는 남긴다: 모델이 데이터보다 먼저 등록된다
    data = doc;
    const errors = [];
    for (const g of doc.groups || []) errors.push(...builder.build(g).errors);
    errors.push(...anim.load(doc).errors);
    errors.push(...visual.load(doc).errors);
    errors.push(...timeline.load(doc).errors);
    errors.push(...transition.load(doc).errors);
    for (const e of errors) log(`애니메이션 데이터: ${e}`, 'error');
    log(`애니메이션 데이터: 모델 그룹 ${(doc.groups || []).length} · 애니메이션 ${anim.ids().length} · 구조 ${visual.ids().length} · 타임라인 ${timeline.ids().length}`);
    return { ok: !errors.length, errors };
  }

  async function loadUrl(url) {
    const doc = await (await fetch(url, { cache: 'no-cache' })).json();
    dataUrl = url;
    return apply(doc);
  }

  // 데이터만 지우기: 재생·타임라인 취소, 표시 색 지우기, 개념 모델 해제 (GLB Mixer는 유지)
  function clearData() {
    timeline.clear();
    anim.cancelAll('reload');
    anim.clearDefs();
    visual.clear();
    transition.clear();
    builder.destroyAll();
    data = null;
  }
  // 장면을 내릴 때: 데이터 + GLB Mixer 해제(클립 캐시 정리)
  function unload() {
    clearData();
    anim.unload();
  }

  const kit = {
    morph, deform, anim, visual, timeline, transition, builder, commands,
    apply, loadUrl, unload, setRunner,
    // 진행 중인 것만 취소 (재시작). 정의와 모델은 남긴다
    cancelAll(reason = 'reset') { timeline.cancelAll(reason); anim.cancelAll(reason); },
    pauseAll() { anim.pauseAll(); timeline.pauseAll(); },
    resumeAll() { anim.resumeAll(); timeline.resumeAll(); },
    setReducedMotion(on) { anim.setReducedMotion(on); },
    // GLB 클립 연결: scene-manager의 'model' 이벤트에서 부른다
    registerClips: (id, root, clips) => anim.registerClips(id, root, clips),
    tick(dt) {
      const t0 = performance.now();
      anim.tick(dt);
      const ms = performance.now() - t0;
      stats.lastTickMs = ms;
      stats.maxTickMs = Math.max(stats.maxTickMs, ms);
    },
    snapshot() { return { animations: anim.ids(), timelines: timeline.ids(), structures: visual.ids(), morph_objects: registry.ids().filter((id) => morph.names(id).length) }; },
    get data() { return data; },
    get url() { return dataUrl; },
    get stats() { return { ...stats }; },
  };
  return kit;
}
