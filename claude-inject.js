'use strict';

(async () => {
  const KEY = 'ai_pending_claude';
  const result = await chrome.storage.local.get(KEY);
  const pending = result[KEY];

  if (!pending || Date.now() - pending.ts > 30000) return;
  await chrome.storage.local.remove(KEY);

  // 클립보드가 이미 준비됨 — 배너를 즉시 표시
  const banner = showBanner();

  const input = await waitForInput([
    'div.ProseMirror[contenteditable="true"]',
    'div[contenteditable="true"][data-placeholder]',
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
  ]);

  if (!input) return; // 배너는 계속 보임 (Ctrl+V 유도)

  input.focus();

  const injected = tryInject(input, pending.prompt);
  if (injected) {
    banner.success();
  }
  // 실패 시 배너가 "Ctrl+V" 안내를 유지
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

  const hide = () => setTimeout(() => el.remove(), 300);

  return {
    success() {
      el.style.background = '#0f9d58';
      el.textContent = '✅  자동 입력 완료!';
      setTimeout(() => el.remove(), 2000);
    },
  };
}
