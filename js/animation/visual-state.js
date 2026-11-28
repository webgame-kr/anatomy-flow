// Visual State Controller (STEP 04-B): 구조마다 정해진 상태와 상태 사이 전환 애니메이션
// - 예: 판막 OPEN / CLOSED (전환 중 OPENING / CLOSING), 혈관 BASELINE / VASOCONSTRICTION / VASODILATION
// - 구조 정의는 콘텐츠(content/animations/*.json의 structures)에 있다. 여기에는 의료 내용을 넣지 않는다.
// - 상태 판단(언제 열리는가)은 Python 콘텐츠 규칙이나 타임라인이 정한다. 이 모듈은 보여 주기만 한다.
// - indicators: 실제 모델(예: BodyParts3D 판막)은 첨판 리깅이 없어 움직이지 않는다. 대신 상태 색으로 "표시"만 한다.
//   이 표시를 판막이 실제로 열리고 닫히는 모습이라고 설명하지 않는다.

export function createVisualState({ anim, materials, registry, resolve = (id) => (registry.has(id) ? [id] : []), log = () => {} }) {
  const structs = new Map();      // id → { def, state, pending }
  const listeners = new Set();
  const emit = (kind, data) => { for (const fn of listeners) fn(kind, data); };

  function define(def) {
    if (!def || !def.structure_id || !Array.isArray(def.states) || !def.states.length) return { ok: false, error: `구조 정의 오류: ${def && def.structure_id}` };
    const initial = def.initial || def.states[0];
    structs.set(def.structure_id, { def, state: initial, pending: null });
    paint(def.structure_id);
    return { ok: true };
  }

  function load(doc) {
    const errors = [];
    for (const d of doc.structures || []) { const r = define(d); if (!r.ok) errors.push(r.error); }
    return { ok: !errors.length, errors };
  }

  function paint(id) {
    const s = structs.get(id);
    if (!s) return;
    for (const ind of s.def.indicators || []) {
      const color = (ind.state_colors || {})[s.state] ?? null;
      for (const oid of resolve(ind.target)) materials.setColor(oid, color);
    }
  }

  function transitionOf(s, to) {
    const t = (s.def.transitions || {})[`${s.state}->${to}`] || (s.def.transitions || {})[`*->${to}`] || null;
    return t;
  }

  // 상태 바꾸기. instant면 애니메이션 없이 끝 상태로. 결과 Promise {status}
  async function set(id, to, { instant = false, speed = 1 } = {}) {
    const s = structs.get(id);
    if (!s) return { status: 'failed', reason: `없는 구조: ${id}` };
    if (!s.def.states.includes(to)) return { status: 'failed', reason: `${id}: 알 수 없는 상태 ${to}` };
    if (s.pending) { anim.stop(s.pending, { restore: false }); s.pending = null; }
    if (s.state === to) return { status: 'completed', structure_id: id, state: to };
    const tr = transitionOf(s, to);
    const from = s.state;
    if (tr && tr.via) { s.state = tr.via; emit('state', { structure_id: id, state: s.state, from }); paint(id); }
    if (tr && tr.animation && !instant) {
      s.pending = tr.animation;
      const h = anim.play(tr.animation, { speed });
      const r = await h.promise;
      if (s.pending === tr.animation) s.pending = null;
      if (r.status !== 'completed') {
        // 취소·실패: 중간 상태로 남기지 않고 이전 상태로 표시 (애니메이션은 restore_on_cancel로 형태를 되돌린다)
        if (r.reason !== 'replaced') { s.state = from; paint(id); emit('state', { structure_id: id, state: from, from: to, cancelled: true }); }
        return { status: r.status, reason: r.reason, structure_id: id, state: s.state };
      }
    } else if (tr && tr.animation && instant) {
      const d = anim.def(tr.animation);
      if (d) { const h = anim.play(tr.animation); anim.seek(tr.animation, 1); anim.stop(tr.animation, { restore: false }); await h.promise; }
    }
    s.state = to;
    paint(id);
    emit('state', { structure_id: id, state: to, from });
    return { status: 'completed', structure_id: id, state: to };
  }

  // 여러 구조를 동시에: {id: state}
  async function setMany(map, opts = {}) {
    const results = await Promise.all(Object.entries(map || {}).map(([id, st]) => set(id, st, opts)));
    const bad = results.find((r) => r.status !== 'completed');
    return bad ? { status: bad.status, reason: bad.reason, results } : { status: 'completed', results };
  }

  function snapshot() { const out = {}; for (const [id, s] of structs) out[id] = s.state; return out; }

  return {
    define,
    load,
    set,
    setMany,
    get: (id) => (structs.has(id) ? structs.get(id).state : null),
    isOpen: (id) => (structs.has(id) ? structs.get(id).state === 'OPEN' : null),
    has: (id) => structs.has(id),
    ids: () => [...structs.keys()],
    def: (id) => (structs.has(id) ? structs.get(id).def : null),
    snapshot,
    restore: (snap) => setMany(snap || {}, { instant: true }),
    // 표시 색 지우기 (장면 정리)
    clear() {
      for (const [id, s] of structs) for (const ind of s.def.indicators || []) for (const oid of resolve(ind.target)) if (registry.has(oid)) materials.setColor(oid, null);
      structs.clear();
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
