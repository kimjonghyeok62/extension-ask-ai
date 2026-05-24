'use strict';

(async () => {
  const KEY = 'ai_pending_gemini';
  const result = await chrome.storage.local.get(KEY);
  const pending = result[KEY];

  if (!pending || Date.now() - pending.ts > 30000) return;
  await chrome.storage.local.remove(KEY);

  const banner = showBanner();

  const input = await waitForInput([
    'rich-textarea div[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    'div.ql-editor[contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea',
  ]);

  if (!input) return;

  input.focus();

  const injected = tryInject(input, pending.prompt);
  if (injected) {
    banner.success();
  }
})();

// ── 주입 시도 ─────────────────────────────────────────────────────────────────

function tryInject(el, text) {
  // textarea는 value setter + input 이벤트로 처리 (Angular nativeElement 우회)
  if (el.tagName === 'TEXTAREA') {
    try {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (el.value.trim()) return true;
    } catch {}
  }

  // Method 1: execCommand insertText
  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, text);
    if (ok && el.textContent.trim()) return true;
  } catch {}

  // Method 2: ClipboardEvent paste
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    }));
    if (el.textContent.trim()) return true;
  } catch {}

  // Method 3: 직접 innerText + events
  try {
    el.innerText = text;
    ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
    if (el.textContent.trim()) return true;
  } catch {}

  return false;
}

// ── 입력창 대기 ───────────────────────────────────────────────────────────────

function waitForInput(selectors, maxMs = 15000) {
  return new Promise(resolve => {
    const find = () => selectors.reduce((found, sel) =>
      found || document.querySelector(sel), null);

    const el = find();
    if (el) { setTimeout(() => resolve(el), 700); return; }

    const timer = setTimeout(() => { ob.disconnect(); resolve(null); }, maxMs);

    const ob = new MutationObserver(() => {
      const el = find();
      if (el) { clearTimeout(timer); ob.disconnect(); setTimeout(() => resolve(el), 700); }
    });
    ob.observe(document.documentElement, { childList: true, subtree: true });
  });
}

// ── 안내 배너 ─────────────────────────────────────────────────────────────────

function showBanner() {
  const el = document.createElement('div');
  el.id = '__ai-banner__';
  Object.assign(el.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '2147483647',
    background: '#1a73e8',
    color: '#fff',
    fontFamily: '-apple-system, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    padding: '12px 20px',
    textAlign: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    letterSpacing: '0.02em',
  });
  el.textContent = '📋  텍스트가 클립보드에 복사되었습니다 — 입력창에 Ctrl+V 를 눌러주세요';
  document.body.prepend(el);

  return {
    success() {
      el.style.background = '#0f9d58';
      el.textContent = '✅  자동 입력 완료!';
      setTimeout(() => el.remove(), 2000);
    },
  };
}
