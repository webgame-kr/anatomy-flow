// Sandbox 화면 연결: Python 엔진의 명령을 받아 화면에 반영한다

import { startPython, describeLoadError, PYODIDE_VERSION } from './py-bridge.js';
import { buildScene, applyView, pulse, makeTrail, clearTrails } from './render.js';
import { moveAlong, cancelAll } from './animation.js';
import { createCamera } from './camera.js';
import { setupTyping } from './typing-input.js';
import { loadRecords, saveRecord, clearRecords, downloadCsv } from './records.js';

const $ = (id) => document.getElementById(id);
const ui = {
  select: $('content-select'), reset: $('reset-btn'), svg: $('scene'), banner: $('banner'),
  prompt: $('prompt'), answer: $('answer'), submit: $('submit-btn'), feedback: $('feedback'),
  phase: $('d-phase'), current: $('d-current'), completed: $('d-completed'), path: $('d-path'),
  score: $('d-score'), steps: $('d-steps'), vars: $('d-vars'), candidates: $('d-candidates'),
  log: $('d-log'), validate: $('d-validate'), records: $('d-records'), engine: $('d-engine'),
  optAuto: $('opt-auto'), optFollow: $('opt-follow'), optLabels: $('opt-labels'),
  csv: $('csv-btn'), clearRec: $('clear-rec-btn'),
  loading: $('loading'), loadingText: $('loading-text'), loadingError: $('loading-error'),
};

let bridge = null;
let content = null;
let scene = null;
let view = null;
let session = 0;              // 콘텐츠를 다시 불러오거나 초기화하면 증가 (이전 애니메이션 무시용)
let executed = new Set();     // 이미 실행한 명령 id (중복 실행 방지)
let startTime = 0;
let lastPath = '-';
const camera = createCamera(ui.svg);
const MIN_FOLLOW_SCALE = 0.7;   // 추적할 때 최소 배율 (모바일에서 글자가 읽히도록)

const typing = setupTyping(ui.answer, ui.submit, {
  onSubmit: handleSubmit,
  onAutoCheck: (text) => ui.optAuto.checked && bridge && content && bridge.peek(text) === true,
});

// ---------- 시작 ----------
boot();

async function boot() {
  try {
    bridge = await startPython((text) => { ui.loadingText.textContent = text; });
  } catch (err) {
    const info = describeLoadError(err);
    ui.loadingText.textContent = '불러오기 실패';
    ui.loadingError.innerHTML = `<h2>${info.title}</h2><p>${info.body}</p>`;
    ui.loadingError.hidden = false;
    document.querySelector('.spinner').style.display = 'none';
    console.error(err);
    return;
  }
  ui.engine.textContent = `Pyodide ${PYODIDE_VERSION} · Python ${bridge.version || ''}`;

  let list = [];
  try {
    const res = await fetch('content/index.json', { cache: 'no-cache' });
    list = await res.json();
  } catch (err) {
    showFatal('콘텐츠 목록(content/index.json)을 읽지 못했습니다.');
    return;
  }
  ui.select.innerHTML = '';
  for (const item of list) {
    const opt = document.createElement('option');
    opt.value = item.file;
    opt.textContent = item.title;
    ui.select.appendChild(opt);
  }
  const params = new URLSearchParams(location.search);
  if (params.get('c')) ui.select.value = params.get('c');

  ui.select.disabled = false;
  ui.loading.hidden = true;
  typing.enable();
  updateRecords();
  await loadSelected();
}

function showFatal(text) {
  ui.loadingText.textContent = text;
  document.querySelector('.spinner').style.display = 'none';
}

