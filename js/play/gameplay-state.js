// 게임 진행 상태 머신 (STEP 03-D)
// 상태마다 허용되는 사용자 입력과 다음 상태를 표로 정한다. 표에 없는 전이는 거절하고 기록만 남긴다.
//
//   loading ──▶ ready ──start──▶ waiting_input ⇄ waiting_choice (후보가 여러 개인 분기)
//                                     │ submit
//                                     ▼
//                                 checking ──wrong──▶ waiting_*
//                                     │ correct (이동 있음)
//                                     ▼
//                              transitioning ──도착──▶ waiting_* / completed
//                                     │ 이동 실패·취소
//                                     ▼
//                                   error(복구 가능) ──retry──▶ transitioning
//                                                   └─recover─▶ waiting_*
//   waiting_* / transitioning ──pause──▶ paused ──resume──▶ (이전 상태)
//   어느 상태든 ──restart──▶ loading ──▶ waiting_input (session 번호 증가)

export const STATES = ['loading', 'ready', 'waiting_input', 'checking', 'transitioning', 'waiting_choice', 'paused', 'completed', 'error'];

// 상태별 허용 입력
export const ALLOWED = {
  loading: [],
  ready: ['start', 'set_mode', 'settings'],
  waiting_input: ['submit', 'hint', 'reveal', 'pause', 'restart', 'end', 'settings', 'camera'],
  waiting_choice: ['submit', 'hint', 'reveal', 'pause', 'restart', 'end', 'settings', 'camera'],
  checking: ['restart', 'end', 'settings', 'camera'],        // 판정 중: 제출·일시정지 금지 (중복 요청 방지). 늦은 응답은 세션으로 버린다
  transitioning: ['pause', 'restart', 'end', 'settings', 'camera'],
  paused: ['resume', 'restart', 'end', 'settings', 'camera'],
  completed: ['restart', 'set_mode', 'settings', 'camera', 'export'],
  error: ['retry', 'recover', 'restart', 'end', 'settings', 'camera'],
};

const NEXT = {
  loading: ['ready', 'waiting_input', 'waiting_choice', 'error', 'completed'],
  ready: ['loading', 'waiting_input', 'waiting_choice', 'error'],
  waiting_input: ['checking', 'paused', 'loading', 'completed', 'error', 'waiting_choice', 'waiting_input'],
  waiting_choice: ['checking', 'paused', 'loading', 'completed', 'error', 'waiting_input', 'waiting_choice'],
  checking: ['waiting_input', 'waiting_choice', 'transitioning', 'completed', 'error', 'loading'],
  transitioning: ['waiting_input', 'waiting_choice', 'completed', 'paused', 'error', 'loading'],
  paused: ['waiting_input', 'waiting_choice', 'transitioning', 'loading', 'completed', 'error'],
  completed: ['loading', 'ready'],
  error: ['transitioning', 'waiting_input', 'waiting_choice', 'loading', 'completed'],
};

export function createStateMachine({ onChange = () => {}, log = () => {} } = {}) {
  let state = 'loading';
  let before = null;          // paused 직전 상태
  const history = [];

  function can(action) { return ALLOWED[state].includes(action); }

  function to(next, reason = '') {
    if (next === state) return true;
    if (!NEXT[state].includes(next)) {
      log(`상태 전이 거절: ${state} → ${next}${reason ? ` (${reason})` : ''}`, 'warn');
      return false;
    }
    const prev = state;
    if (next === 'paused') before = prev;
    state = next;
    history.push({ from: prev, to: next, reason, t: Math.round(performance.now()) });
    if (history.length > 200) history.shift();
    onChange(next, prev, reason);
    return true;
  }

  return {
    can,
    to,
    get state() { return state; },
    get beforePause() { return before; },
    history: () => [...history],
    // 강제 전환 (restart·fatal): 표와 무관하게 loading/error로
    force(next, reason = '') {
      const prev = state;
      state = next;
      history.push({ from: prev, to: next, reason, forced: true, t: Math.round(performance.now()) });
      onChange(next, prev, reason);
    },
  };
}
