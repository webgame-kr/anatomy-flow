// Play 화면 시작점 (STEP 03-D): 엔진·학습 모드·세션·컨트롤러·UI 연결
// 학습 규칙은 Python(lesson.py)에 있고, 여기서는 화면과 입력만 연결한다.

import { checkWebGL, createPlayEngine, DEFAULT_WALL_OPACITY } from './play-engine.js';
import { createGameplayController } from './gameplay-controller.js';
import { createGameplayUi } from './gameplay-ui.js';
import { createCyclePanel } from './cycle-panel.js';
import { createLearningMode, MODES } from './learning-mode.js';
import { createSessionManager } from './session-manager.js';
import { setupTyping } from '../shared/typing-input.js';

window.__nf3dBooted = true;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const LESSONS_URL = 'content/lessons/index.json';

const logs = [];
function log(text, level = '') {
  logs.push({ t: Math.round(performance.now()), text, level });
  if (logs.length > 300) logs.shift();
  if (level === 'error') console.warn(text);
}
window.addEventListener('unhandledrejection', (e) => { log(`처리되지 않은 오류: ${e.reason && e.reason.message ? e.reason.message : e.reason}`, 'error'); e.preventDefault(); });

const gl = checkWebGL();
if (!gl.ok) {
  $('fatal').hidden = false;
  $('fatal').innerHTML = `<h2>이 환경에서는 3D 화면을 표시할 수 없습니다</h2><p>${gl.reason}</p>`;
} else {
  boot().catch((err) => {
    $('fatal').hidden = false;
    $('fatal').innerHTML = `<h2>Play 화면을 시작하지 못했습니다</h2><p>${String(err.message || err)}</p>`;
  });
}

