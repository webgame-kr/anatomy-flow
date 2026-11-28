// 이동 명령 어댑터 (STEP 03-C): command-runner가 실행하는 actor_* / path_* / camera_follow 명령
// Python(scene_commands.py)과 같은 규칙으로 다시 검사한다. 잘못된 ID·값은 오류로 돌려주고 프로그램은 계속 돈다.
//
// 명령 형식 (STEP 02의 {action, target, value, duration}을 그대로 쓰고, 필요한 필드만 더한다)
//   actor_create            target=actor_id, value={actor_type, model_id, display_size, biological_state, path_id, speed}
//   actor_remove            target=actor_id
//   actor_set_path          target=actor_id, path_id, progress?(0~1), direction?(1|-1)
//   actor_move              target=actor_id, speed?(m/s) | duration?(ms), until?('end'|'next_stop'), loops?, pass_stops?, route?[path_id]
//   actor_move_to_checkpoint target=actor_id, checkpoint_id, duration?|speed?
//   actor_pause / actor_resume / actor_stop / actor_reset / actor_reverse   target=actor_id
//   actor_set_speed         target=actor_id, value(m/s)
//   actor_seek              target=actor_id, value(0~1)
//   actor_set_state         target=actor_id, value={oxygenation: 'oxygenated'|'deoxygenated', ...}
//   path_show / path_hide   target=path_id
//   camera_follow           target=actor_id, value?={distance, height, side, first_person}
//   camera_unfollow         (대상 없음)
// 공통 선택 필드: wait(true면 이동 결과까지 기다림), session(현재 session과 다르면 실행하지 않음)

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

const SPEC = {
  actor_create: 'new_actor',
  actor_remove: 'actor',
  actor_set_path: 'actor',
  actor_move: 'actor',
  actor_move_to_checkpoint: 'actor',
  actor_pause: 'actor',
  actor_resume: 'actor',
  actor_stop: 'actor',
  actor_reset: 'actor',
  actor_reverse: 'actor',
  actor_set_speed: 'actor',
  actor_seek: 'actor',
  actor_set_state: 'actor',
  path_show: 'path',
  path_hide: 'path',
  camera_follow: 'actor',
  camera_unfollow: 'none',
};

export const MOTION_ACTIONS = Object.keys(SPEC);

