// 하단 Status Bar, 이벤트 로그, Debug 오버레이

export function createDebugPanel() {
  const $ = (id) => document.getElementById(id);
  const el = {
    fps: $('s-fps'), objects: $('s-objects'), render: $('s-render'), memory: $('s-memory'),
    pyDot: $('py-dot'), pyStatus: $('py-status'), load: $('s-load'), progress: $('s-progress'),
    logBtn: $('btn-log'), last: $('s-last'), drawer: $('log-drawer'), log: $('log'),
    debugBtn: $('btn-debug'), debugBox: $('debug-box'),
  };
  let count = 0;
  let debugOn = false;
  let errors = 0;

  el.logBtn.addEventListener('click', () => {
    el.drawer.hidden = !el.drawer.hidden;
    el.logBtn.setAttribute('aria-expanded', String(!el.drawer.hidden));
    if (!el.drawer.hidden) {
      el.logBtn.classList.remove('error');
      errors = 0;
    }
  });
  el.debugBtn.addEventListener('click', () => {
    debugOn = !debugOn;
    el.debugBtn.setAttribute('aria-pressed', String(debugOn));
    el.debugBox.hidden = !debugOn;
  });

  function log(text, level = '') {
    count += 1;
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const li = document.createElement('li');
    li.value = count;
    li.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${text}`;
    if (level) li.className = level;
    el.log.prepend(li);
    while (el.log.children.length > 300) el.log.lastChild.remove();
    el.last.textContent = text;
    if (level === 'error') {
      errors += 1;
      if (el.drawer.hidden) el.logBtn.classList.add('error');
    }
  }

  function stats(s) {
    el.fps.textContent = String(s.fps);
    el.render.textContent = `draw ${s.calls} · 삼각형 ${s.triangles.toLocaleString()}`;
    el.memory.textContent = `GPU geo ${s.geometries} · tex ${s.textures}`;
  }

  function objects(n) {
    el.objects.textContent = String(n);
  }

  function python(state, text) {
    el.pyDot.className = `dot ${state}`;
    el.pyStatus.textContent = text;
  }

  // 모델 로딩 상태: percent가 null이면 진행률을 알 수 없는 로딩(막대가 흐르는 표시)
  function loading(state, detail = {}) {
    if (state === 'loading') {
      el.progress.hidden = false;
      if (detail.percent === null || detail.percent === undefined) {
        el.progress.removeAttribute('value');
        el.load.textContent = `모델: ${detail.label} 불러오는 중${detail.loaded ? ` (${Math.round(detail.loaded / 1024)}KB)` : ''}`;
      } else {
        el.progress.value = detail.percent;
        el.load.textContent = `모델: ${detail.label} ${detail.percent}%`;
      }
    } else {
      el.progress.hidden = true;
      if (state === 'done') el.load.textContent = `모델: ${detail.label} 완료`;
      else if (state === 'error') el.load.textContent = `모델: 실패 (${detail.label})`;
      else if (state === 'warn') el.load.textContent = `모델: 경고 (${detail.label})`;
      else el.load.textContent = '모델: 대기';
    }
  }

  function debug(text) {
    if (debugOn) el.debugBox.textContent = text;
  }

  return { log, stats, objects, python, loading, debug, get debugOn() { return debugOn; }, get errorCount() { return errors; } };
}
