// Motion Controller (STEP 03-C): Actor를 경로 위에서 움직이는 공통 이동 엔진
// - 기존 렌더링 루프(viewport onFrame)에서 tick(dt)으로만 움직인다. 별도 루프를 만들지 않는다.
// - 진행은 거리(m) 단위다: distance += 방향 × 속도(m/s) × dt. 프레임 속도와 무관하게 같은 시간에 같은 거리를 간다.
// - dt는 viewport가 0.1초로 제한한다(탭이 비활성이었다가 돌아와도 한 번에 크게 튀지 않음).
// - Checkpoint는 한 프레임 이동 구간 [이전 거리, 새 거리]과의 교차로 감지한다 → 큰 dt에서도 건너뛰지 않는다.
// - 같은 Checkpoint 이벤트는 (Checkpoint, 바퀴 수, 방향)마다 한 번만 실행한다.
//   다시 활성화되는 조건: 순환 경로에서 새 바퀴 시작, actor_reset, 경로 재지정(actor_set_path), 경로 전환(연결 경로).
// - 명령마다 결과(arrived / completed / cancelled / failed)를 Promise로 돌려준다.
// - 장면 전환·초기화 때 session 번호를 올리고 진행 중 명령을 모두 cancelled로 끝낸다. 이전 session의 명령은 실행하지 않는다.

import * as THREE from 'three';

const FORWARD = new THREE.Vector3(0, 0, 1);    // Actor 모델의 앞쪽(+Z)
const MAX_SUBSTEPS = 8;                        // 한 프레임에서 경로 끝·순환·전환을 처리하는 최대 횟수