export function createMotionCommands({ paths, actors, motion, camera, onFollow = null }) {
  function validate(cmd) {
    const kind = SPEC[cmd.action];
    if (!kind) return `지원하지 않는 명령: ${cmd.action}`;
    if ('session' in cmd && cmd.session !== motion.session) return `이전 session(${cmd.session})의 명령 (현재 ${motion.session})`;
    const t = cmd.target;
    if (kind === 'new_actor') {
      if (typeof t !== 'string' || !t) return 'actor_id(target)가 필요합니다';
      if (actors.has(t)) return `이미 있는 Actor: ${t}`;
      const v = cmd.value || {};
      if (typeof v !== 'object') return 'value는 Actor 설정 객체여야 합니다';
      if (v.path_id && !paths.has(v.path_id)) return `없는 경로: ${v.path_id}`;
      if ('display_size' in v && !(isNum(v.display_size) && v.display_size > 0)) return 'display_size는 0보다 큰 숫자';
      return '';
    }
    if (kind === 'actor' && !actors.has(t)) return `없는 Actor: ${t}`;
    if (kind === 'path' && !paths.has(t)) return `없는 경로: ${t}`;
    switch (cmd.action) {
      case 'actor_set_path':
        if (!paths.has(cmd.path_id)) return `없는 경로: ${cmd.path_id}`;
        if ('progress' in cmd && !(isNum(cmd.progress) && cmd.progress >= 0 && cmd.progress <= 1)) return 'progress는 0~1';
        if ('direction' in cmd && cmd.direction !== 1 && cmd.direction !== -1) return 'direction은 1 또는 -1';
        break;
      case 'actor_move':
        if ('speed' in cmd && !(isNum(cmd.speed) && cmd.speed > 0)) return 'speed는 0보다 큰 숫자(m/s)';
        if ('duration' in cmd && !(isNum(cmd.duration) && cmd.duration > 0)) return 'duration은 0보다 큰 숫자(ms)';
        if ('until' in cmd && !['end', 'next_stop'].includes(cmd.until)) return "until은 'end' 또는 'next_stop'";
        if ('loops' in cmd && !(Number.isInteger(cmd.loops) && cmd.loops >= 0)) return 'loops는 0 이상의 정수';
        if ('route' in cmd && !(Array.isArray(cmd.route) && cmd.route.every((p) => paths.has(p)))) return 'route에 없는 경로가 있습니다';
        if (!actors.get(t).path_id) return `경로가 지정되지 않은 Actor: ${t}`;
        break;
      case 'actor_move_to_checkpoint':
        if (!paths.findCheckpoint(cmd.checkpoint_id)) return `없는 Checkpoint: ${cmd.checkpoint_id}`;
        if ('duration' in cmd && !(isNum(cmd.duration) && cmd.duration > 0)) return 'duration은 0보다 큰 숫자(ms)';
        break;
      case 'actor_set_speed':
        if (!(isNum(cmd.value) && cmd.value > 0)) return '속도는 0보다 큰 숫자(m/s)';
        break;
      case 'actor_seek':
        if (!(isNum(cmd.value) && cmd.value >= 0 && cmd.value <= 1)) return '진행률은 0~1';
        if (!actors.get(t).path_id) return `경로가 지정되지 않은 Actor: ${t}`;
        break;
      case 'actor_set_state':
        if (!cmd.value || typeof cmd.value !== 'object' || Array.isArray(cmd.value)) return 'value는 상태 객체여야 합니다';
        break;
      default:
        break;
    }
    return '';
  }

  const ok = { status: 'ok' };
  const asResult = (r) => (r.ok ? ok : { status: 'failed', reason: r.error });
  const moveResult = (c) => (c.result ? c.result : c.promise);

  function run(cmd) {
    const t = cmd.target;
    switch (cmd.action) {
      case 'actor_create': {
        const v = cmd.value || {};
        const r = actors.create({ ...v, actor_id: t });
        if (!r.ok) return { status: 'failed', reason: r.error };
        if (v.path_id) motion.setPath(t, v.path_id, { progress: v.progress, direction: v.direction });
        return ok;
      }
      case 'actor_remove': {
        if (camera.followTarget === t) camera.stopFollow();
        motion.stop(t);
        return actors.remove(t) ? ok : { status: 'failed', reason: '제거 실패' };
      }
      case 'actor_set_path': return asResult(motion.setPath(t, cmd.path_id, { progress: cmd.progress, direction: cmd.direction }));
      case 'actor_move': return moveResult(motion.move(t, { speed: cmd.speed, duration: cmd.duration, until: cmd.until, loops: cmd.loops, pass_stops: cmd.pass_stops, route: cmd.route }));
      case 'actor_move_to_checkpoint': return moveResult(motion.moveToCheckpoint(t, cmd.checkpoint_id, { speed: cmd.speed, duration: cmd.duration }));
      case 'actor_pause': return asResult(motion.pause(t));
      case 'actor_resume': return asResult(motion.resume(t));
      case 'actor_stop': return asResult(motion.stop(t));
      case 'actor_reset': return asResult(motion.reset(t));
      case 'actor_reverse': return asResult(motion.reverse(t));
      case 'actor_set_speed': return asResult(motion.setSpeed(t, cmd.value));
      case 'actor_seek': return asResult(motion.seek(t, cmd.value));
      case 'actor_set_state': return actors.setBiologicalState(t, cmd.value) ? ok : { status: 'failed', reason: '상태 변경 실패' };
      case 'path_show': paths.setPathVisible(t, true); return ok;
      case 'path_hide': paths.setPathVisible(t, false); return ok;
      case 'camera_follow': {
        const v = cmd.value || {};
        const res = camera.startFollow(t, { distance: v.distance, height: v.height, side: v.side, firstPerson: !!v.first_person });
        if (onFollow) onFollow(t, v);
        return res ? ok : { status: 'failed', reason: '추적 시작 실패' };
      }
      case 'camera_unfollow': camera.stopFollow(); if (onFollow) onFollow(null); return ok;
      default: return { status: 'failed', reason: `지원하지 않는 명령: ${cmd.action}` };
    }
  }

  return {
    handles: (action) => action in SPEC,
    validate,
    run,
    actions: MOTION_ACTIONS,
  };
}
