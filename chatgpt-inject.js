'use strict';

(async () => {
  console.log("[AskAI] chatgpt-inject.js loaded.");
  const KEY = 'ai_pending_chatgpt';
  const result = await chrome.storage.local.get(KEY);
  const pending = result[KEY];

  if (!pending) {
    console.log("[AskAI] No pending data found in storage.");
    return;
  }
  if (Date.now() - pending.ts > 30000) {
    console.log("[AskAI] Pending data expired.");
    return;
  }
  
  await chrome.storage.local.remove(KEY);
  console.log("[AskAI] Pending prompt ready:", pending.prompt);

  const selectors = [
    'textarea#prompt-textarea',
    '#prompt-textarea',
    'textarea',
    'div#prompt-textarea[contenteditable="true"]',
    'div[contenteditable="true"][data-placeholder]',
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
  ];

  const maxAttempts = 15; // 250ms * 15 = 약 3.7초간 폴링 시도
  let attempt = 0;

  async function startInjection() {
    const input = await waitForInput(selectors);
    if (!input) {
      console.error("[AskAI] Input element not found within timeout.");
      return;
    }

    const interval = setInterval(async () => {
      attempt++;
      // 매 시도마다 DOM 갱신을 고려해 최신 엘리먼트 재조회
      const activeInput = selectors.reduce((found, sel) => found || document.querySelector(sel), null) || input;

      if (activeInput) {
        console.log(`[AskAI] Attempting injection #${attempt} on tag: ${activeInput.tagName}`);
        activeInput.focus();
        activeInput.click();
        
        const success = tryInject(activeInput, pending.prompt, selectors);
        const currentText = activeInput.tagName === 'TEXTAREA' ? activeInput.value : activeInput.textContent;
        
        console.log(`[AskAI] Injection result: ${success ? 'SUCCESS' : 'FAILED'}, current value length: ${currentText.length}`);

        // 성공 판정: 주입 함수가 true를 리턴했고, 입력 필드 텍스트가 실제로 목표 프롬프트를 포함할 때
        if (success && currentText.trim().includes(pending.prompt.trim())) {
          clearInterval(interval);
          moveCursorToEnd(activeInput);
          console.log("[AskAI] Prompt successfully injected and stabilized.");
          return;
        }
      } else {
        console.log(`[AskAI] Active input not found in attempt #${attempt}`);
      }

      if (attempt >= maxAttempts) {
        clearInterval(interval);
        console.error("[AskAI] Prompt injection failed after maximum attempts.");
      }
    }, 250);
  }

  await startInjection();
})();

// ── 커서 끝으로 이동 ──────────────────────────────────────────────────────────

function moveCursorToEnd(el) {
  el.focus();
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    el.selectionStart = el.selectionEnd = el.value.length;
  } else {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
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

  // 1. TEXTAREA 처리 (최신 ChatGPT 대응)
  if (el.tagName === 'TEXTAREA') {
    // Method 1: React State 우회 주입 (HTMLTextAreaElement.prototype.value setter)
    try {
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (el.value.trim() === text.trim()) {
        console.log("[AskAI] Injected via React setter.");
        return true;
      }
    } catch (e) {
      console.warn("[AskAI] React setter failed:", e);
    }

    // Method 2: execCommand ('insertText') - 포커스된 상태의 textarea 대체 주입
    try {
      el.focus();
      el.select();
      const ok = document.execCommand('insertText', false, text);
      if (ok && el.value.trim()) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        console.log("[AskAI] Injected via execCommand insertText.");
        return true;
      }
    } catch (e) {
      console.warn("[AskAI] execCommand insertText failed:", e);
    }

    // Method 3: ClipboardEvent paste
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
      if (el.value.trim().includes(text.trim())) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        console.log("[AskAI] Injected via ClipboardEvent paste.");
        return true;
      }
    } catch (e) {
      console.warn("[AskAI] ClipboardEvent paste failed:", e);
    }

    // Method 4: 일반 value 대입
    try {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (el.value.trim()) {
        console.log("[AskAI] Injected via direct value assignment.");
        return true;
      }
    } catch (e) {}
  }

  // 2. CONTENTEDITABLE 처리 (혹시 모를 에디터 대응 fallback)
  // Method 1: ClipboardEvent paste
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
      console.log("[AskAI] Injected (contenteditable) via ClipboardEvent paste.");
      return true;
    }
  } catch {}

  // Method 2: range + execCommand
  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, text);
    if (ok && el.textContent.trim()) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      console.log("[AskAI] Injected (contenteditable) via Range + execCommand.");
      return true;
    }
  } catch {}

  // Method 3: selectAll + execCommand
  try {
    el.click();
    el.focus();
    document.execCommand('selectAll', false, null);
    const ok = document.execCommand('insertText', false, text);
    if (ok && el.textContent.trim()) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      console.log("[AskAI] Injected (contenteditable) via SelectAll + execCommand.");
      return true;
    }
  } catch {}

  // Method 4: innerHTML + InputEvent
  try {
    el.focus();
    el.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = text;
    el.appendChild(p);
    const range = document.createRange();
    range.setStartAfter(p);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
    if (el.textContent.trim()) {
      console.log("[AskAI] Injected (contenteditable) via innerHTML + InputEvent.");
      return true;
    }
  } catch {}

  // Method 5: innerText + events
  try {
    el.innerText = text;
    ['input', 'change', 'blur'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
    if (el.textContent.trim()) {
      console.log("[AskAI] Injected (contenteditable) via direct innerText.");
      return true;
    }
  } catch {}

  return false;
}

// ── 입력창 대기 ───────────────────────────────────────────────────────────────

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
    if (el) { setTimeout(() => resolve(el), 500); return; } // 대기시간을 500ms로 단축하여 빠른 시도 시작

    const timer = setTimeout(() => { ob.disconnect(); resolve(null); }, maxMs);

    const ob = new MutationObserver(() => {
      const el = find();
      if (el) { clearTimeout(timer); ob.disconnect(); setTimeout(() => resolve(el), 1500); }
    });
    ob.observe(document.documentElement, { childList: true, subtree: true });
  });
}
