// Gameplay Controller (STEP 03-D): Python 학습 규칙 엔진 ↔ 3D 엔진 연결
// - 정답 판정, 진행, 분기·순환 조건, 기록 계산은 Python(lesson.py → game.py)이 한다. 여기에는 학습 규칙이 없다.
// - 여기서 하는 일: 입력 전달, 반환 명령 실행(command-runner), 이동 완료 대기, 카메라, 상태 머신, 세션 검증.
// - 비동기 안전: 모든 Python 응답과 이동 결과는 보낸 때의 세션 번호를 확인한 뒤 반영한다.
//   재시작·콘텐츠 변경은 세션 번호를 올리고 motion.cancelAll()로 진행 중인 이동을 끝낸다.

import { createStateMachine } from './gameplay-state.js';

const STALE = Symbol('stale');
const EVENT_TIMEOUT_MS = 8000;      // 순차(sequential) 3D 이벤트를 기다리는 최대 시간 (끝나지 않는 이벤트로 멈추지 않게)
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export function createGameplayController({ engine, session, mode, log, onUpdate = () => {} }) {
  const sm = createStateMachine({ log, onChange: (s, prev, why) => emit('state', { state: s, prev, why }) });
  let lesson = null;            // 콘텐츠 JSON (원본)
  let view = null;              // Python get_view() 결과
  let lastExplain = null;       // 마지막으로 도착한 노드 (설명 표시용)
  let feedback = null;          // { kind: 'correct'|'wrong'|'info'|'error', text }
  let failure = null;           // 이동 실패 정보 { edge, status }
  let validation = { errors: [], warnings: [] };
  let hints = [];               // 이번 문제의 힌트
  let lastMs = { submit: 0, arrive: 0 };
  const options = { cameraMode: 'auto', reducedMotion: false, cameraSpeed: 1, actorSpeed: 1, showPath: false };
  const listeners = new Set();

  function emit(kind, data = {}) {
    for (const fn of listeners) fn(kind, data);
    onUpdate(kind, data);
  }

  // 스케일 전환 뒤: 이동 중이면 새 장면에서 카메라 추적을 다시 켠다 (전환 때 추적을 끈다)
  engine.scale.onChange((kind, d) => {
    if (kind !== 'changed') return;
    if (sm.state === 'transitioning' && options.cameraMode === 'auto' && !options.reducedMotion) engine.camera.startFollow(actorId());
    emit('scale', d);
  });

  // ---------- Python 호출 (세션 검증) ----------
  async function py(fn, ...args) {
    const no = session.no;
    const t0 = performance.now();
    const r = await engine.client.call(fn, ...args);
    if (!session.isCurrent(no)) { log(`이전 세션 응답 무시: ${fn}`, 'warn'); return STALE; }
    lastMs[fn] = Math.round(performance.now() - t0);
    return r;
  }

  const nodeOf = (id) => (lesson ? (lesson.nodes || []).find((n) => (n.node_id || n.id) === id) : null);
  const actorId = () => (lesson && lesson.actor_id) || '';

  function nextWaitState() {
    if (!view) return 'waiting_input';
    if (view.phase === 'done') return 'completed';
    return view.candidates.length > 1 ? 'waiting_choice' : 'waiting_input';
  }

  // ---------- 콘텐츠 불러오기 ----------
  async function loadLesson(url) {
    session.newSession();
    sm.force('loading', 'load');
    engine.kit.motion.cancelAll('lesson_load');
    view = null; lastExplain = null; feedback = null; failure = null; hints = [];
    emit('loading', { text: '학습 콘텐츠를 불러오는 중…' });
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`콘텐츠 파일을 읽지 못했습니다 (${res.status})`);
      lesson = await res.json();
    } catch (err) {
      return fatal(`콘텐츠 오류: ${err.message}`);
    }
    const sc = lesson.scene || {};
    try {
      emit('loading', { text: '3D 모델을 불러오는 중…' });
      if (sc.type === 'anatomy') await engine.loadAnatomy(sc.url, { micro: sc.micro || null, animations: sc.animations || null, start_scale: sc.start_scale || null });
      else if (sc.type === 'sandbox') await engine.loadSandbox(sc.catalog, sc.scene_id);
      else throw new Error(`알 수 없는 장면 종류: ${sc.type}`);
    } catch (err) {
      return fatal(`3D 장면을 불러오지 못했습니다: ${err.message}`);
    }
    validation = validate3d(lesson);
    for (const w of validation.warnings) log(`콘텐츠 검사: ${w}`, 'warn');
    if (validation.errors.length) {
      for (const x of validation.errors) log(`콘텐츠 검사: ${x}`, 'error');
      return fatal(`콘텐츠의 3D 연결 오류 ${validation.errors.length}개: ${validation.errors.slice(0, 3).join(' / ')}`);
    }
    emit('loading', { text: 'Python 학습 엔진을 준비하는 중…' });
    try {
      await engine.client.start();
      const r = await py('lesson.load', lesson, actorId());
      if (r === STALE) return;
      if (!r.ok) return fatal(`콘텐츠 규칙 오류: ${r.errors.join(' / ')}`);
      for (const w of r.warnings) log(`규칙 검사: ${w}`, 'warn');
      view = r.view;
    } catch (err) {
      return fatal(`Python 엔진 오류: ${err.message}`);
    }
    sm.to('ready', 'loaded');
    emit('lesson', { lesson });
    return true;
  }

  function fatal(text) {
    feedback = { kind: 'error', text };
    log(text, 'error');
    sm.force('error', 'fatal');
    failure = { fatal: true };
    emit('view');
    return false;
  }

  // 콘텐츠 ID가 실제 모델·Anchor·경로·Checkpoint·Actor와 이어지는지 (JS 쪽 3D 검증)
  function validate3d(c) {
    const errors = [];
    const warnings = [];
    const { kit, anatomy, anchors, kind } = engine;
    const nodeIds = new Set();
    const edgeIds = new Set();
    if (!actorId() || !kit.actors.has(actorId())) errors.push(`없는 Actor: ${actorId() || '(actor_id 없음)'}`);
    for (const n of c.nodes || []) {
      const id = n.node_id || n.id;
      if (nodeIds.has(id)) errors.push(`Node ID 중복: ${id}`);
      nodeIds.add(id);
      if (n.anatomical_id && kind === 'anatomy' && !anatomy.has(n.anatomical_id)) errors.push(`${id}: 없는 해부학 구조 ${n.anatomical_id}`);
      if (n.anatomical_id && kind === 'anatomy' && anatomy.has(n.anatomical_id) && anatomy.status(n.anatomical_id) === 'MISSING') warnings.push(`${id}: 모델이 없는 구조 ${n.anatomical_id}`);
      if (n.anchor_id && !anchors.get(n.anchor_id)) errors.push(`${id}: 없는 Anchor ${n.anchor_id}`);
      if (n.checkpoint_id && !kit.paths.findCheckpoint(n.checkpoint_id)) errors.push(`${id}: 없는 Checkpoint ${n.checkpoint_id}`);
      if (n.verification_status === 'VERIFIED') {
        const cp = n.checkpoint_id && kit.paths.findCheckpoint(n.checkpoint_id);
        const p = cp && kit.paths.get(cp.pathId);
        if (p && p.verification_status !== 'ANATOMY_REVIEWED') warnings.push(`${id}: 노드는 VERIFIED지만 경로 ${p.path_id}는 ${p.verification_status}`);
      }
      checkEvents(n.events, id, errors);
    }
    for (const ed of c.edges || []) {
      const id = ed.edge_id || ed.id;
      if (edgeIds.has(id)) errors.push(`Edge ID 중복: ${id}`);
      edgeIds.add(id);
      const path = ed.path_id || ed.path;
      if (path && !kit.paths.has(path)) errors.push(`${id}: 없는 Path ${path}`);
      if (ed.checkpoint_id && !kit.paths.findCheckpoint(ed.checkpoint_id)) errors.push(`${id}: 없는 Checkpoint ${ed.checkpoint_id}`);
      if (ed.actor_id && !kit.actors.has(ed.actor_id)) errors.push(`${id}: 없는 Actor ${ed.actor_id}`);
      const target = nodeOf(ed.target_node || ed.to);
      if (ed.pre_checkpoint_id && !kit.paths.findCheckpoint(ed.pre_checkpoint_id)) errors.push(`${id}: 없는 Checkpoint ${ed.pre_checkpoint_id}`);
      if (ed.timeline_id && !engine.anim.timeline.has(ed.timeline_id)) errors.push(`${id}: 없는 타임라인 ${ed.timeline_id}`);
      if (ed.transition_type === 'scene') {
        const sc = ed.scale || {};
        const spec = engine.scale.get(sc.scene_id);
        if (!spec) errors.push(`${id}: 없는 스케일 장면 ${sc.scene_id}`);
        else if (spec.level !== sc.level) errors.push(`${id}: 장면 ${sc.scene_id}의 수준은 ${spec.level} (콘텐츠 ${sc.level})`);
        if (sc.checkpoint_id && !kit.paths.findCheckpoint(sc.checkpoint_id)) errors.push(`${id}: 없는 Checkpoint ${sc.checkpoint_id}`);
      }
      if ((ed.transition_type || 'move') === 'move' && !path && !(target && target.checkpoint_id) && !ed.checkpoint_id && !ed.timeline_id) {
        errors.push(`${id}: 이동(move) Edge인데 Path·Checkpoint가 없습니다 (이동 없는 구간은 transition_type "jump")`);
      }
      checkEvents(ed.events, id, errors);
    }
    return { errors, warnings };
  }

  function checkEvents(events, where, errors) {
    for (const ev of events || []) {
      if (ev.type !== 'scene') continue;
      const cmd = ev.command || {};
      const problem = engine.kit.commands.handles(cmd.action) ? (engine.kit.actors.has(cmd.target) || !String(cmd.action).startsWith('actor_') ? '' : `없는 Actor ${cmd.target}`) : '';
      if (problem) errors.push(`${where}: 3D 이벤트 ${cmd.action} — ${problem}`);
    }
  }

  // ---------- 시작·재시작·종료 ----------
  async function start(modeId) {
    if (!sm.can('start') && sm.state !== 'completed') return false;
    if (modeId) mode.set(modeId);
    mode.resetQuestion();
    session.newSession();
    sm.force('loading', 'start');
    await resetScene();
    const r = await py('lesson.reset');
    if (r === STALE) return false;
    view = r;
    lastExplain = null; feedback = null; failure = null; hints = [];
    session.startClock();
    sm.to(nextWaitState(), 'start');
    applyPresentation();
    emit('view');
    return true;
  }

  async function resetScene() {
    engine.anim.cancelAll('restart');
    engine.kit.motion.cancelAll('restart');
    engine.camera.stopFollow();
    await engine.resetMotion();
    engine.highlightStructures([]);
    if (lesson && lesson.initial_visual_state) await engine.applyVisualState(lesson.initial_visual_state);
    engine.overview(0);
  }

  async function restart() {
    if (!sm.can('restart')) return false;
    session.stopClock();
    log('현재 기전 재시작');
    sm.force('ready', 'restart');
    return start(mode.id);
  }

  async function end() {
    if (!sm.can('end')) return false;
    const rec = await saveRecord('quit');
    engine.kit.motion.cancelAll('end');
    sm.force('completed', 'end');
    emit('complete', { record: rec, status: 'quit' });
    return true;
  }

  // ---------- 입력 ----------
  async function submit(text) {
    if (!sm.can('submit')) { log(`지금은 제출할 수 없습니다 (${sm.state})`, 'warn'); return null; }
    const value = String(text ?? '').normalize('NFC');
    if (!value.trim()) { feedback = { kind: 'info', text: '용어를 입력하세요.' }; emit('view'); return 'empty'; }
    sm.to('checking', 'submit');
    let r;
    try {
      r = await py('lesson.submit', value);
    } catch (err) {
      feedback = { kind: 'error', text: `판정 요청 실패: ${err.message}. 다시 입력하세요.` };
      sm.to(nextWaitState(), 'python_error');
      emit('view');
      return 'error';
    }
    if (r === STALE) return 'stale';
    view = r.view;
    if (r.result === 'wrong') {
      feedback = { kind: 'wrong', text: `"${value.trim()}"은(는) 정답이 아닙니다. 현재 위치에서 다시 입력하세요.` };
      sm.to(nextWaitState(), 'wrong');
      emit('view', { wrong: true });
      return 'wrong';
    }
    if (r.result !== 'correct' && r.result !== 'move_error') {
      feedback = { kind: 'info', text: `입력 처리: ${r.result}` };
      sm.to(nextWaitState(), r.result);
      emit('view');
      return r.result;
    }
    if (r.result === 'move_error') {
      feedback = { kind: 'error', text: `3D 경로가 없어 이동하지 못했습니다: ${r.errors.join(' / ')}` };
      sm.to(nextWaitState(), 'move_error');
      emit('view');
      return 'move_error';
    }
    mode.resetQuestion();
    hints = [];
    if (!r.edge) {
      // 시작 노드: 이동 없이 도착
      await runEvents(r.events);
      afterArrival();
      return 'correct';
    }
    const target = r.move && r.move.anatomical_id;
    const next = nodeOf(edgeTarget(r.edge));
    feedback = { kind: 'correct', text: `정답! ${next ? (next.name_ko || next.ko) : ''}(으)로 이동합니다.` };
    sm.to('transitioning', 'correct');
    emit('view');
    return runMotion(r.commands, r.move, target);
  }

  // 노드로 들어오는 Edge의 타임라인 (그 단계의 모양을 되돌릴 때)
  function edgeTimelineTo(node) {
    const id = node.node_id || node.id;
    const ed = (lesson.edges || []).find((x) => (x.target_node || x.to) === id && x.timeline_id);
    return ed ? ed.timeline_id : null;
  }

  function edgeTarget(edgeId) {
    const ed = (lesson.edges || []).find((x) => (x.edge_id || x.id) === edgeId);
    return ed ? (ed.target_node || ed.to) : null;
  }

  // 이동 명령 실행 → 결과 → Python 도착 처리
  async function runMotion(commands, move, targetStructure) {
    const no = session.no;
    const actor = actorId();
    const cmds = (commands || []).map((c) => (isNum(c.duration) ? { ...c, duration: Math.max(100, c.duration / options.actorSpeed) } : { ...c }));
    const moving = cmds.some((c) => c.action === 'actor_move_to_checkpoint' || c.action === 'actor_move');
    if (moving && options.cameraMode === 'auto' && !options.reducedMotion) engine.camera.startFollow(actor);
    let status = 'ok';
    if (cmds.length) {
      const t0 = performance.now();
      const summary = await engine.runner.run(cmds);
      if (!session.isCurrent(no)) return 'stale';
      const outs = summary.results.map((x) => x.outcome).filter((o) => o && typeof o === 'object');
      if (summary.failed) status = 'failed';
      else if (outs.some((o) => o.status === 'cancelled')) status = 'cancelled';
      else if (outs.some((o) => o.status === 'failed')) status = 'failed';
      else status = outs.length ? outs[outs.length - 1].status : 'ok';
      log(`이동 ${status} (${Math.round(performance.now() - t0)}ms${summary.errors.length ? ` · ${summary.errors.join(' / ')}` : ''})`, status === 'failed' ? 'error' : '');
    }
    const r = await py('lesson.arrived', status === 'arrived' || status === 'completed' || status === 'ok' ? 'arrived' : status);
    if (r === STALE) return 'stale';
    view = r.view;
    if (r.result === 'arrived') {
      await runEvents(r.events);
      if (!session.isCurrent(no)) return 'stale';
      await cameraOnArrival(targetStructure);
      afterArrival();
      return 'arrived';
    }
    if (r.result === 'ignored') { sm.to(nextWaitState(), 'ignored'); emit('view'); return 'ignored'; }
    // 이동 실패·취소: 학습 상태는 진행하지 않는다 → 재시도 또는 마지막 정상 위치 복구
    failure = { edge: r.edge, status };
    feedback = { kind: 'error', text: `Actor 이동이 ${status === 'cancelled' ? '취소' : '실패'}되었습니다. 다시 시도하거나 마지막 정상 위치로 돌아가세요.` };
    engine.camera.stopFollow();
    sm.to('error', `move_${status}`);
    emit('view');
    return `move_${status}`;
  }

  async function cameraOnArrival(structureId) {
    engine.camera.stopFollow();
    if (options.cameraMode !== 'auto') return;
    const d = options.reducedMotion ? 0 : Math.round(700 / options.cameraSpeed);
    if (options.reducedMotion && !structureId) return;
    const sp = engine.scale.currentSpec;
    if (sp && engine.scale.current !== engine.organSceneId()) { engine.overview(d); return; }   // 개념·조직 장면   // 개념 장면: 기관 구조 대신 장면 정면(교환 부위 전체)
    if (structureId && engine.kind === 'anatomy') await engine.focusStructure(structureId, d);
    else engine.focusActor(actorId(), null, d);
  }

  function afterArrival() {
    const cur = view && view.current ? nodeOf(view.current) : null;
    lastExplain = cur;
    if (cur) feedback = { kind: 'correct', text: `도착: ${cur.name_ko || cur.ko}` };
    failure = null;
    if (view.phase === 'done') { complete(); return; }
    sm.to(nextWaitState(), 'arrived');
    applyPresentation();
    emit('view', { arrived: true });
  }

  // 도착 후 이벤트: var(표시), scene(3D 명령), complete, log. sequential만 기다리고 parallel은 기다리지 않는다
  async function runEvents(events) {
    for (const ev of events || []) {
      if (ev.type === 'scene') {
        const cmd = { ...ev.command };
        if (ev.mode === 'sequential') {
          const job = engine.runner.run([{ ...cmd, wait: true }]);
          const res = await Promise.race([job, new Promise((r) => setTimeout(() => r({ timeout: true }), EVENT_TIMEOUT_MS))]);
          if (res.timeout) log(`3D 이벤트 ${cmd.action}: ${EVENT_TIMEOUT_MS}ms 안에 끝나지 않아 기다리지 않고 진행`, 'warn');
          else if (res.failed && ev.required) throw new Error(`필수 3D 이벤트 실패: ${cmd.action}`);
        } else {
          engine.runner.run([cmd]).then((s) => { if (s.failed) log(`장식용 3D 이벤트 실패(무시): ${cmd.action}`, 'warn'); });
        }
      } else if (ev.type === 'var') {
        log(`상태 ${ev.var} = ${ev.value}`);
      } else if (ev.type === 'log') {
        log(ev.text);
      } else if (['color', 'show', 'hide', 'pulse'].includes(ev.type)) {
        log(`2D 모델 이벤트 ${ev.type}는 3D Play 화면에서 쓰지 않습니다`, 'warn');
      }
    }
  }

  // 다음 위치 안내(강조)와 라벨 정책
  function applyPresentation() {
    if (!view) return;
    const nextIds = view.candidates.map((c) => c.anatomical_id).filter(Boolean);
    engine.highlightStructures(mode.highlightNext() && sm.state !== 'completed' ? nextIds : []);
  }

  async function complete() {
    session.stopClock();
    engine.highlightStructures([]);
    sm.to('completed', 'goal');
    const rec = await saveRecord(view.end_reason === 'goal' ? 'completed' : `ended_${view.end_reason}`);
    emit('complete', { record: rec, status: 'completed' });
  }

  async function saveRecord(status) {
    session.stopClock();
    const info = {
      session_id: session.id, learning_mode: mode.id,
      start_time: session.startedAt ? session.startedAt.toISOString() : '', end_time: new Date().toISOString(),
      active_seconds: session.activeSeconds(), completion_status: status,
    };
    let rec = null;
    try {
      rec = await engine.client.call('lesson.record', info);
    } catch (err) {
      log(`기록 계산 실패: ${err.message}`, 'error');
      return null;
    }
    const saved = session.saveRecord(rec);
    if (!saved.ok) log(`기록 저장 실패: ${saved.error} (게임은 계속됩니다)`, 'error');
    else log(`학습 기록 저장 (${saved.count}개 보관)`);
    return { ...rec, saved: saved.ok, saveError: saved.error };
  }

  // ---------- 힌트·정답 보기 ----------
  async function hint() {
    if (!sm.can('hint')) return null;
    const r = await py('lesson.hint');
    if (r === STALE || !r.ok) return null;
    view = r.view;
    hints = r.hints;
    emit('view');
    return hints;
  }

  // 정답 보기 (암기·추론 모드): 힌트 1회로 기록
  async function reveal() {
    if (!sm.can('reveal')) return null;
    const r = await hint();
    if (!r) return null;
    mode.reveal(view.candidates.map((c) => c.node));
    applyPresentation();
    emit('view', { revealed: true });
    return true;
  }

  // ---------- 일시정지 ----------
  function pause() {
    if (!sm.can('pause')) return false;
    engine.kit.motion.pauseAll();
    engine.anim.pauseAll();
    engine.scale.pause();
    engine.camera.stopFollow();
    session.hold('pause');
    sm.to('paused', 'user');
    emit('view');
    return true;
  }

  function resume() {
    if (!sm.can('resume')) return false;
    const back = sm.beforePause || 'waiting_input';
    engine.kit.motion.resumeAll();
    engine.anim.resumeAll();
    engine.scale.resume();
    if (back === 'transitioning' && options.cameraMode === 'auto' && !options.reducedMotion) engine.camera.startFollow(actorId());
    session.release('pause');
    sm.to(back, 'resume');
    emit('view');
    return true;
  }

  // ---------- 이동 실패 복구 ----------
  async function retry() {
    if (!sm.can('retry') || !failure || failure.fatal) return false;
    const r = await py('lesson.retry');
    if (r === STALE || !r.ok) { feedback = { kind: 'error', text: '재시도할 이동이 없습니다. 복구를 누르세요.' }; emit('view'); return false; }
    sm.to('transitioning', 'retry');
    feedback = { kind: 'info', text: '이동을 다시 시도합니다.' };
    emit('view');
    const target = view.moving_edge ? nodeOf(edgeTarget(view.moving_edge)) : null;
    return runMotion(r.commands, null, target && target.anatomical_id);
  }

  async function recover() {
    if (!sm.can('recover') || !failure || failure.fatal) return false;
    const r = await py('lesson.recover', '사용자 복구');
    if (r === STALE) return false;
    view = r.view;
    if (r.checkpoint_id) {
      // 마지막 정상 위치가 다른 스케일 장면이면 그 장면으로 먼저 돌아간다 (즉시 전환)
      const sid = engine.scale.sceneOfCheckpoint(r.checkpoint_id);
      if (sid && sid !== engine.scale.current) {
        const spec = engine.scale.get(sid);
        await engine.runner.run([{ action: 'scale_change', target: actorId(), level: spec.level, scene_id: sid, checkpoint_id: r.checkpoint_id, duration: 0, wait: true }]);
      }
      await engine.runner.run([{ action: 'actor_place_at_checkpoint', target: actorId(), checkpoint_id: r.checkpoint_id }]);
      // STEP 04-B: 마지막 정상 노드의 단계 모양(판막·형태)으로 되돌린다
      const node = view && view.current ? nodeOf(view.current) : null;
      const tl = node ? edgeTimelineTo(node) : null;
      const ph = tl ? engine.conceptPhases().find((p) => p.timeline_id === tl) : null;
      if (ph) await engine.applyPhaseEnd(ph.phase_key);
      else if (r.visual_state && Object.keys(r.visual_state).length) await engine.applyVisualState(r.visual_state);
    } else {
      await engine.resetMotion();
    }
    failure = null;
    feedback = { kind: 'info', text: '마지막 정상 위치로 돌아왔습니다. 다시 입력하세요.' };
    sm.to(nextWaitState(), 'recover');
    applyPresentation();
    emit('view');
    return true;
  }

  return {
    loadLesson,
    start,
    restart,
    end,
    submit,
    hint,
    reveal,
    pause,
    resume,
    retry,
    recover,
    setOption(k, v) {
      options[k] = v;
      if (k === 'showPath') engine.kit.paths.setShowPaths(!!v);
      if (k === 'cameraMode' && v === 'free') engine.camera.stopFollow();
      if (k === 'reducedMotion' && v) engine.camera.stopFollow();
      if (k === 'reducedMotion') { engine.scale.setReducedMotion(!!v); engine.anim.setReducedMotion(!!v); }
      emit('options');
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    nodeOf,
    get state() { return sm.state; },
    get machine() { return sm; },
    get view() { return view; },
    get lesson() { return lesson; },
    get lastExplain() { return lastExplain; },
    get feedback() { return feedback; },
    get failure() { return failure; },
    get hints() { return hints; },
    get options() { return { ...options }; },
    get validation() { return validation; },
    get timings() { return { ...lastMs }; },
  };
}
