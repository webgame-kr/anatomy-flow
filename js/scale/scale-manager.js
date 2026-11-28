// 다중 스케일 장면 관리 (STEP 04-A)
// - 수준(level): BODY, ORGAN, TISSUE, CELL, MOLECULAR. 수준마다 좌표 원점·단위·카메라·Actor 표시 크기를 따로 둔다.
//   지금 장면이 있는 수준: ORGAN(BodyParts3D 심혈관), TISSUE(개념 장면 content/micro/*.json). 나머지는 자리만 있다.
// - 전환 때 유지하는 것: 학습 세션, 노드, 논리 Actor ID, 생리 상태(biological_state), 정답·오답 기록, 진행
//   → Actor를 지우고 새로 만들지 않는다. 같은 Actor를 새 장면의 Checkpoint에 놓고 표시 크기만 바꾼다.
//   → 학습 상태는 Python이 가지고 있으므로 여기서는 건드리지 않는다.
// - 전환 중에는 busy: 두 번째 전환 명령은 실패로 돌려준다(중복 이동 방지). 입력은 상태 머신(transitioning)이 막는다.
// - 실제 크기와 교육용 확대를 분리해 표시한다: 수준별 unit_note, 장면별 magnification_note.
// - 명령: { action: 'scale_change', target: actor_id, level, scene_id, checkpoint_id, duration, wait }
//   command-runner가 ctx.scale로 이 모듈에 넘긴다. 결과는 { status: 'arrived' | 'failed' | 'cancelled' }.

import * as THREE from 'three';

export const LEVELS = {
  BODY: { name_ko: '몸 전체', unit_note: '1 장면 m = 실제 1 m', available: false },
  ORGAN: { name_ko: '기관', unit_note: '1 장면 m = 실제 1 m (BodyParts3D 실제 크기)', available: true },
  TISSUE: { name_ko: '조직', unit_note: '장면별 배율 (개념 장면)', available: true },
  CELL: { name_ko: '세포', unit_note: '-', available: false },
  MOLECULAR: { name_ko: '분자', unit_note: '-', available: false },
};

const ACTIONS = new Set(['scale_change']);

