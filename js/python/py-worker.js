// Pyodide를 Web Worker 안에서 실행한다 (화면 렌더링이 멈추지 않도록)
// 메시지 형식
//   main → worker : { type: 'init', pyodideBase, pyBase, files }
//                   { type: 'call', id, fn, args }
//   worker → main : { type: 'status', text }
//                   { type: 'ready', python, pyodide }
//                   { type: 'init-error', kind, detail }
//                   { type: 'result', id, ok, value, error }

let sandbox = null;
let ready = false;

// Python에서 호출을 허용하는 함수 목록
const ALLOWED = new Set([
  'ping', 'reset', 'create', 'remove', 'move', 'rotate', 'resize',
  'set_color', 'next_color', 'toggle_visible', 'arrange_circle', 'get_state',
]);

function toPlain(value) {
  if (value && typeof value === 'object' && typeof value.toJs === 'function') {
    const plain = value.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false });
    value.destroy();
    return plain;
  }
  return value;
}

async function init({ pyodideBase, pyBase, files }) {
  try {
    postMessage({ type: 'status', text: 'Pyodide 내려받는 중…' });
    try {
      importScripts(pyodideBase + 'pyodide.js');
    } catch (err) {
      postMessage({ type: 'init-error', kind: 'cdn', detail: String(err) });
      return;
    }
    const py = await self.loadPyodide({ indexURL: pyodideBase });

    postMessage({ type: 'status', text: 'Python 파일 불러오는 중…' });
    py.FS.mkdirTree('/home/pyodide/engine');
    for (const file of files) {
      const res = await fetch(pyBase + file, { cache: 'no-cache' });
      if (!res.ok) {
        postMessage({ type: 'init-error', kind: 'engine', detail: `py/${file} (${res.status})` });
        return;
      }
      py.FS.writeFile(`/home/pyodide/engine/${file}`, await res.text());
    }
    py.runPython("import sys\nif '/home/pyodide/engine' not in sys.path:\n    sys.path.insert(0, '/home/pyodide/engine')");
    sandbox = py.pyimport('sandbox3d');
    ready = true;
    const info = toPlain(sandbox.ping());
    postMessage({ type: 'ready', python: info.python, pyodide: py.version, ping: info });
  } catch (err) {
    postMessage({ type: 'init-error', kind: 'python', detail: String(err && err.message ? err.message : err) });
  }
}

function call({ id, fn, args }) {
  if (!ready) {
    postMessage({ type: 'result', id, ok: false, error: 'Python이 아직 준비되지 않았습니다.' });
    return;
  }
  if (!ALLOWED.has(fn)) {
    postMessage({ type: 'result', id, ok: false, error: `허용되지 않은 함수: ${fn}` });
    return;
  }
  try {
    const value = toPlain(sandbox[fn](...(args || [])));
    postMessage({ type: 'result', id, ok: true, value });
  } catch (err) {
    postMessage({ type: 'result', id, ok: false, error: String(err && err.message ? err.message : err).slice(-600) });
  }
}

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'init') init(msg);
  else if (msg.type === 'call') call(msg);
};
