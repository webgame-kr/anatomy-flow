// Animation Editor (STEP 04-B): 개발자용 경량 애니메이션 편집기 (Sandbox 오른쪽 패널)
// - 목록: 애니메이션·타임라인·구조 상태를 재생·일시정지·정지하고 진행을 본다.
// - 편집: 대상 객체, 종류, 클립/Morph Target, 재생시간, 반복, easing, Keyframe(추가·수정·삭제·현재 상태 넣기)
// - 타임라인: 단계 JSON을 직접 고치고 검사·미리보기한다(순차·병렬·지연·반복).
// - JSON 가져오기·내보내기 (내보낸 파일을 다시 불러오면 같은 정의가 된다).
// Blender 대체나 FLOW Studio가 아니다. 데이터 확인과 작은 수정용이다.

import { ANIMATION_TYPES } from './animation-manager.js';

export function createAnimationEditor({ container, kit, motionKit = null, registry, camera = null, log = () => {} }) {
  const { anim, timeline, visual, morph } = kit;
  let editId = null;
  let draft = null;
  let enabled = true;

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const btn = (label, fn, cls = '') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const sec = (title) => { const s = el('div', 'pe-sec'); s.appendChild(el('h3', '', title)); container.appendChild(s); return s; };

  container.innerHTML = '';
  container.classList.add('pe', 'ae');
  const info = el('p', 'muted');
  container.appendChild(info);
  const sList = sec('애니메이션');
  const animList = el('ul', 'pe-list');
  sList.appendChild(animList);
  const sTl = sec('타임라인');
  const tlList = el('ul', 'pe-list');
  sTl.appendChild(tlList);
  const sSt = sec('구조 상태 (판막·혈관 등)');
  const stList = el('ul', 'pe-list');
  sSt.appendChild(stList);
  const sEdit = sec('편집');
  const editBox = el('div');
  sEdit.appendChild(editBox);
  const sTlEdit = sec('타임라인 편집 (JSON)');
  const tlSel = el('select');
  const tlText = el('textarea', 'ae-json');
  tlText.rows = 8;
  tlText.spellcheck = false;
  const tlRow = el('div', 'row btns');
  tlRow.append(btn('검사·적용', applyTimeline), btn('▶ 미리보기', () => { applyTimeline(); playTl(tlSel.value); }, 'primary'));
  tlSel.addEventListener('change', () => loadTl(tlSel.value));
  sTlEdit.append(tlSel, tlText, tlRow);
  const sFile = sec('JSON');
  const fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = '.json,application/json';
  const fileLab = el('label', 'btn file-btn', '애니메이션 JSON 불러오기'); fileLab.appendChild(fileIn);
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0]; fileIn.value = '';
    if (!f) return;
    try {
      const doc = JSON.parse(await f.text());
      const r = kit.apply(doc);
      if (doc.motion && motionKit) motionKit.apply(doc.motion);
      log(r.ok ? `애니메이션 JSON 불러옴 (${anim.ids().length}개)` : `애니메이션 JSON 오류: ${r.errors.join(' / ')}`, r.ok ? '' : 'error');
      render();
    } catch (err) { log(`애니메이션 JSON 오류: ${err.message}`, 'error'); }
  });
  const rf = el('div', 'row btns');
  rf.append(btn('애니메이션 JSON 내보내기', exportJson), fileLab, btn('전체 정지·복원', () => { kit.cancelAll('editor'); render(); }, 'danger'));
  sFile.appendChild(rf);

  // ---------- 목록 ----------
  function badge(status) { return el('span', `vs ${status || ''}`, status || '-'); }

  function renderLists() {
    const d = kit.data || {};
    info.textContent = d.description ? `${d.description}` : '애니메이션 데이터가 없는 장면입니다. (Animation Test 장면 AA~AE를 고르세요)';
    animList.innerHTML = '';
    for (const id of anim.ids().filter((x) => !x.startsWith('__'))) {
      const def = anim.def(id);
      const li = el('li');
      const row = el('div', `pe-row${id === editId ? ' active' : ''}`);
      const st = anim.state(id);
      row.append(
        btn(`${id}`, () => edit(id), 'nm'),
        badge(def.verification_status),
        el('span', 'muted', `${def.animation_type}${st ? ` ${(Math.min(1, Math.abs(st.progress)) * 100).toFixed(0)}%${st.loops ? ` ×${st.loops + 1}` : ''}${st.paused ? ' ⏸' : ''}` : ''}`),
        btn('▶', () => playAnim(id), 'mini'), btn('⏸', () => toggle(id), 'mini'), btn('■', () => { anim.stop(id); render(); }, 'mini'));
      row.children[0].title = `${def.target_id}${def.notes ? ` · ${def.notes}` : ''}`;
      li.appendChild(row);
      animList.appendChild(li);
    }
    if (!anim.ids().length) animList.appendChild(el('li', 'muted', '(없음)'));
    tlList.innerHTML = '';
    for (const id of timeline.ids()) {
      const def = timeline.def(id);
      const li = el('li');
      const row = el('div', 'pe-row');
      row.append(el('span', 'nm', id), el('span', 'muted', `${def.blocking ? 'Blocking' : 'Non-blocking'}${timeline.isRunning(id) ? ' · 실행 중' : ''}`),
        btn('▶', () => playTl(id), 'mini'), btn('⏸', () => (timeline.isRunning(id) ? (pausedTl.has(id) ? resumeTl(id) : pauseTl(id)) : null), 'mini'),
        btn('✕', () => { timeline.cancel(id); render(); }, 'mini danger'));
      li.appendChild(row);
      tlList.appendChild(li);
    }
    if (!timeline.ids().length) tlList.appendChild(el('li', 'muted', '(없음)'));
    stList.innerHTML = '';
    for (const id of visual.ids()) {
      const def = visual.def(id);
      const li = el('li');
      const row = el('div', 'pe-row');
      const sel = el('select');
      for (const s of def.states.filter((x) => !['OPENING', 'CLOSING'].includes(x))) { const o = el('option', '', s); o.value = s; sel.appendChild(o); }
      sel.value = visual.get(id);
      sel.addEventListener('change', async () => { const r = await visual.set(id, sel.value); if (r.status !== 'completed') log(`${id}: ${r.status} ${r.reason || ''}`, 'warn'); render(); });
      row.append(el('span', 'nm', def.name_ko || id), el('span', 'muted', visual.get(id)), sel);
      li.appendChild(row);
      stList.appendChild(li);
    }
    if (!visual.ids().length) stList.appendChild(el('li', 'muted', '(없음)'));
    const cur = tlSel.value;
    tlSel.innerHTML = '';
    for (const id of timeline.ids()) { const o = el('option', '', id); o.value = id; tlSel.appendChild(o); }
    const o = el('option', '', '(새 타임라인)'); o.value = '__new'; tlSel.appendChild(o);
    tlSel.value = timeline.has(cur) || cur === '__new' ? cur : (timeline.ids()[0] || '__new');
    if (!tlText.dataset.dirty) loadTl(tlSel.value);
  }

  function playAnim(id) {
    const h = anim.play(id);
    h.promise.then((r) => { log(`애니메이션 ${id}: ${r.status}${r.reason ? ` (${r.reason})` : ''}`, r.status === 'failed' ? 'error' : ''); render(); });
    render();
  }
  function toggle(id) { const st = anim.state(id); if (!st) return; if (st.paused) anim.resume(id); else anim.pause(id); render(); }
  const pausedTl = new Set();
  function pauseTl(id) { timeline.pause(id); pausedTl.add(id); render(); }
  function resumeTl(id) { timeline.resume(id); pausedTl.delete(id); render(); }
  function playTl(id) {
    if (!timeline.has(id)) { log(`없는 타임라인: ${id}`, 'warn'); return; }
    const t0 = performance.now();
    const h = timeline.play(id);
    h.promise.then((r) => { pausedTl.delete(id); log(`타임라인 ${id}: ${r.status} (${Math.round(performance.now() - t0)}ms)${r.reason ? ` — ${r.reason}` : ''}`, r.status === 'failed' ? 'error' : ''); render(); });
    render();
  }

  // ---------- 편집 ----------
  function edit(id) {
    editId = id;
    draft = id && anim.def(id) ? JSON.parse(JSON.stringify(anim.def(id))) : { animation_id: `anim_${Date.now() % 100000}`, target_id: registry.ids()[0] || '', animation_type: 'transform', duration_ms: 1000, loop: false, easing: 'linear', keyframes: [], restore_on_cancel: true, verification_status: 'TEST' };
    renderEdit();
    renderLists();
  }

  function currentValue() {
    const o = registry.get(draft.target_id);
    if (!o) return null;
    const t = draft.animation_type;
    if (t === 'transform') {
      const r = o.object3D.rotation;
      return { position: o.object3D.position.toArray().map((n) => +n.toFixed(4)), rotation: [r.x, r.y, r.z].map((n) => +(n * 180 / Math.PI).toFixed(2)), scale: o.object3D.scale.toArray().map((n) => +n.toFixed(4)) };
    }
    if (t === 'morph') return draft.morph_target ? (morph.get(draft.target_id, draft.morph_target) ?? 0) : Object.fromEntries(morph.names(draft.target_id).map((n) => [n, morph.get(draft.target_id, n)]));
    if (t === 'deform') return kit.deform.getRadiusScale(draft.target_id) ?? 1;
    if (t === 'material' || t === 'visibility') return { opacity: 1 };     // 색은 값 칸에 직접 적는다
    return null;
  }

  function renderEdit() {
    editBox.innerHTML = '';
    if (!draft) {
      editBox.append(el('p', 'muted', '목록에서 애니메이션을 고르거나 새로 만드세요.'), btn('+ 새 애니메이션', () => edit(null)));
      return;
    }
    const dl = el('dl', 'kv');
    const kv = (k, node) => { dl.append(el('dt', '', k)); const dd = el('dd'); dd.appendChild(node); dl.append(dd); };
    const input = (key, type = 'text', step) => {
      const i = el('input'); i.type = type; if (step) i.step = step;
      i.value = draft[key] ?? '';
      i.addEventListener('change', () => { draft[key] = type === 'number' ? Number(i.value) : i.value; renderEdit(); });
      return i;
    };
    kv('ID', input('animation_id'));
    const tSel = el('select');
    for (const id of registry.ids()) { const e = registry.get(id); if (e.type === 'actor') continue; const o = el('option', '', `${id}`); o.value = id; tSel.appendChild(o); }
    tSel.value = draft.target_id;
    tSel.addEventListener('change', () => { draft.target_id = tSel.value; renderEdit(); });
    kv('대상 객체', tSel);
    const ty = el('select');
    for (const t of ANIMATION_TYPES) { const o = el('option', '', t); o.value = t; ty.appendChild(o); }
    ty.value = draft.animation_type;
    ty.addEventListener('change', () => { draft.animation_type = ty.value; draft.keyframes = []; renderEdit(); });
    kv('종류', ty);
    if (draft.animation_type === 'clip') {
      const cs = el('select');
      for (const n of anim.clipNames(draft.target_id)) { const o = el('option', '', n); o.value = n; cs.appendChild(o); }
      if (!cs.options.length) cs.appendChild(el('option', '', '(클립 없음: GLB 모델 루트를 고르세요)'));
      cs.value = draft.clip_name || '';
      cs.addEventListener('change', () => { draft.clip_name = cs.value; });
      if (!draft.clip_name && cs.options[0]) draft.clip_name = cs.options[0].value;
      kv('AnimationClip', cs);
    }
    if (draft.animation_type === 'morph' || draft.procedure === 'morph_cycle') {
      const ms = el('select');
      const none = el('option', '', '(여러 개: 값 {이름: 가중치})'); none.value = ''; ms.appendChild(none);
      for (const n of morph.names(draft.target_id)) { const o = el('option', '', n); o.value = n; ms.appendChild(o); }
      ms.value = draft.morph_target || '';
      ms.addEventListener('change', () => { draft.morph_target = ms.value || undefined; renderEdit(); });
      kv('Morph Target', ms);
    }
    kv('재생시간 (ms)', input('duration_ms', 'number', '50'));
    const lp = el('input'); lp.type = 'number'; lp.min = '0'; lp.step = '1';
    lp.value = draft.loop === true ? '' : String(draft.loop || 0);
    lp.placeholder = '∞';
    lp.title = '추가 반복 횟수. 비우면 끝없이';
    lp.addEventListener('change', () => { draft.loop = lp.value === '' ? true : Math.max(0, Math.round(Number(lp.value))); });
    kv('반복 (추가 횟수, 빈칸=∞)', lp);
    const es = el('select');
    for (const n of ['linear', 'ease_in', 'ease_out', 'ease_in_out', 'step']) { const o = el('option', '', n); o.value = n; es.appendChild(o); }
    es.value = draft.easing || 'linear';
    es.addEventListener('change', () => { draft.easing = es.value; });
    kv('easing', es);
    kv('검증 상태', el('span', '', draft.verification_status || '-'));
    editBox.appendChild(dl);
    // Keyframe
    if (!['clip', 'procedural'].includes(draft.animation_type)) {
      const table = el('div', 'ae-keys');
      draft.keyframes.forEach((k, i) => {
        const row = el('div', 'row');
        const t = el('input'); t.type = 'number'; t.min = '0'; t.max = '1'; t.step = '0.05'; t.value = k.time;
        t.addEventListener('change', () => { k.time = Math.max(0, Math.min(1, Number(t.value))); draft.keyframes.sort((a, b) => a.time - b.time); renderEdit(); });
        const v = el('input'); v.type = 'text'; v.value = JSON.stringify(k.value); v.className = 'ae-val';
        v.addEventListener('change', () => { try { k.value = JSON.parse(v.value); v.classList.remove('bad'); } catch (err) { v.classList.add('bad'); log(`Keyframe 값 JSON 오류: ${err.message}`, 'warn'); } });
        row.append(el('span', 'muted', `#${i + 1} t`), t, v, btn('✕', () => { draft.keyframes.splice(i, 1); renderEdit(); }, 'mini danger'));
        table.appendChild(row);
      });
      const add = el('div', 'row btns');
      add.append(
        btn('+ 현재 상태로 Keyframe', () => { const v = currentValue(); if (v === null) { log('현재 상태를 읽을 수 없습니다', 'warn'); return; } const last = draft.keyframes.length ? draft.keyframes.at(-1).time : -0.5; draft.keyframes.push({ time: Math.min(1, +(last + 0.5).toFixed(2)), value: v }); renderEdit(); }),
        btn('시작 상태 = 현재', () => { const v = currentValue(); if (v === null) return; draft.keyframes = draft.keyframes.filter((k) => k.time !== 0); draft.keyframes.unshift({ time: 0, value: v }); renderEdit(); }),
        btn('끝 상태 = 현재', () => { const v = currentValue(); if (v === null) return; draft.keyframes = draft.keyframes.filter((k) => k.time !== 1); draft.keyframes.push({ time: 1, value: v }); renderEdit(); }));
      editBox.append(el('p', 'muted', 'Keyframe: time은 재생시간 비율(0~1), 값은 JSON. transform {position,rotation(도),scale}, morph 숫자 또는 {이름:가중치}, material {color,opacity}, deform 반지름 배율'), table, add);
    }
    const scrub = el('input'); scrub.type = 'range'; scrub.min = '0'; scrub.max = '1000'; scrub.value = '0';
    scrub.setAttribute('aria-label', '미리보기 위치');
    scrub.addEventListener('input', () => {
      if (!apply()) return;
      if (!anim.isPlaying(draft.animation_id)) { anim.play(draft.animation_id); anim.pause(draft.animation_id); }
      anim.seek(draft.animation_id, Number(scrub.value) / 1000);
    });
    const r = el('div', 'row btns');
    r.append(btn('적용', () => { if (apply()) log(`애니메이션 정의 적용: ${draft.animation_id}`); }, 'primary'),
      btn('▶ 미리보기', () => { if (apply()) playAnim(draft.animation_id); }),
      btn('⏸/재개', () => toggle(draft.animation_id)),
      btn('초기화', () => { anim.stop(draft.animation_id, { restore: true }); scrub.value = '0'; render(); }),
      btn('+ 새 애니메이션', () => edit(null)));
    const rs = el('div', 'row'); rs.append(el('span', 'muted', '타임라인 위치'), scrub);
    editBox.append(rs, r);
  }

  function apply() {
    if (!draft) return false;
    const errs = anim.validateDef(draft);
    if (errs.length) { log(`애니메이션 정의 오류: ${errs.join(' / ')}`, 'error'); return false; }
    if (anim.isPlaying(draft.animation_id)) anim.stop(draft.animation_id, { restore: true });
    const r = anim.define(draft);
    if (!r.ok) { log(r.errors.join(' / '), 'error'); return false; }
    editId = draft.animation_id;
    renderLists();
    return true;
  }

  function loadTl(id) {
    delete tlText.dataset.dirty;
    tlText.value = id === '__new' || !timeline.has(id)
      ? JSON.stringify({ timeline_id: 'timeline_new', blocking: true, steps: [{ type: 'parallel', steps: [] }] }, null, 1)
      : JSON.stringify(timeline.def(id), null, 1);
  }
  tlText.addEventListener('input', () => { tlText.dataset.dirty = '1'; });
  function applyTimeline() {
    let def;
    try { def = JSON.parse(tlText.value); } catch (err) { log(`타임라인 JSON 오류: ${err.message}`, 'error'); return false; }
    const r = timeline.define(def);
    if (!r.ok) { log(`타임라인 검사: ${r.errors.join(' / ')}`, 'error'); return false; }
    delete tlText.dataset.dirty;
    log(`타임라인 적용: ${def.timeline_id}`);
    renderLists();
    tlSel.value = def.timeline_id;
    return true;
  }

  function exportJson() {
    const base = kit.data ? JSON.parse(JSON.stringify(kit.data)) : { version: 1 };
    base.animations = anim.ids().filter((x) => !x.startsWith('__')).map((id) => anim.def(id));
    base.timelines = timeline.ids().map((id) => timeline.def(id));
    base.exported_at = new Date().toISOString();
    const text = JSON.stringify(base, null, 1);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `${base.scene_id || 'animations'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    log(`애니메이션 JSON 내보냄: 애니메이션 ${base.animations.length}개, 타임라인 ${base.timelines.length}개`);
    return text;
  }

  function render() { renderLists(); renderEdit(); }

  anim.onEvent((kind) => { if (kind === 'complete' || kind === 'end') renderLists(); });
  visual.onChange(() => renderLists());
  setInterval(() => { if (enabled && container.offsetParent !== null && anim.playingIds().length) renderLists(); }, 300);
  render();

  return { render, edit, exportJson, applyTimeline, setEnabled(on) { enabled = on; }, get draft() { return draft; } };
}