export function createScaleManager({ camera, actors, motion, paths, overlay = null, log = () => {}, hooks = {} }) {
  const scenes = new Map();        // scene_id → { level, enter(), exit(), bounds(), actor_display_size, follow, magnification_note, conceptual }
  let current = null;              // 현재 scene_id
  let busy = false;
  let session = 0;                 // cancel()이 올린다: 전환 도중 재시작되면 결과를 cancelled로
  let reduced = false;
  let held = false;                // 게임 일시정지: 전환 단계 사이에서 기다린다
  const holdWait = async () => { while (held) await new Promise((r) => setTimeout(r, 50)); };
  const listeners = new Set();
  const emit = (kind, data) => { for (const fn of listeners) fn(kind, data); };

  function register(sceneId, spec) {
    scenes.set(sceneId, { level: 'ORGAN', conceptual: false, ...spec });
    if (!current && spec.level === 'ORGAN') current = sceneId;
  }
  function unregister(sceneId) { scenes.delete(sceneId); }

  function fade(on, ms) {
    if (!overlay) return Promise.resolve();
    overlay.style.transitionDuration = `${ms}ms`;
    overlay.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, ms));
  }

  function validate(cmd) {
    if (!actors.has(cmd.target)) return `없는 Actor: ${cmd.target}`;
    if (!LEVELS[cmd.level]) return `알 수 없는 수준: ${cmd.level}`;
    const s = scenes.get(cmd.scene_id);
    if (!s) return `없는 장면: ${cmd.scene_id}`;
    if (s.level !== cmd.level) return `장면 ${cmd.scene_id}의 수준은 ${s.level}`;
    if (cmd.checkpoint_id && !paths.findCheckpoint(cmd.checkpoint_id)) return `없는 Checkpoint: ${cmd.checkpoint_id}`;
    return '';
  }

  async function change(cmd) {
    const problem = validate(cmd);
    if (problem) return { status: 'failed', reason: problem, action: 'scale_change' };
    if (busy) return { status: 'failed', reason: '이미 스케일 전환 중', action: 'scale_change' };
    busy = true;
    const no = session;
    const total = reduced ? 0 : Math.max(0, Number.isFinite(cmd.duration) ? cmd.duration : 900);
    const from = current;
    const to = cmd.scene_id;
    const toSpec = scenes.get(to);
    emit('start', { from, to, level: cmd.level });
    try {
      camera.stopFollow();
      await fade(true, total / 2);
      await holdWait();
      if (no !== session) return { status: 'cancelled', action: 'scale_change' };
      if (from && from !== to && scenes.get(from)) scenes.get(from).exit();
      toSpec.enter();
      current = to;
      // 같은 논리 Actor: 표시 크기만 장면에 맞추고 새 장면의 Checkpoint에 놓는다 (biological_state 유지)
      if (Number.isFinite(toSpec.actor_display_size)) actors.setDisplaySize(cmd.target, toSpec.actor_display_size);
      if (toSpec.follow) camera.setFollowOptions(toSpec.follow);
      if (cmd.checkpoint_id) {
        const r = motion.placeAtCheckpoint(cmd.target, cmd.checkpoint_id);
        if (r.result && r.result.status === 'failed') throw new Error(r.result.reason || '배치 실패');
      }
      const box = toSpec.bounds();
      if (box && !box.isEmpty()) camera.focusBox(box, { duration: 0, direction: toSpec.view_direction ? new THREE.Vector3(...toSpec.view_direction) : null });
      if (hooks.onChanged) hooks.onChanged(to, toSpec);
      await fade(false, total / 2);
      await holdWait();
      if (no !== session) return { status: 'cancelled', action: 'scale_change' };
      log(`스케일 전환: ${from || '-'} → ${to} (${cmd.level})`);
      emit('changed', { from, to, level: cmd.level, spec: toSpec });
      return { status: 'arrived', action: 'scale_change', scene_id: to, level: cmd.level, checkpoint_id: cmd.checkpoint_id || null };
    } catch (err) {
      log(`스케일 전환 실패: ${err.message}`, 'error');
      if (overlay) overlay.classList.remove('on');
      return { status: 'failed', reason: err.message, action: 'scale_change' };
    } finally {
      busy = false;
    }
  }

  // 처음 장면(ORGAN)으로 즉시 되돌리기: 재시작·콘텐츠 변경 때
  function reset(organSceneId = null) {
    session += 1;
    busy = false;
    held = false;
    if (overlay) { overlay.style.transitionDuration = '0ms'; overlay.classList.remove('on'); }
    const target = organSceneId || [...scenes.entries()].find(([, s]) => s.level === 'ORGAN')?.[0] || null;
    if (current && current !== target && scenes.get(current)) scenes.get(current).exit();
    if (target && scenes.get(target)) {
      const s = scenes.get(target);
      s.enter();
      if (s.follow) camera.setFollowOptions(s.follow);
      if (hooks.onChanged) hooks.onChanged(target, s);
    }
    current = target;
    emit('changed', { from: null, to: target, level: target ? scenes.get(target).level : null, spec: target ? scenes.get(target) : null });
  }

  // Checkpoint가 속한 장면 (복구할 때 장면이 다르면 먼저 그 장면으로 옮긴다). 장면 spec.path_ids에 없으면 ORGAN 장면
  function sceneOfCheckpoint(cid) {
    const f = paths.findCheckpoint(cid);
    if (!f) return null;
    for (const [id, s] of scenes) if ((s.path_ids || []).includes(f.pathId)) return id;
    return [...scenes.entries()].find(([, s]) => s.level === 'ORGAN')?.[0] || null;
  }

  // command-runner 연결 (ctx.scale)
  const commands = {
    handles: (action) => ACTIONS.has(action),
    validate,
    run: (cmd) => change(cmd),
  };

  return {
    register,
    unregister,
    change,
    reset,
    commands,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    pause() { held = true; },
    resume() { held = false; },
    get held() { return held; },
    setReducedMotion(on) { reduced = !!on; for (const s of scenes.values()) if (s.setReducedMotion) s.setReducedMotion(on); },
    get current() { return current; },
    get currentSpec() { return current ? scenes.get(current) : null; },
    get busy() { return busy; },
    get levels() { return LEVELS; },
    has: (id) => scenes.has(id),
    get: (id) => scenes.get(id) || null,
    sceneOfCheckpoint,
  };
}
