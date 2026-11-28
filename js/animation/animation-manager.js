// Animation Manager (STEP 04-B): 모든 3D 객체 애니메이션을 한 곳에서 재생·관리한다
//
// 애니메이션 정의 (content/animations/*.json, FLOW_SPEC 7장)
//   { animation_id, target_id, animation_type, clip_name, morph_target, duration_ms, loop, playback_rate, easing,
//     keyframes: [{time: 0~1 (duration 비율), value}], initial_state, final_state, restore_on_cancel,
//     procedure, params, verification_status, source, notes }
// animation_type
//   transform  : value {position:[m], rotation:[deg], scale:[배] | 숫자}
//   morph      : value 숫자(morph_target의 가중치 0~1) 또는 {target이름: 가중치}
//   clip       : GLB에 들어 있는 AnimationClip (clip_name). Three.js AnimationMixer를 모델마다 하나만 만든다.
//   material   : value {color:'#rrggbb', opacity:0~1, highlight:true|false} → material-controller 상태 층
//   visibility : value {opacity:0~1, visible:true|false} (등장·사라짐)
//   deform     : value 숫자(관 반지름 배율) → deformation-controller
//   procedural : procedure 'pulse'(크기 맥동) | 'morph_cycle'(가중치 반복) | 'deform_cycle'(반지름 반복), params
// 재생
//   - 시간은 ms. 매 프레임 기존 렌더링 루프의 tick(dt)에서만 진행한다 (requestAnimationFrame을 따로 만들지 않음).
//   - 같은 animation_id를 다시 재생하면 이전 재생은 'replaced'로 끝난다 (반복 애니메이션 누적 방지).
//   - 결과: completed | cancelled | failed. cancelAll()은 session을 올려 이전 장면의 콜백이 새 장면에 닿지 않게 한다.
//   - 대상 객체가 사라지면 그 재생은 failed로 끝난다.
//   - restore_on_cancel(기본 true): 취소·정지 때 시작 전 상태로 되돌린다.

import * as THREE from 'three';

export const ANIMATION_TYPES = ['transform', 'morph', 'clip', 'material', 'visibility', 'deform', 'procedural'];
const EASE = {
  linear: (u) => u,
  ease_in: (u) => u * u,
  ease_out: (u) => 1 - (1 - u) * (1 - u),
  ease_in_out: (u) => (u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2),
  step: (u) => (u < 1 ? 0 : 1),
};

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

// 값 보간: 숫자, 숫자 배열, 색상 문자열, 불리언(0.5에서 바뀜), 객체(키별)
function lerpValue(a, b, u) {
  if (isNum(a) && isNum(b)) return a + (b - a) * u;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => lerpValue(x, b[i], u));
  if (typeof a === 'string' && typeof b === 'string' && a[0] === '#' && b[0] === '#') {
    return `#${new THREE.Color(a).lerp(new THREE.Color(b), u).getHexString()}`;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return u < 0.5 ? a : b;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = k in a && k in b ? lerpValue(a[k], b[k], u) : (k in b ? b[k] : a[k]);
    return out;
  }
  return u < 1 ? a : b;
}

function sample(keys, u) {
  if (!keys.length) return undefined;
  if (u <= keys[0].time) return keys[0].value;
  for (let i = 1; i < keys.length; i += 1) {
    if (u <= keys[i].time) {
      const k0 = keys[i - 1];
      const k1 = keys[i];
      const span = k1.time - k0.time || 1;
      return lerpValue(k0.value, k1.value, (u - k0.time) / span);
    }
  }
  return keys[keys.length - 1].value;
}

