// Timeline Engine (STEP 04-B): 여러 애니메이션·명령을 순서대로 또는 동시에 실행한다
//
// 타임라인 정의 { timeline_id, blocking, restore_on_cancel, steps: [...] }
// 단계 종류
//   { type: 'animation', animation_id, wait=true, speed, loop, non_blocking }
//   { type: 'state', set: {구조ID: 상태}, wait=true, instant }        → visual-state (판막·혈관 상태)
//   { type: 'command', command: {...}, wait=true, through: [구조ID] } → command-runner (Actor 이동 등)
//        through: 이 이동이 지나가는 구조. 하나라도 OPEN이 아니면 실행하지 않고 실패한다 (닫힌 판막 통과 방지)
//   { type: 'delay', ms }
//   { type: 'parallel', steps: [...] }   모두 끝날 때까지 기다린다 (wait:false 단계는 기다리지 않음)
//   { type: 'sequence', steps: [...] }
//   { type: 'repeat', count, steps: [...] }
//   { type: 'if', when: {structure, equals} | {phase, equals}, then: [...], else: [...] }  (보이는 상태 조건. 학습 규칙 조건은 Python)
//   { type: 'marker', name, phase }      중간 이벤트(화면 표시용). phase가 있으면 현재 단계로 기록
// 실행
//   - blocking 타임라인 결과가 completed가 아니면 학습을 진행하지 않는다(command-runner가 실패·취소로 돌려준다).
//   - 반복 장식 애니메이션은 { wait:false } 로 넣는다 → 끝나지 않아도 타임라인은 끝난다.
//   - pause/resume: 지연·애니메이션 모두 멈춘다. cancel: 남은 단계를 실행하지 않고, restore_on_cancel이면 시작 전 구조 상태로 되돌린다.
//   - session: cancelAll() 뒤에는 이전 타임라인의 남은 단계가 실행되지 않는다.