// ---------- Content Loader ----------
async function loadSelected() {
  session += 1;
  cancelAll();
  content = null;
  view = null;
  hideBanner();
  ui.validate.innerHTML = '';
  const file = ui.select.value;
  let data;
  try {
    const res = await fetch(`content/${file}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = JSON.parse(await res.text());
  } catch (err) {
    showValidation([`파일을 읽지 못했습니다: ${file} (${err.message})`], []);
    clearScene('JSON 파일을 읽지 못했습니다.');
    return;
  }

  const result = bridge.load(data);
  showValidation(result.errors || [], result.warnings || []);
  if (!result.ok) {
    clearScene(`콘텐츠 검증 실패: 오류 ${result.errors.length}개 (패널의 "콘텐츠 검증" 참고)`);
    ui.validate.closest('details').open = true;
    return;
  }
  content = data;
  scene = buildScene(ui.svg, content);
  camera.fit(scene.bounds);
  startRound(result.view);
}

function clearScene(message) {
  ui.svg.innerHTML = '';
  scene = null;
  typing.lock(true);
  ui.reset.disabled = true;
  ui.prompt.textContent = message;
  ui.feedback.textContent = '';
  ui.csv.disabled = loadRecords().length === 0;
  renderPanel(null);
}

function showValidation(errors, warnings) {
  ui.validate.innerHTML = '';
  if (errors.length === 0 && warnings.length === 0) {
    const li = document.createElement('li');
    li.textContent = '문제 없음';
    ui.validate.appendChild(li);
  }
  for (const text of errors) addItem(ui.validate, `오류: ${text}`, 'err');
  for (const text of warnings) addItem(ui.validate, `경고: ${text}`, 'warn');
}

function addItem(list, text, cls) {
  const li = document.createElement('li');
  li.textContent = text;
  if (cls) li.className = cls;
  list.appendChild(li);
}

// ---------- 진행 ----------
function startRound(newView) {
  cancelAll();
  executed = new Set();
  lastPath = '-';
  startTime = performance.now();
  if (scene) {
    clearTrails(scene);
    scene.mover.setAttribute('visibility', 'hidden');
  }
  hideBanner();
  typing.lock(false);
  typing.clear();
  ui.reset.disabled = false;
  ui.feedback.textContent = '';
  ui.feedback.className = 'feedback';
  update(newView);
  typing.focus();
}

function handleSubmit(text) {
  if (!content) return;
  const res = bridge.submit(text);
  if (res.result === 'busy' || res.result === 'done' || res.result === 'not_loaded') return;
  if (res.result === 'empty') {
    setFeedback('용어를 입력하세요.', '');
    return;
  }
  if (res.result === 'wrong') {
    ui.answer.classList.remove('wrong');
    void ui.answer.offsetWidth;
    ui.answer.classList.add('wrong');
    setFeedback(`"${text.trim()}"는 다음 단계가 아닙니다. 현재 위치를 유지합니다.`, 'bad');
    update(res.view);
    return;
  }
  ui.answer.classList.remove('wrong');
  typing.clear();
  setFeedback('정답!', 'good');
  runCommands(res.commands, res.view);
}

function runCommands(commands, newView) {
  update(newView);
  for (const cmd of commands) {
    if (executed.has(cmd.id)) continue;   // 같은 명령은 한 번만 실행
    executed.add(cmd.id);
    if (cmd.type === 'move') startMove(cmd);
    else if (cmd.type === 'arrive') onArrive(cmd);
    else if (cmd.type === 'pulse' || cmd.type === 'color' || cmd.type === 'show') {
      const m = scene.modelEls[cmd.model];
      if (m) pulse(m.shape);
    } else if (cmd.type === 'var') flashVar(cmd.var);
    else if (cmd.type === 'complete') onComplete(cmd.reason);
  }
}

function startMove(cmd) {
  const pathEl = scene.edgeEls[cmd.edge];
  const mySession = session;
  typing.lock(true);
  lastPath = `${cmd.edge} (${cmd.from} → ${cmd.to})`;
  renderPanel(view);

  const mover = scene.mover;
  const look = cmd.mover || {};
  mover.setAttribute('r', look.size || 8);
  mover.style.fill = look.color || '#2f6fde';
  mover.setAttribute('visibility', 'visible');
  const trail = makeTrail(scene, cmd.edge);

  moveAlong(pathEl, {
    duration: cmd.duration || 1000,
    reverse: !!cmd.reverse,
    onFrame(point, eased) {
      mover.setAttribute('cx', point.x);
      mover.setAttribute('cy', point.y);
      if (trail) {
        const hidden = trail.len * (1 - eased);
        trail.el.style.strokeDashoffset = cmd.reverse ? `${-hidden}` : `${hidden}`;
      }
      if (ui.optFollow.checked) camera.follow(point, MIN_FOLLOW_SCALE);
    },
    onDone() {
      if (mySession !== session) return;   // 초기화된 뒤 끝난 이전 애니메이션
      mover.setAttribute('visibility', 'hidden');
      if (trail) trail.el.remove();
      const res = bridge.arrive(cmd.edge);
      if (res.result !== 'arrived') return;
      if (res.view.phase !== 'done') typing.lock(false);
      runCommands(res.commands, res.view);
      typing.focus();
    },
  });
}

function onArrive(cmd) {
  const item = scene.nodeEls[cmd.node];
  if (!item) return;
  pulse(item.group.querySelector('circle:not(.ring)'));
  if (ui.optFollow.checked) camera.follow({ x: item.data.x, y: item.data.y }, MIN_FOLLOW_SCALE);
}

function onComplete(reason) {
  typing.lock(true);
  const seconds = (performance.now() - startTime) / 1000;
  const record = bridge.makeRecord(dateText(new Date()), seconds);
  if (record) saveRecord(record);
  updateRecords();
  if (reason === 'goal') {
    showBanner(`완료! 정답 ${view.correct} · 오답 ${view.wrong} · 정답률 ${view.accuracy}%`, false);
  } else if (reason === 'limit') {
    showBanner('최대 이동 횟수에 도달해 종료했습니다.', true);
  } else {
    showBanner('더 갈 수 있는 경로가 없어 종료했습니다.', true);
  }
}

// ---------- 화면 갱신 ----------
function update(newView) {
  view = newView;
  if (scene && view) applyView(scene, view, { showLabels: ui.optLabels.checked });
  renderPrompt();
  renderPanel(view);
}

function renderPrompt() {
  if (!view) return;
  if (view.phase === 'done') {
    ui.prompt.textContent = '시나리오가 끝났습니다. 초기화하거나 다른 콘텐츠를 고르세요.';
    return;
  }
  if (view.phase === 'moving') {
    ui.prompt.textContent = '이동 중…';
    return;
  }
  const cands = view.candidates || [];
  if (cands.length === 0) {
    ui.prompt.textContent = '입력할 수 있는 다음 단계가 없습니다.';
    return;
  }
  const head = view.current ? '다음 단계' : '시작 지점';
  if (cands.length === 1) {
    ui.prompt.innerHTML = `${head}: <b>${escapeHtml(cands[0].desc || '(설명 없음)')}</b>`;
  } else {
    const parts = cands.map((c, i) => `${i + 1}) ${escapeHtml(c.desc || c.node)}`);
    ui.prompt.innerHTML = `갈래 ${cands.length}개 — 가고 싶은 쪽의 용어를 입력: <b>${parts.join(' &nbsp; ')}</b>`;
  }
}

function renderPanel(v) {
  if (!v) {
    for (const key of ['phase', 'current', 'completed', 'path', 'score', 'steps']) ui[key].textContent = '-';
    ui.vars.innerHTML = '';
    ui.candidates.innerHTML = '';
    ui.log.innerHTML = '';
    return;
  }
  const phaseName = { ready: '입력 대기', moving: '이동 중', done: '종료' };
  ui.phase.textContent = `${phaseName[v.phase] || v.phase}${v.end_reason ? ` (${v.end_reason})` : ''}`;
  ui.current.textContent = v.current ? `${v.current} · ${nodeName(v.current)}` : '(시작 전)';
  ui.completed.textContent = (v.completed || []).map((id) => `${id}×${(v.visits || {})[id] || 0}`).join(', ') || '-';
  ui.path.textContent = v.moving_edge ? lastPath : `마지막: ${lastPath}`;
  ui.score.textContent = `${v.correct} / ${v.wrong} (정답률 ${v.accuracy}%)`;
  ui.steps.textContent = `${v.steps}${content && content.max_steps ? ` / 최대 ${content.max_steps}` : ''}`;

  ui.vars.innerHTML = '';
  const vars = v.vars || {};
  const keys = Object.keys(vars);
  if (keys.length === 0) ui.vars.innerHTML = '<tr><td colspan="2">(변수 없음)</td></tr>';
  for (const key of keys) {
    const tr = document.createElement('tr');
    tr.dataset.var = key;
    tr.innerHTML = `<td>${escapeHtml(key)}</td><td>${escapeHtml(JSON.stringify(vars[key]))}</td>`;
    ui.vars.appendChild(tr);
  }

  ui.candidates.innerHTML = '';
  for (const c of v.candidates || []) {
    addItem(ui.candidates, `${c.node} (${c.edge || '시작'}): ${c.answers.join(' / ')}`);
  }
  if ((v.candidates || []).length === 0) addItem(ui.candidates, '-');

  ui.log.innerHTML = '';
  const log = v.log || [];
  for (let i = log.length - 1; i >= 0; i--) {
    const li = document.createElement('li');
    li.value = log[i][0];
    li.textContent = log[i][1];
    ui.log.appendChild(li);
  }
}

function nodeName(id) {
  const n = content && content.nodes.find((x) => x.id === id);
  return n ? n.ko : '';
}

function flashVar(name) {
  const row = ui.vars.querySelector(`tr[data-var="${CSS.escape(name)}"]`);
  if (!row) return;
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 900);
}

function setFeedback(text, cls) {
  ui.feedback.textContent = text;
  ui.feedback.className = `feedback ${cls}`;
}

function showBanner(text, warn) {
  ui.banner.textContent = text;
  ui.banner.classList.toggle('warn', warn);
  ui.banner.hidden = false;
}

function hideBanner() {
  ui.banner.hidden = true;
}

function updateRecords() {
  const list = loadRecords();
  if (list.length === 0) {
    ui.records.textContent = '저장된 기록이 없습니다.';
  } else {
    const last = list[list.length - 1];
    ui.records.textContent = `기록 ${list.length}개 · 마지막: ${last.title} (${last.accuracy}%, ${last.seconds}초)`;
  }
  ui.csv.disabled = list.length === 0;
}

function dateText(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 버튼과 옵션 ----------
ui.select.addEventListener('change', () => { loadSelected(); });

ui.reset.addEventListener('click', () => {
  if (!content) return;
  session += 1;
  const newView = bridge.reset();
  camera.fit(scene.bounds);
  startRound(newView);
  setFeedback('초기화했습니다.', '');
});

ui.optLabels.addEventListener('change', () => update(view));
ui.optFollow.addEventListener('change', () => { if (!ui.optFollow.checked) camera.stopFollow(); });
$('zoom-in').addEventListener('click', () => camera.zoomIn());
$('zoom-out').addEventListener('click', () => camera.zoomOut());
$('zoom-fit').addEventListener('click', () => { if (scene) camera.fit(scene.bounds); });

ui.csv.addEventListener('click', () => {
  const list = loadRecords();
  if (list.length === 0) return;
  downloadCsv(`flow-records-${dateText(new Date()).slice(0, 10)}.csv`, bridge.recordsCsv(list));
});

ui.clearRec.addEventListener('click', () => {
  if (!confirm('저장된 학습 기록을 모두 지울까요?')) return;
  clearRecords();
  updateRecords();
});

// 개발·자동 검증용 (콘솔에서 확인)
window.__flow = {
  get view() { return view; },
  get content() { return content; },
  get bridge() { return bridge; },
  submit: (text) => handleSubmit(text),
};
