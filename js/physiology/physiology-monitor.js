// Physiology Monitor (STEP 04-C): Play 화면의 생리 상태 모니터·그래프·자유 실험·자동 관찰
// - 표시 값은 Python 스냅샷(game.physiology)이다. 여기서 생리 값을 계산하거나 바꾸지 않는다.
// - 콘텐츠가 고른 변수만 보여 준다(lesson.physiology.monitor). 모든 수치를 한꺼번에 보이지 않는다.
// - 암기·추론 모드: 다음 문제의 정답과 관련된 변수(physiology_hide)의 값·방향을 제출 전에 숨긴다.
// - 교육용 수치·계산값·상대 상태·근거(강의 대조/공개 자료/교육용 값)를 구분해 표시한다. 실제 환자 측정값이 아니다.
// - 자유 실험(experiment)·자동 관찰(observe)은 학습 상태와 다른 문맥에서 한다. 그동안 입력을 막는다.
// - 그래프는 상태가 바뀔 때만 다시 그린다(프레임마다 그리지 않음).

const LEVEL_KO = { '-2': '크게 감소', '-1': '감소', 0: '기준', 1: '증가', 2: '크게 증가', UNKNOWN: '미확정', MIXED: '미확정(반대 원인)' };
const ARROW = { '-2': '⇊', '-1': '↓', 0: '–', 1: '↑', 2: '⇈', UNKNOWN: '?', MIXED: '±' };
const STATUS_KO = {
  LECTURE_CHECKED: '강의 대조', PUBLIC_REFERENCE: '공개 자료', EDUCATIONAL_VALUE: '교육용 값', CONCEPTUAL: '개념',
  PENDING_REVIEW: '검토 전', TECH_TESTED: '기술 시험', NEEDS_PHYSIOLOGY_REVIEW: '생리 검토 필요', NEEDS_ANATOMY_REVIEW: '해부 검토 필요',
};
const SIGNAL_KO = { neural_afferent: '구심 신경', neural_efferent: '원심 신경', hormone: '호르몬', enzyme: '효소', neurotransmitter: '신경전달물질', paracrine: '세포 간 신호', electrical: '전기 활성' };
const SIGNAL_COLOR = { neural_afferent: '#3f86b3', neural_efferent: '#d9772b', hormone: '#8e5cd9', enzyme: '#b8902a' };
const TIMESCALE_KO = { neural_fast: '빠른 신경 조절', hormonal: '호르몬', hormonal_slow: '느린 호르몬 조절', renal_volume: '신장·체액량', immediate: '즉시' };
const LINE_COLORS = ['#d23c3c', '#2e6fd1', '#2b9a5a', '#d9772b', '#8e5cd9', '#555'];
const BUSY_STATES = ['transitioning', 'checking', 'loading'];