async function boot() {
  const mode = createLearningMode(params.get('mode') || 'guide');
  const session = createSessionManager();
  const engine = createPlayEngine({
    container: $('viewport'), labelContainer: $('viewport'), log,
    onPythonStatus: (state, text) => { if (state === 'error') log(`Python: ${text}`, 'error'); },
  });
  const game = createGameplayController({ engine, session, mode, log });
  const ui = createGameplayUi({ game, mode, session, engine });
  // STEP 04-B: 단계형 애니메이션 콘텐츠(심장주기)의 상태 표시·자유 관찰. 관찰 중에는 입력을 막는다 (Python 상태를 바꾸지 않게)
  const cycle = createCyclePanel({
    engine, game, container: $('cc-panel'), log,
    onObserveChange: (on) => { $('answer').disabled = on; $('btn-submit').disabled = on; },
    canRevealAll: () => mode.id === 'guide' || game.state === 'completed',
  });

  // ---------- 입력 ----------
  const input = $('answer');
  const typing = setupTyping(input, $('btn-submit'), {
    onSubmit: async (value) => {
      if (cycle.observing) return;
      const r = await game.submit(value);
      if (r === 'wrong') {
        const box = document.querySelector('.pl-typing');
        box.classList.remove('shake');
        void box.offsetWidth;
        box.classList.add('shake');
        input.select();
      } else if (r === 'correct' || r === 'arrived') {
        typing.clear();
      }
    },
  });
  // 자동 제출(선택): 조합이 끝난 입력만 Python에 정답인지 물어본다
  let autoTimer = null;
  input.addEventListener('input', (ev) => {
    if (!$('opt-auto') || !$('opt-auto').checked) return;
    if (ev.isComposing || typing.isComposing) return;
    clearTimeout(autoTimer);
    const value = input.value;
    autoTimer = setTimeout(async () => {
      if (typing.isComposing || input.value !== value || !['waiting_input', 'waiting_choice'].includes(game.state)) return;
      try {
        if (await engine.client.call('lesson.peek', value.normalize('NFC')) && input.value === value && !typing.isComposing) $('btn-submit').click();
      } catch (err) { /* 자동 제출 실패는 무시 (수동 제출 가능) */ }
    }, 300);
  });
  $('btn-hint').addEventListener('click', () => game.hint());
  $('btn-reveal').addEventListener('click', () => game.reveal());
  $('btn-clear').addEventListener('click', () => { typing.clear(); input.focus(); });

  // ---------- 상단·오버레이 ----------
  $('btn-pause').addEventListener('click', () => (game.state === 'paused' ? game.resume() : game.pause()));
  $('btn-resume').addEventListener('click', () => game.resume());
  $('btn-restart').addEventListener('click', () => game.restart());
  $('btn-err-restart').addEventListener('click', () => (game.failure && game.failure.fatal ? location.reload() : game.restart()));
  $('btn-retry').addEventListener('click', () => game.retry());
  $('btn-recover').addEventListener('click', () => game.recover());
  $('btn-end').addEventListener('click', () => { if (window.confirm('학습을 끝낼까요? 지금까지의 기록을 저장합니다.')) game.end(); });
  $('btn-settings').addEventListener('click', () => { const s = $('settings'); s.hidden = !s.hidden; $('btn-settings').setAttribute('aria-expanded', String(!s.hidden)); });
  $('tg-flow').addEventListener('click', () => { $('pl-flow').classList.toggle('open'); $('pl-stats').classList.remove('open'); });
  $('tg-stats').addEventListener('click', () => { $('pl-stats').classList.toggle('open'); $('pl-flow').classList.remove('open'); });

  // 설정
  const autoLabel = document.createElement('label');
  autoLabel.className = 'chk';
  autoLabel.innerHTML = '<input id="opt-auto" type="checkbox"> 정답이면 자동 제출 (한글 조합 중 제외)';
  $('settings').insertBefore(autoLabel, $('settings').querySelector('.row'));
  $('opt-camera').addEventListener('change', (ev) => game.setOption('cameraMode', ev.target.value));
  $('opt-reduced').addEventListener('change', (ev) => game.setOption('reducedMotion', ev.target.checked));
  $('opt-camspeed').addEventListener('input', (ev) => game.setOption('cameraSpeed', Number(ev.target.value)));
  $('opt-actorspeed').addEventListener('input', (ev) => game.setOption('actorSpeed', Number(ev.target.value)));
  $('opt-path').addEventListener('change', (ev) => game.setOption('showPath', ev.target.checked));
  $('opt-labels').addEventListener('change', (ev) => {
    engine.userLabels = ev.target.checked;
    const sp = engine.scale.currentSpec;
    if (engine.labels) engine.labels.setVisible(ev.target.checked && (!sp || sp.level === 'ORGAN'));
  });
  $('opt-opacity').value = String(DEFAULT_WALL_OPACITY);
  $('opt-opacity').addEventListener('input', (ev) => engine.setWallOpacity(Number(ev.target.value)));
  $('opt-view').addEventListener('change', (ev) => {
    $('opt-clip-pos').disabled = ev.target.value !== 'section_x';
    engine.setViewMode(ev.target.value);
  });
  $('opt-clip-pos').addEventListener('input', (ev) => engine.setSectionPosition(Number(ev.target.value) / 100));
  $('btn-view-all').addEventListener('click', () => { engine.camera.stopFollow(); engine.overview(); });
  $('btn-view-actor').addEventListener('click', () => { const a = game.lesson && game.lesson.actor_id; if (a) engine.focusActor(a); });
  $('btn-csv').addEventListener('click', async () => {
    const csv = await engine.client.call('lesson.records_csv', session.loadRecords());
    session.downloadCsv(`nurseflow-records-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  });

  // 스케일 표시: 지금 수준, 개념 모델 여부, 실제 크기와 교육용 확대
  const renderScale = () => {
    const sp = engine.scale.currentSpec;
    const box = $('scale-ind');
    box.innerHTML = '';
    if (!sp) { box.hidden = true; return; }
    box.hidden = false;
    const lv = engine.scale.levels[sp.level];
    const head = document.createElement('div');
    head.className = 'si-head';
    head.textContent = `${lv ? lv.name_ko : sp.level} 수준 · ${sp.title_ko || ''}`;
    if (sp.conceptual) { const b = document.createElement('span'); b.className = 'vs CONCEPTUAL'; b.textContent = '개념 모델'; b.title = '해부 모델이 아니라 직접 만든 단순 형태'; head.appendChild(b); }
    const unit = document.createElement('div');
    unit.className = 'si-note';
    unit.textContent = sp.unit_note || '';
    const mag = document.createElement('div');
    mag.className = 'si-note';
    mag.textContent = sp.magnification_note || '';
    box.append(head, unit, mag);
    box.classList.toggle('concept', !!sp.conceptual);
  };
  engine.scale.onChange((k) => { if (k === 'changed') renderScale(); });
  renderScale();

  // Hover 툴팁: 아직 배우지 않은 학습 구조 이름은 숨긴다
  engine.selection.onHover((oid) => {
    const tip = $('hover-tip');
    const sid = oid && engine.manager ? engine.anatomy.structureForObject(oid) : null;
    const s = sid ? engine.anatomy.get(sid) : null;
    tip.hidden = !s;
    if (!s) return;
    tip.textContent = canShowStructure(sid) ? `${s.name_ko} · ${s.name_en}` : '? ? ? (아직 배우지 않은 구조)';
  });

  // 학습 노드가 가리키는 구조와 그 하위 구조는 정책에 따라 숨긴다
  function lessonNodeFor(structureId) {
    if (!game.lesson) return null;
    let cur = structureId;
    while (cur) {
      const n = game.lesson.nodes.find((x) => x.anatomical_id === cur);
      if (n) return n;
      const s = engine.anatomy.get(cur);
      cur = s ? s.parent_id : null;
    }
    return null;
  }
  function canShowStructure(sid) {
    const n = lessonNodeFor(sid);
    return !n || !game.view || mode.canShowName(game.view, n.node_id || n.id);
  }
  function applyLabels() {
    if (!engine.labels || !game.lesson) return;
    const ids = game.lesson.nodes.map((n) => n.anatomical_id).filter((id) => id && canShowStructure(id));
    engine.labels.setMajor([...new Set(ids)]);
    engine.labels.setScope('major');
  }

  // ---------- 상태 변화 → 화면 ----------
  game.onChange((kind, data) => {
    if (kind === 'loading') { $('start-note').textContent = data.text; }
    if (kind === 'lesson') {
      $('pl-lesson').textContent = game.lesson.title;
      $('pl-system').textContent = game.lesson.system === 'cardiovascular' ? '심혈관계' : (game.lesson.system || '');
      const credits = engine.sceneInfo && engine.sceneInfo.credits;
      $('credits').hidden = !credits;
      $('credits').textContent = credits || '';
      $('start-note').textContent = game.lesson.verification_note || '';
      $('btn-start').disabled = false;
    }
    if (kind === 'complete') {
      ui.showDone(data.record, data.status);
      renderDoneButtons();
    }
    applyLabels();
    ui.renderAll(typing);
    if (['waiting_input', 'waiting_choice'].includes(game.state) && (kind === 'view' || kind === 'state')) typing.focus();
  });
  setInterval(() => { if (game.view && !['completed', 'ready', 'loading'].includes(game.state)) ui.renderStats(); }, 1000);

  // ---------- 시작 화면 ----------
  const modeBox = $('sel-mode');
  modeBox.innerHTML = '<legend class="muted">학습 모드</legend>';
  for (const m of Object.values(MODES)) {
    const lab = document.createElement('label');
    lab.innerHTML = `<input type="radio" name="mode" value="${m.id}"><span><b>${m.name_ko}</b><span>${m.desc}</span></span>`;
    if (m.id === mode.id) lab.querySelector('input').checked = true;
    modeBox.appendChild(lab);
  }
  $('btn-start').addEventListener('click', async () => {
    const m = modeBox.querySelector('input:checked').value;
    $('ov-start').hidden = true;
    await game.start(m);
  });

  function renderDoneButtons() {
    const box = $('done-btns');
    box.innerHTML = '';
    const b = (label, fn, cls = '') => { const x = document.createElement('button'); x.type = 'button'; x.textContent = label; if (cls) x.className = cls; x.addEventListener('click', fn); box.appendChild(x); };
    b('다시 플레이', async () => { $('ov-done').hidden = true; await game.start(mode.id); }, 'primary');
    for (const m of Object.values(MODES)) if (m.id !== mode.id) b(`${m.name_ko} 모드로 시작`, async () => { $('ov-done').hidden = true; await game.start(m.id); });
    b('학습 기록 CSV', () => $('btn-csv').click());
    b('3D 자유 탐색', () => { $('ov-done').hidden = true; });
  }

  // 콘텐츠 목록
  const index = await (await fetch(LESSONS_URL, { cache: 'no-cache' })).json();
  const sel = $('sel-lesson');
  for (const l of index.lessons) {
    const o = document.createElement('option');
    o.value = l.url;
    o.textContent = `${l.system} · ${l.title}`;
    sel.appendChild(o);
  }
  const want = params.get('lesson');
  const pick = index.lessons.find((l) => l.id === want) || index.lessons[0];
  sel.value = pick.url;
  sel.addEventListener('change', async () => { $('btn-start').disabled = true; await game.loadLesson(sel.value); });

  // 모바일 키보드: 보이는 영역 높이에 맞춰 입력창이 가려지지 않게
  if (window.visualViewport) {
    const fit = () => { document.body.style.height = `${window.visualViewport.height}px`; };
    window.visualViewport.addEventListener('resize', fit);
    fit();
  }

  window.__play = { engine, game, mode, session, logs, typing, cycle };
  ui.renderAll(typing);
  await game.loadLesson(pick.url);
  if (params.get('autostart') === '1' && game.state === 'ready') { $('ov-start').hidden = true; await game.start(mode.id); }
}
