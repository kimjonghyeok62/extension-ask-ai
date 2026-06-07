'use strict';

(async () => {
  const KEY = 'ai_pending_gemini';
  const result = await chrome.storage.local.get(KEY);
  const pending = result[KEY];

  if (!pending || Date.now() - pending.ts > 30000) return;
  const claimedTs = pending.ts;  // 이 inject 인스턴스가 읽은 타임스탬프

  const selectors = [
    'rich-textarea div[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    'div.ql-editor[contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea',
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

  // Angular 재렌더링 후 커서가 처음으로 리셋될 수 있으므로 딜레이 후 재보정
  [200, 500, 900].forEach(ms =>
    setTimeout(() => {
      const el = selectors.reduce((found, sel) => found || document.querySelector(sel), null) || activeInput;
      if (el) moveCursorToEnd(el);
    }, ms)
  );
})();

// ── 커서 끝으로 이동 ──────────────────────────────────────────────────────────

function moveCursorToEnd(el) {
  el.focus();
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
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

// ── 주입 시도 ─────────────────────────────────────────────────────────────────

function tryInject(el, text, selectors) {
  if (!el || !document.body.contains(el)) {
    if (selectors) {
      el = selectors.reduce((found, sel) => found || document.querySelector(sel), null) || el;
    }
  }
  if (!el) return false;

  // TEXTAREA의 경우 기존 Angular nativeElement 우회
  if (el.tagName === 'TEXTAREA') {
    try {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (el.value.trim()) { moveCursorToEnd(el); return true; }
    } catch {}
  }

  // Method 1: ClipboardEvent paste (Angular/Quill 등 최신 리치 에디터의 이벤트 감지에 가장 효과적)
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

  // Method 2: range selectNodeContents + execCommand
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

  // Method 3: click 활성화 후 selectAll + execCommand (Angular 대응 fallback)
  try {
    el.click();
    el.focus();
    document.execCommand('selectAll', false, null);
    const ok = document.execCommand('insertText', false, text);
    if (ok && el.textContent.trim()) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      moveCursorToEnd(el);
      return true;
    }
  } catch {}

  // Method 4: innerText + events
  try {
    el.innerText = text;
    ['input', 'change', 'blur'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
    if (el.textContent.trim()) { moveCursorToEnd(el); return true; }
  } catch {}

  return false;
}

// ── 입력창 대기 ───────────────────────────────────────────────────────────────

function waitForInput(selectors, maxMs = 15000) {
  return new Promise(resolve => {
    const find = () => selectors.reduce((found, sel) =>
      found || document.querySelector(sel), null);

    const el = find();
    if (el) { setTimeout(() => resolve(el), 1500); return; }

    const timer = setTimeout(() => { ob.disconnect(); resolve(null); }, maxMs);

    const ob = new MutationObserver(() => {
      const el = find();
      if (el) { clearTimeout(timer); ob.disconnect(); setTimeout(() => resolve(el), 1500); }
    });
    ob.observe(document.documentElement, { childList: true, subtree: true });
  });
}
