// 3D Viewport: Scene, Renderer, Camera, Light, Helper, OrbitControls, 반응형, 렌더링 루프

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CAMERA_HOME = new THREE.Vector3(7, 6, 9);
const TARGET_HOME = new THREE.Vector3(0, 0.5, 0);

export function checkWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { ok: false, reason: '이 브라우저 또는 그래픽 드라이버가 WebGL을 지원하지 않습니다.' };
    return { ok: true, version: canvas.getContext('webgl2') ? 'WebGL 2' : 'WebGL 1' };
  } catch (err) {
    return { ok: false, reason: `WebGL 확인 중 오류: ${err.message}` };
  }
}

export function createViewport(container, { onFrame, onStats, onContextLost } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f5f8);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.position.copy(CAMERA_HOME);

  // 조명
  const ambient = new THREE.AmbientLight(0xffffff, 1.2);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(5, 10, 7);
  scene.add(ambient, sun);

  // 보조 도구 (바닥 격자, 축: x 빨강 · y 초록 · z 파랑)
  const grid = new THREE.GridHelper(20, 20, 0x9aa4b2, 0xd5dae2);
  const axes = new THREE.AxesHelper(3);
  axes.position.y = 0.002;
  scene.add(grid, axes);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(TARGET_HOME);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI * 0.495;   // 바닥 아래로 내려가지 않게
  controls.update();

  // 화면 크기 변화 대응
  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (onContextLost) onContextLost();
  });

  // 렌더링 루프 (Python은 여기서 부르지 않는다)
  const clock = new THREE.Clock();
  let frames = 0;
  let statTime = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (onFrame) onFrame(dt);
    controls.update();
    renderer.render(scene, camera);
    frames += 1;
    statTime += dt;
    if (statTime >= 0.5) {
      if (onStats) {
        onStats({
          fps: Math.round(frames / statTime),
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          size: `${renderer.domElement.width}×${renderer.domElement.height}`,
        });
      }
      frames = 0;
      statTime = 0;
    }
  });

  // 클릭(드래그가 아닌 짧은 클릭)으로 객체 선택
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = null;
  function pick(clientX, clientY, meshes) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length > 0 ? hits[0].object : null;
  }
  function onPick(handler, getMeshes) {
    renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (!downAt) return;
      const moved = Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y);
      downAt = null;
      if (moved > 5) return;   // 회전 드래그였음
      handler(pick(e.clientX, e.clientY, getMeshes()));
    });
  }

  function resetCamera() {
    camera.position.copy(CAMERA_HOME);
    controls.target.copy(TARGET_HOME);
    controls.update();
  }

  return { THREE, scene, renderer, camera, controls, onPick, resetCamera };
}
