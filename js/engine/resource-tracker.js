// 그래픽 리소스(Geometry, Material, Texture) 참조 수 관리
// 여러 객체나 장면이 같은 리소스를 공유할 수 있으므로, 참조가 0이 될 때만 dispose한다.

function materialsOf(obj) {
  if (!obj.material) return [];
  return Array.isArray(obj.material) ? obj.material : [obj.material];
}

function texturesOf(material) {
  const list = [];
  for (const key of Object.keys(material)) {
    const value = material[key];
    if (value && value.isTexture) list.push(value);
  }
  if (material.uniforms) {
    for (const u of Object.values(material.uniforms)) {
      if (u && u.value && u.value.isTexture) list.push(u.value);
    }
  }
  return list;
}

export function createResourceTracker() {
  const counts = new Map();
  const disposeListeners = new Set();

  function eachResource(object3D, fn) {
    object3D.traverse((o) => {
      if (o.geometry) fn(o.geometry);
      for (const m of materialsOf(o)) {
        fn(m);
        for (const t of texturesOf(m)) fn(t);
      }
    });
  }

  function retainResource(res) {
    counts.set(res, (counts.get(res) || 0) + 1);
  }

  function releaseResource(res) {
    const next = (counts.get(res) || 0) - 1;
    if (next > 0) {
      counts.set(res, next);
      return false;
    }
    counts.delete(res);
    if (typeof res.dispose === 'function') res.dispose();
    for (const fn of disposeListeners) fn(res);
    return true;
  }

  return {
    retain(object3D) { eachResource(object3D, retainResource); },
    release(object3D) { eachResource(object3D, releaseResource); },
    retainResource,
    releaseResource,
    onDispose(fn) { disposeListeners.add(fn); },
    count(res) { return counts.get(res) || 0; },
    stats() {
      let geometries = 0;
      let materials = 0;
      let textures = 0;
      for (const res of counts.keys()) {
        if (res.isBufferGeometry) geometries += 1;
        else if (res.isMaterial) materials += 1;
        else if (res.isTexture) textures += 1;
      }
      return { geometries, materials, textures };
    },
  };
}
