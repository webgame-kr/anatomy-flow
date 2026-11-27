// Python Worker와 메시지로 통신하는 클라이언트 (Promise 기반)

export const PYODIDE_VERSION = '0.26.4';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PY_FILES = ['sandbox3d.py'];
const INIT_TIMEOUT_MS = 90000;
const CALL_TIMEOUT_MS = 10000;

export function createPythonClient({ onStatus, simulateFailure = false } = {}) {
  let worker = null;
  let nextId = 1;
  const pending = new Map();
  let state = 'idle';     // idle, loading, ready, error
  let info = null;

  function setState(next, text) {
    state = next;
    if (onStatus) onStatus(next, text);
  }

  function start() {
    return new Promise((resolve, reject) => {
      if (location.protocol === 'file:') {
        const err = { kind: 'file', detail: 'file:// 에서는 Worker와 fetch를 쓸 수 없습니다.' };
        setState('error', describe(err));
        reject(err);
        return;
      }
      setState('loading', 'Python 엔진 준비 중…');
      try {
        worker = new Worker(new URL('./py-worker.js', import.meta.url));
      } catch (e) {
        const err = { kind: 'worker', detail: String(e) };
        setState('error', describe(err));
        reject(err);
        return;
      }
      const timer = setTimeout(() => {
        const err = { kind: 'timeout', detail: `${INIT_TIMEOUT_MS / 1000}초 안에 준비되지 않음` };
        setState('error', describe(err));
        worker.terminate();
        reject(err);
      }, INIT_TIMEOUT_MS);

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'status') {
          setState('loading', msg.text);
        } else if (msg.type === 'ready') {
          clearTimeout(timer);
          info = { python: msg.python, pyodide: msg.pyodide, ping: msg.ping };
          setState('ready', `Python ${msg.python} · Pyodide ${msg.pyodide}`);
          resolve(info);
        } else if (msg.type === 'init-error') {
          clearTimeout(timer);
          setState('error', describe(msg));
          reject(msg);
        } else if (msg.type === 'result') {
          const job = pending.get(msg.id);
          if (!job) return;
          pending.delete(msg.id);
          clearTimeout(job.timer);
          if (msg.ok) job.resolve(msg.value);
          else job.reject(new Error(msg.error));
        }
      };
      worker.onerror = (e) => {
        e.preventDefault();
        clearTimeout(timer);
        const err = { kind: 'worker', detail: e.message || 'Worker 오류' };
        setState('error', describe(err));
        reject(err);
      };

      const base = simulateFailure ? 'https://cdn.jsdelivr.net/pyodide/v0.0.0-missing/full/' : PYODIDE_BASE;
      worker.postMessage({
        type: 'init',
        pyodideBase: base,
        pyBase: new URL('../../py/', import.meta.url).href,
        files: PY_FILES,
      });
    });
  }

  // Python 함수 호출 (렌더링 프레임마다 부르지 않는다: 버튼·이벤트 때만)
  function call(fn, ...args) {
    if (state !== 'ready') return Promise.reject(new Error('Python이 준비되지 않았습니다.'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Python 응답 시간 초과: ${fn}`));
      }, CALL_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ type: 'call', id, fn, args });
    });
  }

  return {
    start,
    call,
    get state() { return state; },
    get info() { return info; },
  };
}

export function describe(err) {
  const kind = err && err.kind;
  if (kind === 'file') return '파일을 직접 열었습니다. 로컬 서버(python -m http.server)로 여세요.';
  if (kind === 'cdn' || kind === 'timeout') {
    return `Pyodide(${PYODIDE_VERSION})를 내려받지 못했습니다. 인터넷 연결과 cdn.jsdelivr.net 차단 여부를 확인하세요.`;
  }
  if (kind === 'engine') return `Python 파일을 찾지 못했습니다: ${err.detail}`;
  if (kind === 'worker') return `Web Worker를 시작하지 못했습니다: ${err.detail}`;
  return `Python 엔진 오류: ${String((err && err.detail) || err).slice(0, 300)}`;
}
