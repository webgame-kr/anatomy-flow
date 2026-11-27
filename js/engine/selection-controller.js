// Selection Controller: Raycaster로 Hover · 클릭 선택 · 선택 해제
// 카메라 드래그와 클릭을 구분하고, 숨겨진·선택 불가·단면으로 잘린 부분은 제외한다.

import * as THREE from 'three';
import { isShown } from './object-registry.js';

const DRAG_PX = 6;

export function createSelectionController({ renderer, camera, registry, materials, getClipPlanes }) {
  const dom = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const listeners = { select: new Set(), hover: new Set() };
  let selectedId = null;
  let hoverId = null;
  let level = 'part';          // 'part' | 'model'
  let down = null;
  let hoverQueued = null;
  let enabled = true;

  const selectBox = new THREE.BoxHelper(undefined, 0x2f6fde);
  selectBox.visible = false;
  selectBox.material.depthTest = false;
  selectBox.renderOrder = 10;

  function emit(kind, id) {
    for (const fn of listeners[kind]) fn(id);
  }

  function pick(clientX, clientY) {
    const rect = dom.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const meshes = registry.allMeshes().filter(isShown);
    const hits = raycaster.intersectObjects(meshes, false);
    const planes = getClipPlanes ? getClipPlanes() : null;
    for (const hit of hits) {
      // 단면으로 잘려 보이지 않는 부분은 건너뛴다
      const mats = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
      const clip = mats[0] && mats[0].clippingPlanes;
      if (clip && clip.length && planes && clip.some((p) => p.distanceToPoint(hit.point) < 0)) continue;
      if (mats.every((m) => m.opacity <= 0.02)) continue;
      const id = registry.resolvePick(hit.object, level);
      if (id) return id;
    }
    return null;
  }

  function select(id) {
    if (id && !registry.has(id)) id = null;
    if (id === selectedId) return;
    if (selectedId) materials.setHighlight(selectedId, 'select', false);
    selectedId = id;
    if (id) materials.setHighlight(id, 'select', true);
    emit('select', id);
  }

  function setHover(id) {
    if (id === hoverId) return;
    if (hoverId) materials.setHighlight(hoverId, 'hover', false);
    hoverId = id;
    if (id && id !== selectedId) materials.setHighlight(id, 'hover', true);
    dom.style.cursor = id ? 'pointer' : '';
    emit('hover', id);
  }

  function onDown(e) {
    if (!enabled) return;
    down = { x: e.clientX, y: e.clientY, button: e.button, moved: false, pointerType: e.pointerType };
  }

  function onMove(e) {
    if (down) {
      if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > DRAG_PX) down.moved = true;
      return;
    }
    if (!enabled || e.pointerType === 'touch') return;
    // Hover는 프레임당 한 번만 계산
    if (!hoverQueued) {
      hoverQueued = { x: e.clientX, y: e.clientY };
      requestAnimationFrame(() => {
        const q = hoverQueued;
        hoverQueued = null;
        if (q) setHover(pick(q.x, q.y));
      });
    } else {
      hoverQueued.x = e.clientX;
      hoverQueued.y = e.clientY;
    }
  }

  function onUp(e) {
    const d = down;
    down = null;
    if (!enabled || !d || d.moved || d.button !== 0) return;   // 드래그(카메라 회전)면 선택하지 않는다
    select(pick(e.clientX, e.clientY));
  }

  function onLeave() {
    setHover(null);
  }

  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointerleave', onLeave);

  // 선택 상자 갱신 (렌더링 루프에서 호출)
  function tick() {
    const entry = selectedId ? registry.get(selectedId) : null;
    if (entry && isShown(entry.object3D)) {
      selectBox.setFromObject(entry.object3D);
      selectBox.visible = true;
    } else {
      selectBox.visible = false;
    }
  }

  // 객체가 레지스트리에서 빠지면 선택·hover도 해제
  registry.onChange((kind) => {
    if (kind !== 'structure') return;
    if (selectedId && !registry.has(selectedId)) { selectedId = null; emit('select', null); }
    if (hoverId && !registry.has(hoverId)) hoverId = null;
  });

  return {
    helper: selectBox,
    select,
    tick,
    pick,
    onSelect(fn) { listeners.select.add(fn); },
    onHover(fn) { listeners.hover.add(fn); },
    setLevel(v) { level = v === 'model' ? 'model' : 'part'; },
    setEnabled(v) { enabled = v; if (!v) setHover(null); },
    get selectedId() { return selectedId; },
    get hoverId() { return hoverId; },
    get level() { return level; },
  };
}
