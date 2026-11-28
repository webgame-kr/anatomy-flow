// Anatomy Labels: 3D 좌표에 연결된 HTML 라벨 (CSS2DRenderer 대신 같은 원리의 가벼운 오버레이)
// - 기준점: 구조의 보이는 Mesh 경계 상자 중심(월드 좌표). 카메라가 움직이면 매 프레임 다시 투영한다.
// - 카메라 뒤(투영 z > 1), 화면 밖, 숨겨진 구조의 라벨은 숨긴다.
// - 겹침: 우선순위(선택 > hover > 가까운 것) 순으로 놓고, 이미 놓인 라벨과 겹치면 건너뛴다.

import * as THREE from 'three';

export function createAnatomyLabels({ container, camera, anatomy }) {
  const layer = document.createElement('div');
  layer.className = 'label-layer';
  container.appendChild(layer);
  const els = new Map();        // anatomical_id → { el, w, h }
  let mode = 'both';            // ko | en | both
  let scope = 'major';          // all | major | selected | off
  let major = new Set();
  let selected = null;
  let hover = null;
  const v = new THREE.Vector3();
  const camPos = new THREE.Vector3();

  function text(s) {
    if (mode === 'ko') return s.name_ko;
    if (mode === 'en') return s.name_en;
    return `${s.name_ko} · ${s.name_en}`;
  }

  function element(id) {
    let item = els.get(id);
    if (!item) {
      const el = document.createElement('div');
      el.className = 'a-label';
      el.dataset.id = id;
      layer.appendChild(el);
      item = { el, w: 0, h: 0, text: '' };
      els.set(id, item);
    }
    const s = anatomy.get(id);
    const t = text(s);
    if (item.text !== t) {
      item.el.textContent = t;
      item.text = t;
      item.w = item.el.offsetWidth;
      item.h = item.el.offsetHeight;
    }
    return item;
  }

  function wanted() {
    if (scope === 'off') return [];
    if (scope === 'selected') return [selected, hover].filter(Boolean);
    const base = scope === 'all' ? anatomy.list().map((s) => s.anatomical_id) : [...major];
    const set = new Set(base);
    if (selected) set.add(selected);
    if (hover) set.add(hover);
    return [...set];
  }

  // 매 프레임: 투영, 숨김 판정, 겹침 피하기
  function update() {
    const rect = container.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    camera.getWorldPosition(camPos);
    const items = [];
    for (const id of wanted()) {
      if (!anatomy.isVisible(id)) continue;
      const box = anatomy.worldBox(id, true);
      if (box.isEmpty()) continue;
      box.getCenter(v);
      const dist = v.distanceTo(camPos);
      v.project(camera);
      if (v.z > 1 || v.z < -1) continue;                         // 카메라 뒤 또는 시야 밖(깊이)
      const x = (v.x + 1) / 2 * W;
      const y = (1 - v.y) / 2 * H;
      if (x < 0 || x > W || y < 0 || y > H) continue;           // 화면 밖
      const pri = id === selected ? 0 : (id === hover ? 1 : 2);
      items.push({ id, x, y, dist, pri });
    }
    items.sort((a, b) => a.pri - b.pri || a.dist - b.dist);
    const placed = [];
    const shown = new Set();
    for (const it of items) {
      const item = element(it.id);
      const r = { x: it.x - item.w / 2, y: it.y - item.h - 6, w: item.w, h: item.h };
      if (r.x < 2) r.x = 2;
      if (r.x + r.w > W - 2) r.x = W - 2 - r.w;
      const hit = placed.some((p) => r.x < p.x + p.w + 4 && r.x + r.w + 4 > p.x && r.y < p.y + p.h + 2 && r.y + r.h + 2 > p.y);
      if (hit && it.pri === 2) continue;
      placed.push(r);
      shown.add(it.id);
      item.el.style.transform = `translate(${Math.round(r.x)}px, ${Math.round(r.y)}px)`;
      item.el.classList.toggle('sel', it.id === selected);
      item.el.classList.toggle('hov', it.id === hover && it.id !== selected);
    }
    for (const [id, item] of els) item.el.hidden = !shown.has(id);
    return shown.size;
  }

  return {
    update,
    setMode(m) { mode = m; },
    setScope(s) { scope = s; },
    setMajor(list) { major = new Set(list || []); },
    setSelected(id) { selected = id; },
    setHover(id) { hover = id; },
    setVisible(on) { layer.hidden = !on; },
    clear() { for (const item of els.values()) item.el.remove(); els.clear(); },
    get count() { return [...els.values()].filter((i) => !i.el.hidden).length; },
    get mode() { return mode; },
    get scope() { return scope; },
  };
}
