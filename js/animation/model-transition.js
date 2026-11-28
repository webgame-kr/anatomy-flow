// Model Transition (STEP 04-B): 같은 논리 ID 아래 여러 모델(상태별 모양)을 바꿔 보여 준다
// - 예(이후 콘텐츠): 상처 회복 단계, 혈전 형성. 이번 단계는 단순 시험 모델로 기능만 확인한다.
// - 논리 ID(logical_id)는 그대로 두고, 지금 보이는 모델(variant)만 바꾼다 → 학습 콘텐츠는 논리 ID만 안다.
// - 전환 방식: swap(즉시), fade(나가는 모델 사라진 뒤 들어오는 모델 등장), crossfade(동시에)
// - 투명도 변화는 animation-manager의 visibility 애니메이션으로 한다 (재질은 material-controller 상태 층).
// - 새 모델 불러오기: loadModel(url) 콜백이 있으면 아직 없는 variant를 불러와 레지스트리에 등록한 뒤 전환한다.
// - remove_old: true면 전환 뒤 이전 모델을 registry.unregister로 해제한다 (resource-tracker가 정리).

export function createModelTransition({ registry, materials, anim, loadModel = null, log = () => {} }) {
  const groups = new Map();     // logical_id → { variants: {state: {object_id, url}}, current }
  let seq = 0;

  function define(def) {
    if (!def || !def.logical_id || !def.variants) return { ok: false, error: '전환 정의 오류' };
    const variants = {};
    for (const [st, v] of Object.entries(def.variants)) variants[st] = typeof v === 'string' ? { object_id: v } : { ...v };
    const current = def.initial || Object.keys(variants)[0];
    groups.set(def.logical_id, { variants, current });
    for (const [st, v] of Object.entries(variants)) if (registry.has(v.object_id)) materials.setVisible(v.object_id, st === current);
    return { ok: true };
  }

  function load(doc) {
    const errors = [];
    for (const d of doc.transitions || []) { const r = define(d); if (!r.ok) errors.push(r.error); }
    return { ok: !errors.length, errors };
  }

  function fadeDef(objectId, from, to, ms) {
    seq += 1;
    const id = `__mt_${seq}`;
    anim.define({ animation_id: id, target_id: objectId, animation_type: 'visibility', duration_ms: ms, easing: 'ease_in_out', restore_on_cancel: false,
      keyframes: [{ time: 0, value: { opacity: from } }, { time: 1, value: { opacity: to } }] });
    return id;
  }

  async function transition(logicalId, toState, { mode = 'crossfade', duration_ms = 800, remove_old = false } = {}) {
    const g = groups.get(logicalId);
    if (!g) return { status: 'failed', reason: `없는 논리 ID: ${logicalId}` };
    const next = g.variants[toState];
    if (!next) return { status: 'failed', reason: `${logicalId}: 없는 상태 ${toState}` };
    if (g.current === toState) return { status: 'completed', logical_id: logicalId, state: toState };
    if (!registry.has(next.object_id)) {
      if (!next.url || !loadModel) return { status: 'failed', reason: `모델이 없습니다: ${next.object_id}` };
      next.object_id = await loadModel(next.url, next);
      if (!next.object_id || !registry.has(next.object_id)) return { status: 'failed', reason: `모델을 불러오지 못했습니다: ${next.url}` };
    }
    const prev = g.variants[g.current];
    const prevId = prev && registry.has(prev.object_id) ? prev.object_id : null;
    const prevState = prevId ? materials.getState(prevId) : null;
    const nextState = materials.getState(next.object_id);
    const op0 = prevState ? prevState.opacity : 1;
    const op1 = nextState && nextState.opacity < 1 && nextState.opacity > 0 ? nextState.opacity : 1;
    if (mode === 'swap' || duration_ms <= 0) {
      if (prevId) materials.setVisible(prevId, false);
      materials.setVisible(next.object_id, true);
    } else {
      materials.setState(next.object_id, { color: nextState ? nextState.color : null, opacity: 0, visible: true });
      const outId = prevId ? fadeDef(prevId, op0, 0, mode === 'fade' ? duration_ms / 2 : duration_ms) : null;
      const inId = fadeDef(next.object_id, 0, op1, mode === 'fade' ? duration_ms / 2 : duration_ms);
      let r;
      if (mode === 'fade') {
        if (outId) { r = await anim.play(outId).promise; if (r.status !== 'completed') return { status: r.status, reason: r.reason }; }
        r = await anim.play(inId).promise;
      } else {
        const rs = await Promise.all([outId ? anim.play(outId).promise : Promise.resolve({ status: 'completed' }), anim.play(inId).promise]);
        r = rs.find((x) => x.status !== 'completed') || rs[1];
      }
      if (r.status !== 'completed') return { status: r.status, reason: r.reason };
      if (prevId) materials.setState(prevId, { color: prevState ? prevState.color : null, opacity: op0, visible: false });
    }
    const from = g.current;
    g.current = toState;
    if (remove_old && prevId) { registry.unregister(prevId); prev.object_id = null; }
    log(`모델 전환: ${logicalId} ${from} → ${toState} (${mode})`);
    return { status: 'completed', logical_id: logicalId, state: toState, object_id: next.object_id };
  }

  return {
    define,
    load,
    transition,
    current: (logicalId) => (groups.has(logicalId) ? groups.get(logicalId).current : null),
    objectOf: (logicalId) => { const g = groups.get(logicalId); return g ? g.variants[g.current].object_id : null; },
    has: (id) => groups.has(id),
    ids: () => [...groups.keys()],
    clear() { groups.clear(); },
  };
}
