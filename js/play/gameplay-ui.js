// Play 화면 그리기 (STEP 03-D): 진행 패널, 학습 정보, 문제·피드백, 오버레이
// 표시할 이름은 모두 learning-mode 정책(canShowName)을 거친다 → 암기·추론 모드에서 정답이 새지 않게.

const $ = (id) => document.getElementById(id);
const STATUS_KO = {
  APPROXIMATE: '근사 경로', PENDING: '모델·경로 없음', CONCEPT: '개념', TEST: '테스트', VERIFIED: '검증됨',
  GEOMETRY_CHECKED: '기하 검사', ANATOMY_REVIEWED: '전공자 검토', CONCEPTUAL: '개념 모델',
};
const STATUS_TIP = {
  APPROXIMATE: '해부학적으로 검증되지 않은 근사 경로',
  PENDING: '3D 모델이나 이동 경로가 없어 개념으로만 진행',
  GEOMETRY_CHECKED: '모델 내강 안쪽인지 기하 검사만 통과한 경로. 해부학 전문가 검토는 받지 않았다',
  ANATOMY_REVIEWED: '전공자가 검토한 경로',
  CONCEPTUAL: '해부 모델이 없어 직접 만든 개념 장면. 실제 모양·비율과 다르다',
};
const VAR_LABEL = {
  oxygenation: ['산소 상태', { oxygenated: '산소가 많음 (교육용 표시)', deoxygenated: '산소가 적음 (교육용 표시)' }],
  current_circulation: ['순환', { pulmonary: '폐순환', systemic: '체순환' }],
  current_structure: ['현재 구조', {}],
  completed_cycles: ['완료한 순환', {}],
  laps: ['순환 횟수(laps)', {}],
};

