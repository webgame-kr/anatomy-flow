// Camera Engine: viewBox로 확대·축소, 드래그 이동, 대상 추적

export function createCamera(svg) {
  const vb = { x: 0, y: 0, w: 1000, h: 600 };
  let home = { ...vb };
  let target = null;       // 따라갈 점 (world 좌표)
  let loop = 0;
  const pointers = new Map();
  let pinchDist = 0;
  let dragMoved = false;

  function apply() {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }

  // 화면 좌표 → world 좌표 (preserveAspectRatio: xMidYMid meet 기준)
  function toWorld(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    const s = Math.min(r.width / vb.w, r.height / vb.h) || 1;
    const ox = (r.width - vb.w * s) / 2;
    const oy = (r.height - vb.h * s) / 2;
    return { x: vb.x + (clientX - r.left - ox) / s, y: vb.y + (clientY - r.top - oy) / s, s };
  }

  function scale() {
    const r = svg.getBoundingClientRect();
    return Math.min(r.width / vb.w, r.height / vb.h) || 1;
  }

  function fit(bounds) {
    vb.x = bounds.x; vb.y = bounds.y; vb.w = bounds.w; vb.h = bounds.h;
    home = { ...vb };
    target = null;
    apply();
  }

  function zoomAt(factor, clientX, clientY) {
    const p = clientX === undefined ? { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 } : toWorld(clientX, clientY);
    const newW = Math.min(home.w * 4, Math.max(home.w / 6, vb.w * factor));
    const ratio = newW / vb.w;
    vb.x = p.x - (p.x - vb.x) * ratio;
    vb.y = p.y - (p.y - vb.y) * ratio;
    vb.w *= ratio;
    vb.h *= ratio;
    apply();
  }

  function panScreen(dx, dy) {
    const s = scale();
    vb.x -= dx / s;
    vb.y -= dy / s;
    apply();
  }

  function tick() {
    loop = 0;
    if (!target) return;
    const tx = target.x - vb.w / 2;
    const ty = target.y - vb.h / 2;
    vb.x += (tx - vb.x) * 0.12;
    vb.y += (ty - vb.y) * 0.12;
    apply();
    if (Math.abs(tx - vb.x) > 0.5 || Math.abs(ty - vb.y) > 0.5) loop = requestAnimationFrame(tick);
  }

  // 화면이 좁아 글자가 너무 작아지면(모바일) 최소 배율까지 확대한다
  function ensureScale(minScale) {
    const s = scale();
    if (s >= minScale) return;
    const ratio = s / minScale;
    const cx = vb.x + vb.w / 2;
    const cy = vb.y + vb.h / 2;
    vb.w *= ratio;
    vb.h *= ratio;
    vb.x = cx - vb.w / 2;
    vb.y = cy - vb.h / 2;
    apply();
  }

  function follow(point, minScale) {
    if (minScale) ensureScale(minScale);
    target = { x: point.x, y: point.y };
    if (!loop) loop = requestAnimationFrame(tick);
  }

  function stopFollow() {
    target = null;
    if (loop) cancelAnimationFrame(loop);
    loop = 0;
  }

  // 마우스 휠 확대·축소
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    stopFollow();
    zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false });

  // 드래그(마우스·터치)와 두 손가락 확대
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragMoved = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    svg.classList.add('dragging');
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        if (!dragMoved) { dragMoved = true; stopFollow(); }
        panScreen(dx, dy);
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0 && dist > 0) {
        stopFollow();
        zoomAt(pinchDist / dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      pinchDist = dist;
    }
  });

  function release(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) svg.classList.remove('dragging');
  }
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);

  apply();
  return {
    fit,
    fitHome: () => fit(home),
    zoomIn: () => { stopFollow(); zoomAt(1 / 1.25); },
    zoomOut: () => { stopFollow(); zoomAt(1.25); },
    follow,
    stopFollow,
    get viewBox() { return { ...vb }; },
  };
}
