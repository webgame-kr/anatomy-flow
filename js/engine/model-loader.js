// Model Loader: GLB / glTF 불러오기, 진행률, 구조 분석, 중복 로딩 방지, 해제
// 로컬 파일은 브라우저 안에서만 읽는다(외부 서버로 보내지 않음).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const THREE_VERSION = '0.160.0';
const DRACO_PATH = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/libs/draco/gltf/`;

function baseName(url) {
  const clean = decodeURIComponent(String(url).split(/[?#]/)[0]);
  return clean.substring(clean.lastIndexOf('/') + 1);
}

// 모델 구조 요약 (노드·Mesh·재질·텍스처·삼각형·애니메이션·크기)
export function analyze(root, animations = []) {
  let nodes = 0;
  let meshes = 0;
  let triangles = 0;
  const materials = new Set();
  const textures = new Set();
  const names = new Map();
  root.traverse((o) => {
    nodes += 1;
    names.set(o.name, (names.get(o.name) || 0) + 1);
    if (!o.isMesh) return;
    meshes += 1;
    const geo = o.geometry;
    const count = geo.index ? geo.index.count : (geo.attributes.position ? geo.attributes.position.count : 0);
    triangles += Math.floor(count / 3);
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      materials.add(m);
      for (const v of Object.values(m)) if (v && v.isTexture) textures.add(v);
    }
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.isEmpty() ? [0, 0, 0] : box.getSize(new THREE.Vector3()).toArray().map((n) => Math.round(n * 1000) / 1000);
  const duplicateNames = [...names.entries()].filter(([n, c]) => n && c > 1).map(([n]) => n);
  return {
    nodes, meshes, triangles,
    materials: materials.size, textures: textures.size,
    animations: animations.map((a) => a.name || '(이름 없음)'),
    size, duplicateNames,
  };
}

export function createModelLoader({ onStatus } = {}) {
  const loading = new Map();   // key -> Promise (같은 모델을 동시에 두 번 받지 않기)
  let dracoLoader = null;

  function status(state, detail) {
    if (onStatus) onStatus(state, detail);
  }

  function makeLoader(manager) {
    const loader = new GLTFLoader(manager);
    if (!dracoLoader) {
      dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(DRACO_PATH);
    }
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader;
  }

  function finish(gltf, key, label) {
    const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
    if (!root) throw new Error('모델에 장면(scene)이 없습니다.');
    root.name = root.name || label;
    const report = analyze(root, gltf.animations || []);
    return { key, label, root, animations: gltf.animations || [], report };
  }

  // URL에서 불러오기 (GitHub Pages 상대 경로)
  function loadUrl(url, label) {
    const key = `url:${url}`;
    if (loading.has(key)) return loading.get(key);
    const promise = new Promise((resolve, reject) => {
      status('loading', { label, percent: null });
      makeLoader().load(url, (gltf) => {
        try {
          const result = finish(gltf, key, label || baseName(url));
          status('done', { label });
          resolve(result);
        } catch (err) {
          status('error', { label, message: err.message });
          reject(err);
        }
      }, (e) => {
        // 서버가 전체 크기를 알려 주지 않으면 진행률을 계산할 수 없다
        if (e.lengthComputable && e.total > 0) status('loading', { label, percent: Math.round((e.loaded / e.total) * 100) });
        else status('loading', { label, percent: null, loaded: e.loaded });
      }, (err) => {
        const message = describeError(err, url);
        status('error', { label, message });
        reject(new Error(message));
      });
    }).finally(() => loading.delete(key));
    loading.set(key, promise);
    return promise;
  }

  // 사용자가 고른 로컬 파일들. .glb 하나, 또는 .gltf + .bin + 텍스처 세트
  async function loadFiles(fileList) {
    const files = [...fileList];
    const main = files.find((f) => /\.glb$/i.test(f.name)) || files.find((f) => /\.gltf$/i.test(f.name));
    if (!main) throw new Error('.glb 또는 .gltf 파일을 선택하세요.');
    const key = `file:${main.name}:${main.size}:${main.lastModified}`;
    if (loading.has(key)) return loading.get(key);
    const label = main.name;

    const promise = (async () => {
      status('loading', { label, percent: null });
      const blobUrls = new Map();
      for (const f of files) if (f !== main) blobUrls.set(f.name, URL.createObjectURL(f));
      const missing = [];
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) return url;
        const name = baseName(url);
        if (blobUrls.has(name)) return blobUrls.get(name);
        missing.push(name);
        // 선택하지 않은 파일은 서버에 요청하지 않는다 (빈 데이터 → 로딩 실패로 처리)
        return 'data:application/octet-stream;base64,';
      });
      try {
        const buffer = await main.arrayBuffer();
        const loader = makeLoader(manager);
        const gltf = await new Promise((resolve, reject) => {
          loader.parse(buffer, '', resolve, reject);
        });
        if (missing.length > 0) {
          status('warn', { label, message: `함께 선택되지 않은 파일: ${[...new Set(missing)].join(', ')}` });
        }
        const result = finish(gltf, key, label);
        status('done', { label });
        return result;
      } catch (err) {
        let message = describeError(err, label);
        if (missing.length > 0) {
          message = `glTF가 참조하는 파일을 찾지 못했습니다: ${[...new Set(missing)].join(', ')}. .gltf와 .bin, 텍스처 파일을 함께 선택하세요.`;
        }
        status('error', { label, message });
        throw new Error(message);
      } finally {
        for (const u of blobUrls.values()) URL.revokeObjectURL(u);
      }
    })().finally(() => loading.delete(key));
    loading.set(key, promise);
    return promise;
  }

  return { loadUrl, loadFiles, get busy() { return loading.size > 0; } };
}

function describeError(err, where) {
  const text = String((err && err.message) || err || '');
  if (/404|Not Found/i.test(text) || (err && err.target && err.target.status === 404)) {
    return `모델 파일이 없습니다 (${where}). 로컬 전용 모델이거나 경로가 잘못되었습니다.`;
  }
  if (/KHR_draco|draco/i.test(text)) return `Draco 압축 해제에 실패했습니다: ${text}`;
  if (/Unexpected token|JSON/i.test(text)) return `glTF 형식이 올바르지 않습니다: ${text.slice(0, 160)}`;
  return `모델을 불러오지 못했습니다: ${text.slice(0, 200) || where}`;
}