export function createPhysiologyMonitor({ game, mode, engine, container, log = () => {}, onLockChange = () => {} }) {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const btn = (label, fn, cls = '') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const st = { tab: 'state', collapsed: false, ctx: 'mechanism', running: false, paused: false, speed: 1, steps: [], warnings: [], errors: [], drawn: '' };
  // 좁은 화면이나 좁은 3D 영역에서는 접어 둔다 (3D 모델을 가리지 않게). 머리글을 누르면 펼친다
  if (typeof window !== 'undefined' && window.matchMedia) st.collapsed = window.matchMedia('(max-width: 720px)').matches;
  if (container.parentElement && container.parentElement.clientWidth && container.parentElement.clientWidth < 560) st.collapsed = true;

  container.innerHTML = '';
  const head = el('button', 'cc-head ph-head');
  head.type = 'button';
  head.addEventListener('click', () => { st.collapsed = !st.collapsed; render(); });
  const tabs = el('div', 'row btns ph-tabs');
  const body = el('div', 'ph-body');
  const foot = el('p', 'note ph-foot');
  container.append(head, tabs, body, foot);

  const phys = () => game.physiology;
  const conf = () => (game.lesson && game.lesson.physiology) || null;
  const active = () => !!conf() && !!phys();

  function hiddenVars() {
    // 가이드 모드는 모두 보인다. 암기·추론: 지금 후보 문제의 physiology_hide (정답 보기를 누른 문제는 보인다)
    const v = game.view;
    if (!v || mode.id === 'guide') return new Set();
    const out = new Set();
    for (const c of v.candidates || []) {
      if (mode.canShowName(v, c.node)) continue;
      for (const id of c.physiology_hide || []) out.add(id);
    }
    return out;
  }

  function fmt(x, unit) {
    if (x === null || x === undefined) return '계산 불가';
    if (typeof x === 'number') return `${Math.round(x * 100) / 100}${unit && unit !== '단계' ? ` ${unit}` : ''}`;
    return String(x);
  }

  function setTab(t) { st.tab = t; render(); }

  function renderTabs() {
    tabs.innerHTML = '';
    const c = conf();
    const items = [['state', '상태'], ['graph', '그래프']];
    // 암기·추론 모드에서는 실험·관찰로 정답을 미리 볼 수 있으므로, 가이드 모드이거나 학습을 마친 뒤에만 연다
    const open = mode.id === 'guide' || game.state === 'completed' || st.ctx !== 'mechanism';
    if (c && c.experiment && open) items.push(['experiment', '자유 실험']);
    if (c && c.observe && open) items.push(['observe', '자동 관찰']);
    if (!items.some(([id]) => id === st.tab)) st.tab = 'state';
    for (const [id, label] of items) {
      const b = btn(label, () => setTab(id), st.tab === id ? 'on' : '');
      b.setAttribute('aria-pressed', String(st.tab === id));
      tabs.appendChild(b);
    }
  }

  // ---------- 상태 ----------
  function renderState(p) {
    const hide = hiddenVars();
    const c = conf();
    const ctxNote = el('p', 'note');
    ctxNote.textContent = p.context === 'mechanism' ? (c.mechanism_note || '기전 학습: 정답을 맞힐 때마다 생리 상태가 바뀝니다.')
      : p.context === 'experiment' ? '자유 실험 중 (학습 기록과 별개)' : '자동 관찰 중 (학습 상태와 별개)';
    body.appendChild(ctxNote);
    const table = el('table', 'ph-table');
    const thead = el('tr');
    for (const h of ['변수', '기준', '현재', '방향']) thead.appendChild(el('th', '', h));
    table.appendChild(thead);
    for (const v of p.vars) {
      const tr = el('tr');
      const name = el('td');
      name.appendChild(el('span', '', v.name_ko));
      const tag = v.data_type === 'computed' ? '계산값' : (v.data_type === 'relative' ? '상대 상태' : (STATUS_KO[v.verification_status] || ''));
      if (tag) name.appendChild(el('span', 'ph-tag', tag));
      name.title = `${v.name_en || ''} · 근거 상태: ${STATUS_KO[v.verification_status] || v.verification_status}${v.note ? ` · ${v.note}` : ''}`;
      tr.appendChild(name);
      const hidden = hide.has(v.variable_id);
      const numeric = v.data_type === 'number' || v.data_type === 'computed';
      // 숨김 변수는 기준값도 숨긴다 (계산 문제의 정답이 기준값일 수 있다)
      tr.appendChild(el('td', hidden ? 'ph-hidden' : '', hidden ? '?' : (numeric ? fmt(v.baseline, v.unit) : '기준')));
      const cur = hidden ? '?' : (numeric ? (p.context === 'mechanism' && v.trend !== 0 && v.value === v.baseline ? '(방향만)' : fmt(v.value, v.unit)) : (LEVEL_KO[v.level] || v.label));
      tr.appendChild(el('td', hidden ? 'ph-hidden' : '', cur));
      const dir = hidden ? '?' : (ARROW[v.level] ?? '');
      const td = el('td', `ph-dir lv${v.level}`, dir);
      if (!hidden && v.normal_range && numeric && typeof v.value === 'number') {
        const [lo, hi] = v.normal_range;
        if (v.value < lo || v.value > hi) td.title = `참고 범위 ${lo}–${hi} ${v.unit} 밖 (교육용 표시)`;
      }
      tr.appendChild(td);
      table.appendChild(tr);
    }
    body.appendChild(table);
    if (hide.size) body.appendChild(el('p', 'note', `제출 전에는 정답과 관련된 ${hide.size}개 변수를 숨깁니다 (${mode.info.name_ko} 모드).`));
    const rec = (p.receptors || []).filter((r) => r.state === 'ACTIVE');
    if (rec.length) body.appendChild(el('p', 'ph-line', `활성 수용체: ${rec.map((r) => `${r.name_ko}`).join(', ')}`));
    const sig = (p.signals || []).slice(-4).reverse();
    if (sig.length) {
      const line = el('p', 'ph-line');
      line.appendChild(document.createTextNode('최근 신호: '));
      for (const s of sig) {
        const chip = el('span', 'ph-chip', `${SIGNAL_KO[s.signal_type] || s.signal_type} ${s.source}→${s.target}`);
        chip.style.borderColor = SIGNAL_COLOR[s.signal_type] || '#999';
        line.appendChild(chip);
      }
      body.appendChild(line);
    }
    const fb = Object.entries(p.feedback || {});
    if (fb.length) body.appendChild(el('p', 'ph-line', `되먹임: ${fb.map(([id, f]) => `${id.replace('fb.', '')} ${f.iteration}회 (${f.status})`).join(' · ')}`));
    if (p.pending) body.appendChild(el('p', 'note', '정답 처리 중: 애니메이션이 끝나면 상태를 확정합니다.'));
  }

  // ---------- 그래프 ----------
  const canvas = el('canvas', 'ph-graph');
  canvas.width = 300;
  canvas.height = 150;
  function renderGraph(p) {
    const c = conf();
    const ids = c.graph || [];
    const hide = hiddenVars();
    body.appendChild(canvas);
    const legend = el('div', 'ph-legend');
    body.appendChild(legend);
    const hist = p.history || [];
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fafbfd';
    ctx.fillRect(0, 0, W, H);
    // 0 기준선 (기준 상태), 위 = 증가
    const y0 = H / 2;
    ctx.strokeStyle = '#ccd';
    ctx.beginPath(); ctx.moveTo(28, y0); ctx.lineTo(W - 4, y0); ctx.stroke();
    ctx.fillStyle = '#889';
    ctx.font = '9px sans-serif';
    ctx.fillText('기준', 2, y0 + 3);
    ctx.fillText('증가', 2, 12);
    ctx.fillText('감소', 2, H - 4);
    if (hist.length < 1) return;
    const xs = (i) => 28 + (hist.length === 1 ? 0 : (i * (W - 34)) / (hist.length - 1));
    const varInfo = Object.fromEntries((p.vars || []).map((v) => [v.variable_id, v]));
    ids.forEach((id, k) => {
      const color = LINE_COLORS[k % LINE_COLORS.length];
      const info = varInfo[id];
      const item = el('span', 'ph-chip', info ? info.name_ko : id);
      item.style.borderColor = color;
      if (hide.has(id)) { item.textContent += ' (숨김)'; legend.appendChild(item); return; }
      legend.appendChild(item);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      hist.forEach((row, i) => {
        const raw = row.values[id];
        const level = row.levels ? row.levels[id] : null;
        let y = null;
        const numeric = info && (info.data_type === 'number' || info.data_type === 'computed');
        if (numeric && typeof raw === 'number' && raw === info.baseline && typeof level === 'number' && level !== 0) {
          // 값은 그대로이고 방향만 정해진 경우(기전 학습): 단계로 그린다
          y = y0 - (level / 2) * (H / 2 - 6);
        } else if (typeof raw === 'number' && numeric && typeof info.baseline === 'number' && info.baseline) {
          // 수치: 기준값 대비 변화율(±50% = 위·아래 끝)
          const ratio = (raw - info.baseline) / Math.abs(info.baseline);
          y = y0 - Math.max(-1, Math.min(1, ratio / 0.5)) * (H / 2 - 6);
        } else if (typeof raw === 'number' && raw >= -2 && raw <= 2) {
          y = y0 - (raw / 2) * (H / 2 - 6);
        }
        if (y === null) { started = false; return; }
        y += (k - (ids.length - 1) / 2) * 2.5;    // 같은 단계로 겹치는 선을 구분하려고 조금씩 띄운다 (표시용)
        if (!started) { ctx.moveTo(xs(i), y); started = true; } else ctx.lineTo(xs(i), y);
      });
      ctx.stroke();
    });
    const t = p.time || {};
    body.appendChild(el('p', 'note', `가로: 기록 순서(학습 단계 ${t.step ?? 0}, 물리 시간 ${t.t ?? 0}). 세로: 수치 변수는 기준값 대비 변화율(±50%), 상대 상태·방향만 바뀐 수치는 단계(±2). 겹치는 선은 조금 띄워 그렸다. 물리 시간 1단위 = 화면 ${(t.tick_ms || 600) / 1000}초(교육용 압축). 실제 환자 모니터 데이터가 아닙니다.`));
  }

  // ---------- 자유 실험 ----------
  async function enterContext(name) {
    const r = await game.physiologyCall('switch_context', name);
    if (!r.ok) { st.errors = r.errors || []; render(); return false; }
    st.ctx = name;
    onLockChange(name !== 'mechanism');
    await game.runPhysiology(r.commands);
    st.errors = [];
    render();
    return true;
  }

  async function leaveContext() {
    if (engine.signals) engine.signals.cancelAll();
    await enterContext('mechanism');
    st.steps = [];
    st.running = false;
  }

  function renderExperiment(p) {
    const c = conf().experiment;
    body.appendChild(el('p', 'note', c.note || ''));
    if (st.ctx !== 'experiment') {
      body.appendChild(btn('실험 시작 (학습 입력 잠시 멈춤)', () => enterContext('experiment'), 'primary'));
      return;
    }
    const varInfo = Object.fromEntries((p.vars || []).map((v) => [v.variable_id, v]));
    const grid = el('div', 'ph-exp');
    for (const id of c.inputs) {
      const v = varInfo[id];
      if (!v) continue;
      const lab = el('label', 'ph-field');
      lab.appendChild(el('span', '', `${v.name_ko} (${v.unit})`));
      const inp = el('input');
      inp.type = 'number';
      inp.step = 'any';
      inp.value = typeof v.value === 'number' ? String(v.value) : '';
      inp.addEventListener('change', async () => {
        const n = Number(inp.value);
        const r = await game.physiologyCall('state_set', id, n);
        st.warnings = r.warnings || [];
        st.errors = r.ok ? [] : (r.errors || []);
        if (r.ok) await game.runPhysiology(r.commands);
        render();
      });
      lab.appendChild(inp);
      grid.appendChild(lab);
    }
    body.appendChild(grid);
    const modeRow = el('label', 'ph-field');
    modeRow.appendChild(el('span', '', '평균동맥압 계산 방식'));
    const sel = el('select');
    for (const [val, label] of [['pressure_estimate', '혈압으로 추정: DBP + (SBP−DBP)/3'], ['hemodynamic', '혈역학: CO × 말초혈관저항']]) {
      const o = el('option', '', label); o.value = val; sel.appendChild(o);
    }
    sel.value = (p.modes && p.modes.map) || 'pressure_estimate';
    sel.addEventListener('change', async () => { const r = await game.physiologyCall('set_formula_mode', 'map', sel.value); st.errors = r.ok ? [] : r.errors; render(); });
    modeRow.appendChild(sel);
    body.appendChild(modeRow);
    const out = el('dl', 'kv ph-out');
    for (const id of c.outputs) {
      const v = varInfo[id];
      if (!v) continue;
      out.appendChild(el('dt', '', v.name_ko));
      out.appendChild(el('dd', '', `${fmt(v.value, v.unit)} ${ARROW[v.level] ?? ''}`));
    }
    body.appendChild(out);
    const calc = (p.calc || []).slice(-3).reverse();
    if (calc.length) body.appendChild(el('p', 'note', `계산: ${calc.map((x) => `${x.formula_id} = ${x.value} ${x.unit}`).join(' · ')}`));
    for (const w of st.warnings) body.appendChild(el('p', 'ph-warn', `주의: ${w}`));
    body.appendChild(el('div', 'row btns', '')).append(
      btn('기준 상태로', async () => { const r = await game.physiologyCall('reset'); await game.runPhysiology(r.commands); st.warnings = []; render(); }),
      btn('실험 끝내기', leaveContext, 'primary'),
    );
    body.appendChild(el('p', 'note', 'MAP를 CO × 저항으로 계산해도 수축기·이완기 혈압이 정해지지는 않습니다. 두 방식은 따로 계산합니다.'));
  }

  // ---------- 자동 관찰 ----------
  function scaled(cmds) {
    return (cmds || []).map((c) => (c.action === 'signal_emit' ? { ...c, duration: Math.max(150, (c.duration || 900) / st.speed) } : { ...c }));
  }

  async function observe(scenarioId) {
    const c = conf().observe;
    if (st.ctx !== 'observe' && !(await enterContext('observe'))) return;
    st.running = true;
    st.steps = [];
    render();
    let r = await game.physiologyCall('scenario_start', scenarioId);
    if (!r.ok) { st.errors = r.errors; st.running = false; render(); return; }
    await game.runPhysiology(scaled(r.commands));
    r = await game.physiologyCall('feedback_run', c.loops);
    st.steps = r.steps || [];
    render();
    // 고리 단계를 물리 시간 순서로 보여 준다 (명령은 Python이 시간 순서로 정렬해 둠)
    await game.runPhysiology(scaled(r.commands));
    st.running = false;
    render();
  }

  function togglePause() {
    st.paused = !st.paused;
    if (st.paused) { engine.kit.motion.pauseAll(); engine.anim.pauseAll(); } else { engine.kit.motion.resumeAll(); engine.anim.resumeAll(); }
    render();
  }

  function renderObserve(p) {
    const c = conf().observe;
    body.appendChild(el('p', 'note', '시나리오를 처음부터 되먹임까지 재생합니다. 학습 상태·기록은 바뀌지 않습니다. 물리 시간은 교육용으로 압축했고, 신경 반사(초)와 RAAS(분~시간)의 실제 시간 차이를 같은 비율로 줄이지 않았습니다.'));
    const row = el('div', 'row btns');
    const sel = el('select');
    for (const id of c.scenarios) { const o = el('option', '', id.replace('sc.', '')); o.value = id; sel.appendChild(o); }
    const speed = el('select');
    for (const v of [0.5, 1, 2]) { const o = el('option', '', `${v}배`); o.value = String(v); speed.appendChild(o); }
    speed.value = String(st.speed);
    speed.addEventListener('change', () => { st.speed = Number(speed.value); });
    row.append(sel, btn(st.running ? '관찰 중…' : '▶ 관찰', () => { if (!st.running) observe(sel.value); }), btn(st.paused ? '계속' : '⏸', togglePause), speed);
    body.appendChild(row);
    if (st.steps.length) {
      const ol = el('ol', 'ph-steps');
      for (const s of st.steps) {
        const loop = s.loop_id ? s.loop_id.replace('fb.', '') : '';
        const sensed = s.sensed ? ` · MAP ${LEVEL_KO[s.sensed.before] ?? s.sensed.before} → ${LEVEL_KO[s.sensed.after] ?? s.sensed.after}` : '';
        ol.appendChild(el('li', '', `t=${s.t} ${loop} ${s.iteration}회 (${s.status})${sensed}${s.note ? ` — ${s.note}` : ''}`));
      }
      body.appendChild(ol);
    }
    if (st.ctx === 'observe') body.appendChild(btn('관찰 끝내기 (학습으로)', leaveContext, 'primary'));
  }

  function render() {
    container.hidden = !active();
    if (!active()) return;
    const p = phys();
    container.classList.toggle('collapsed', st.collapsed);
    head.textContent = `생리 상태 (교육용 모델)${p.context !== 'mechanism' ? ` · ${p.context === 'experiment' ? '자유 실험' : '자동 관찰'}` : ''} ${st.collapsed ? '▸' : '▾'}`;
    renderTabs();
    body.innerHTML = '';
    if (!st.collapsed) {
      if (st.tab === 'graph') renderGraph(p);
      else if (st.tab === 'experiment' && conf().experiment) renderExperiment(p);
      else if (st.tab === 'observe' && conf().observe) renderObserve(p);
      else renderState(p);
      for (const e of st.errors) body.appendChild(el('p', 'ph-err', e));
    }
    tabs.hidden = st.collapsed;
    const t = p.time || {};
    foot.hidden = st.collapsed;
    foot.textContent = `${p.disclaimer || ''} 물리 시간 ${t.t ?? 0} · 학습 단계 ${t.step ?? 0}.`;
  }

  game.onChange((kind) => {
    if (kind === 'lesson') { st.ctx = 'mechanism'; st.steps = []; st.tab = 'state'; onLockChange(false); }
    if (['view', 'physiology', 'lesson', 'state'].includes(kind)) render();
  });
  render();

  return {
    render,
    get locked() { return st.ctx !== 'mechanism'; },
    get busy() { return BUSY_STATES.includes(game.state); },
  };
}
