'use strict';

(async () => {
  const KEY = 'ai_pending_gemini';
  const result = await chrome.storage.session.get(KEY);
  const pending = result[KEY];

  if (!pending || Date.now() - pending.ts > 30000) return;
  await chrome.storage.session.remove(KEY);

  const input = await waitForInput([
    'rich-textarea div[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    'textarea',
  ]);

  if (input) {
    injectText(input, pending.prompt);
  } else {
    copyFallback(pending.prompt);
  }
})();

function waitForInput(selectors, maxMs = 15000) {
  return new Promise(resolve => {
    const find = () => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    };

    const found = find();
    if (found) { setTimeout(() => resolve(found), 600); return; }

    const timer = setTimeout(() => { ob.disconnect(); resolve(null); }, maxMs);

    const ob = new MutationObserver(() => {
      const el = find();
      if (el) {
        clearTimeout(timer);
        ob.disconnect();
        setTimeout(() => resolve(el), 600);
      }
    });

    const root = document.body || document.documentElement;
    ob.observe(root, { childList: true, subtree: true });
  });
}

function injectText(el, text) {
  el.focus();

  // textarea는 value setter + input 이벤트로 처리
  if (el.tagName === 'TEXTAREA') {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // contenteditable: ClipboardEvent paste 우선
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  el.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dt,
    bubbles: true,
    cancelable: true,
  }));

  // fallback: execCommand
  if (!el.textContent.trim()) {
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
  }
}

function copyFallback(text) {
  navigator.clipboard.writeText(text).catch(() => {});
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#222',
    color: '#fff',
    padding: '10px 18px',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'sans-serif',
    zIndex: '999999',
    pointerEvents: 'none',
  });
  el.textContent = '클립보드에 복사되었습니다. Ctrl+V로 붙여넣기 하세요.';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}
