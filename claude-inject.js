'use strict';

(async () => {
  const KEY = 'ai_pending_claude';
  const result = await chrome.storage.local.get(KEY);
  const pending = result[KEY];

  if (!pending || Date.now() - pending.ts > 30000) return;
  const claimedTs = pending.ts;

  const selectors = [
    'div.ProseMirror[contenteditable="true"]',
    'div[contenteditable="true"][data-placeholder]',
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
  ];

  const input = await waitForInput(selectors);
  if (!input) return;

  // 주입 직전: 더 최신 요청이 들어왔거나 이미 다른 inject가 처리했으면 포기
  const recheck = await chrome.storage.local.get(KEY);
  if (!recheck[KEY] || recheck[KEY].ts !== claimedTs) return;
  await chrome.storage.local.remove(KEY);

  // DOM 갱신을 고려하여 주입 직전 최신 엘리먼트 다시 찾기
  let activeInput = document.body.contains(input) ? input : null;
  if (!activeInput) {
    for (const sel of selectors) {
      const found = document.querySelector(sel);
      if (found && document.body.contains(found)) {
        activeInput = found;
        break;
      }
    }
  }
  if (!activeInput) activeInput = input;

  window.focus();
  activeInput.click();
  activeInput.focus();
  await new Promise(r => setTimeout(r, 300));

  if (!document.body.contains(activeInput)) {
    activeInput = selectors.reduce((found, sel) => found || document.querySelector(sel), null) || activeInput;
  }

  tryInject(activeInput, pending.prompt, selectors);
})();

// ── 커서 끝으로 이동 ──────────────────────────────────────────────────────────

function moveCursorToEnd(el) {
  el.focus();
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

// ── 주입 시도 ─────────────────────────────────────────────────────────────────

function tryInject(el, text, selectors) {
  if (!el || !document.body.contains(el)) {
    if (selectors) {
      el = selectors.reduce((found, sel) => found || document.querySelector(sel), null) || el;
    }
  }
  if (!el) return false;

  // Method 1: ClipboardEvent paste (React SyntheticEvent 경유 - 현대 에디터 최적화)
  try {
    el.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(pasteEvent);
    if (el.textContent.trim().includes(text.trim())) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      moveCursorToEnd(el);
      return true;
    }
  } catch {}

  // Method 2: execCommand insertText — contenteditable + ProseMirror
  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, text);
    if (ok && el.textContent.trim()) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      moveCursorToEnd(el);
      return true;
    }
  } catch {}

  // Method 3: 직접 innerText 설정 + input/change 이벤트 (마지막 수단)
  try {
    el.innerText = text;
    ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
    if (el.textContent.trim()) { moveCursorToEnd(el); return true; }
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
