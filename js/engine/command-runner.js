// Python이 돌려준 명령 리스트를 해석해 객체 관리 모듈에 적용한다
// 명령 형식: { id, op: 'clear' | 'create' | 'update' | 'remove', target, ... }

export function createCommandRunner(manager, { onLog } = {}) {
  const done = new Set();     // 이미 실행한 명령 id (같은 명령 두 번 실행 방지)

  function log(text, level) {
    if (onLog) onLog(text, level);
  }

  function run(commands) {
    const summary = { applied: 0, skipped: 0, failed: 0 };
    if (!Array.isArray(commands)) {
      log('명령 목록이 배열이 아닙니다.', 'error');
      summary.failed += 1;
      return summary;
    }
    for (const cmd of commands) {
      if (!cmd || typeof cmd.op !== 'string') {
        log('잘못된 명령 형식', 'error');
        summary.failed += 1;
        continue;
      }
      if (cmd.op === 'clear') done.clear();   // 초기화하면 Python 명령 번호도 1부터 다시 시작한다
      if (done.has(cmd.id)) {
        summary.skipped += 1;
        continue;
      }
      done.add(cmd.id);
      try {
        if (cmd.op === 'clear') {
          manager.clear();
        } else if (cmd.op === 'create') {
          manager.create(cmd.object);
        } else if (cmd.op === 'update') {
          const props = {};
          for (const key of ['position', 'rotation', 'scale', 'color', 'visible']) {
            if (key in cmd) props[key] = cmd[key];
          }
          manager.update(cmd.target, props, cmd.duration || 0);
        } else if (cmd.op === 'remove') {
          if (!manager.remove(cmd.target)) throw new Error(`없는 객체: ${cmd.target}`);
        } else {
          throw new Error(`알 수 없는 명령: ${cmd.op}`);
        }
        summary.applied += 1;
      } catch (err) {
        summary.failed += 1;
        log(`명령 #${cmd.id} ${cmd.op} 실패: ${err.message}`, 'error');
      }
    }
    return summary;
  }

  return { run };
}
