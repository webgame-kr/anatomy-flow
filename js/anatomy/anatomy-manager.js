// Anatomy Manager: 해부학 장면(scene.json) 불러오기, 레이어, 시점, 구조 선택·격리·투명도·단면
// 기존 엔진(Scene Manager, Material/Camera/Clipping Controller)을 그대로 쓰고, 해부학 의미만 얹는다.
// 레이어 숨김과 구조별 숨김은 따로 기억한다 → 상위 레이어를 껐다 켜도 하위 구조의 개별 상태가 유지된다.

import * as THREE from 'three';

export function createAnatomyManager(ctx) {
  const { registry, anatomy, scenes, loader, materials, camera, clipping, selection, log } = ctx;
  let sceneDef = null;
  const assetUrl = new Map();
  const layers = new Map();          // layer id → { def, visible, opacity }
  const hidden = new Set();          // 개별로 숨긴 구조
  const opacityOf = new Map();       // 구조별 투명도
  let selected = null;
  const listeners = new Set();
  const loading = new Map();         // asset id → Promise
  const selectBox = new THREE.Box3Helper(new THREE.Box3(), 0x2f6fde);
  selectBox.visible = false;
  selectBox.material.depthTest = false;
  selectBox.renderOrder = 10;
  ctx.scene.add(selectBox);

  function emit(kind, data) { for (const fn of listeners) fn(kind, data); }

  async function loadScene(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`장면 정의를 읽지 못했습니다: ${url} (${res.status})`);
    sceneDef = await res.json();
    const structures = await (await fetch(sceneDef.object_mapping, { cache: 'no-cache' })).json();
    anatomy.load(structures);
    for (const a of sceneDef.assets) assetUrl.set(a.asset_id, a.url);
    layers.clear();
    for (const l of sceneDef.layers) layers.set(l.id, { def: l, visible: l.visible !== false, opacity: l.opacity ?? 1 });

    // 기존 Scene Manager 형식으로 바꿔 넣는다 (처음 불러올 자산만)
    scenes.useCatalog({
      assets: Object.fromEntries(sceneDef.assets.map((a) => [a.asset_id, { url: a.url, public: true }])),
      scenes: [{
        scene_id: sceneDef.scene_id, scene_name: sceneDef.scene_name,
        coordinate_system: sceneDef.coordinate_system, camera_defaults: sceneDef.default_camera,
        lighting: sceneDef.lighting, background: sceneDef.background, credits: sceneDef.credits,
        assets: sceneDef.assets.filter((a) => a.load !== 'lazy').map((a) => ({ asset_id: a.asset_id, display_name: a.asset_id })),
        objects: [],
      }],
    });
    return sceneDef;
  }

  async function start() {
    hidden.clear();
    opacityOf.clear();
    selected = null;
    // 초기화하면 레이어도 장면 정의의 기본값으로 (지연 로딩 자산은 다시 불러오지 않는다)
    for (const l of layers.values()) {
      l.visible = l.def.visible !== false;
      l.opacity = l.def.opacity ?? 1;
    }
    const t0 = performance.now();
    await scenes.load(sceneDef.scene_id, { remember: false });
    anatomy.resolve();
    // 처음부터 켜진 레이어 중 지연 로딩 자산이 있으면 불러온다
    for (const [id, l] of layers) if (l.visible && !l.def.kind) await ensureLayerAssets(id);
    apply();
    const ms = Math.round(performance.now() - t0);
    emit('ready', { ms });
    return ms;
  }

  // ---------- 지연 로딩 ----------
  function assetsOfLayer(layerId) {
    const l = layers.get(layerId);
    if (!l || l.def.kind) return [];
    const ids = new Set();
    for (const s of anatomy.list()) if (l.def.groups.includes(s.anatomical_group)) s.asset_ids.forEach((a) => ids.add(a));
    return [...ids];
  }

  async function ensureAsset(assetId) {
    if (registry.has(assetId)) return true;
    if (loading.has(assetId)) return loading.get(assetId);
    const url = assetUrl.get(assetId);
    if (!url) { log(`장면 정의에 없는 자산: ${assetId}`, 'error'); return false; }
    const job = (async () => {
      const t0 = performance.now();
      try {
        const result = await loader.loadUrl(url, assetId);
        if (!registry.has(assetId)) scenes.addModel(result, assetId, { display_name: assetId });
        anatomy.resolve();
        log(`지연 로딩: ${assetId} ${Math.round(performance.now() - t0)}ms`);
        emit('assets', { assetId });
        return true;
      } catch (err) {
        log(`모델을 불러오지 못했습니다 (${assetId}): ${err.message}`, 'error');
        return false;
      } finally {
        loading.delete(assetId);
      }
    })();
    loading.set(assetId, job);
    return job;
  }

  async function ensureLayerAssets(layerId) {
    for (const a of assetsOfLayer(layerId)) await ensureAsset(a);
  }

  // ---------- 표시 상태 적용 ----------
  function layerOf(structureId) {
    const s = anatomy.get(structureId);
    if (!s) return null;
    for (const [id, l] of layers) if (!l.def.kind && l.def.groups.includes(s.anatomical_group)) return { id, ...l };
    return null;
  }

  function apply({ silent = false } = {}) {
    const seen = new Set();
    for (const s of anatomy.list()) {
      for (const oid of anatomy.objectIdsOf(s.anatomical_id)) {
        if (seen.has(oid)) continue;
        seen.add(oid);
        const owners = anatomy.structuresForObject(oid);
        const layer = layerOf(owners[0]);
        const layerOn = layer ? layer.visible : true;
        const indivOn = owners.every((sid) => !hidden.has(sid));
        let op = layer ? layer.opacity : 1;
        for (const sid of owners) if (opacityOf.has(sid)) op = Math.min(op, opacityOf.get(sid));
        materials.setVisible(oid, layerOn && indivOn);
        materials.setOpacity(oid, op);
      }
    }
    updateSelectBox();
    if (!silent) emit('state');
  }

  async function setLayerVisible(layerId, visible) {
    const l = layers.get(layerId);
    if (!l) return;
    l.visible = visible;
    if (visible && !l.def.kind) await ensureLayerAssets(layerId);
    apply();
    emit('layer', { layerId, visible });
  }

  function setLayerOpacity(layerId, opacity) {
    const l = layers.get(layerId);
    if (!l) return;
    l.opacity = opacity;
    apply({ silent: true });          // 슬라이더를 끄는 동안 목록을 다시 그리지 않는다
  }

  function setStructureVisible(id, visible) {
    if (visible) hidden.delete(id);
    else hidden.add(id);
    apply();
  }

  function setStructureOpacity(id, opacity) {
    if (opacity >= 1) opacityOf.delete(id);
    else opacityOf.set(id, opacity);
    apply({ silent: true });
  }

  // ---------- 선택 ----------
  function select(id) {
    const prev = selected;
    if (prev) for (const oid of anatomy.objectIdsOf(prev)) materials.setHighlight(oid, 'select', false);
    selected = id && anatomy.has(id) ? id : null;
    if (selected) for (const oid of anatomy.objectIdsOf(selected)) materials.setHighlight(oid, 'select', true);
    if (clipping.state.enabled && clipping.state.scope === 'selected') setClip({});
    updateSelectBox();
    emit('select', { id: selected });
  }

  function updateSelectBox() {
    if (!selected || anatomy.objectIdsOf(selected).length === 0) {
      selectBox.visible = false;
      return;
    }
    const box = anatomy.worldBox(selected, true);
    selectBox.visible = !box.isEmpty();
    if (!box.isEmpty()) selectBox.box.copy(box);
  }

  function boxOfStructures(ids) {
    const box = new THREE.Box3();
    for (const id of ids) box.union(anatomy.worldBox(id));
    return box;
  }

  async function focus(id, direction = null) {
    const s = anatomy.get(id);
    if (!s) return false;
    if (anatomy.objectIdsOf(id).length === 0) {
      // 지연 로딩 레이어의 구조면 불러온 뒤 초점
      for (const a of s.asset_ids) await ensureAsset(a);
      const l = layerOf(id);
      if (l && !l.visible) await setLayerVisible(l.id, true);
    }
    const box = anatomy.worldBox(id);
    if (box.isEmpty()) return false;
    return camera.focusBox(box, { direction: direction ? camera.directionOf(direction) : null });
  }

  async function view(viewId) {
    const v = (sceneDef.views || []).find((x) => x.id === viewId);
    if (!v) return false;
    for (const l of v.show_layers || []) await setLayerVisible(l, true);
    if (v.targets === 'loaded') return camera.overview({ direction: camera.directionOf(v.direction) });
    const box = boxOfStructures(v.targets);
    if (box.isEmpty()) return false;
    return camera.focusBox(box, { direction: camera.directionOf(v.direction) });
  }

  // 정면·후면·해부학적 좌/우·상단·사선: 선택 구조가 있으면 그것, 없으면 불러온 전체
  function direction(name) {
    const box = selected ? anatomy.worldBox(selected) : null;
    if (box && !box.isEmpty()) return camera.focusBox(box, { direction: camera.directionOf(name) });
    return camera.preset(name);
  }

  function isolate(id) {
    materials.clearGhost();
    materials.isolateSet(anatomy.meshesOf(id), id);
    emit('state');
  }

  function ghostOthers(id) {
    materials.clearIsolation();
    materials.ghostSet(anatomy.meshesOf(id), id);
    emit('state');
  }

  // 전체 복원: 격리·고스트·개별 숨김·개별 투명도 해제 (레이어 설정은 유지)
  function restoreAll() {
    materials.clearIsolation();
    materials.clearGhost();
    hidden.clear();
    opacityOf.clear();
    apply();
  }

  function setClip(changes) {
    const ids = selected ? anatomy.objectIdsOf(selected) : [];
    return clipping.set({ ...changes, targetIds: ids, targetId: null });
  }

  return {
    loadScene,
    start,
    ensureAsset,
    setLayerVisible,
    setLayerOpacity,
    setStructureVisible,
    setStructureOpacity,
    select,
    focus,
    view,
    direction,
    isolate,
    ghostOthers,
    restoreAll,
    setClip,
    apply,
    resolveTargets: (target) => (anatomy.has(target) ? anatomy.objectIdsOf(target) : []),
    focusObjects: (ids) => {
      const box = new THREE.Box3();
      for (const oid of ids) for (const m of registry.meshesOf(oid)) box.expandByObject(m);
      return camera.focusBox(box);
    },
    layersList: () => [...layers.entries()].map(([id, l]) => ({ id, ...l.def, visible: l.visible, opacity: l.opacity })),
    layerState: (id) => layers.get(id),
    isHidden: (id) => hidden.has(id),
    opacityOf: (id) => opacityOf.get(id) ?? 1,
    tick: () => { if (selected) updateSelectBox(); },
    onChange(fn) { listeners.add(fn); },
    get selected() { return selected; },
    get scene() { return sceneDef; },
  };
}
