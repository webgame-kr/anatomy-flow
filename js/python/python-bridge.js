// Python Bridge: Python 함수 호출 → 돌려받은 명령을 command-runner로 실행
// 호출은 순서대로 한 번에 하나씩 처리한다. Python은 버튼·이벤트 때만 부른다(프레임마다 X).

export function createPythonBridge({ client, runner, log }) {
  let queue = Promise.resolve();

  function run(fn, ...args) {
    const job = queue.then(async () => {
      let result;
      try {
        result = await client.call(fn, ...args);
      } catch (err) {
        log(`Python 호출 실패 (${fn}): ${err.message}`, 'error');
        return { result: null, summary: null };
      }
      if (result && Array.isArray(result.errors)) {
        for (const e of result.errors) log(`Python 검사: ${e}`, 'warn');
      }
      if (result && result.ok === false && !Array.isArray(result.errors)) {
        log(`Python: ${result.message}`, 'warn');
      }
      const commands = (result && result.commands) || [];
      const summary = await runner.run(commands);
      log(`Python ${fn} → 명령 ${commands.length}개 · 적용 ${summary.applied}${summary.failed ? ` · 실패 ${summary.failed}` : ''}${result && result.message ? ` · ${result.message}` : ''}`,
        summary.failed ? 'warn' : '');
      return { result, summary };
    });
    queue = job.catch(() => {});
    return job;
  }

  // 명령 없이 값만 받는 호출
  function call(fn, ...args) {
    return client.call(fn, ...args);
  }

  return { run, call, get state() { return client.state; } };
}
