// Pyodide 로딩과 Python 엔진 호출 (Python은 상태와 명령만 돌려준다)

export const PYODIDE_VERSION = '0.26.4';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const ENGINE_DIR = '/home/pyodide/engine';
const PY_FILES = [
  'typing_engine.py',
  'state_engine.py',
  'flow_engine.py',
  'content_loader.py',
  'record_engine.py',
  'game.py',
];

export class EngineLoadError extends Error {
  constructor(kind, detail) {
    super(detail || kind);
    this.kind = kind;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new EngineLoadError('cdn', src));
    document.head.appendChild(s);
  });
}

function withTimeout(promise, ms, kind) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new EngineLoadError(kind)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function startPython(onStatus) {
  if (location.protocol === 'file:') throw new EngineLoadError('file');

  onStatus(`Pyodide ${PYODIDE_VERSION} 내려받는 중… (처음 한 번은 수십 초 걸릴 수 있음)`);
  if (typeof window.loadPyodide !== 'function') {
    await withTimeout(loadScript(PYODIDE_BASE + 'pyodide.js'), 45000, 'timeout');
  }
  let py;
  try {
    py = await withTimeout(window.loadPyodide({ indexURL: PYODIDE_BASE }), 90000, 'timeout');
  } catch (err) {
    if (err instanceof EngineLoadError) throw err;
    throw new EngineLoadError('init', String(err));
  }

  onStatus('Python 엔진 파일 불러오는 중…');
  py.FS.mkdirTree(ENGINE_DIR);
  for (const file of PY_FILES) {
    const res = await fetch(`py/${file}`, { cache: 'no-cache' });
    if (!res.ok) throw new EngineLoadError('engine', `py/${file} (${res.status})`);
    py.FS.writeFile(`${ENGINE_DIR}/${file}`, await res.text());
  }
  try {
    py.runPython(`
import sys
if '${ENGINE_DIR}' not in sys.path:
    sys.path.insert(0, '${ENGINE_DIR}')
import game
`);
  } catch (err) {
    throw new EngineLoadError('python', String(err));
  }
  return makeBridge(py, py.pyimport('game'));
}

function makeBridge(py, game) {
  // Python 값을 일반 JS 값으로 바꾸고 프록시는 바로 해제한다
  function toJs(value) {
    if (value && typeof value === 'object' && typeof value.toJs === 'function') {
      const plain = value.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false });
      value.destroy();
      return plain;
    }
    return value;
  }

  function call(name, ...args) {
    const pyArgs = args.map((a) => (a !== null && typeof a === 'object' ? py.toPy(a) : a));
    try {
      return toJs(game[name](...pyArgs));
    } finally {
      for (const a of pyArgs) {
        if (a && typeof a.destroy === 'function') a.destroy();
      }
    }
  }

  return {
    version: py.runPython('import sys\nsys.version.split()[0]'),
    load: (content) => call('load', content),
    submit: (text) => call('submit', text),
    peek: (text) => call('peek', text),
    arrive: (edgeId) => call('arrive', edgeId),
    reset: () => call('reset'),
    view: () => call('get_view'),
    makeRecord: (dateText, seconds) => call('make_record', dateText, seconds),
    recordsCsv: (records) => call('records_csv', records),
  };
}

export function describeLoadError(err) {
  const kind = err && err.kind;
  if (kind === 'file') {
    return {
      title: '파일을 직접 열면 실행할 수 없습니다',
      body: '브라우저 보안 때문에 <code>file://</code> 주소에서는 엔진 파일을 읽을 수 없습니다. 프로젝트 폴더에서 <code>python -m http.server 8000</code>을 실행한 뒤 <code>http://localhost:8000</code>으로 여세요.',
    };
  }
  if (kind === 'cdn' || kind === 'timeout') {
    return {
      title: 'Pyodide를 내려받지 못했습니다',
      body: `인터넷 연결을 확인하세요. 학교·회사 네트워크에서 <code>cdn.jsdelivr.net</code>이 막혀 있을 수 있습니다. 잠시 후 새로고침해 보세요. (Pyodide ${PYODIDE_VERSION})`,
    };
  }
  if (kind === 'engine') {
    return {
      title: 'Python 엔진 파일이 없습니다',
      body: `다음 파일을 찾지 못했습니다: <code>${err.message}</code>. 배포한 폴더에 <code>py/</code> 폴더가 함께 올라갔는지 확인하세요.`,
    };
  }
  return {
    title: 'Python 엔진을 시작하지 못했습니다',
    body: `오류 내용: <code>${String((err && err.message) || err).slice(0, 400)}</code>`,
  };
}
