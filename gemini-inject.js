'use strict';

(async () => {
  const KEY = 'ai_pending_gemini';
  const result = await chrome.storage.local.get(KEY);
  const pending = result[KEY];

  if (!pending || Date.now() - pending.ts > 30000) return;
  await chrome.storage.local.remove(KEY);

  const input = await waitForInput([
    'rich-textarea div[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    'div.ql-editor[contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea',
  ]);

  if (!input) return;

  input.focus();
  tryInject(input, pending.prompt);
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
