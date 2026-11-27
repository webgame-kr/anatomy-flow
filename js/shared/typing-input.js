// 입력창 처리: 한글 IME 조합 중에는 판정하지 않고, 완성된 입력만 제출한다

export function setupTyping(input, button, { onSubmit, onAutoCheck }) {
  let composing = false;
  let enterDuringComposition = false;
  let locked = false;
  let lastSubmit = 0;

  input.addEventListener('compositionstart', () => {
    composing = true;
  });

  input.addEventListener('compositionend', () => {
    composing = false;
    // 조합 중에 Enter를 눌렀다면, 조합이 끝난 값으로 한 번만 제출한다
    if (enterDuringComposition) {
      enterDuringComposition = false;
      setTimeout(fire, 0);
    } else {
      setTimeout(autoCheck, 0);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.isComposing || composing || e.keyCode === 229) {
      enterDuringComposition = true;
      return;
    }
    fire();
  });

  input.addEventListener('input', (e) => {
    if (composing || e.isComposing) return;
    autoCheck();
  });

  button.addEventListener('click', () => {
    // 버튼을 누르면 입력창 조합이 먼저 끝나므로 한 박자 뒤에 제출
    setTimeout(fire, 0);
  });

  function fire() {
    if (locked || composing) return;
    const now = performance.now();
    if (now - lastSubmit < 200) return;   // Enter 이벤트가 겹쳐 들어오는 브라우저 대비
    lastSubmit = now;
    onSubmit(input.value);
  }

  function autoCheck() {
    if (locked || composing) return;
    if (onAutoCheck && onAutoCheck(input.value)) fire();
  }

  return {
    lock(value) {
      locked = value;
      input.readOnly = value;
      button.disabled = value;
    },
    enable() {
      input.disabled = false;
      button.disabled = locked;
    },
    clear() {
      input.value = '';
    },
    focus() {
      if (window.matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
    },
    get isComposing() {
      return composing;
    },
  };
}