export function createGameplayUi({ game, mode, session, engine }) {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const nid = (n) => n.node_id || n.id;
  const nameOf = (n) => n.name_ko || n.ko;

  function badge(status) {
    const b = el('span', `vs ${status || ''}`, STATUS_KO[status] || status || '');
    b.title = STATUS_TIP[status] || '';
    return b;
  }

  // 고르지 않은 분기: 출발 노드를 지났고, 같은 출발의 다른 노드를 이미 골랐는데 이 노드는 안 간 경우
  function skippedSet(view, lesson) {
    const done = new Set(view.completed);
    const out = new Set();
    const byFrom = new Map();
    for (const e of lesson.edges) { const f = e.source_node || e.from; if (!byFrom.has(f)) byFrom.set(f, []); byFrom.get(f).push(e.target_node || e.to); }
    for (const [f, tos] of byFrom) {
      if (!done.has(f) || tos.length < 2) continue;
      if (!tos.some((t) => done.has(t))) continue;
      for (const t of tos) if (!done.has(t)) out.add(t);
    }
    return out;
  }

  function renderFlow() {
    const view = game.view;
    const lesson = game.lesson;
    const ol = $('flow-list');
    ol.innerHTML = '';
    if (!view || !lesson) return;
    const cand = new Set(view.candidates.map((c) => c.node));
    const skipped = skippedSet(view, lesson);
    for (const n of lesson.nodes) {
      const id = nid(n);
      const li = el('li');
      const done = view.completed.includes(id);
      const showName = mode.canShowName(view, id);
      let dot = '•';
      if (done) { li.classList.add('done'); dot = '✓'; }
      if (view.current === id) { li.classList.add('current'); dot = '▶'; }
      if (cand.has(id) && game.state !== 'completed') { li.classList.add('next'); dot = '?'; }
      if (skipped.has(id)) { li.classList.add('skipped'); dot = '–'; }
      if (!showName) li.classList.add('hidden-name');
      const visits = view.visits[id] || 0;
      li.append(el('span', 'mk', dot), el('span', 'nm', showName ? `${nameOf(n)}${visits > 1 ? ` ×${visits}` : ''}` : '? ? ?'));
      if (n.verification_status) li.appendChild(badge(n.verification_status));
      if (skipped.has(id)) li.title = '고르지 않은 분기 경로 (진행률에 포함하지 않음)';
      ol.appendChild(li);
    }
    $('flow-note').textContent = lesson.verification_note || '';
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function renderStats() {
    const v = game.view;
    const kv = $('stats-kv');
    kv.innerHTML = '';
    if (!v) return;
    const acc = v.correct + v.wrong > 0 ? (v.correct / (v.correct + v.wrong)) * 100 : 0;
    const rows = [
      ['진행률', `${Math.round(v.progress * 100)}%`],
      ['정답률', `${acc.toFixed(1)}% (전체 시도)`],
      ['첫 시도', `${v.first_accuracy}% (${v.first_correct}/${v.questions})`],
      ['정답 · 오답', `${v.correct} · ${v.wrong}`],
      ['학습 시간', fmtTime(session.activeSeconds())],
      ['힌트', `${v.hints}회`],
    ];
    if (v.laps) rows.push(['순환 이동', `${v.laps}회`]);
    for (const [k, val] of rows) kv.append(el('dt', '', k), el('dd', '', val));
    $('st-progress-bar').style.width = `${Math.round(v.progress * 100)}%`;
    const vars = $('vars-kv');
    vars.innerHTML = '';
    const declared = Object.keys((game.lesson && game.lesson.variables) || {});
    for (const key of declared) {
      const [label, map] = VAR_LABEL[key] || [key, {}];
      let value = v.vars[key];
      if (key === 'current_structure' && value === '') value = '-';
      vars.append(el('dt', '', label), el('dd', '', map[value] || String(value)));
    }
  }

  function renderQuestion() {
    const v = game.view;
    const box = $('q-lines');
    box.innerHTML = '';
    $('q-title').textContent = '';
    if (!v) return;
    if (game.state === 'completed') { $('q-title').textContent = '학습을 마쳤습니다.'; return; }
    const q = mode.question(v, v.candidates);
    $('q-title').textContent = q.title;
    const hints = new Map((game.hints || []).map((h) => [h.node, h.hint]));
    for (const line of q.lines) {
      const li = el('li');
      li.appendChild(document.createTextNode(line.text));
      if (line.answer) li.appendChild(el('span', 'ans', `→ ${line.answer}`));
      if (line.seen) li.appendChild(el('span', 'vs', '다시 방문'));
      if (hints.has(line.node)) li.appendChild(el('span', 'hint', `힌트: ${hints.get(line.node)}`));
      box.appendChild(li);
    }
  }

  function renderExplain() {
    const n = game.lastExplain;
    const box = $('explain');
    box.hidden = !n;
    if (!n) return;
    box.innerHTML = '';
    box.append(el('h3', '', `${nameOf(n)} · ${n.name_en || n.en || ''}`));
    if (n.explanation) box.append(el('p', '', n.explanation));
    const st = el('p', 'note');
    st.append('3D 상태: ', badge(n.verification_status));
    box.append(st);
  }

  function renderFeedback() {
    const f = game.feedback;
    const box = $('feedback');
    box.className = `feedback ${f ? f.kind : ''}`;
    box.textContent = f ? f.text : '';
  }

  // 입력 가능 상태와 버튼
  function renderControls(typing) {
    const s = game.state;
    const canType = s === 'waiting_input' || s === 'waiting_choice';
    typing.lock(!canType);
    $('answer').disabled = !canType && s !== 'checking' && s !== 'transitioning';
    $('btn-hint').disabled = !canType;
    $('btn-clear').disabled = !canType;
    $('btn-reveal').hidden = mode.id === 'guide';
    $('btn-reveal').disabled = !canType;
    $('btn-pause').disabled = !['waiting_input', 'waiting_choice', 'transitioning', 'paused'].includes(s);
    $('btn-pause').textContent = s === 'paused' ? '계속하기' : '일시정지';
    $('btn-end').disabled = !['waiting_input', 'waiting_choice', 'transitioning', 'paused', 'error'].includes(s);
    const status = { checking: '판정 중…', transitioning: '이동 중…', loading: '불러오는 중…', paused: '일시정지' }[s];
    $('pl-status').hidden = !status;
    $('pl-status').textContent = status || '';
    $('ov-pause').hidden = s !== 'paused';
    const err = s === 'error';
    $('ov-error').hidden = !err;
    if (err) {
      $('err-text').textContent = game.feedback ? game.feedback.text : '오류';
      const fatal = game.failure && game.failure.fatal;
      $('btn-retry').hidden = fatal;
      $('btn-recover').hidden = fatal;
    }
    $('pl-mode').textContent = `${mode.info.name_ko} 모드`;
  }

  function renderAll(typing) {
    renderFlow();
    renderStats();
    renderQuestion();
    renderExplain();
    renderFeedback();
    renderControls(typing);
  }

  function showDone(rec, status) {
    const v = game.view;
    const lesson = game.lesson;
    $('ov-done').hidden = false;
    $('done-title').textContent = status === 'quit' ? '학습 종료 (미완료)' : `학습 완료: ${lesson.title}`;
    const kv = $('done-kv');
    kv.innerHTML = '';
    const r = rec || {};
    const rows = [
      ['기전', lesson.title],
      ['완료 여부', status === 'quit' ? '중간 종료' : (v.end_reason === 'goal' ? '완료' : v.end_reason)],
      ['학습 모드', mode.info.name_ko],
      ['총 학습 시간', `${fmtTime(r.active_learning_time || session.activeSeconds())} (일시정지 제외)`],
      ['정답률', `${r.accuracy ?? 0}% (정답 ${v.correct} / 전체 제출 ${v.correct + v.wrong})`],
      ['첫 시도 정답률', `${r.first_attempt_accuracy ?? v.first_accuracy}% (${v.first_correct} / ${v.questions}문제)`],
      ['오답 횟수', String(v.wrong)],
      ['힌트 사용', `${v.hints}회`],
      ['학습한 구조', `${v.completed.length}개`],
    ];
    for (const [k, val] of rows) kv.append(el('dt', '', k), el('dd', '', val));
    const wrong = Object.keys(v.wrong_nodes || {}).map((id) => game.nodeOf(id)).filter(Boolean).map(nameOf);
    $('done-wrong').textContent = wrong.length ? wrong.join(', ') : '없음';
    const ol = $('done-review');
    ol.innerHTML = '';
    for (const id of v.completed) {
      const n = game.nodeOf(id);
      if (!n) continue;
      const li = el('li');
      li.append(el('b', '', `${nameOf(n)} `), el('span', 'muted', `${n.name_en || n.en || ''} `), badge(n.verification_status));
      if (n.explanation) li.append(el('div', '', n.explanation));
      ol.appendChild(li);
    }
    $('done-save').textContent = rec ? (rec.saved ? '학습 기록을 이 브라우저(LocalStorage)에 저장했습니다.' : `기록을 저장하지 못했습니다: ${rec.saveError || ''}`) : '기록을 계산하지 못했습니다.';
  }

  return { renderAll, renderStats, showDone, badge };
}
