// Physiology Editor (STEP 04-C): 개발자용 경량 생리 상태 편집기 (Sandbox 오른쪽 패널)
// - 모델(JSON)을 Python 생리 엔진(physiology_commands)에 불러오고, 변수·공식·인과관계·되먹임·신호·수용체·시각 바인딩을 확인·추가한다.
// - 모든 판정과 계산은 Python이 한다. 편집 내용은 이 패널의 JSON 사본에 넣고 Python에 다시 불러와 검증한다(오류면 되돌림).
// - 단계 실행(인과 적용, 되먹임 한 단계), 스냅샷·복원, 초기화, JSON 가져오기·내보내기.
// 완전한 노드 기반 FLOW Studio가 아니다(STEP 05). 공통 데이터 구조를 확인하는 도구다.

const TYPES = ['number', 'relative', 'activation', 'boolean', 'category', 'computed'];
const REL_TYPES = ['positive', 'negative', 'activation', 'inhibition', 'conditional', 'threshold', 'multi_condition', 'parallel', 'formula_direction'];
const BIND_KINDS = ['animation_speed', 'morph', 'structure_state', 'material', 'signal'];

export function createPhysiologyEditor({ container, client, runner, log = () => {}, defaultUrl = 'content/physiology/cardiovascular-model.json' }) {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const btn = (label, fn, cls = '') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const sel = (items, value) => { const s = el('select'); for (const it of items) { const o = el('option', '', String(it)); o.value = String(it); s.appendChild(o); } if (value !== undefined) s.value = String(value); return s; };
  const input = (ph, w = '') => { const i = el('input'); i.placeholder = ph; if (w) i.style.width = w; return i; };
  const st = { doc: null, view: null, describe: null, snap: null, msg: '', err: [], loaded: false };

  container.innerHTML = '';
  container.classList.add('pe', 'phe');
  const status = el('p', 'muted');
  const body = el('div');
  container.append(status, body);

  async function py(fn, ...args) {
    try {
      return await client.call(`physiology_commands.${fn}`, ...args);
    } catch (err) {
      st.err = [String(err.message || err)];
      render();
      return null;
    }
  }

  async function runCmds(r) {
    if (r && r.commands && r.commands.length && runner) {
      const s = await runner.run(r.commands.map((c) => ({ ...c })));
      if (s.failed) log(`생리 시각 명령 실패 ${s.failed}개 (장면에 대상이 없을 수 있음): ${s.errors.slice(0, 2).join(' / ')}`, 'warn');
    }
  }

  async function loadDoc(doc, note) {
    const r = await py('load', doc);
    if (!r) return false;
    if (!r.ok) { st.err = r.errors.slice(0, 8); render(); return false; }
    st.doc = doc;
    st.loaded = true;
    st.err = [];
    st.msg = `${note} · 경고 ${r.warnings.length}개`;
    st.view = r.view;
    st.describe = await py('describe');
    await runCmds(await py('state_bind_visual'));
    render();
    return true;
  }

  async function loadDefault() {
    try {
      const doc = await (await fetch(defaultUrl, { cache: 'no-cache' })).json();
      await loadDoc(doc, `불러옴: ${defaultUrl}`);
    } catch (err) {
      st.err = [`모델 파일을 읽지 못했습니다: ${err.message}`];
      render();
    }
  }

  async function edit(mutator, note) {
    // JSON 사본을 고친 뒤 Python에 다시 불러와 검증. 실패하면 이전 모델을 유지
    const copy = JSON.parse(JSON.stringify(st.doc));
    const problem = mutator(copy);
    if (problem) { st.err = [problem]; render(); return; }
    const before = st.doc;
    if (!(await loadDoc(copy, note))) { st.doc = before; await py('load', before); }
  }

  async function act(fn, ...args) {
    const r = await py(fn, ...args);
    if (!r) return;
    st.err = r.ok === false ? (r.errors || []) : [];
    if (r.view) st.view = r.view;
    const extra = [];
    if (r.result === 'duplicate') extra.push('같은 이벤트라 다시 적용하지 않음');
    if (r.feedback) extra.push(`되먹임 ${r.feedback.status} (${r.feedback.iteration}회) ${r.feedback.note || ''}`);
    if (r.unresolved && r.unresolved.length) extra.push(`미확정 ${r.unresolved.map((u) => u.var).join(', ')}`);
    if (r.warnings && r.warnings.length) extra.push(...r.warnings);
    st.msg = `${fn}: 변화 ${(r.changes || []).length}개 · 시각 명령 ${(r.commands || []).length}개${extra.length ? ` · ${extra.join(' / ')}` : ''}`;
    render();
    await runCmds(r);
  }

  function section(title) { const s = el('div', 'pe-sec'); s.appendChild(el('h3', '', title)); body.appendChild(s); return s; }

  function renderVars(s) {
    const v = st.view;
    const all = (st.describe && st.describe.variables) || [];
    const table = el('table', 'phe-table');
    for (const x of all) {
      const tr = el('tr');
      tr.appendChild(el('td', '', x.variable_id));
      tr.appendChild(el('td', 'muted', `${x.data_type}${x.unit ? ` · ${x.unit}` : ''}`));
      const cur = (v && v.vars ? v.vars.find((y) => y.variable_id === x.variable_id) : null) || x;
      tr.appendChild(el('td', '', typeof cur.value === 'number' ? String(Math.round(cur.value * 100) / 100) : String(cur.value)));
      tr.appendChild(el('td', '', String(cur.label || '')));
      table.appendChild(tr);
    }
    s.appendChild(table);
    // 값 설정·단계 적용
    const row = el('div', 'row');
    const vSel = sel(all.map((x) => x.variable_id));
    const val = input('값 또는 단계(-2~2)', '90px');
    const prop = el('label', 'chk');
    const propBox = el('input'); propBox.type = 'checkbox'; propBox.checked = true;
    prop.append(propBox, document.createTextNode(' 인과 전파'));
    row.append(vSel, val, btn('적용', async () => {
      const x = all.find((y) => y.variable_id === vSel.value);
      const n = Number(val.value);
      if (!x) return;
      if (x.data_type === 'number') return act('state_set', x.variable_id, n);
      if (!Number.isInteger(n)) { st.err = ['단계는 정수']; render(); return; }
      if (propBox.checked) return act('causal_apply', [{ var: x.variable_id, delta: n }], '', null);
      return act('state_update', x.variable_id, n);
    }), prop);
    s.appendChild(row);
    // 변수 등록
    const row2 = el('div', 'row');
    const id = input('variable_id', '110px');
    const ko = input('이름', '80px');
    const ty = sel(TYPES, 'relative');
    const unit = input('단위', '60px');
    const base = input('기준값', '60px');
    row2.append(id, ko, ty, unit, base, btn('변수 등록', () => edit((d) => {
      if (!id.value) return 'variable_id가 필요합니다';
      const spec = { variable_id: id.value, name_ko: ko.value || id.value, name_en: '', data_type: ty.value, unit: unit.value,
        verification_status: 'PENDING_REVIEW', source: '편집기에서 추가', notes: '' };
      if (base.value !== '') spec.baseline = ty.value === 'number' ? Number(base.value) : (ty.value === 'relative' ? Number(base.value) : base.value);
      if (ty.value === 'number') spec.allowed_range = [-1e6, 1e6];
      d.variables.push(spec);
      return '';
    }, `변수 ${id.value} 추가`)));
    s.appendChild(row2);
  }

  function renderFormulas(s) {
    const f = st.describe && st.describe.formulas;
    if (!f) return;
    const ul = el('ul', 'pe-list');
    for (const x of f.formulas) ul.appendChild(el('li', x.active ? '' : 'muted', `${x.formula_id}: ${x.output} = ${x.function}(${Object.values(x.inputs).join(', ')})${x.mode ? ` [${x.mode_group}:${x.mode}]` : ''}${x.run !== 'always' ? ` (${x.run})` : ''}`));
    s.appendChild(ul);
    s.appendChild(el('p', 'muted', `계산 순서: ${f.order.join(' → ')}`));
    const row = el('div', 'row');
    const m = sel(['pressure_estimate', 'hemodynamic'], f.modes.map);
    row.append(el('span', '', 'MAP 계산 방식'), m, btn('바꾸기', () => act('set_formula_mode', 'map', m.value)), btn('다시 계산', () => act('state_calculate')));
    s.appendChild(row);
  }

  function renderCausal(s) {
    const c = st.describe && st.describe.causal;
    if (!c) return;
    s.appendChild(el('p', 'muted', `관계 ${c.relations.length}개 · 변수 순서 ${c.order.length}개 (순환 없음)`));
    const ul = el('ul', 'pe-list phe-scroll');
    for (const r of c.relations) ul.appendChild(el('li', '', `${r.causal_id}: ${r.source_variable} → ${r.target_variable} (${r.direction}, ${r.relationship_type}${r.delay ? `, 지연 ${r.delay}` : ''}, ${r.mechanism})`));
    s.appendChild(ul);
    const vars = ((st.describe && st.describe.variables) || []).map((x) => x.variable_id);
    const row = el('div', 'row');
    const cid = input('causal_id', '90px');
    const src = sel(vars);
    const tgt = sel(vars);
    const dir = sel(['increase', 'decrease']);
    const kind = sel(REL_TYPES);
    const mech = input('기전', '60px'); mech.value = 'core';
    const delay = input('지연', '36px'); delay.value = '0';
    const cond = input('조건 JSON (선택) 예: [{"var":"preload","op":"<=","level":1}]', '100%');
    row.append(cid, src, el('span', '', '→'), tgt, dir, kind, mech, delay);
    s.append(row, cond, btn('인과관계 추가 (검증)', () => edit((d) => {
      if (!cid.value) return 'causal_id가 필요합니다';
      let conditions = [];
      if (cond.value.trim()) { try { conditions = JSON.parse(cond.value); } catch (e) { return `조건 JSON 오류: ${e.message}`; } }
      d.causal.push({ causal_id: cid.value, source_variable: src.value, target_variable: tgt.value, direction: dir.value, relationship_type: kind.value,
        conditions, delay: Number(delay.value) || 0, priority: 0, mechanism: mech.value || 'core', timescale: 'immediate', source: '편집기에서 추가', verification_status: 'PENDING_REVIEW' });
      return '';
    }, `관계 ${cid.value} 추가`)));
  }

  function renderFeedback(s) {
    const d = st.describe;
    if (!d) return;
    const row = el('div', 'row');
    const loop = sel(d.feedback);
    row.append(loop, btn('시작', () => act('feedback_start', loop.value)), btn('한 단계', () => act('feedback_step', loop.value)),
      btn('정지', () => act('feedback_stop', loop.value)), btn('끝까지', () => act('feedback_run', [loop.value], 20)));
    s.appendChild(row);
    const fb = (st.view && st.view.feedback) || {};
    for (const [id, f] of Object.entries(fb)) s.appendChild(el('p', 'muted', `${id}: ${f.status}, ${f.iteration}회, 다음 t=${f.next_t}`));
    const row2 = el('div', 'row');
    const sc = sel(((d.scenarios && d.scenarios.scenarios) || []).map((x) => x.scenario_id));
    row2.append(el('span', '', '시나리오'), sc, btn('시나리오 시작', () => act('run_ops', [{ op: 'scenario_start', scenario_id: sc.value }], `editor#${Date.now()}`)));
    s.appendChild(row2);
  }

  function renderSignals(s) {
    const d = st.describe;
    if (!d) return;
    const row = el('div', 'row');
    const sig = sel(d.signals);
    row.append(sig, btn('신호 보내기', () => act('signal_emit', sig.value)));
    const rec = sel(d.receptors);
    row.append(rec, btn('활성', () => act('receptor_activate', rec.value, '')), btn('비활성', () => act('receptor_deactivate', rec.value)));
    s.appendChild(row);
    // 시각 바인딩 추가 (상태 → 시각)
    const vars = d.variables.map((x) => x.variable_id);
    const row2 = el('div', 'row');
    const bid = input('binding_id', '80px');
    const bv = sel(vars);
    const bk = sel(BIND_KINDS, 'material');
    const bt = input('대상 ID(애니메이션/객체/구조/신호)', '130px');
    const bm = input('map JSON 예: {"1":"#ff0000","0":"#999999"}', '100%');
    row2.append(bid, bv, bk, bt);
    s.append(el('p', 'muted', `시각 바인딩 ${d.bindings}개 (생리 상태 → 시각, 한 방향)`), row2, bm, btn('바인딩 추가 (검증)', () => edit((doc) => {
      if (!bid.value || !bt.value) return 'binding_id와 대상이 필요합니다';
      let map = {};
      if (bm.value.trim()) { try { map = JSON.parse(bm.value); } catch (e) { return `map JSON 오류: ${e.message}`; } }
      const b = { binding_id: bid.value, variable: bv.value, kind: bk.value, map };
      if (bk.value === 'signal') { b.signal_id = bt.value; b.when = 'change'; } else b.target = bt.value;
      if (bk.value === 'morph') b.morph = 'contract';
      doc.visual_bindings.push(b);
      return '';
    }, `바인딩 ${bid.value} 추가`)));
  }

  function renderTools(s) {
    const row = el('div', 'row btns');
    row.append(
      btn('기본 모델 불러오기', loadDefault),
      btn('초기화', () => act('reset')),
      btn('스냅샷', async () => { st.snap = await py('state_snapshot'); st.msg = '스냅샷 저장'; render(); }),
      btn('복원', () => (st.snap ? act('state_restore', st.snap) : null)),
      btn('JSON 내보내기', () => {
        const blob = new Blob([JSON.stringify(st.doc, null, 1)], { type: 'application/json' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `${(st.doc && st.doc.model_id) || 'physiology-model'}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }),
    );
    const file = el('input'); file.type = 'file'; file.accept = 'application/json,.json';
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      try { await loadDoc(JSON.parse(await f.text()), `가져옴: ${f.name}`); } catch (err) { st.err = [`JSON 오류: ${err.message}`]; render(); }
    });
    s.append(row, el('span', 'muted', 'JSON 가져오기 '), file);
    if (st.view) {
      const pre = el('pre', 'phe-pre');
      pre.textContent = JSON.stringify({ context: st.view.context, time: st.view.time, pending: st.view.pending, modes: st.view.modes }, null, 1);
      s.appendChild(pre);
    }
  }

  function render() {
    body.innerHTML = '';
    status.textContent = st.loaded ? `${(st.doc && st.doc.title_ko) || ''} · ${st.msg}` : '생리 모델이 없습니다. "기본 모델 불러오기"를 누르세요 (Python 준비 후).';
    for (const e of st.err) body.appendChild(el('p', 'err', e));
    renderTools(section('모델 · 스냅샷 · JSON'));
    if (!st.loaded) return;
    renderVars(section('변수 (등록 · 초기 상태 · 단위 · 값)'));
    renderFormulas(section('계산 함수'));
    renderCausal(section('인과관계 (증가·감소 · 조건 · 지연)'));
    renderFeedback(section('되먹임 · 시나리오 (단계별 실행)'));
    renderSignals(section('신호 · 수용체 · 애니메이션 연결'));
  }

  render();
  return { render, loadDefault, get state() { return st; } };
}
