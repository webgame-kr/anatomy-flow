// Material Controller: 객체별 색상·투명도·표시·강조·격리·단면 재질 상태
//
// 상태 층(layer)을 나눠서 서로 덮어쓰지 않게 한다.
//   1) 상태 색상·투명도 (set_color / set_opacity: 이후 생리적 상태 변화가 쓰는 층) → material.color / opacity
//   2) 강조 (선택 > 이벤트 highlight > hover)                                     → material.emissive
//   3) 격리(Isolation) 숨김 · 고스트(나머지 투명화)                              → visible / opacity 곱
//   4) 단면(clipping)                                                           → material.clippingPlanes
// 원본 재질은 건드리지 않는다. 변경이 필요한 Mesh만 재질을 복제해서 쓰고,
// 아무 상태도 없으면 원본 재질로 되돌리고 복제본을 해제한다(공유 재질 충돌 방지).

import * as THREE from 'three';

const HIGHLIGHT = {
  select: { color: new THREE.Color('#2f6fde'), intensity: 0.3 },
  event: { color: new THREE.Color('#f5a00a'), intensity: 0.6 },
  hover: { color: new THREE.Color('#5aa0ff'), intensity: 0.3 },
};
const GHOST_OPACITY = 0.12;

function asArray(m) {
  return Array.isArray(m) ? m : [m];
}

