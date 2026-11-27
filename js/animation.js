// Animation Engine: requestAnimationFrame으로 SVG 경로를 따라 이동

const active = new Set();

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// pathEl 위를 duration(ms) 동안 이동한다. reverse면 끝에서 처음으로.
// 탭이 숨겨져 rAF가 멈춰도 끝나도록 시간 초과 안전장치를 둔다.
export function moveAlong(pathEl, { duration = 1000, reverse = false, onFrame, onDone }) {
  const length = pathEl.getTotalLength();
  let startTime = null;
  let frame = 0;
  let finished = false;

  const handle = {
    cancel() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      clearTimeout(safety);
      active.delete(handle);
    },
  };

  function render(progress) {
    const eased = easeInOut(progress);
    const along = reverse ? 1 - eased : eased;
    const point = pathEl.getPointAtLength(along * length);
    if (onFrame) onFrame(point, eased);
  }

  function finish() {
    if (finished) return;
    render(1);
    finished = true;
    cancelAnimationFrame(frame);
    clearTimeout(safety);
    active.delete(handle);
    if (onDone) onDone();
  }

  function step(now) {
    if (finished) return;
    if (startTime === null) startTime = now;
    const progress = Math.min(1, (now - startTime) / duration);
    if (progress >= 1) {
      finish();
      return;
    }
    render(progress);
    frame = requestAnimationFrame(step);
  }

  const safety = setTimeout(finish, duration + 1500);
  active.add(handle);
  render(0);
  frame = requestAnimationFrame(step);
  return handle;
}

export function cancelAll() {
  for (const handle of [...active]) handle.cancel();
}

export function activeCount() {
  return active.size;
}