export function createTimelineEngine({ anim, visual, runner = null, log = () => {} }) {
  const defs = new Map();
  const running = new Map();        // timeline_id → 실행 상태
  const listeners = new Set();
  let session = 0;
  let seq = 0;
  let phase = null;
  let hold = false;                 // 게임 일시정지: 실행 중·새로 시작하는 타임라인 모두 멈춘다
  const emit = (kind, data) => { for (const fn of listeners) fn(kind, data); };

  const STEP_TYPES = ['animation', 'state', 'command', 'delay', 'parallel', 'sequence', 'repeat', 'if', 'marker'];
  function validate(def) {
    const errs = [];
    if (!def || !def.timeline_id) errs.push('timeline_id 없음');
    const walk = (steps, where) => {
      if (!Array.isArray(steps)) { errs.push(`${where}: steps는 배열`); return; }
      steps.forEach((s, i) => {
        const w = `${where}#${i + 1}`;
        if (!STEP_TYPES.includes(s.type)) { errs.push(`${w}: 알 수 없는 단계 ${s.type}`); return; }
        if (s.type === 'animation' && !anim.has(s.animation_id)) errs.push(`${w}: 없는 애니메이션 ${s.animation_id}`);
        if (s.type === 'state') for (const id of Object.keys(s.set || {})) if (!visual.has(id)) errs.push(`${w}: 없는 구조 ${id}`);
        if (s.type === 'delay' && !(s.ms >= 0)) errs.push(`${w}: delay ms는 0 이상`);
        if (s.type === 'repeat' && !(Number.isInteger(s.count) && s.count > 0)) errs.push(`${w}: repeat count는 1 이상 정수`);
        if (s.type === 'command' && (!s.command || !s.command.action)) errs.push(`${w}: command 없음`);
        if (s.through) for (const id of s.through) if (!visual.has(id)) errs.push(`${w}: through의 없는 구조 ${id}`);
        if (s.steps) walk(s.steps, w);
        if (s.then) walk(s.then, `${w}.then`);
        if (s.else) walk(s.else, `${w}.else`);
      });
    };
    if (def) walk(def.steps, def.timeline_id);
    return errs;
  }

  function load(doc) {
    const errors = [];
    for (const d of doc.timelines || []) {
      const e = validate(d);
      if (e.length) errors.push(...e);
      else defs.set(d.timeline_id, { blocking: true, restore_on_cancel: true, ...JSON.parse(JSON.stringify(d)) });
    }
    return { ok: !errors.length, errors };
  }

  // ---------- 실행 ----------
  function play(timelineId, opts = {}) {
    const def = defs.get(timelineId);
    seq += 1;
    if (!def) { const r = { status: 'failed', reason: `없는 타임라인: ${timelineId}` }; return { id: seq, result: r, promise: Promise.resolve(r) }; }
    const prev = running.get(timelineId);
    if (prev) cancelRun(prev, 'replaced');
    const run = { def, id: seq, session, paused: false, cancelled: false, reason: '', started: [], snap: visual.snapshot(), speed: opts.speed || 1 };
    running.set(timelineId, run);
    emit('start', { timeline_id: timelineId, cmd_id: run.id });
    const promise = (async () => {
      let status = 'completed';
      let reason = '';
      try {
        const r = await steps(run, def.steps);
        if (r !== 'ok') { status = r === 'cancelled' ? 'cancelled' : 'failed'; reason = run.reason; }
      } catch (err) {
        status = 'failed';
        reason = err.message;
      }
      if (status !== 'completed' && def.restore_on_cancel !== false && run.reason !== 'replaced') await visual.restore(run.snap);
      if (running.get(timelineId) === run) running.delete(timelineId);
      const result = { status, reason, timeline_id: timelineId, cmd_id: run.id, session: run.session };
      emit(status === 'completed' ? 'complete' : 'end', result);
      if (status !== 'completed') log(`타임라인 ${timelineId}: ${status}${reason ? ` (${reason})` : ''}`, status === 'failed' ? 'error' : 'warn');
      return result;
    })();
    run.promise = promise;
    return { id: run.id, promise };
  }

  const alive = (run) => !run.cancelled && run.session === session;

  async function holdWhilePaused(run) { while ((run.paused || hold) && alive(run)) await new Promise((r) => setTimeout(r, 30)); }

  async function steps(run, list) {
    for (const s of list) {
      await holdWhilePaused(run);
      if (!alive(run)) return 'cancelled';
      const r = await stepOne(run, s);
      if (r !== 'ok') return r;
    }
    return 'ok';
  }

  async function stepOne(run, s) {
    switch (s.type) {
      case 'animation': {
        const h = anim.play(s.animation_id, { speed: (s.speed || 1) * run.speed, loop: s.loop, non_blocking: s.wait === false });
        run.started.push(s.animation_id);
        if (s.wait === false) return h.result && h.result.status === 'failed' ? fail(run, h.result.reason) : 'ok';
        const r = await h.promise;
        if (!alive(run)) return 'cancelled';
        return r.status === 'completed' ? 'ok' : fail(run, r.reason || r.status, r.status);
      }
      case 'state': {
        const p = visual.setMany(s.set, { instant: !!s.instant, speed: run.speed });
        if (s.wait === false) return 'ok';
        const r = await p;
        if (!alive(run)) return 'cancelled';
        return r.status === 'completed' ? 'ok' : fail(run, r.reason || r.status, r.status);
      }
      case 'command': {
        for (const id of s.through || []) {
          if (visual.get(id) !== 'OPEN') return fail(run, `닫힌 구조를 지나는 이동: ${id}는 ${visual.get(id)}`);
        }
        if (!runner) return fail(run, '명령 실행기가 없습니다');
        const job = runner.run([{ ...s.command, wait: s.wait !== false }]);
        if (s.wait === false) return 'ok';
        const sum = await job;
        if (!alive(run)) return 'cancelled';
        if (sum.failed) return fail(run, sum.errors.join(' / '));
        const out = sum.results.map((x) => x.outcome).filter((o) => o && typeof o === 'object').pop();
        if (out && out.status === 'cancelled') return fail(run, 'cancelled', 'cancelled');
        return 'ok';
      }
      case 'delay': {
        let left = s.ms / run.speed;
        while (left > 0) {
          await holdWhilePaused(run);
          if (!alive(run)) return 'cancelled';
          const d = Math.min(left, 30);
          await new Promise((r) => setTimeout(r, d));
          left -= d;
        }
        return 'ok';
      }
      case 'parallel': {
        const rs = await Promise.all(s.steps.map((c) => stepOne(run, c)));
        return rs.find((r) => r !== 'ok') || 'ok';
      }
      case 'sequence':
        return steps(run, s.steps);
      case 'repeat':
        for (let i = 0; i < s.count; i += 1) { const r = await steps(run, s.steps); if (r !== 'ok') return r; }
        return 'ok';
      case 'if': {
        const w = s.when || {};
        let ok = false;
        if (w.structure) ok = visual.get(w.structure) === w.equals;
        else if (w.phase !== undefined) ok = phase === w.phase;
        return steps(run, ok ? (s.then || []) : (s.else || []));
      }
      case 'marker':
        if (s.phase !== undefined) phase = s.phase;
        emit('marker', { timeline_id: run.def.timeline_id, name: s.name, phase: s.phase ?? null, label: s.label || '' });
        return 'ok';
      default:
        return fail(run, `알 수 없는 단계 ${s.type}`);
    }
  }

  function fail(run, reason, status = 'failed') { run.reason = reason; return status === 'cancelled' ? 'cancelled' : 'failed'; }

  function cancelRun(run, reason) {
    run.cancelled = true;
    run.reason = reason;
    for (const a of run.started) if (anim.isPlaying(a)) anim.stop(a, { restore: reason !== 'replaced' });
  }

  function control(id, fn) { const r = running.get(id); if (!r) return { ok: false, error: `실행 중이 아님: ${id}` }; fn(r); return { ok: true }; }

  return {
    load,
    validate,
    define(d) { const e = validate(d); if (!e.length) defs.set(d.timeline_id, { blocking: true, restore_on_cancel: true, ...JSON.parse(JSON.stringify(d)) }); return { ok: !e.length, errors: e }; },
    play,
    pause: (id) => control(id, (r) => { r.paused = true; for (const a of r.started) anim.pause(a); }),
    resume: (id) => control(id, (r) => { r.paused = false; for (const a of r.started) anim.resume(a); }),
    cancel: (id, reason = 'cancelled') => control(id, (r) => cancelRun(r, reason)),
    cancelAll(reason = 'reset') { hold = false; for (const r of [...running.values()]) cancelRun(r, reason); session += 1; return session; },
    pauseAll() { hold = true; },
    resumeAll() { hold = false; },
    has: (id) => defs.has(id),
    def: (id) => defs.get(id) || null,
    ids: () => [...defs.keys()],
    isRunning: (id) => running.has(id),
    runningIds: () => [...running.keys()],
    clear() { this.cancelAll('unload'); defs.clear(); phase = null; },
    get phase() { return phase; },
    setPhase(p) { phase = p; },
    onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get session() { return session; },
  };
}
