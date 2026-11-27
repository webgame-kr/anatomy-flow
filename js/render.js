// Rendering Engine: 콘텐츠 데이터로 SVG 노드·모델·경로를 만든다

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent) {
  const node = document.createElementNS(NS, tag);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (parent) parent.appendChild(node);
  return node;
}

function edgePathD(edge, content, nodeById) {
  if (edge.path) {
    const found = (content.paths || []).find((p) => p.id === edge.path);
    if (found) return found.d;
  }
  const a = nodeById[edge.from];
  const b = nodeById[edge.to];
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

function drawModel(model, parent) {
  const g = el('g', { 'data-model': model.id }, parent);
  let shape;
  let cx = model.x;
  let cy = model.y;
  if (model.shape === 'circle') {
    shape = el('circle', { cx: model.x, cy: model.y, r: model.r || 30 }, g);
  } else if (model.shape === 'ellipse') {
    shape = el('ellipse', { cx: model.x, cy: model.y, rx: model.rx || 40, ry: model.ry || 25 }, g);
  } else if (model.shape === 'rect') {
    const w = model.w || 60;
    const h = model.h || 40;
    shape = el('rect', { x: model.x, y: model.y, width: w, height: h, rx: 8 }, g);
    cx = model.x + w / 2;
    cy = model.y + h / 2;
  } else {
    shape = el('path', { d: model.d }, g);
  }
  shape.classList.add('model');
  shape.style.fill = model.color || '#9aa4b2';
  if (model.label) {
    const label = el('text', { x: cx, y: cy + 5, class: 'model-label' }, g);
    label.textContent = model.label;
  }
  return { group: g, shape };
}

export function buildScene(svg, content) {
  svg.innerHTML = '';
  const nodeById = {};
  for (const n of content.nodes) nodeById[n.id] = n;

  const defs = el('defs', {}, svg);
  const marker = el('marker', {
    id: 'arrow', viewBox: '0 0 10 10', refX: 8, refY: 5,
    markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse',
  }, defs);
  el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#9aa4b2' }, marker);

  const world = el('g', { class: 'world' }, svg);
  const layerModels = el('g', { class: 'layer-models' }, world);
  const layerEdges = el('g', { class: 'layer-edges' }, world);
  const layerTrail = el('g', { class: 'layer-trail' }, world);
  const layerNodes = el('g', { class: 'layer-nodes' }, world);
  const layerMover = el('g', { class: 'layer-mover' }, world);

  const modelEls = {};
  for (const m of content.models || []) modelEls[m.id] = drawModel(m, layerModels);

  const edgeEls = {};
  for (const edge of content.edges) {
    const d = edgePathD(edge, content, nodeById);
    const attrs = { d, class: 'edge', 'data-edge': edge.id };
    if (edge.reverse) attrs['marker-start'] = 'url(#arrow)';
    else attrs['marker-end'] = 'url(#arrow)';
    edgeEls[edge.id] = el('path', attrs, layerEdges);
  }

  const nodeEls = {};
  for (const n of content.nodes) {
    const g = el('g', { class: 'node', 'data-node': n.id, transform: `translate(${n.x} ${n.y})` }, layerNodes);
    el('circle', { r: 22, class: 'ring' }, g);
    el('circle', { r: 18 }, g);
    const ko = el('text', { y: 44, class: 'ko' }, g);
    const en = el('text', { y: 60, class: 'en' }, g);
    nodeEls[n.id] = { group: g, ko, en, data: n };
  }

  const mover = el('circle', { r: 8, class: 'mover', visibility: 'hidden' }, layerMover);

  return {
    svg, world, layerTrail, edgeEls, nodeEls, modelEls, mover,
    bounds: computeBounds(content),
  };
}

function computeBounds(content) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  function add(x, y) {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  for (const n of content.nodes) { add(n.x - 30, n.y - 30); add(n.x + 30, n.y + 70); }
  for (const m of content.models || []) {
    if (m.shape === 'rect') { add(m.x, m.y); add(m.x + (m.w || 60), m.y + (m.h || 40)); }
    else if (m.shape === 'circle') { add(m.x - (m.r || 30), m.y - (m.r || 30)); add(m.x + (m.r || 30), m.y + (m.r || 30)); }
    else if (m.shape === 'ellipse') { add(m.x - (m.rx || 40), m.y - (m.ry || 25)); add(m.x + (m.rx || 40), m.y + (m.ry || 25)); }
  }
  if (minX === Infinity) return { x: 0, y: 0, w: 1000, h: 600 };
  const pad = 40;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

// Python이 돌려준 view를 화면에 반영한다
export function applyView(scene, view, opts) {
  if (!view) return;
  const completed = new Set(view.completed || []);
  const candidates = new Set((view.candidates || []).map((c) => c.node));
  const candidateEdges = new Set((view.candidates || []).map((c) => c.edge).filter(Boolean));
  const doneEdges = new Set(view.done_edges || []);

  for (const id in scene.nodeEls) {
    const item = scene.nodeEls[id];
    const g = item.group;
    const isCurrent = view.current === id;
    g.classList.toggle('current', isCurrent);
    g.classList.toggle('done', completed.has(id) && !isCurrent);
    g.classList.toggle('candidate', candidates.has(id) && view.phase === 'ready');
    const known = completed.has(id) || opts.showLabels;
    item.ko.textContent = known ? item.data.ko : '?';
    item.en.textContent = known ? (item.data.en || '') : '';
  }

  for (const id in scene.edgeEls) {
    const path = scene.edgeEls[id];
    path.classList.toggle('done', doneEdges.has(id));
    path.classList.toggle('candidate', candidateEdges.has(id) && view.phase === 'ready' && !doneEdges.has(id));
  }

  const models = view.models || {};
  for (const id in scene.modelEls) {
    const state = models[id];
    if (!state) continue;
    const m = scene.modelEls[id];
    m.shape.style.fill = state.color;
    m.group.style.display = state.visible ? '' : 'none';
  }
}

export function pulse(element) {
  if (!element) return;
  element.classList.remove('pulse');
  // 강제로 다시 계산해서 애니메이션을 처음부터 재생
  void element.getBBox();
  element.classList.add('pulse');
  setTimeout(() => element.classList.remove('pulse'), 1500);
}

export function makeTrail(scene, edgeId) {
  const src = scene.edgeEls[edgeId];
  if (!src) return null;
  const trail = el('path', { d: src.getAttribute('d'), class: 'trail' }, scene.layerTrail);
  const len = trail.getTotalLength();
  trail.style.strokeDasharray = `${len} ${len}`;
  trail.style.strokeDashoffset = `${len}`;
  return { el: trail, len };
}

export function clearTrails(scene) {
  scene.layerTrail.innerHTML = '';
}
