// 학습 모드 정책 (STEP 03-D): 무엇을 보여 주고 무엇을 숨기는지
// - guide: 정답(한·영), 설명, 다음 위치를 모두 보여 준다.
// - memory: 정답을 숨기고 다음 구조의 위치(3D 강조)와 힌트를 준다.
// - reasoning: 앞 기전과 다음 현상을 잇는 질문(reason_prompt)을 보여 준다. 정답·위치를 숨기고, 맞힌 뒤 설명을 보여 준다.
// 정답 노출 경로(라벨, 진행 목록, Hover 툴팁, 질문 문구)를 모두 이 정책으로 거른다.
// 학습자가 "정답 보기"를 누르면(힌트로 기록) 그 문제의 정답을 보여 준다.

export const MODES = {
  guide: { id: 'guide', name_ko: '가이드', desc: '정답과 설명을 보면서 기전 순서를 익힙니다.' },
  memory: { id: 'memory', name_ko: '암기', desc: '정답을 숨깁니다. 3D 위치와 힌트를 보고 용어를 입력합니다.' },
  reasoning: { id: 'reasoning', name_ko: '기전 추론', desc: '원인과 결과를 잇는 질문에 답합니다. 정답 뒤에 설명을 봅니다.' },
};

export function createLearningMode(id = 'guide') {
  let mode = MODES[id] ? id : 'guide';
  const revealed = new Set();   // 이번 문제에서 정답 보기를 누른 노드

  // 이미 배운(완료한) 노드인지
  const learned = (view, nodeId) => !!view && view.completed.includes(nodeId);

  return {
    set(id2) { if (MODES[id2]) mode = id2; },
    get id() { return mode; },
    get info() { return MODES[mode]; },
    resetQuestion() { revealed.clear(); },
    reveal(nodeIds) { for (const n of nodeIds) revealed.add(n); },

    // 이 노드의 이름을 보여도 되는가 (라벨, 진행 목록, Hover)
    canShowName(view, nodeId) {
      if (mode === 'guide') return true;
      return learned(view, nodeId) || revealed.has(nodeId);
    },

    // 다음 위치(후보 구조)를 3D로 강조할지
    highlightNext() { return mode !== 'reasoning'; },

    // 지금 문제 문구 (후보 목록 → 화면에 보일 질문)
    question(view, candidates) {
      if (!candidates.length) return { title: '', lines: [] };
      const many = candidates.length > 1;
      const lines = [];
      for (const c of candidates) {
        const show = mode === 'guide' || revealed.has(c.node);
        const ask = mode === 'reasoning' ? (c.reason_prompt || c.prompt) : c.prompt;
        lines.push({
          node: c.node,
          text: ask || (show ? `${c.ko}` : '다음 구조의 이름은?'),
          answer: show ? `${c.ko}${c.en ? ` · ${c.en}` : ''}` : '',
          status: c.verification_status,
          seen: c.seen,
        });
      }
      return { title: many ? `갈림길: ${candidates.length}개 경로 중 하나를 골라 입력하세요` : '', lines };
    },

    // 맞힌 뒤 보여 줄 설명 (모든 모드: 도착한 구조 설명)
    explainAfter() { return true; },
  };
}
