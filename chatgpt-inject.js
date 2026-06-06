'use strict';

// chatgpt.com 전용: 프롬프트 자동 주입 스크립트

(async () => {
  const KEY = 'ai_pending_chatgpt';
  const result = await chrome.storage.local.get(KEY);
  const pending = result[KEY];

  if (!pending) return;
  if (Date.now() - pending.ts > 30000) return;

  await chrome.storage.local.remove(KEY);

  // ChatGPT의 입력창 셀렉터 (우선순위 순)
  // div#prompt-textarea 는 ProseMirror 기반 contenteditable
  const selectors = [
    'div#prompt-textarea[contenteditable="true"]',
    '#prompt-textarea',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][data-placeholder]',
    'textarea#prompt-textarea',
    'textarea',
  ];

  const input = await waitForInput(selectors);
  if (!input) {
    console.error('[AskAI] ChatGPT 입력창을 찾지 못했습니다.');
    return;
  }

  const maxAttempts = 20; // 300ms × 20 = 6초
  let attempt = 0;

  const interval = setInterval(() => {
    attempt++;
    const el = selectors.reduce((f, s) => f || document.querySelector(s), null) || input;

    el.focus();
    const success = tryInject(el, pending.prompt);

    const currentText = el.tagName === 'TEXTAREA' ? el.value : el.textContent;
    if (success && currentText.trim().length > 0) {
      clearInterval(interval);
      moveCursorToEnd(el);
      console.log('[AskAI] ChatGPT 주입 성공 (attempt:', attempt, ')');
      return;
    }

    if (attempt >= maxAttempts) {
      clearInterval(interval);
      console.error('[AskAI] ChatGPT 주입 실패 - 최대 시도 초과');
    }
  }, 300);
})();

// ── 커서 끝으로 이동 ──────────────────────────────────────────
function moveCursorToEnd(el) {
  el.focus();
  if (el.tagName === 'TEXTAREA') {
    el.selectionStart = el.selectionEnd = el.value.length;
    el.scrollTop = el.scrollHeight;
  } else {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    // 커서가 화면에 보이도록 스크롤
    const rect = range.getBoundingClientRect();
    if (rect.bottom > window.innerHeight || rect.top < 0) {
      el.scrollTop = el.scrollHeight;
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

// ── 주입 시도 ─────────────────────────────────────────────────
function tryInject(el, text) {
  if (!el || !document.body.contains(el)) return false;

  // ── TEXTAREA 처리 ──
  if (el.tagName === 'TEXTAREA') {
    // M1: React native setter
    try {
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (el.value.trim() === text.trim()) return true;
    } catch {}

    // M2: execCommand
    try {
      el.focus(); el.select();
      if (document.execCommand('insertText', false, text) && el.value.trim()) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    } catch {}

    // M3: direct value
    try {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (el.value.trim()) return true;
    } catch {}

    return false;
  }

  // ── CONTENTEDITABLE 처리 (ChatGPT ProseMirror) ──

  // M1: beforeinput + insertText — ProseMirror가 직접 처리하는 이벤트
  try {
    el.focus();
    // 기존 내용 전체 선택 후 삭제
    document.execCommand('selectAll', false, null);
    el.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: text,
      bubbles: true,
      cancelable: true,
    }));
    el.dispatchEvent(new InputEvent('input', {
      inputType: 'insertText',
      data: text,
      bubbles: true,
    }));
    if (el.textContent.trim().length > 0) return true;
  } catch {}

  // M2: ClipboardEvent paste (가장 자연스러운 방법)
  try {
    el.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dt, bubbles: true, cancelable: true,
    }));
    if (el.textContent.trim().length > 0) return true;
  } catch {}

  // M3: selectAll + execCommand insertText
  try {
    el.click(); el.focus();
    document.execCommand('selectAll', false, null);
    if (document.execCommand('insertText', false, text)) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (el.textContent.trim().length > 0) return true;
    }
  } catch {}

  // M4: innerHTML + <p> 삽입
  try {
    el.focus();
    el.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = text;
    el.appendChild(p);
    const range = document.createRange();
    range.setStartAfter(p); range.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(range);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
    if (el.textContent.trim().length > 0) return true;
  } catch {}

  // M5: innerText fallback
  try {
    el.innerText = text;
    ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
    if (el.textContent.trim().length > 0) return true;
  } catch {}

  return false;
}

// ── 입력창 대기 (최대 15초, MutationObserver) ─────────────────
function waitForInput(selectors, maxMs = 15000) {
  return new Promise(resolve => {
    const find = () => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && !el.disabled) return el;
      }
      return null;
    };

    const el = find();
    if (el) {
      // 이미 있으면 800ms 후 반환 (React 초기화 대기)
      setTimeout(() => resolve(el), 800);
      return;
    }

    const timer = setTimeout(() => { ob.disconnect(); resolve(null); }, maxMs);
    const ob = new MutationObserver(() => {
      const el = find();
      if (el) {
        clearTimeout(timer);
        ob.disconnect();
        // SPA 라우팅 후 React 마운트 대기
        setTimeout(() => resolve(el), 1500);
      }
    });
    ob.observe(document.documentElement, { childList: true, subtree: true });
  });
}
