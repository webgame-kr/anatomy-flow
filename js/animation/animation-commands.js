// 애니메이션 명령 (STEP 04-B): command-runner의 ctx.animation으로 연결한다
// Python(scene_commands.ANIMATION)과 여기서 각각 검사한다. 잘못된 명령은 실패 결과만 돌려주고 다음 명령은 계속 실행된다.
//
// 명령 (시간 ms, 속도 배율, 가중치 0~1)
//   animation_play      {target: animation_id, speed, loop, from, direction, wait}
//   animation_pause / animation_resume / animation_stop {target: animation_id, restore}
//   animation_seek      {target, value: 0~1 비율 또는 ms(1보다 큼)}
//   animation_set_speed {target, value > 0}
//   animation_set_loop  {target, value: true|false|반복 횟수}
//   animation_set_weight{target, value 0~1}
//   morph_set_value     {target: 객체 ID, morph: 이름, value 0~1}
//   morph_transition    {target: 객체 ID, morph: 이름, value 0~1, duration(ms), wait}
//   timeline_play       {target: timeline_id, speed, wait}
//   timeline_pause / timeline_resume / timeline_cancel {target: timeline_id}
//   set_biological_visual_state {value: {구조ID: 상태}, instant, wait}
//   model_transition    {target: 논리 ID, value: 상태, mode, duration, wait}
// 결과: {status: completed|cancelled|failed, ...}

