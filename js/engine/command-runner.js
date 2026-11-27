// Python이 돌려준 명령 리스트를 해석해 3D에 적용한다
// STEP 01 형식: { id, op: 'clear' | 'create' | 'update' | 'remove', target, ... }
// STEP 02 형식: { action, target, value, duration } — set_position, set_rotation, set_scale,
//               set_color, set_visibility, set_opacity, highlight, camera_focus, camera_overview, scene_change
// 잘못된 명령은 기록만 하고 다음 명령을 계속 실행한다(전체가 멈추지 않게).

const NO_TARGET = new Set(['camera_overview', 'scene_change']);
const isNum = (n) => typeof n === 'number' && isFinite(n);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);

const CHECK = {
  set_position: (v) => (isVec3(v) ? '' : '[x, y, z] 숫자 3개가 필요합니다'),
  set_rotation: (v) => (isVec3(v) ? '' : '[x, y, z] 각도(도) 3개가 필요합니다'),
  set_scale: (v) => ((isNum(v) && v > 0) || (isVec3(v) && v.every((n) => n > 0)) ? '' : '크기는 0보다 큰 숫자 또는 [x, y, z]'),
  set_color: (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? '' : '색상은 #rrggbb 형식'),
  set_visibility: (v) => (typeof v === 'boolean' ? '' : 'true 또는 false가 필요합니다'),
  set_opacity: (v) => (isNum(v) && v >= 0 && v <= 1 ? '' : '투명도는 0 ~ 1'),
  highlight: (v) => (v === undefined || typeof v === 'boolean' ? '' : 'true 또는 false가 필요합니다'),
  camera_focus: () => '',
  camera_overview: () => '',
  scene_change: (v) => (typeof v === 'string' && v ? '' : '장면 ID가 필요합니다'),
};

export function createCommandRunner(manager, ctx = {}) {
  const done = new Set();     // 이미 실행한 STEP 01 명령 id (같은 명령 두 번 실행 방지)

  function log(text, level) {
    if (ctx.onLog) ctx.onLog(text, level);
  }

  // ---------- STEP 02 action 명령 ----------
  function validateAction(cmd) {
    if (!(cmd.action in CHECK)) return `지원하지 않는 명령: ${cmd.action}`;
    if (!NO_TARGET.has(cmd.action) && !ctx.registry.has(cmd.target)) return `없는 객체 ID: ${cmd.target}`;
    if (cmd.action === 'scene_change' && ctx.scenes && !ctx.scenes.has(cmd.value)) return `없는 장면: ${cmd.value}`;
    return CHECK[cmd.action](cmd.value);
  }

  function runAction(cmd) {
    const d = isNum(cmd.duration) ? cmd.duration : 0;
    switch (cmd.action) {
      case 'set_position': manager.update(cmd.target, { position: cmd.value }, d); break;
      case 'set_rotation': manager.update(cmd.target, { rotation: cmd.value }, d); break;
      case 'set_scale': manager.update(cmd.target, { scale: cmd.value }, d); break;
      case 'set_color': ctx.materials.setColor(cmd.target, cmd.value); break;
      case 'set_visibility': ctx.materials.setVisible(cmd.target, cmd.value); break;
      case 'set_opacity': ctx.materials.setOpacity(cmd.target, cmd.value); break;
      case 'highlight': ctx.materials.setHighlight(cmd.target, 'event', cmd.value !== false); break;
      // 대상이 이동 중이면 도착한 뒤 초점을 맞춘다
      case 'camera_focus': return manager.whenSettled(cmd.target).then(() => ctx.camera.focus(cmd.target));
      case 'camera_overview': ctx.camera.overview(); break;
      case 'scene_change': return ctx.scenes.load(cmd.value);
      default: break;
    }
    return null;
  }

  // ---------- STEP 01 op 명령 ----------
  function runOp(cmd) {
    if (cmd.op === 'clear') done.clear();   // 초기화하면 Python 명령 번호도 1부터 다시 시작한다
    if (done.has(cmd.id)) return 'skipped';
    done.add(cmd.id);
    if (cmd.op === 'clear') {
      for (const id of [...ctx.registry.roots()]) {
        if (ctx.registry.get(id).sourceAssetId === 'step01') manager.remove(id);
      }
    } else if (cmd.op === 'create') {
      manager.create({ ...cmd.object, sourceAssetId: 'step01' });
    } else if (cmd.op === 'update') {
      const props = {};
      for (const key of ['position', 'rotation', 'scale', 'color', 'visible']) if (key in cmd) props[key] = cmd[key];
      manager.update(cmd.target, props, cmd.duration || 0);
    } else if (cmd.op === 'remove') {
      if (!manager.remove(cmd.target)) throw new Error(`없는 객체: ${cmd.target}`);
    } else {
      throw new Error(`알 수 없는 명령: ${cmd.op}`);
    }
    return 'applied';
  }

  // 명령 목록 실행. scene_change처럼 비동기인 명령은 끝날 때까지 기다린 뒤 다음 명령을 실행한다.
  async function run(commands) {
    const summary = { applied: 0, skipped: 0, failed: 0, errors: [] };
    if (!Array.isArray(commands)) {
      log('명령 목록이 배열이 아닙니다.', 'error');
      summary.failed += 1;
      return summary;
    }
    for (let i = 0; i < commands.length; i += 1) {
      const cmd = commands[i];
      try {
        if (cmd && typeof cmd.action === 'string') {
          const problem = validateAction(cmd);
          if (problem) throw new Error(problem);
          const pending = runAction(cmd);
          if (pending && typeof pending.then === 'function') await pending;
          summary.applied += 1;
        } else if (cmd && typeof cmd.op === 'string') {
          if (runOp(cmd) === 'skipped') summary.skipped += 1;
          else summary.applied += 1;
        } else {
          throw new Error('명령 형식이 아닙니다 (action 또는 op 필요)');
        }
      } catch (err) {
        summary.failed += 1;
        const name = cmd && (cmd.action || cmd.op);
        const text = `명령 #${i + 1} ${name || '?'} 실패: ${err.message}`;
        summary.errors.push(text);
        log(text, 'error');
      }
    }
    return summary;
  }

  return { run, validateAction };
}
