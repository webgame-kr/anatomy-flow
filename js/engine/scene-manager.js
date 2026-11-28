// Scene Manager: 장면 정의(content/sandbox/scenes.json)로 장면을 만들고 전환한다.
// 전환할 때 이전 장면의 객체를 레지스트리에서 해제한다(리소스는 참조 수가 0일 때만 dispose).
// 이전 장면으로 돌아갈 수 있도록 카메라와 객체 변환 상태를 저장한다.

import * as THREE from 'three';
import { boxOf } from './object-registry.js';

export function createSceneManager(ctx) {
  const { viewport, registry, tracker, objects, materials, selection, clipping, camera, loader, log } = ctx;
  let catalog = { scenes: [], assets: {} };
  let current = null;
  let token = 0;                 // 빠르게 연달아 전환할 때 이전 비동기 로딩을 무시하기 위한 번호
  const history = [];            // 이전 장면 상태
  const listeners = new Set();

  function emit(kind, data) {
    for (const fn of listeners) fn(kind, data);
  }

  async function loadCatalog(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`장면 정의를 읽지 못했습니다: ${url} (${res.status})`);
    catalog = await res.json();
    return catalog;
  }

  // STEP 03-B: 다른 형식(해부학 scene.json)에서 만든 장면 목록을 직접 넣는다
  function useCatalog(c) {
    catalog = c;
    return catalog;
  }

  function def(id) {
    return catalog.scenes.find((s) => s.scene_id === id) || null;
  }

  // 현재 장면 상태 저장 (카메라, 객체 변환·표시·투명도)
  function captureState() {
    if (!current) return null;
    const objs = {};
    for (const id of registry.ids()) {
      const info = registry.info(id);
      objs[id] = { position: info.position, rotation: info.rotation, scale: info.scale, visible: info.visible, opacity: info.opacity };
    }
    return { sceneId: current.scene_id, camera: camera.state(), objects: objs };
  }

  // 이전 장면 정리
  function unload() {
    selection.select(null);
    clipping.reset();
    materials.showAll();
    objects.cancelTweens();
    registry.clear();
  }

  function retainModel(root) {
    tracker.retain(root);
  }

  function fitModel(root, asset) {
    if (asset.fit && asset.fit.size) {
      const size = boxOf(root, false).getSize(new THREE.Vector3());
      const max = Math.max(size.x, size.y, size.z);
      if (max > 0) root.scale.multiplyScalar(asset.fit.size / max);
    }
    if (Array.isArray(asset.position)) {
      root.position.set(0, 0, 0);
      root.updateWorldMatrix(true, true);
      const box = boxOf(root, false);
      const center = box.getCenter(new THREE.Vector3());
      if (asset.fit) {
        // 크기를 맞춘 모델은 중심을 position에 둔다
        root.position.set(asset.position[0] - center.x, asset.position[1] - center.y, asset.position[2] - center.z);
      } else {
        root.position.set(...asset.position);
      }
    }
  }

  async function loadAsset(asset, myToken) {
    const meta = catalog.assets[asset.asset_id];
    if (!meta) {
      log(`장면 자산 정의 없음: ${asset.asset_id}`, 'error');
      return null;
    }
    if (registry.has(asset.asset_id)) {
      log(`이미 불러온 모델: ${asset.asset_id} (중복 로딩 안 함)`, 'warn');
      return asset.asset_id;
    }
    try {
      const result = await loader.loadUrl(meta.url, asset.display_name || asset.asset_id);
      if (myToken !== token) return null;   // 그사이 다른 장면으로 바뀜
      return addModel(result, asset.asset_id, asset);
    } catch (err) {
      if (asset.optional) log(`선택 모델 없음: ${asset.display_name || asset.asset_id} — ${err.message}`, 'warn');
      else log(`모델 로딩 실패: ${err.message}`, 'error');
      return null;
    }
  }

  // 불러온 모델을 장면에 넣고 레지스트리에 등록
  function addModel(result, assetId, placement = {}) {
    const root = result.root;
    registry.rootObject.add(root);
    fitModel(root, placement);
    retainModel(root);
    const id = registry.registerModel(root, {
      assetId,
      displayName: placement.display_name || result.label,
      animationNames: result.report.animations,
    });
    log(`모델 등록: ${id} · 노드 ${result.report.nodes} · Mesh ${result.report.meshes} · 재질 ${result.report.materials} · 삼각형 ${result.report.triangles} · 애니메이션 [${result.report.animations.join(', ')}]`);
    emit('model', { id, report: result.report, root, clips: result.animations || [] });   // STEP 04-B: GLB AnimationClip 전달
    return id;
  }

  async function load(sceneId, { restore = null, remember = true } = {}) {
    const d = def(sceneId);
    if (!d) throw new Error(`없는 장면: ${sceneId}`);
    const myToken = ++token;
    if (current && remember) {
      history.push(captureState());
      if (history.length > 10) history.shift();
    }
    emit('loading', { sceneId });
    unload();
    current = d;

    viewport.setLighting(d.lighting, d.background);
    camera.setCoordinateSystem(d.coordinate_system);
    const cd = d.camera_defaults || {};
    if (cd.fov) {
      viewport.camera.fov = cd.fov;
      viewport.camera.updateProjectionMatrix();
    }
    camera.setHome(cd.position || [7, 6, 9], cd.target || [0, 0.5, 0], cd.fov);
    camera.resetHome(0);

    // 공유 재질 (같은 재질 객체를 여러 Mesh가 쓴다)
    const shared = {};
    for (const [key, m] of Object.entries(d.materials || {})) shared[key] = objects.newMaterial(m.color);

    for (const g of d.groups || []) objects.createGroup(g);
    for (const o of d.objects || []) {
      const spec = { ...o, sourceAssetId: d.scene_id };
      if (typeof o.material === 'string') {
        if (!shared[o.material]) log(`없는 공유 재질: ${o.material}`, 'error');
        spec.material = shared[o.material];
      }
      if (Array.isArray(o.materials)) spec.materials = o.materials.map((c) => objects.newMaterial(c));
      try {
        objects.create(spec);
      } catch (err) {
        log(`객체 생성 실패 (${o.id}): ${err.message}`, 'error');
      }
    }

    for (const asset of d.assets || []) {
      await loadAsset(asset, myToken);
      if (myToken !== token) return null;
    }

    if (Array.isArray(d.default_visible_objects)) {
      for (const id of registry.roots()) materials.setVisible(id, d.default_visible_objects.includes(id));
    }

    if (restore) applyState(restore);
    emit('ready', { scene: d });
    return d;
  }

  function applyState(state) {
    for (const [id, s] of Object.entries(state.objects || {})) {
      if (!registry.has(id)) continue;
      objects.update(id, { position: s.position, rotation: s.rotation, scale: s.scale }, 0);
      materials.setVisible(id, s.visible);
      if (s.opacity < 1) materials.setOpacity(id, s.opacity);
    }
    camera.restoreState(state.camera);
  }

  async function back() {
    const prev = history.pop();
    if (!prev) return null;
    return load(prev.sceneId, { restore: prev, remember: false });
  }

  async function reset() {
    if (!current) return null;
    return load(current.scene_id, { remember: false });
  }

  return {
    loadCatalog,
    useCatalog,
    load,
    back,
    reset,
    addModel,
    has: (id) => !!def(id),
    list: () => catalog.scenes.map((s) => ({ id: s.scene_id, name: s.scene_name })),
    get current() { return current; },
    get historySize() { return history.length; },
    onChange(fn) { listeners.add(fn); },
  };
}
