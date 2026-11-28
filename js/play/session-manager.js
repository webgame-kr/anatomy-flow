// 학습 세션 관리 (STEP 03-D): 세션 ID, 요청 ID, 학습 시간 타이머, 기록 저장
// - 세션 ID는 시작·재시작·콘텐츠 변경마다 바뀐다. 비동기 응답은 보낼 때의 세션 ID와 같을 때만 반영한다.
// - 학습 시간(active_learning_time)은 일시정지와 탭 비활성 시간을 빼고 잰다.
// - 기록 계산과 CSV 문자열은 Python(record_engine.py)이 만들고, 여기서는 저장(LocalStorage)만 한다.

import { downloadCsv } from '../shared/records.js';

const KEY_V2 = 'nurseflow.records.v2';
const KEY_V1 = 'flowengine.records.v1';     // v0.1 기록 (읽기만, CSV에 함께 내보냄)
const MAX = 500;

export function createSessionManager() {
  let sessionNo = 0;
  let sessionId = '';
  let reqNo = 0;
  let startedAt = null;
  let activeMs = 0;
  let runningSince = null;      // 시간을 재는 중이면 시작 시각
  let pausedReason = new Set(); // 'pause' | 'hidden' | 'transition-free' 등

  function newSession() {
    sessionNo += 1;
    const rand = Math.random().toString(36).slice(2, 8);
    sessionId = `s${Date.now().toString(36)}-${rand}`;
    startedAt = new Date();
    activeMs = 0;
    runningSince = null;
    pausedReason = new Set();
    return sessionNo;
  }

  function startClock() { if (runningSince === null && pausedReason.size === 0) runningSince = performance.now(); }
  function stopClock() { if (runningSince !== null) { activeMs += performance.now() - runningSince; runningSince = null; } }
  function hold(reason) { pausedReason.add(reason); stopClock(); }
  function release(reason) { pausedReason.delete(reason); startClock(); }

  // 탭이 비활성화되면 학습 시간을 멈춘다
  document.addEventListener('visibilitychange', () => {
    if (!startedAt) return;
    if (document.hidden) hold('hidden');
    else release('hidden');
  });

  function activeSeconds() {
    return (activeMs + (runningSince !== null ? performance.now() - runningSince : 0)) / 1000;
  }

  // ---------- 기록 저장 ----------
  function read(key) {
    try {
      const t = localStorage.getItem(key);
      const list = t ? JSON.parse(t) : [];
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function loadRecords() {
    return [...read(KEY_V1), ...read(KEY_V2)];
  }

  // 결과: { ok, error } — 저장 공간 부족·비활성 환경이면 ok=false (게임은 계속)
  function saveRecord(record) {
    const list = read(KEY_V2);
    list.push(record);
    try {
      localStorage.setItem(KEY_V2, JSON.stringify(list.slice(-MAX)));
      return { ok: true, count: Math.min(list.length, MAX) };
    } catch (err) {
      return { ok: false, error: err && err.name === 'QuotaExceededError' ? '저장 공간이 부족합니다' : `저장할 수 없습니다 (${err && err.message ? err.message : err})` };
    }
  }

  function clearRecords() {
    try { localStorage.removeItem(KEY_V2); return true; } catch (err) { return false; }
  }

  return {
    newSession,
    nextRequest() { reqNo += 1; return reqNo; },
    isCurrent(no) { return no === sessionNo; },
    startClock,
    stopClock,
    hold,
    release,
    activeSeconds,
    loadRecords,
    saveRecord,
    clearRecords,
    downloadCsv,
    get no() { return sessionNo; },
    get id() { return sessionId; },
    get startedAt() { return startedAt; },
  };
}
