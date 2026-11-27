// 개발자 Sandbox: 3D Viewport + Python Worker + 객체 관리 연결

import * as THREE from 'three';
import { checkWebGL, createViewport } from './engine/viewport.js';
import { createObjectManager } from './engine/object-manager.js';
import { createCommandRunner } from './engine/command-runner.js';
import { createPythonClient } from './python/py-client.js';

window.__nf3dBooted = true;

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const simulate = params.get('simulate') || '';   // 개발용: nowebgl, nopython

const ui = {
  viewport: $('viewport'), fatal: $('fatal'), reset: $('btn-reset'), camera: $('btn-camera'),
  pyDot: $('py-dot'), pyStatus: $('py-status'), glInfo: $('gl-info'), fps: $('fps'),
  renderInfo: $('render-info'), objCount: $('obj-count'), list: $('obj-list'),
  selId: $('sel-id'), selPos: $('sel-pos'), selRot: $('sel-rot'), selLook: $('sel-look'),
  color: $('color-input'), log: $('log'),
};

let logCount = 0;
function log(text, level = '') {
  logCount += 1;
  const li = document.createElement('li');
  li.value = logCount;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  li.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${text}`;
  if (level) li.className = level;
  ui.log.prepend(li);
  while (ui.log.children.length > 200) ui.log.lastChild.remove();
}

window.addEventListener('unhandledrejection', (e) => {
  log(`처리되지 않은 오류: ${e.reason && e.reason.message ? e.reason.message : e.reason}`, 'error');
  e.preventDefault();
});

function showFatal(title, body) {
  ui.fatal.hidden = false;
  ui.fatal.innerHTML = `<h2>${title}</h2><p>${body}</p>`;
}

// ---------- 1. WebGL 확인과 3D 화면 ----------
const gl = simulate === 'nowebgl' ? { ok: false, reason: '(개발용 시뮬레이션) WebGL을 사용할 수 없는 환경입니다.' } : checkWebGL();
let viewport = null;
let manager = null;
let runner = null;

if (!gl.ok) {
  showFatal('이 환경에서는 3D 화면을 표시할 수 없습니다',
    `${gl.reason}<br>최신 Chrome, Edge, Safari, Firefox를 사용하고 브라우저 설정에서 하드웨어 가속을 켜 주세요.`);
  ui.glInfo.textContent = 'WebGL 미지원';
  log('WebGL 미지원: 3D 화면을 시작하지 않음', 'error');
} else {
  try {
    viewport = createViewport(ui.viewport, {
      onFrame: (dt) => manager && manager.tick(dt),
      onStats: renderStats,
      onContextLost: () => {
        showFatal('그래픽 컨텍스트를 잃었습니다', '그래픽 드라이버가 재설정되었습니다. 페이지를 새로고침하세요.');
        log('WebGL 컨텍스트 손실', 'error');
      },
    });
    manager = createObjectManager(viewport.scene);
    runner = createCommandRunner(manager, { onLog: log });
    viewport.onPick((mesh) => select(mesh ? mesh.userData.id : null), () => manager.meshes());
    ui.glInfo.textContent = `${gl.version} · three.js r${THREE.REVISION}`;
    log(`3D 화면 시작 (${gl.version}, three.js r${THREE.REVISION})`);
  } catch (err) {
    showFatal('3D 엔진을 시작하지 못했습니다', String(err.message || err));
    log(`3D 초기화 실패: ${err.message}`, 'error');
  }
}

function renderStats(s) {
  ui.fps.textContent = `${s.fps}`;
  ui.renderInfo.textContent = `draw ${s.calls} · 삼각형 ${s.triangles} · ${s.size}`;
  if (manager && manager.selectedId) showSelected();
}

// ---------- 2. Python Worker ----------
const python = createPythonClient({
  simulateFailure: simulate === 'nopython',
  onStatus: (state, text) => {
    ui.pyDot.className = `dot ${state}`;
    ui.pyStatus.textContent = text;
    refreshButtons();
  },
});

let queue = Promise.resolve();

// Python 함수를 순서대로 호출하고, 돌려받은 명령을 3D에 적용한다
function act(fn, ...args) {
  queue = queue.then(async () => {
    if (!runner) return null;
    let result;
    try {
      result = await python.call(fn, ...args);
    } catch (err) {
      log(`Python 호출 실패 (${fn}): ${err.message}`, 'error');
      return null;
    }
    if (!result.ok) {
      log(`Python: ${result.message}`, 'warn');
      return result;
    }
    const sum = runner.run(result.commands);
    log(`Python ${fn} → 명령 ${result.commands.length}개 적용${sum.failed ? `, 실패 ${sum.failed}` : ''} · ${result.message}`);
    checkSync(result.objects);
    return result;
  });
  return queue;
}

// Python 상태와 3D 장면의 객체 ID가 같은지 확인
function checkSync(pyObjects) {
  const pyIds = pyObjects.map((o) => o.id).join(',');
  const jsIds = manager.ids().join(',');
  if (pyIds !== jsIds) log(`상태 불일치! Python [${pyIds}] / 3D [${jsIds}]`, 'error');
  renderList();
  if (manager.selectedId && !manager.has(manager.selectedId)) select(null);
  else showSelected();
}

// ---------- 3. 화면 패널 ----------
function select(id) {
  if (!manager) return;
  manager.select(id);
  renderList();
  showSelected();
  refreshButtons();
}

function renderList() {
  if (!manager) return;
  const objs = manager.list();
  ui.objCount.textContent = `${objs.length}`;
  ui.list.innerHTML = '';
  for (const o of objs) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = o.id === manager.selectedId ? 'active' : '';
    btn.innerHTML = `<span class="swatch" style="background:${o.color}"></span><span>${o.id}</span><span class="muted">${o.name}</span>${o.visible ? '' : '<span class="hidden-tag">숨김</span>'}`;
    btn.addEventListener('click', () => select(o.id));
    li.appendChild(btn);
    ui.list.appendChild(li);
  }
  if (objs.length === 0) ui.list.innerHTML = '<li class="muted">(객체 없음)</li>';
}

function showSelected() {
  const o = manager && manager.selectedId ? manager.info(manager.selectedId) : null;
  if (!o) {
    ui.selId.textContent = '(없음 — 3D 화면이나 목록에서 클릭)';
    ui.selPos.textContent = '-';
    ui.selRot.textContent = '-';
    ui.selLook.textContent = '-';
    return;
  }
  ui.selId.textContent = `${o.id} (${o.name})`;
  ui.selPos.textContent = o.position.join(', ');
  ui.selRot.textContent = o.rotation.join(', ');
  ui.selLook.textContent = `×${o.scale} · ${o.color}${o.visible ? '' : ' · 숨김'}`;
}

function refreshButtons() {
  const pyReady = python.state === 'ready' && !!runner;
  const hasSel = !!(manager && manager.selectedId);
  for (const btn of document.querySelectorAll('button.py')) {
    btn.disabled = !pyReady || (btn.classList.contains('sel') && !hasSel);
  }
  ui.reset.disabled = !pyReady;
}

// ---------- 4. 버튼 ----------
document.querySelectorAll('[data-create]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const x = Math.round((Math.random() * 8 - 4) * 10) / 10;
    const z = Math.round((Math.random() * 8 - 4) * 10) / 10;
    const r = await act('create', btn.dataset.create, x, 0.5, z);
    if (r && r.ok) select(r.commands[0].target);
  });
});

document.querySelectorAll('[data-move]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [dx, dy, dz] = btn.dataset.move.split(',').map(Number);
    act('move', manager.selectedId, dx, dy, dz);
  });
});

$('btn-rotate').addEventListener('click', () => act('rotate', manager.selectedId, 0, 45, 0));
$('btn-bigger').addEventListener('click', () => act('resize', manager.selectedId, 1.25));
$('btn-smaller').addEventListener('click', () => act('resize', manager.selectedId, 0.8));
$('btn-visible').addEventListener('click', () => act('toggle_visible', manager.selectedId));
$('btn-color').addEventListener('click', () => act('set_color', manager.selectedId, ui.color.value));
$('btn-next-color').addEventListener('click', () => act('next_color', manager.selectedId));
$('btn-remove').addEventListener('click', async () => {
  const r = await act('remove', manager.selectedId);
  if (r && r.ok) select(null);
});
$('btn-circle').addEventListener('click', () => act('arrange_circle', 3));
$('btn-ping').addEventListener('click', async () => {
  try {
    const t0 = performance.now();
    const info = await python.call('ping');
    log(`Python 핑 ${Math.round(performance.now() - t0)}ms · dict ${JSON.stringify(info)}`);
  } catch (err) {
    log(`Python 핑 실패: ${err.message}`, 'error');
  }
});

ui.reset.addEventListener('click', async () => {
  select(null);
  if (viewport) viewport.resetCamera();
  await act('reset');
  log('전체 초기화 완료');
});
ui.camera.addEventListener('click', () => { if (viewport) viewport.resetCamera(); });

// ---------- 5. 시작 ----------
refreshButtons();
renderList();
showSelected();

python.start().then(async (info) => {
  log(`Python 준비 완료 (Python ${info.python}, Pyodide ${info.pyodide}) · ping 리스트 ${JSON.stringify(info.ping.kinds)}`);
  if (runner) await act('reset');
}).catch(() => {
  log(`Python 로딩 실패: ${ui.pyStatus.textContent}`, 'error');
  if (manager) {
    showFatalPython();
  }
});

function showFatalPython() {
  const note = document.createElement('div');
  note.className = 'hud';
  note.style.top = '10px';
  note.style.bottom = 'auto';
  note.style.color = 'var(--bad)';
  note.textContent = 'Python 엔진을 불러오지 못해 객체 명령을 쓸 수 없습니다. 패널의 Python 상태를 확인하세요.';
  ui.viewport.appendChild(note);
}

// 개발·자동 검증용
window.__nf3d = {
  get manager() { return manager; },
  get viewport() { return viewport; },
  python,
  act,
  select,
};