export function createMotionController({ paths, actors, log = () => {} }) {
  let session = 1;
  let cmdSeq = 0;
  const listeners = new Set();
  const events = [];                            // 최근 이벤트 기록 (개발자 로그)
  const tmpP = new THREE.Vector3();
  const tmpT = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpQ2 = new THREE.Quaternion();

  function emit(kind, data) {
    const ev = { kind, session, t: Math.round(performance.now()), ...data };
    events.push(ev);
    if (events.length > 300) events.shift();
    for (const fn of listeners) fn(kind, ev);
  }

  // ---------- 내부 상태 ----------
  function mstate(a) {
    if (!a.m) a.m = { lap: 0, fired: new Set(), target: null, cmd: null, fresh: true, quat: null, route: [], maxLoops: 0, passStops: false };
    return a.m;
  }

  function setState(a, s) {
    if (a.movement_state === s) return;
    a.movement_state = s;
    emit('state', { actor_id: a.actor_id, state: s, path_id: a.path_id });
  }

  function finishCmd(a, status, extra = {}) {
    const m = mstate(a);
    if (!m.cmd) return;
    const c = m.cmd;
    m.cmd = null;
    const result = { status, actor_id: a.actor_id, cmd_id: c.id, action: c.action, session: c.session, path_id: a.path_id, progress: round(a.progress), ...extra };
    emit('command_done', result);
    c.resolve(result);
  }

  function newCmd(a, action) {
    const m = mstate(a);
    if (m.cmd) finishCmd(a, 'cancelled', { reason: '새 이동 명령으로 대체' });
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    cmdSeq += 1;
    m.cmd = { id: cmdSeq, action, session, resolve };
    return { id: cmdSeq, promise };
  }

  function fail(actorId, action, reason) {
    cmdSeq += 1;
    const result = { status: 'failed', actor_id: actorId, cmd_id: cmdSeq, action, session, reason };
    emit('command_done', result);
    log(`이동 명령 실패 (${action} ${actorId}): ${reason}`, 'error');
    return { id: cmdSeq, promise: Promise.resolve(result), result };
  }

  // ---------- 위치·회전 적용 ----------
  function place(a, dt = 0, snap = false) {
    const len = paths.length(a.path_id);
    a.progress = len > 0 ? a.distance / len : 0;
    const p = paths.pointAt(a.path_id, a.distance, tmpP);
    if (!p) return;
    a.object3D.position.copy(p);
    if (a.rotation_mode !== 'tangent') return;
    const t = paths.tangentAt(a.path_id, a.distance, tmpT);
    if (!t) return;
    if (a.direction < 0) t.negate();
    const m = mstate(a);
    // 평행 이동(parallel transport): 이전 앞쪽에서 새 접선으로 최소 회전만 더한다 → 뒤집힘 방지
    if (!m.quat || snap) {
      m.quat = new THREE.Quaternion().setFromUnitVectors(FORWARD, t);
      m.fwd = t.clone();
    } else {
      tmpQ.setFromUnitVectors(m.fwd, t);
      m.quat.premultiply(tmpQ).normalize();
      m.fwd.copy(t);
    }
    if (snap || dt <= 0) a.object3D.quaternion.copy(m.quat);
    else a.object3D.quaternion.slerp(m.quat, 1 - Math.exp(-dt * 14));
  }

  // ---------- 조회 ----------
  function stopsAhead(a) {
    const cps = paths.checkpoints(a.path_id).filter((c) => c.valid && c.stop_on_arrival);
    const d = a.distance;
    if (a.direction > 0) return cps.filter((c) => c.distance > d + 1e-9);
    return cps.filter((c) => c.distance < d - 1e-9).reverse();
  }

  function nextCheckpoint(a) {
    const cps = paths.checkpoints(a.path_id).filter((c) => c.valid);
    const d = a.distance;
    const list = a.direction > 0 ? cps.filter((c) => c.distance > d + 1e-9) : cps.filter((c) => c.distance < d - 1e-9).reverse();
    return list[0] || null;
  }

  // ---------- 명령 ----------
  function check(actorId, action) {
    const a = actors.get(actorId);
    if (!a) return { error: `없는 Actor: ${actorId}` };
    return { a };
  }

  function setPath(actorId, pathId, { progress = null, distance = null, direction = null } = {}) {
    const { a, error } = check(actorId);
    if (error) return { ok: false, error };
    if (!paths.has(pathId)) return { ok: false, error: `없는 경로: ${pathId}` };
    const len = paths.length(pathId);
    if (!(len > 0)) return { ok: false, error: `길이가 0인 경로: ${pathId}` };
    if (mstate(a).cmd) finishCmd(a, 'cancelled', { reason: '경로 변경' });
    a.path_id = pathId;
    const def = paths.get(pathId);
    a.direction = direction === -1 || direction === 1 ? direction : (def.direction || 1);
    if (Number.isFinite(distance)) a.distance = THREE.MathUtils.clamp(distance, 0, len);
    else if (Number.isFinite(progress)) a.distance = THREE.MathUtils.clamp(progress, 0, 1) * len;
    else a.distance = a.direction > 0 ? 0 : len;
    if (def.default_speed) a.speed = def.default_speed;
    const m = mstate(a);
    m.lap = 0;
    m.fired.clear();
    m.fresh = true;
    m.target = null;
    m.quat = null;
    setState(a, 'idle');
    place(a, 0, true);
    emit('path_set', { actor_id: actorId, path_id: pathId });
    return { ok: true };
  }

  // 이동 시작. opts: { speed(m/s), duration(ms, 목적지까지), until: 'end'|'next_stop'|checkpoint_id, loops, pass_stops, route:[path_id...] }
  function move(actorId, opts = {}) {
    const { a, error } = check(actorId);
    if (error) return fail(actorId, 'actor_move', error);
    if (!a.path_id || !paths.has(a.path_id)) return fail(actorId, 'actor_move', '경로가 지정되지 않았습니다');
    const m = mstate(a);
    const len = paths.length(a.path_id);
    let target = null;
    if (opts.until && opts.until !== 'end' && opts.until !== 'next_stop') {
      const cp = paths.checkpoints(a.path_id).find((c) => c.checkpoint_id === opts.until);
      if (!cp) return fail(actorId, 'actor_move_to_checkpoint', `이 경로(${a.path_id})에 없는 Checkpoint: ${opts.until}`);
      if (!cp.valid) return fail(actorId, 'actor_move_to_checkpoint', `위치를 계산할 수 없는 Checkpoint: ${opts.until}`);
      if (Math.abs(cp.distance - a.distance) < 1e-9) {
        // 이미 그 위치
        const c = newCmd(a, 'actor_move_to_checkpoint');
        setState(a, 'waiting_at_checkpoint');
        finishCmd(a, 'arrived', { checkpoint_id: cp.checkpoint_id, note: '이미 도착' });
        return c;
      }
      // 목표가 뒤쪽이면 방향을 바꾼다 (순환 경로는 진행 방향 유지)
      const def = paths.get(a.path_id);
      if (!def.closed) a.direction = cp.distance > a.distance ? 1 : -1;
      target = { checkpoint_id: cp.checkpoint_id, distance: cp.distance };
    }
    const c = newCmd(a, target ? 'actor_move_to_checkpoint' : 'actor_move');
    m.target = target;
    m.passStops = !!opts.pass_stops;
    m.maxLoops = Number.isFinite(opts.loops) ? opts.loops : (m.maxLoops || 0);
    if (Array.isArray(opts.route)) m.route = [...opts.route];
    if (Number.isFinite(opts.speed) && opts.speed > 0) a.speed = opts.speed;
    if (Number.isFinite(opts.duration) && opts.duration > 0) {
      // duration: 목적지(목표 Checkpoint, 다음 정지 지점, 끝)까지 걸릴 시간 → 속도로 바꾼다
      let dist = null;
      if (target) dist = travelDistance(a, target.distance, len);
      else {
        const stop = !m.passStops ? stopsAhead(a)[0] : null;
        dist = stop ? Math.abs(stop.distance - a.distance) : (a.direction > 0 ? len - a.distance : a.distance);
      }
      if (dist > 0) a.speed = dist / (opts.duration / 1000);
    }
    // 끝에 서 있으면: 순환 경로는 그대로, 열린 경로는 처음으로 되돌리지 않고 완료 처리
    const atEnd = a.direction > 0 ? a.distance >= len - 1e-9 : a.distance <= 1e-9;
    if (atEnd && !paths.get(a.path_id).closed && !linkAfter(a)) {
      setState(a, 'completed');
      finishCmd(a, 'completed', { note: '이미 경로 끝' });
      return c;
    }
    setState(a, 'moving');
    return c;
  }

  function travelDistance(a, d, len) {
    const def = paths.get(a.path_id);
    if (!def.closed) return Math.abs(d - a.distance);
    return a.direction > 0 ? ((d - a.distance) + len) % len : ((a.distance - d) + len) % len;
  }

  function moveToCheckpoint(actorId, checkpointId, opts = {}) {
    const a = actors.get(actorId);
    if (!a) return fail(actorId, 'actor_move_to_checkpoint', `없는 Actor: ${actorId}`);
    // 다른 경로의 Checkpoint면 그 경로로 옮긴다
    const found = paths.findCheckpoint(checkpointId);
    if (!found) return fail(actorId, 'actor_move_to_checkpoint', `없는 Checkpoint: ${checkpointId}`);
    if (found.pathId !== a.path_id) {
      const r = setPath(actorId, found.pathId);
      if (!r.ok) return fail(actorId, 'actor_move_to_checkpoint', r.error);
    }
    return move(actorId, { ...opts, until: checkpointId });
  }

  // 이동 없이 Checkpoint 위치에 놓기 (transition 'jump', 마지막 정상 위치 복구)
  function placeAtCheckpoint(actorId, checkpointId) {
    const a = actors.get(actorId);
    if (!a) return fail(actorId, 'actor_place_at_checkpoint', `없는 Actor: ${actorId}`);
    const found = paths.findCheckpoint(checkpointId);
    if (!found || !found.cp.valid) return fail(actorId, 'actor_place_at_checkpoint', `없는 Checkpoint: ${checkpointId}`);
    const r = setPath(actorId, found.pathId, { distance: found.cp.distance });
    if (!r.ok) return fail(actorId, 'actor_place_at_checkpoint', r.error);
    // 그 Checkpoint 이벤트는 이미 처리한 것으로 본다 (다음 이동에서 다시 내지 않음)
    mstate(a).fired.add(`${checkpointId}|0|${a.direction > 0 ? 'forward' : 'backward'}`);
    mstate(a).fresh = false;
    setState(a, 'waiting_at_checkpoint');
    cmdSeq += 1;
    const result = { status: 'arrived', actor_id: actorId, cmd_id: cmdSeq, action: 'actor_place_at_checkpoint', session, path_id: found.pathId, progress: round(a.progress), checkpoint_id: checkpointId };
    emit('command_done', result);
    return { id: cmdSeq, promise: Promise.resolve(result), result };
  }

  // 전체 일시정지·재개 (게임 일시정지): 이동 중인 Actor만
  const pausedByGame = new Set();
  function pauseAll() {
    for (const a of actors.list()) if (a.movement_state === 'moving') { setState(a, 'paused'); pausedByGame.add(a.actor_id); }
    return pausedByGame.size;
  }
  function resumeAll() {
    for (const id of pausedByGame) { const a = actors.get(id); if (a && a.movement_state === 'paused') setState(a, 'moving'); }
    const n = pausedByGame.size;
    pausedByGame.clear();
    return n;
  }

  // 개발자 Next: 정지 지점에서 다음 정지 지점까지
  function next(actorId, opts = {}) {
    const a = actors.get(actorId);
    if (!a) return fail(actorId, 'actor_next', `없는 Actor: ${actorId}`);
    return move(actorId, { ...opts, until: 'next_stop' });
  }

  function pause(actorId) {
    const a = actors.get(actorId);
    if (!a) return { ok: false, error: `없는 Actor: ${actorId}` };
    if (a.movement_state !== 'moving') return { ok: false, error: `이동 중이 아님 (${a.movement_state})` };
    setState(a, 'paused');
    return { ok: true };
  }

  function resume(actorId) {
    const a = actors.get(actorId);
    if (!a) return { ok: false, error: `없는 Actor: ${actorId}` };
    if (a.movement_state !== 'paused') return { ok: false, error: `일시정지 상태가 아님 (${a.movement_state})` };
    setState(a, 'moving');
    return { ok: true };
  }

  function stop(actorId) {
    const a = actors.get(actorId);
    if (!a) return { ok: false, error: `없는 Actor: ${actorId}` };
    mstate(a).target = null;
    setState(a, 'cancelled');
    finishCmd(a, 'cancelled', { reason: 'actor_stop' });
    return { ok: true };
  }

  function setSpeed(actorId, speed) {
    const a = actors.get(actorId);
    if (!a) return { ok: false, error: `없는 Actor: ${actorId}` };
    if (!(Number.isFinite(speed) && speed > 0)) return { ok: false, error: '속도는 0보다 큰 숫자(m/s)' };
    a.speed = speed;
    return { ok: true };
  }

  // 진행률 지정: 그 사이 Checkpoint 이벤트는 실행하지 않는다(순간 이동)
  function seek(actorId, progress) {
    const a = actors.get(actorId);
    if (!a) return { ok: false, error: `없는 Actor: ${actorId}` };
    if (!a.path_id) return { ok: false, error: '경로가 지정되지 않았습니다' };
    if (!(Number.isFinite(progress) && progress >= 0 && progress <= 1)) return { ok: false, error: '진행률은 0~1' };
    a.distance = progress * paths.length(a.path_id);
    mstate(a).fresh = true;
    place(a, 0, true);
    return { ok: true };
  }

  function reset(actorId) {
    const a = actors.get(actorId);
    if (!a) return { ok: false, error: `없는 Actor: ${actorId}` };
    if (!a.path_id) { setState(a, 'idle'); return { ok: true }; }
    finishCmd(a, 'cancelled', { reason: 'actor_reset' });
    return setPath(actorId, a.path_id);   // 경로 기본 방향의 시작 위치로
  }

  function reverse(actorId) {
    const a = actors.get(actorId);
    if (!a) return { ok: false, error: `없는 Actor: ${actorId}` };
    a.direction = -a.direction;
    mstate(a).target = null;
    place(a, 0, true);
    emit('reverse', { actor_id: actorId, direction: a.direction });
    return { ok: true };
  }

  // 장면 전환·초기화: 모든 이동 취소, session 증가
  function cancelAll(reason = 'reset') {
    for (const a of actors.list()) {
      if (a.m && a.m.cmd) finishCmd(a, 'cancelled', { reason });
      if (a.movement_state === 'moving' || a.movement_state === 'paused') setState(a, 'cancelled');
    }
    session += 1;
    pausedByGame.clear();
    emit('session', { reason });
    return session;
  }

  // ---------- 매 프레임 ----------
  function linkAfter(a) {
    const m = mstate(a);
    if (m.route.length) return { to: m.route[0], fromRoute: true };
    const def = paths.get(a.path_id);
    if (a.direction > 0 && def.links && def.links.length) return def.links.find((l) => !l.when || l.when === a.biological_state.branch) || def.links[0];
    return null;
  }

  // 한 구간(d0→d1)에서 지나간 Checkpoint 처리. 정지해야 하면 그 Checkpoint를 돌려준다.
  function crossCheckpoints(a, d0, d1, includeStart) {
    const m = mstate(a);
    const fwd = d1 >= d0;
    const lo = Math.min(d0, d1);
    const hi = Math.max(d0, d1);
    const dir = a.direction > 0 ? 'forward' : 'backward';
    let cps = paths.checkpoints(a.path_id).filter((c) => c.valid && (
      (c.distance > lo && c.distance < hi) ||
      (c.distance === (fwd ? hi : lo)) ||
      (includeStart && c.distance === (fwd ? lo : hi))));
    if (!fwd) cps = cps.slice().reverse();
    for (const cp of cps) {
      const trig = cp.trigger || 'both';
      if (trig !== 'both' && trig !== dir) continue;
      const key = `${cp.checkpoint_id}|${m.lap}|${dir}`;
      if (m.fired.has(key)) continue;
      m.fired.add(key);
      emit('checkpoint', { actor_id: a.actor_id, path_id: a.path_id, checkpoint_id: cp.checkpoint_id, anatomical_id: cp.anatomical_id || null, event_ids: cp.event_ids || [], label: cp.label || '', direction: dir, lap: m.lap, stop: !!cp.stop_on_arrival });
      const isTarget = m.target && m.target.checkpoint_id === cp.checkpoint_id;
      // 목표 Checkpoint로 가는 중이면 중간 정지 지점은 이벤트만 실행하고 지나간다
      if (isTarget || (cp.stop_on_arrival && !m.passStops && !m.target)) return cp;
    }
    return null;
  }

  function step(a, dt) {
    const m = mstate(a);
    let remaining = a.speed * dt;
    for (let i = 0; i < MAX_SUBSTEPS && remaining > 0; i += 1) {
      const def = paths.get(a.path_id);
      const len = paths.length(a.path_id);
      if (!def || !(len > 0)) { setState(a, 'cancelled'); finishCmd(a, 'failed', { reason: '경로가 사라졌거나 길이가 0' }); return; }
      const d0 = a.distance;
      const end = a.direction > 0 ? len : 0;
      const room = Math.abs(end - d0);
      const move = Math.min(remaining, room);
      const d1 = d0 + a.direction * move;
      const stopCp = crossCheckpoints(a, d0, d1, m.fresh);
      m.fresh = false;
      if (stopCp) {
        a.distance = stopCp.distance;
        place(a, dt);
        m.target = null;
        setState(a, 'waiting_at_checkpoint');
        finishCmd(a, 'arrived', { checkpoint_id: stopCp.checkpoint_id, anatomical_id: stopCp.anatomical_id || null });
        emit('arrive', { actor_id: a.actor_id, checkpoint_id: stopCp.checkpoint_id, anatomical_id: stopCp.anatomical_id || null, path_id: a.path_id });
        return;
      }
      a.distance = d1;
      remaining -= move;
      if (move < room - 1e-12) break;   // 경로 끝에 닿지 않음
      // ---- 경로 끝 ----
      if (def.closed) {
        m.lap += 1;
        emit('lap', { actor_id: a.actor_id, path_id: a.path_id, lap: m.lap });
        if (m.maxLoops && m.lap >= m.maxLoops) {
          // 명시적 종료 조건: 지정한 바퀴 수
          setState(a, 'completed');
          finishCmd(a, 'completed', { reason: `순환 ${m.lap}바퀴 완료` });
          place(a, dt);
          return;
        }
        a.distance = a.direction > 0 ? 0 : len;
        m.fresh = true;   // 새 바퀴: 시작점 Checkpoint도 다시 활성화
        continue;
      }
      const link = a.direction > 0 ? linkAfter(a) : null;
      if (link && paths.has(link.to)) {
        if (link.fromRoute) m.route.shift();
        const from = a.path_id;
        a.path_id = link.to;
        a.distance = 0;
        m.fired.clear();
        m.lap = 0;
        m.fresh = true;
        emit('path_switch', { actor_id: a.actor_id, from, to: link.to });
        continue;
      }
      setState(a, 'completed');
      place(a, dt);
      finishCmd(a, 'completed', {});
      emit('completed', { actor_id: a.actor_id, path_id: a.path_id });
      return;
    }
    place(a, dt);
  }

  function tick(dt) {
    if (!(dt > 0)) return;
    for (const a of actors.list()) {
      if (!a.path_id) continue;
      if (a.movement_state === 'moving') step(a, dt);
      else if (a.m && a.m.quat && a.rotation_mode === 'tangent') a.object3D.quaternion.slerp(a.m.quat, 1 - Math.exp(-dt * 14));
    }
  }

  // 경로가 편집되어 길이가 바뀌면 진행률을 유지해 다시 놓는다
  paths.onChange((kind, data) => {
    if (kind !== 'change' && kind !== 'rebuild') return;
    for (const a of actors.list()) {
      if (a.path_id !== data.id) continue;
      if (data.removed || !paths.has(a.path_id)) {
        finishCmd(a, 'failed', { reason: '경로 삭제' });
        a.path_id = null;
        setState(a, 'idle');
        continue;
      }
      if (kind === 'change') a.distance = THREE.MathUtils.clamp(a.progress, 0, 1) * paths.length(a.path_id);
      place(a, 0, kind === 'change');
    }
  });

  return {
    setPath,
    move,
    moveToCheckpoint,
    placeAtCheckpoint,
    pauseAll,
    resumeAll,
    next,
    pause,
    resume,
    stop,
    setSpeed,
    seek,
    reset,
    reverse,
    cancelAll,
    tick,
    nextCheckpoint: (id) => { const a = actors.get(id); return a ? nextCheckpoint(a) : null; },
    events: () => [...events],
    clearEvents: () => { events.length = 0; },
    onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get session() { return session; },
  };
}

function round(n) { return Math.round(n * 1000) / 1000; }
