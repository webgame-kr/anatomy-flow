// Pyodide를 Web Worker 안에서 실행한다 (화면 렌더링이 멈추지 않도록)
// 메시지 형식
//   main → worker : { type: 'init', pyodideBase, pyBase, files }
//                   { type: 'call', id, fn, args }
//   worker → main : { type: 'status', text }
//                   { type: 'ready', python, pyodide }
//                   { type: 'init-error', kind, detail }
//                   { type: 'result', id, ok, value, error }

let py = null;
let sandbox = null;
const modules = {};
let ready = false;

// Python에서 호출을 허용하는 함수 목록 ("모듈.함수"). 모듈 없이 오면 STEP 01의 sandbox3d로 본다.
const ALLOWED = new Set([
  'sandbox3d.ping', 'sandbox3d.reset', 'sandbox3d.create', 'sandbox3d.remove', 'sandbox3d.move',
  'sandbox3d.rotate', 'sandbox3d.resize', 'sandbox3d.set_color', 'sandbox3d.next_color',
  'sandbox3d.toggle_visible', 'sandbox3d.arrange_circle', 'sandbox3d.get_state',
  'scene_commands.set_snapshot', 'scene_commands.demo', 'scene_commands.restore_demo',
  'scene_commands.error_test', 'scene_commands.change_scene', 'scene_commands.build',
  'scene_commands.count_types',
  // STEP 03-C 이동 명령
  'scene_commands.set_paths', 'scene_commands.route_demo', 'scene_commands.motion_error_test',
  'scene_commands.move_to',
  'motion_link.setup', 'motion_link.to_motion', 'motion_link.motion_done',
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
    py = await self.loadPyodide({ indexURL: pyodideBase });

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
    modules.sandbox3d = sandbox;
    modules.scene_commands = py.pyimport('scene_commands');
    modules.motion_link = py.pyimport('motion_link');
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
  const full = fn.includes('.') ? fn : `sandbox3d.${fn}`;
  if (!ALLOWED.has(full)) {
    postMessage({ type: 'result', id, ok: false, error: `허용되지 않은 함수: ${fn}` });
    return;
  }
  const [modName, fnName] = full.split('.');
  // 배열·객체 인자는 Python list/dict로 바꿔 넘긴다
  const pyArgs = (args || []).map((a) => (a !== null && typeof a === 'object' ? py.toPy(a) : a));
  try {
    const value = toPlain(modules[modName][fnName](...pyArgs));
    postMessage({ type: 'result', id, ok: true, value });
  } catch (err) {
    postMessage({ type: 'result', id, ok: false, error: String(err && err.message ? err.message : err).slice(-600) });
  } finally {
    for (const a of pyArgs) {
      if (a && typeof a.destroy === 'function') a.destroy();
    }
  }
}

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'init') init(msg);
  else if (msg.type === 'call') call(msg);
};
