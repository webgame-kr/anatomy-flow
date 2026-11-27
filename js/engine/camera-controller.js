// Camera Controller: Orbit(OrbitControls) 위에 Focus · Overview · Presets · 부드러운 이동
// 모델 크기가 달라도 Bounding Sphere 반지름으로 거리·near·far·확대 범위를 계산한다.

import * as THREE from 'three';
import { boxOf } from './object-registry.js';

// 프리셋 방향 (모델이 +Z 쪽을 바라보고 Y가 위인 기준. 장면의 coordinate_system으로 바꿀 수 있다)
// 좌측/우측 = 모델의 해부학적 좌측/우측 면을 보는 시점 (+Z를 보는 모델의 왼쪽은 +X)
const PRESETS = {
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(1, 0, 0),
  right: new THREE.Vector3(-1, 0, 0),
  top: new THREE.Vector3(0, 1, 0.0001),
  iso: new THREE.Vector3(1, 0.75, 1),
};
const PRESET_NAMES = { front: '정면', back: '후면', left: '좌측', right: '우측', top: '상단', iso: '사선' };

export function createCameraController({ camera, controls, registry }) {
  let anim = null;          // 진행 중인 카메라 이동 (하나만)
  let home = { position: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
  let followId = null;      // STEP 03 확장: 추적 대상
  let frame = { front: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) };

  // 사용자가 직접 조작하면 진행 중인 이동을 멈춘다
  controls.addEventListener('start', () => { anim = null; });

  function setHome(position, target, fov) {
    home = { position: new THREE.Vector3(...position), target: new THREE.Vector3(...target), fov: fov || camera.fov };
  }

  // 장면 좌표계: front 방향(예: '+Z', '-Y')을 프리셋 기준으로 쓴다
  function setCoordinateSystem(cs = {}) {
    const parse = (s, fallback) => {
      const m = /^([+-])([XYZ])$/i.exec(String(s || ''));
      if (!m) return fallback.clone();
      const v = new THREE.Vector3();
      v[m[2].toLowerCase()] = m[1] === '-' ? -1 : 1;
      return v;
    };
    frame = { front: parse(cs.front, new THREE.Vector3(0, 0, 1)), up: parse(cs.up, new THREE.Vector3(0, 1, 0)) };
  }

  function presetDirection(name) {
    // 기본 프리셋(+Z front, +Y up)을 장면 좌표계로 회전
    const base = PRESETS[name];
    if (!base) return null;
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3().crossVectors(frame.up, frame.front).normalize(), frame.up, frame.front,
    );
    return base.clone().applyMatrix4(m).normalize();
  }

  function fitDistance(radius) {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const fov = Math.min(vFov, hFov);
    return (radius / Math.sin(fov / 2)) * 1.1;
  }

  // 크기에 맞춰 near/far와 확대 범위를 조정
  function adaptRange(radius, distance) {
    camera.near = Math.max(0.001, distance / 500);
    camera.far = Math.max(100, distance * 50 + radius * 10);
    camera.updateProjectionMatrix();
    controls.minDistance = Math.max(0.01, radius * 0.15);
    controls.maxDistance = Math.max(controls.minDistance * 10, distance * 8);
  }

  function animateTo(position, target, duration = 700) {
    anim = {
      t: 0,
      duration: Math.max(0.001, duration / 1000),
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: position.clone(),
      toTarget: target.clone(),
    };
    if (duration <= 0) tick(1);
  }

  // 렌더링 루프에서 매 프레임 호출
  function tick(dt) {
    if (anim) {
      anim.t = Math.min(anim.duration, anim.t + dt);
      const p = anim.t / anim.duration;
      const k = 1 - Math.pow(1 - p, 3);
      camera.position.lerpVectors(anim.fromPos, anim.toPos, k);
      controls.target.lerpVectors(anim.fromTarget, anim.toTarget, k);
      if (p >= 1) anim = null;
    } else if (followId && registry.has(followId)) {
      // STEP 03 확장: 이동 객체 추적 (지금은 대상 중심으로 target만 따라간다)
      const c = boxOf(registry.get(followId).object3D).getCenter(new THREE.Vector3());
      const delta = c.sub(controls.target).multiplyScalar(Math.min(1, dt * 4));
      controls.target.add(delta);
      camera.position.add(delta);
    }
  }

  function focusBox(box, { direction = null, duration = 700 } = {}) {
    if (!box || box.isEmpty()) return false;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.001);
    const distance = fitDistance(radius);
    const dir = direction ? direction.clone().normalize()
      : camera.position.clone().sub(controls.target).normalize();
    if (!isFinite(dir.x) || dir.lengthSq() === 0) dir.set(1, 0.75, 1).normalize();
    adaptRange(radius, distance);
    animateTo(sphere.center.clone().add(dir.multiplyScalar(distance)), sphere.center, duration);
    return true;
  }

  function focus(id, opts) {
    const entry = registry.get(id);
    if (!entry) return false;
    return focusBox(boxOf(entry.object3D), opts);
  }

  function sceneBox() {
    const box = new THREE.Box3();
    for (const id of registry.roots()) box.union(boxOf(registry.get(id).object3D));
    return box;
  }

  function overview(opts = {}) {
    const box = sceneBox();
    if (box.isEmpty()) {
      animateTo(home.position, home.target, opts.duration ?? 700);
      return false;
    }
    return focusBox(box, { direction: opts.direction || presetDirection('iso'), duration: opts.duration ?? 700 });
  }

  function preset(name, id = null) {
    const dir = presetDirection(name);
    if (!dir) return false;
    const box = id && registry.has(id) ? boxOf(registry.get(id).object3D) : sceneBox();
    if (box.isEmpty()) return false;
    return focusBox(box, { direction: dir });
  }

  function resetHome(duration = 0) {
    if (home.fov !== camera.fov) {
      camera.fov = home.fov;
      camera.updateProjectionMatrix();
    }
    camera.near = 0.1;
    camera.far = 500;
    camera.updateProjectionMatrix();
    controls.minDistance = 0.5;
    controls.maxDistance = 80;
    animateTo(home.position, home.target, duration);
  }

  function state() {
    return { position: camera.position.toArray(), target: controls.target.toArray() };
  }

  function restoreState(s) {
    if (!s) return;
    animateTo(new THREE.Vector3(...s.position), new THREE.Vector3(...s.target), 0);
  }

  return {
    tick,
    focus,
    focusBox,
    overview,
    preset,
    resetHome,
    setHome,
    setCoordinateSystem,
    state,
    restoreState,
    setFollowTarget(id) { followId = id; },
    get followTarget() { return followId; },
    get animating() { return !!anim; },
    presetNames: PRESET_NAMES,
  };
}
