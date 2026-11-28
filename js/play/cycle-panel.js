// 생리 단계 패널 (STEP 04-B): 심장주기 같은 단계형 애니메이션 콘텐츠의 현재 상태 표시와 자유 관찰
// - 표시: 현재 단계, 심방·심실, 방실판막·반월판막(구조 상태), 혈액 이동 방향, 압력 관계, 심음, 강의 근거 쪽
// - 학습 진행: Python이 단계를 정한다(정답 → 필수 타임라인). 이 패널은 보여 주기만 한다.
// - 자유 관찰: 자동 재생·이전·다음·일시정지·속도·실제 모델 보기. Python을 부르지 않으므로 학습 기록·규칙 상태가 바뀌지 않는다.
//   관찰 중에는 입력을 막고, 관찰을 끝내면 지금 학습 단계의 모양(판막·형태·Actor 위치)으로 되돌린다.
// - 단계 데이터는 콘텐츠(content/animations/*.json의 phases)에 있다. 여기에는 의료 내용을 넣지 않는다.

const ALLOWED_STATES = ['ready', 'waiting_input', 'waiting_choice', 'completed'];

export function createCyclePanel({ engine, game, container, log = () => {}, onObserveChange = () => {}, canRevealAll = () => true }) {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const btn = (label, fn, cls = '') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const obs = { on: false, index: -1, auto: false, speed: 1, busy: false, token: 0, real: false };

  container.innerHTML = '';
  const head = el('button', 'cc-head');
  head.type = 'button';
  head.title = '눌러서 펼치기·접기';
  // 좁은 화면에서는 접어 둔다 (3D 모델을 가리지 않게). 접혀도 단계와 판막 요약은 보인다
  let collapsed = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
  head.addEventListener('click', () => { collapsed = !collapsed; render(); });
  const body = el('dl', 'kv cc-kv');
  const note = el('p', 'note cc-note');
  const ctrl = el('div', 'row btns cc-ctrl');
  const toggle = btn('자유 관찰', () => (obs.on ? stopObserve() : startObserve()));
  const bPrev = btn('◀ 이전', () => stepTo(obs.index - 1));
  const bNext = btn('다음 ▶', () => stepTo(obs.index + 1));
  const bAuto = btn('▶ 자동 재생', () => (obs.auto ? stopAuto() : startAuto()));
  const bPause = btn('⏸', togglePause);
  const speed = el('select');
  for (const v of [0.5, 1, 2]) { const o = el('option', '', `${v}배`); o.value = String(v); speed.appendChild(o); }
  speed.value = '1';
  speed.setAttribute('aria-label', '재생 속도');
  speed.addEventListener('change', () => { obs.speed = Number(speed.value); });
  const bReal = btn('실제 모델 보기', toggleReal);
  ctrl.append(toggle, bPrev, bNext, bAuto, bPause, speed, bReal);
  container.append(head, body, ctrl, note);

  const phases = () => engine.conceptPhases();
  const active = () => phases().length > 0;

  function currentPhaseKey() {
    // 관찰 중: 관찰 단계. 학습 중: 현재 노드로 들어온 Edge의 타임라인
    if (obs.on) return obs.index >= 0 ? phases()[obs.index].phase_key : null;
    // 정답 뒤 단계 타임라인이 도는 중: 지금 보이는 단계(타임라인 marker)를 보여 준다
    if (game.state === 'transitioning' && engine.anim.timeline.phase !== null) {
      const cur = phases().find((p) => p.phase === engine.anim.timeline.phase);
      if (cur) return cur.phase_key;
    }
    const v = game.view;
    const lesson = game.lesson;
    if (!v || !lesson || !v.current) return null;
    const ed = (lesson.edges || []).find((x) => (x.target_node || x.to) === v.current && x.timeline_id);
    const ph = ed ? phases().find((p) => p.timeline_id === ed.timeline_id) : null;
    return ph ? ph.phase_key : null;
  }

  function render() {
    container.hidden = !active();
    if (!active()) return;
    const key = currentPhaseKey();
    const ph = key ? phases().find((p) => p.phase_key === key) : null;
    const vs = engine.anim.visual;
    const st = (id) => vs.get(id) || '-';
    const short = (x) => ({ OPEN: '열림', CLOSED: '닫힘', OPENING: '열리는 중', CLOSING: '닫히는 중' }[x] || x);
    // 암기·추론 모드: 자유 관찰에서 아직 배우지 않은 단계 이름(정답)을 보여 주지 않는다
    const hideName = obs.on && !canRevealAll();
    const phName = ph ? (hideName ? `단계 ${obs.index + 1} (이름은 학습 뒤 표시)` : ph.name_ko) : '시작 전';
    head.textContent = `${collapsed ? '▸' : '▾'} ${obs.on ? '자유 관찰' : '학습 진행'} · ${phName}${collapsed ? ` — 방실판막 ${short(st('valve.mitral'))} · 반월판막 ${short(st('valve.aortic'))}` : ''}`;
    head.className = `cc-head${obs.on ? ' observing' : ''}`;
    container.classList.toggle('collapsed', collapsed);
    body.innerHTML = '';
    const row = (k, v) => body.append(el('dt', '', k), el('dd', '', v));
    row('심방', ph ? ph.atria : '-');
    row('심실', ph ? ph.ventricles : '-');
    row('방실판막', `삼첨판 ${st('valve.tricuspid')} · 승모판 ${st('valve.mitral')}`);
    row('반월판막', `폐동맥판 ${st('valve.pulmonary')} · 대동맥판 ${st('valve.aortic')}`);
    row('혈액 이동', ph ? ph.flow : '-');
    row('압력 관계', ph ? ph.pressure_relation : '-');
    if (ph && ph.heart_sound) row('심음', ph.heart_sound);
    note.textContent = `${ph ? `근거: ${ph.lecture_refs.join(', ')}. ` : ''}개념 모델입니다. 단계 시간·모양은 교육용 값이며 압력·혈류 계산이 아닙니다.${obs.real ? ' 실제 모델의 판막은 색으로만 상태를 표시합니다(움직이지 않음).' : ''}`;
    toggle.textContent = obs.on ? '관찰 끝 (학습으로)' : '자유 관찰';
    for (const b of [bPrev, bNext, bAuto, bPause, speed]) b.disabled = !obs.on || obs.real;
    bAuto.textContent = obs.auto ? '■ 자동 정지' : '▶ 자동 재생';
    bReal.textContent = obs.real ? '개념 모델 보기' : '실제 모델 보기';
    bReal.disabled = !obs.on || obs.busy;
    toggle.disabled = !obs.on && !ALLOWED_STATES.includes(game.state);
  }

  // ---------- 자유 관찰 ----------
  function startObserve() {
    if (!ALLOWED_STATES.includes(game.state)) { log('이동이나 애니메이션이 끝난 뒤 관찰할 수 있습니다', 'warn'); return; }
    obs.on = true;
    obs.index = Math.max(0, phases().findIndex((p) => p.phase_key === currentPhaseKey()));
    onObserveChange(true);
    log('자유 관찰 시작 (학습 기록·진행에 영향 없음)');
    render();
  }

  async function stopObserve() {
    obs.token += 1;
    obs.auto = false;
    engine.anim.cancelAll('observe_end');
    if (obs.real) await toggleReal();
    obs.on = false;
    // 학습 단계의 모양으로 되돌리기
    const key = currentPhaseKey();
    const lesson = game.lesson;
    if (key) await engine.applyPhaseEnd(key);
    else if (lesson && lesson.initial_visual_state) {
      await engine.applyVisualState(lesson.initial_visual_state);
      const node = game.view && game.view.current ? game.nodeOf(game.view.current) : null;
      for (const [id, w] of [['cc.lv', 0], ['cc.rv', 0], ['cc.la', 0], ['cc.ra', 0]]) if (engine.registry.has(id)) engine.anim.morph.set(id, 'contract', w);
      for (const id of ['cc.lv', 'cc.rv']) if (engine.registry.has(id)) engine.materials.setColor(id, null);
      if (node && node.checkpoint_id) engine.kit.motion.placeAtCheckpoint(lesson.actor_id, node.checkpoint_id);
    }
    onObserveChange(false);
    log('자유 관찰 끝: 학습 단계 화면으로 돌아옴');
    render();
  }

  // 단계 k 보기: 앞 단계가 끝난 모양으로 맞춘 뒤 k 단계 타임라인을 재생
  async function stepTo(k) {
    const list = phases();
    if (!obs.on || obs.busy || !list.length) return;
    const n = list.length;
    const i = ((k % n) + n) % n;
    obs.busy = true;
    const my = obs.token;
    render();
    const prev = list[(i - 1 + n) % n];
    await engine.applyPhaseEnd(prev.phase_key);
    obs.index = i;
    render();
    const r = await engine.anim.timeline.play(list[i].timeline_id, { speed: obs.speed }).promise;
    if (my === obs.token && r.status === 'failed') log(`관찰 재생 실패: ${r.reason}`, 'error');
    obs.busy = false;
    render();
    return r;
  }

  async function startAuto() {
    obs.auto = true;
    const my = obs.token;
    render();
    while (obs.auto && obs.on && my === obs.token) {
      // 이어서 재생: 앞 단계 모양 맞추기 없이 다음 타임라인을 바로
      const list = phases();
      const i = (obs.index + 1) % list.length;
      obs.index = i;
      obs.busy = true;
      render();
      const r = await engine.anim.timeline.play(list[i].timeline_id, { speed: obs.speed }).promise;
      obs.busy = false;
      if (r.status !== 'completed') break;
    }
    obs.auto = false;
    render();
  }
  function stopAuto() { obs.auto = false; render(); }

  let paused = false;
  function togglePause() {
    paused = !paused;
    if (paused) { engine.anim.pauseAll(); } else { engine.anim.resumeAll(); }
    bPause.textContent = paused ? '▶' : '⏸';
  }

  // 실제 모델(BodyParts3D) 보기: 같은 판막 상태를 실제 판막 색으로 표시. 스케일 장면만 바꾼다
  async function toggleReal() {
    const organ = engine.organSceneId();
    const concept = engine.conceptSceneId();
    if (!organ || !concept || obs.busy) return;
    obs.busy = true;
    stopAuto();
    const actor = game.lesson ? game.lesson.actor_id : 'rbc_01';
    if (!obs.real) {
      const r = await engine.runner.run([{ action: 'scale_change', target: actor, level: 'ORGAN', scene_id: organ, checkpoint_id: 'cp.ra', duration: 600, wait: true }]);
      if (!r.failed) { obs.real = true; engine.focusStructure('cv.heart', 500); }
    } else {
      const key = currentPhaseKey();
      await engine.runner.run([{ action: 'scale_change', target: actor, level: engine.scale.get(concept).level, scene_id: concept, checkpoint_id: 'cp.cc.la', duration: 600, wait: true }]);
      obs.real = false;
      if (key) await engine.applyPhaseEnd(key);
    }
    obs.busy = false;
    render();
  }

  engine.anim.visual.onChange(() => render());
  engine.anim.timeline.onEvent((k) => { if (k === 'marker' || k === 'complete') render(); });
  game.onChange(() => render());
  render();

  return { render, get observing() { return obs.on; }, startObserve, stopObserve, stepTo, startAuto, stopAuto, toggleReal, get state() { return { ...obs }; } };
}