const ACTIONS = new Set(['animation_play', 'animation_pause', 'animation_resume', 'animation_stop', 'animation_seek', 'animation_set_speed',
  'animation_set_loop', 'animation_set_weight', 'morph_set_value', 'morph_transition', 'timeline_play', 'timeline_pause', 'timeline_resume',
  'timeline_cancel', 'set_biological_visual_state', 'model_transition']);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export function createAnimationCommands({ anim, morph, timeline, visual, transition, registry, resolve = (id) => (registry.has(id) ? [id] : []) }) {
  let tmp = 0;
  const ok = { status: 'completed' };

  function validate(cmd) {
    const a = cmd.action;
    const t = cmd.target;
    if (a.startsWith('animation_')) {
      if (!anim.has(t)) return `없는 애니메이션: ${t}`;
      if (a === 'animation_play') {
        if (cmd.speed !== undefined && !(isNum(cmd.speed) && cmd.speed > 0)) return 'speed는 0보다 큰 숫자';
        if (cmd.loop !== undefined && !(typeof cmd.loop === 'boolean' || (Number.isInteger(cmd.loop) && cmd.loop >= 0))) return 'loop는 true/false 또는 0 이상 정수';
        if (cmd.from !== undefined && !(isNum(cmd.from) && cmd.from >= 0)) return 'from은 0 이상 (비율 또는 ms)';
      }
      if (a === 'animation_seek' && !(isNum(cmd.value) && cmd.value >= 0)) return 'value는 0 이상 (0~1 비율 또는 ms)';
      if (a === 'animation_set_speed' && !(isNum(cmd.value) && cmd.value > 0)) return '속도는 0보다 큰 숫자';
      if (a === 'animation_set_weight' && !(isNum(cmd.value) && cmd.value >= 0 && cmd.value <= 1)) return '가중치는 0~1';
      if (a === 'animation_set_loop' && !(typeof cmd.value === 'boolean' || (Number.isInteger(cmd.value) && cmd.value >= 0))) return 'loop 값 오류';
      return '';
    }
    if (a.startsWith('morph_')) {
      const ids = resolve(t);
      if (!ids.length) return `없는 객체: ${t}`;
      if (!ids.some((id) => morph.names(id).includes(cmd.morph))) return `${t}: 없는 Morph Target ${cmd.morph}`;
      if (!(isNum(cmd.value) && cmd.value >= 0 && cmd.value <= 1)) return 'Morph 값은 0~1';
      if (a === 'morph_transition' && !(isNum(cmd.duration) && cmd.duration > 0)) return 'duration은 0보다 큰 숫자(ms)';
      return '';
    }
    if (a.startsWith('timeline_')) return timeline.has(t) ? '' : `없는 타임라인: ${t}`;
    if (a === 'set_biological_visual_state') {
      if (!cmd.value || typeof cmd.value !== 'object') return 'value는 {구조ID: 상태}';
      for (const [id, st] of Object.entries(cmd.value)) {
        if (!visual.has(id)) return `없는 구조: ${id}`;
        if (!visual.def(id).states.includes(st)) return `${id}: 알 수 없는 상태 ${st}`;
      }
      return '';
    }
    if (a === 'model_transition') {
      if (!transition.has(t)) return `없는 논리 ID: ${t}`;
      if (typeof cmd.value !== 'string') return 'value는 상태 이름';
      if (cmd.mode && !['swap', 'fade', 'crossfade'].includes(cmd.mode)) return 'mode는 swap, fade, crossfade';
      return '';
    }
    return `지원하지 않는 애니메이션 명령: ${a}`;
  }

  const asResult = (r) => (r && r.ok ? ok : { status: 'failed', reason: (r && r.error) || '실패' });

  function run(cmd) {
    const t = cmd.target;
    switch (cmd.action) {
      case 'animation_play': {
        const h = anim.play(t, { speed: cmd.speed, loop: cmd.loop, from: cmd.from, direction: cmd.direction, weight: cmd.weight });
        if (h.result && h.result.status === 'failed') return h.result;
        return cmd.wait === true ? h.promise : { status: 'completed', started: true, animation_id: t, cmd_id: h.id };
      }
      case 'animation_pause': return asResult(anim.pause(t));
      case 'animation_resume': return asResult(anim.resume(t));
      // 이미 멈춘 것을 멈추는 것은 성공으로 본다 (타임라인이 장식 정지를 여러 번 보내도 오류가 아님)
      case 'animation_stop': return anim.isPlaying(t) ? asResult(anim.stop(t, { restore: cmd.restore !== false })) : { status: 'completed', note: '재생 중이 아님' };
      case 'animation_seek': return asResult(anim.seek(t, cmd.value));
      case 'animation_set_speed': return asResult(anim.setSpeed(t, cmd.value));
      case 'animation_set_loop': return asResult(anim.setLoop(t, cmd.value));
      case 'animation_set_weight': return asResult(anim.setWeight(t, cmd.value));
      case 'morph_set_value': {
        let hit = false;
        for (const id of resolve(t)) hit = morph.set(id, cmd.morph, cmd.value) || hit;
        return hit ? ok : { status: 'failed', reason: 'Morph 적용 실패' };
      }
      case 'morph_transition': {
        // 임시 애니메이션 정의로 현재 값 → 목표 값 (동시에 같은 Morph를 바꾸면 이전 전환은 replaced)
        const jobs = resolve(t).filter((id) => morph.names(id).includes(cmd.morph)).map((id) => {
          const aid = `__morph_${id}_${cmd.morph}`;
          tmp += 1;
          anim.define({ animation_id: aid, target_id: id, animation_type: 'morph', morph_target: cmd.morph, duration_ms: cmd.duration,
            easing: cmd.easing || 'ease_in_out', restore_on_cancel: false,
            keyframes: [{ time: 0, value: morph.get(id, cmd.morph) ?? 0 }, { time: 1, value: cmd.value }] });
          return anim.play(aid).promise;
        });
        const all = Promise.all(jobs).then((rs) => rs.find((r) => r.status !== 'completed') || ok);
        return cmd.wait === true ? all : { status: 'completed', started: true };
      }
      case 'timeline_play': {
        const h = timeline.play(t, { speed: cmd.speed });
        if (h.result) return h.result;
        return cmd.wait === true ? h.promise : { status: 'completed', started: true, timeline_id: t, cmd_id: h.id };
      }
      case 'timeline_pause': return asResult(timeline.pause(t));
      case 'timeline_resume': return asResult(timeline.resume(t));
      case 'timeline_cancel': return asResult(timeline.cancel(t));
      case 'set_biological_visual_state': {
        const p = visual.setMany(cmd.value, { instant: !!cmd.instant });
        return cmd.wait === true ? p : { status: 'completed', started: true };
      }
      case 'model_transition': {
        const p = transition.transition(t, cmd.value, { mode: cmd.mode, duration_ms: cmd.duration ?? 800 });
        return cmd.wait === true ? p : { status: 'completed', started: true };
      }
      default:
        return { status: 'failed', reason: `지원하지 않는 명령 ${cmd.action}` };
    }
  }

  return {
    handles: (action) => ACTIONS.has(action),
    validate,
    run,
    actions: [...ACTIONS],
  };
}