export function createMaterialController({ registry }) {
  const states = new Map();   // mesh -> 상태
  let isolatedId = null;
  let ghostId = null;

  function state(mesh) {
    let st = states.get(mesh);
    if (!st) {
      st = {
        original: mesh.material,
        owned: null,
        color: null,
        opacity: 1,
        hl: { select: false, event: false, hover: false },
        isoHidden: false,
        ghost: false,
        clip: null,
        userVisible: mesh.visible,
      };
      states.set(mesh, st);
    }
    return st;
  }

  function hasOverride(st) {
    return st.color !== null || st.opacity < 1 || st.ghost || st.clip !== null ||
      st.hl.select || st.hl.event || st.hl.hover;
  }

  function ensureOwned(mesh, st) {
    if (st.owned) return;
    const clones = asArray(st.original).map((m) => m.clone());
    st.owned = Array.isArray(st.original) ? clones : clones[0];
    mesh.material = st.owned;
  }

  function dropOwned(mesh, st) {
    if (!st.owned) return;
    for (const m of asArray(st.owned)) m.dispose();
    st.owned = null;
    mesh.material = st.original;
  }

  // 상태 층을 모아 실제 재질에 반영
  function apply(mesh) {
    const st = state(mesh);
    mesh.visible = st.userVisible && !st.isoHidden;
    if (!hasOverride(st)) {
      dropOwned(mesh, st);
      mesh.renderOrder = 0;
      return;
    }
    ensureOwned(mesh, st);
    const originals = asArray(st.original);
    const owned = asArray(st.owned);
    const hl = st.hl.select ? HIGHLIGHT.select : (st.hl.event ? HIGHLIGHT.event : (st.hl.hover ? HIGHLIGHT.hover : null));
    let translucent = false;
    owned.forEach((m, i) => {
      const o = originals[i] || originals[0];
      if (m.color && o.color) {
        if (st.color) m.color.set(st.color);
        else m.color.copy(o.color);
      }
      const op = o.opacity * st.opacity * (st.ghost ? GHOST_OPACITY : 1);
      const wantTransparent = o.transparent || op < 0.999;
      const clip = st.clip;
      const needsUpdate = m.transparent !== wantTransparent ||
        (m.clippingPlanes ? m.clippingPlanes.length : 0) !== (clip ? clip.length : 0);
      m.opacity = op;
      m.transparent = wantTransparent;
      m.depthWrite = op < 0.999 ? false : o.depthWrite;
      if (wantTransparent && op < 0.999) translucent = true;
      if (m.emissive && o.emissive) {
        if (hl) {
          m.emissive.copy(hl.color);
          m.emissiveIntensity = hl.intensity;
        } else {
          m.emissive.copy(o.emissive);
          m.emissiveIntensity = o.emissiveIntensity;
        }
      }
      m.clippingPlanes = clip;
      m.side = clip ? THREE.DoubleSide : o.side;   // 단면에서 안쪽 면도 보이게
      if (needsUpdate) m.needsUpdate = true;
    });
    // 투명한 객체는 불투명한 객체 다음에 그린다
    mesh.renderOrder = translucent ? 2 : 0;
  }

  function each(id, fn) {
    const meshes = registry.meshesOf(id);
    for (const mesh of meshes) {
      fn(state(mesh), mesh);
      apply(mesh);
    }
    return meshes.length;
  }

  function mark(id, key, value) {
    const entry = registry.get(id);
    if (entry) entry.object3D.userData[key] = value;
  }

  // ---------- 상태 색상·투명도 ----------
  function setColor(id, color) {
    each(id, (st) => { st.color = color; });
  }

  function setOpacity(id, value) {
    const v = Math.max(0, Math.min(1, value));
    each(id, (st) => { st.opacity = v; });
    mark(id, 'nfOpacity', v);
  }

  function restore(id) {
    each(id, (st) => { st.color = null; st.opacity = 1; });
    mark(id, 'nfOpacity', 1);
  }

  // ---------- 표시 ----------
  // 그룹/모델은 Object3D.visible로, Mesh는 상태 층을 거쳐 반영한다
  function setVisible(id, visible) {
    const entry = registry.get(id);
    if (!entry) return;
    if (entry.object3D.isMesh) {
      state(entry.object3D).userVisible = visible;
      apply(entry.object3D);
    } else {
      entry.object3D.visible = visible;
    }
  }

  // ---------- 강조 ----------
  function setHighlight(id, kind, on) {
    if (!id || !registry.has(id)) return;
    each(id, (st) => { st.hl[kind] = on; });
  }

  // ---------- 격리 · 고스트 ----------
  function inSubtree(mesh, id) {
    const target = registry.get(id).object3D;
    let cur = mesh;
    while (cur) {
      if (cur === target) return true;
      cur = cur.parent;
    }
    return false;
  }

  function isolate(id) {
    clearIsolation(false);
    if (!registry.has(id)) return;
    isolatedId = id;
    for (const mesh of registry.allMeshes()) {
      const st = state(mesh);
      st.isoHidden = !inSubtree(mesh, id);
      apply(mesh);
    }
  }

  function ghostOthers(id) {
    clearGhost();
    if (!registry.has(id)) return;
    ghostId = id;
    for (const mesh of registry.allMeshes()) {
      const st = state(mesh);
      st.ghost = !inSubtree(mesh, id);
      apply(mesh);
    }
  }

  function clearIsolation(applyNow = true) {
    isolatedId = null;
    for (const [mesh, st] of states) {
      if (st.isoHidden) {
        st.isoHidden = false;
        if (applyNow) apply(mesh);
      }
    }
  }

  function clearGhost() {
    ghostId = null;
    for (const [mesh, st] of states) {
      if (st.ghost) {
        st.ghost = false;
        apply(mesh);
      }
    }
  }

  // 전체 표시: 격리·고스트 해제, 모든 객체 보이기
  function showAll() {
    clearIsolation();
    clearGhost();
    for (const id of registry.ids()) {
      const e = registry.get(id);
      if (!e.object3D.isMesh) e.object3D.visible = true;
    }
    for (const mesh of registry.allMeshes()) {
      state(mesh).userVisible = true;
      apply(mesh);
    }
  }

  // ---------- 단면 ----------
  function setClip(mesh, planes) {
    const st = state(mesh);
    st.clip = planes;
    apply(mesh);
  }

  // 레지스트리에서 객체가 빠지기 전에 원본 재질로 되돌리고 복제본을 해제한다
  registry.onBeforeRemove((entry) => {
    entry.object3D.traverse((o) => {
      if (!o.isMesh) return;
      const st = states.get(o);
      if (!st) return;
      dropOwned(o, st);
      o.visible = st.userVisible;
      states.delete(o);
    });
  });

  return {
    setColor,
    setOpacity,
    setVisible,
    restore,
    setHighlight,
    isolate,
    ghostOthers,
    clearIsolation,
    clearGhost,
    showAll,
    setClip,
    apply,
    get isolatedId() { return isolatedId; },
    get ghostId() { return ghostId; },
    ownedCount() {
      let n = 0;
      for (const st of states.values()) if (st.owned) n += 1;
      return n;
    },
  };
}