export function createAnimationManager({ registry, materials, morph, deform = null, log = () => {} }) {
  const defs = new Map();
  const mixers = new Map();         // 모델 루트 ID → { mixer, root, clips: Map }
  const playing = new Map();        // animation_id → 재생 상태
  const listeners = new Set();
  let session = 0;
  let cmdSeq = 0;
  let hold = false;                 // 게임 일시정지 (pauseAll)
  let reduced = false;
  const emit = (kind, data) => { for (const fn of listeners) fn(kind, data); };

  // ---------- 정의 ----------
  function validateDef(d) {
    const errs = [];
    if (!d || typeof d.animation_id !== 'string' || !d.animation_id) errs.push('animation_id 없음');
    if (!ANIMATION_TYPES.includes(d.animation_type)) errs.push(`${d.animation_id}: 알 수 없는 animation_type ${d.animation_type}`);
    if (!d.target_id) errs.push(`${d.animation_id}: target_id 없음`);
    if (d.duration_ms !== undefined && !(isNum(d.duration_ms) && d.duration_ms > 0)) errs.push(`${d.animation_id}: duration_ms는 0보다 큰 숫자(ms)`);
    if (d.playback_rate !== undefined && !(isNum(d.playback_rate) && d.playback_rate > 0)) errs.push(`${d.animation_id}: playback_rate는 0보다 큰 숫자`);
    if (d.easing && !EASE[d.easing]) errs.push(`${d.animation_id}: easing은 ${Object.keys(EASE).join(', ')} 중 하나`);
    if (d.keyframes) {
      if (!Array.isArray(d.keyframes)) errs.push(`${d.animation_id}: keyframes는 배열`);
      else {
        let prev = -1;
        for (const k of d.keyframes) {
          if (!isNum(k.time) || k.time < 0 || k.time > 1) errs.push(`${d.animation_id}: keyframe time은 0~1 (duration 비율)`);
          else if (k.time < prev) errs.push(`${d.animation_id}: keyframe time이 줄어듦`);
          prev = k.time;
        }
      }
    }
    if (d.animation_type === 'clip' && !d.clip_name) errs.push(`${d.animation_id}: clip_name 없음`);
    if (d.animation_type === 'procedural' && !['pulse', 'morph_cycle', 'deform_cycle'].includes(d.procedure)) errs.push(`${d.animation_id}: procedure는 pulse, morph_cycle, deform_cycle`);
    return errs;
  }

  function define(d) {
    const errs = validateDef(d);
    if (errs.length) return { ok: false, errors: errs };
    defs.set(d.animation_id, { loop: false, playback_rate: 1, easing: 'linear', restore_on_cancel: true, keyframes: [], ...JSON.parse(JSON.stringify(d)) });
    return { ok: true, errors: [] };
  }

  function load(doc) {
    const errors = [];
    for (const d of doc.animations || []) errors.push(...define(d).errors);
    return { ok: errors.length === 0, errors, count: defs.size };
  }

  // ---------- GLB 클립 ----------
  // scene-manager가 모델을 등록할 때 넘겨준다. 같은 모델에 Mixer를 두 번 만들지 않는다.
  function registerClips(rootId, root, clips) {
    if (!clips || !clips.length) return 0;
    let rec = mixers.get(rootId);
    if (!rec) { rec = { mixer: new THREE.AnimationMixer(root), root, clips: new Map() }; mixers.set(rootId, rec); }
    for (const c of clips) rec.clips.set(c.name, c);
    return rec.clips.size;
  }
  function clipNames(rootId) { const r = mixers.get(rootId); return r ? [...r.clips.keys()] : []; }
  function clipOf(def) {
    const r = mixers.get(def.target_id);
    return r ? r.clips.get(def.clip_name) || null : null;
  }

  // ---------- 상태 읽기/쓰기 ----------
  function obj(id) { const e = registry.get(id); return e ? e.object3D : null; }

  function capture(def) {
    const o = obj(def.target_id);
    if (!o) return null;
    const t = def.animation_type;
    if (t === 'transform' || (t === 'procedural' && def.procedure === 'pulse')) return { position: o.position.toArray(), quaternion: o.quaternion.toArray(), scale: o.scale.toArray() };
    if (t === 'morph' || (t === 'procedural' && def.procedure === 'morph_cycle')) {
      const out = {};
      for (const n of morph.names(def.target_id)) out[n] = morph.get(def.target_id, n);
      return { morph: out };
    }
    if (t === 'material' || t === 'visibility') return { material: materials.getState(def.target_id) };
    if (t === 'deform' || (t === 'procedural' && def.procedure === 'deform_cycle')) return { radius: deform ? deform.getRadiusScale(def.target_id) : null };
    return {};
  }

  function restore(def, snap) {
    if (!snap) return;
    const o = obj(def.target_id);
    if (!o) return;
    if (snap.position) { o.position.fromArray(snap.position); o.quaternion.fromArray(snap.quaternion); o.scale.fromArray(snap.scale); }
    if (snap.morph) morph.setMany(def.target_id, snap.morph);
    if (snap.material) materials.setState(def.target_id, snap.material);
    if (snap.radius !== undefined && snap.radius !== null && deform) deform.setRadiusScale(def.target_id, snap.radius);
  }

  function applyValue(def, v, rec) {
    const id = def.target_id;
    const o = obj(id);
    if (!o) return false;
    switch (def.animation_type) {
      case 'transform': {
        if (!v) return true;
        if (v.position) o.position.fromArray(v.position);
        if (v.rotation) o.rotation.set(...v.rotation.map((d) => THREE.MathUtils.degToRad(d)));
        if (v.scale !== undefined) { if (isNum(v.scale)) o.scale.setScalar(v.scale); else o.scale.fromArray(v.scale); }
        return true;
      }
      case 'morph':
        if (isNum(v)) return morph.set(id, def.morph_target ?? 0, v);
        return morph.setMany(id, v);
      case 'material': {
        const cur = materials.getState(id) || {};
        materials.setState(id, { color: v.color !== undefined ? v.color : cur.color, opacity: isNum(v.opacity) ? v.opacity : cur.opacity });
        if (typeof v.highlight === 'boolean') materials.setHighlight(id, 'event', v.highlight);
        return true;
      }
      case 'visibility': {
        const cur = materials.getState(id) || {};
        materials.setState(id, { color: cur.color, opacity: isNum(v.opacity) ? v.opacity : cur.opacity, visible: typeof v.visible === 'boolean' ? v.visible : undefined });
        return true;
      }
      case 'deform':
        return !!deform && deform.setRadiusScale(id, v);
      case 'clip': {
        const action = rec.action;
        action.time = Math.min(rec.t, rec.dur) / 1000;
        rec.mixerRec.mixer.update(0);
        return true;
      }
      default:
        return false;
    }
  }

  // 절차형: 시간(ms) → 값
  function procedural(def, rec) {
    const p = def.params || {};
    const period = p.period_ms || def.duration_ms || 1000;
    const ph = ((rec.t % period) / period) * Math.PI * 2;
    const wave = (1 - Math.cos(ph)) / 2;          // 0→1→0
    const o = obj(def.target_id);
    if (!o) return false;
    if (def.procedure === 'pulse') {
      const s0 = rec.baseline && rec.baseline.scale ? rec.baseline.scale : [1, 1, 1];
      const k = 1 + (p.amplitude ?? 0.05) * wave * rec.weight;
      o.scale.set(s0[0] * k, s0[1] * k, s0[2] * k);
      return true;
    }
    if (def.procedure === 'morph_cycle') return morph.set(def.target_id, def.morph_target ?? 0, (p.min ?? 0) + ((p.max ?? 1) - (p.min ?? 0)) * wave * rec.weight);
    if (def.procedure === 'deform_cycle') return !!deform && deform.setRadiusScale(def.target_id, 1 + ((p.scale ?? 1.1) - 1) * wave * rec.weight);
    return false;
  }

  // ---------- 재생 ----------
  function finish(rec, status, extra = {}) {
    if (rec.done) return;
    rec.done = true;
    if (status !== 'completed' && rec.def.restore_on_cancel !== false && extra.restore !== false) restore(rec.def, rec.baseline);
    if (rec.action) rec.action.stop();
    if (playing.get(rec.def.animation_id) === rec) playing.delete(rec.def.animation_id);
    const result = { status, animation_id: rec.def.animation_id, cmd_id: rec.cmdId, session: rec.session, ...extra };
    delete result.restore;
    emit(status === 'completed' ? 'complete' : 'end', result);
    rec.resolve(result);
  }

  function play(animationId, opts = {}) {
    const def = defs.get(animationId);
    cmdSeq += 1;
    const fail = (reason) => ({ id: cmdSeq, result: { status: 'failed', reason, animation_id: animationId }, promise: Promise.resolve({ status: 'failed', reason, animation_id: animationId }) });
    if (!def) return fail(`없는 애니메이션: ${animationId}`);
    if (!registry.has(def.target_id)) return fail(`없는 대상 객체: ${def.target_id}`);
    let mixerRec = null;
    let action = null;
    let dur = def.duration_ms;
    if (def.animation_type === 'clip') {
      mixerRec = mixers.get(def.target_id);
      const clip = clipOf(def);
      if (!clip) return fail(`없는 클립: ${def.target_id}/${def.clip_name}`);
      action = mixerRec.mixer.clipAction(clip);
      action.reset();
      action.play();
      action.paused = true;                 // 시간은 직접 맞춘다 (일시정지·구간 이동·역방향을 같은 방식으로)
      action.setEffectiveWeight(isNum(opts.weight) ? opts.weight : 1);
      dur = dur || clip.duration * 1000;
    }
    if (def.animation_type === 'morph' && !morph.names(def.target_id).length) return fail(`Morph Target이 없는 대상: ${def.target_id}`);
    if ((def.animation_type === 'deform' || def.procedure === 'deform_cycle') && !(deform && deform.has(def.target_id))) return fail(`변형할 수 없는 대상: ${def.target_id}`);
    if (!(dur > 0)) return fail('duration_ms가 필요합니다');
    const prev = playing.get(animationId);
    if (prev) finish(prev, 'cancelled', { reason: 'replaced', restore: false });
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    const loop = opts.loop !== undefined ? opts.loop : def.loop;
    const rec = {
      def, cmdId: cmdSeq, session, resolve, promise, action, mixerRec, dur,
      t: 0, dir: opts.direction === -1 || opts.direction === 'reverse' ? -1 : 1,
      speed: isNum(opts.speed) && opts.speed > 0 ? opts.speed : (def.playback_rate || 1),
      loop: loop === true ? Infinity : (isNum(loop) ? loop : 0), loops: 0,
      weight: isNum(opts.weight) ? opts.weight : 1,
      paused: false, done: false, baseline: capture(def),      // 게임 일시정지(hold)는 step()에서 전역으로 확인한다
      nonBlocking: !!opts.non_blocking,
    };
    if (rec.dir < 0) rec.t = dur;
    if (isNum(opts.from)) rec.t = Math.max(0, Math.min(dur, opts.from <= 1 ? opts.from * dur : opts.from));
    playing.set(animationId, rec);
    // 애니메이션 줄이기: 장식(반복)은 멈춘 첫 상태로, 한 번 재생은 바로 끝 상태로
    if (reduced && def.animation_type !== 'clip') {
      if (rec.loop) { rec.paused = true; frame(rec); } else { rec.t = rec.dir > 0 ? dur : 0; frame(rec); finish(rec, 'completed'); }
    } else frame(rec);
    emit('start', { animation_id: animationId, cmd_id: rec.cmdId });
    return { id: rec.cmdId, promise };
  }

  function frame(rec) {
    const def = rec.def;
    if (!registry.has(def.target_id)) { finish(rec, 'failed', { reason: `대상 객체가 사라짐: ${def.target_id}`, restore: false }); return; }
    if (def.animation_type === 'procedural') { procedural(def, rec); return; }
    if (def.animation_type === 'clip') { applyValue(def, null, rec); return; }
    const u = EASE[def.easing || 'linear'](Math.max(0, Math.min(1, rec.t / rec.dur)));
    let v = sample(def.keyframes, u);
    if (v === undefined) v = u >= 1 ? def.final_state : def.initial_state;
    if (v !== undefined) applyValue(def, def.animation_type === 'morph' && isNum(v) ? v * rec.weight : v, rec);
  }

  function step(rec, dt) {
    if (rec.paused || hold) return;
    rec.t += dt * 1000 * rec.speed * rec.dir;
    if (rec.def.animation_type === 'procedural') {
      // 절차형은 끝이 없다: loop가 숫자면 그만큼 주기 뒤 끝
      frame(rec);
      if (isFinite(rec.loop) && rec.loop > 0 && Math.abs(rec.t) >= rec.loop * (rec.def.params?.period_ms || rec.dur)) finish(rec, 'completed');
      return;
    }
    const end = rec.dir > 0 ? rec.t >= rec.dur : rec.t <= 0;
    if (end) {
      if (rec.loops < rec.loop) {              // loop: 처음 재생 뒤 추가로 반복할 횟수 (true = 끝없이)
        rec.loops += 1;
        rec.t = rec.dir > 0 ? rec.t - rec.dur : rec.t + rec.dur;
        emit('loop', { animation_id: rec.def.animation_id, loops: rec.loops });
        frame(rec);
        return;
      }
      rec.t = rec.dir > 0 ? rec.dur : 0;
      frame(rec);
      finish(rec, 'completed');
      return;
    }
    frame(rec);
  }

  function tick(dt) {
    if (!(dt > 0) || !playing.size) return;
    for (const rec of [...playing.values()]) step(rec, Math.min(dt, 0.25));
  }

  const get = (id) => playing.get(id) || null;
  function control(id, fn) { const r = get(id); if (!r) return { ok: false, error: `재생 중이 아님: ${id}` }; fn(r); return { ok: true }; }

  return {
    define,
    load,
    validateDef,
    registerClips,
    clipNames,
    play,
    pause: (id) => control(id, (r) => { r.paused = true; }),
    resume: (id) => control(id, (r) => { r.paused = false; }),
    stop: (id, { restore: rs = true } = {}) => control(id, (r) => finish(r, 'cancelled', { reason: 'stopped', restore: rs })),
    seek: (id, value) => control(id, (r) => { r.t = Math.max(0, Math.min(r.dur, value <= 1 ? value * r.dur : value)); frame(r); }),
    setSpeed: (id, v) => (v > 0 ? control(id, (r) => { r.speed = v; }) : { ok: false, error: '속도는 0보다 커야 합니다' }),
    setLoop: (id, v) => control(id, (r) => { r.loop = v === true ? Infinity : (isNum(v) ? v : 0); }),
    setDirection: (id, d) => control(id, (r) => { r.dir = d < 0 ? -1 : 1; }),
    setWeight: (id, w) => control(id, (r) => { r.weight = Math.max(0, Math.min(1, w)); if (r.action) r.action.setEffectiveWeight(r.weight); frame(r); }),
    // 장면 전환·재시작: 모든 재생 취소(복원), session 증가, 게임 일시정지 해제
    cancelAll(reason = 'reset') {
      hold = false;
      for (const r of [...playing.values()]) finish(r, 'cancelled', { reason });
      session += 1;
      return session;
    },
    // 장면을 내릴 때: 재생 취소 + Mixer 해제(클립 캐시 정리)
    unload() {
      this.cancelAll('unload');
      for (const r of mixers.values()) { r.mixer.stopAllAction(); r.mixer.uncacheRoot(r.root); }
      mixers.clear();
    },
    clearDefs() { defs.clear(); },
    pauseAll() { hold = true; },
    resumeAll() { hold = false; },
    setReducedMotion(on) { reduced = !!on; },
    tick,
    has: (id) => defs.has(id),
    def: (id) => defs.get(id) || null,
    ids: () => [...defs.keys()],
    isPlaying: (id) => playing.has(id),
    state: (id) => { const r = playing.get(id); return r ? { t: r.t, duration: r.dur, progress: r.t / r.dur, paused: r.paused || hold, speed: r.speed, dir: r.dir, loops: r.loops } : null; },
    playingIds: () => [...playing.keys()],
    onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get session() { return session; },
    get mixerCount() { return mixers.size; },
    get held() { return hold; },
  };
}
