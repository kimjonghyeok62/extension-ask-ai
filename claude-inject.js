'use strict';

(async () => {
  const KEY = 'ai_pending_claude';
  const result = await chrome.storage.local.get(KEY);
  const pending = result[KEY];

  if (!pending || Date.now() - pending.ts > 30000) return;
  await chrome.storage.local.remove(KEY);

  const input = await waitForInput([
    'div.ProseMirror[contenteditable="true"]',
    'div[contenteditable="true"][data-placeholder]',
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
  ]);

  if (!input) return;

  input.focus();
  tryInject(input, pending.prompt);
})();

// ── 주입 시도 ─────────────────────────────────────────────────────────────────

function tryInject(el, text) {
  // Method 1: execCommand insertText — contenteditable + ProseMirror에 가장 신뢰도 높음
  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, text);
    if (ok && el.textContent.trim()) return true;
  } catch {}

  // Method 2: ClipboardEvent paste (React SyntheticEvent 경유)
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

  // Method 3: 직접 innerText 설정 + input/change 이벤트 (마지막 수단)
  try {
    el.innerText = text;
    ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
    if (el.textContent.trim()) return true;
  } catch {}

  return false;
}

// ── 입력창 대기 (MutationObserver) ───────────────────────────────────────────

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
