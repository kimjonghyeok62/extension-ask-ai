'use strict';

let toolbar = null;
let selectedText = '';

function init() {
  if (document.getElementById('ai-toolbar')) return;

  toolbar = document.createElement('div');
  toolbar.id = 'ai-toolbar';
  toolbar.innerHTML = `
    <button class="ai-btn ai-gemini-btn" data-ai="gemini" title="Gemini로 쉽게 설명">Gemini</button>
    <button class="ai-btn ai-claude-btn" data-ai="claude" title="Claude로 쉽게 설명">Claude</button>
    <button class="ai-btn ai-chatgpt-btn" data-ai="chatgpt" title="ChatGPT로 쉽게 설명">ChatGPT</button>
  `;
  document.body.appendChild(toolbar);

  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ai]');
    if (btn) openAI(btn.dataset.ai);
  });

  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousedown', onMouseDown);
}

function onMouseDown(e) {
  if (e.target.closest('#ai-toolbar')) return;
  hideToolbar();
}

function onMouseUp(e) {
  if (e.target.closest('#ai-toolbar')) return;

  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';

    if (text.length >= 10) {
      selectedText = text;
      positionToolbar(e, sel);
    }
  }, 10);
}

function positionToolbar(e, sel) {
  if (!sel || sel.rangeCount === 0) return;

  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (!rect || rect.height === 0) return;

  const toolbarH = 38;
  let top;

  if (e.clientY > rect.top + rect.height / 2) {
    top = window.scrollY + rect.bottom + 10;
  } else {
    top = window.scrollY + rect.top - toolbarH - 10;
  }

  const cx = window.scrollX + rect.left + rect.width / 2;

  toolbar.style.top = top + 'px';
  toolbar.style.left = cx + 'px';
  toolbar.classList.add('ai-visible');
}

function hideToolbar() {
  if (toolbar) toolbar.classList.remove('ai-visible');
}

function openAI(service) {
  if (!selectedText) return;
  hideToolbar();

  const prompt = `${selectedText}\n\n위 내용을 쉽게 설명해주세요`;

  // 사용자 제스처가 살아있는 지금 클립보드에 기록 (inject 스크립트는 제스처 없음)
  // HTTP 페이지는 navigator.clipboard 자체가 undefined — optional chaining으로 무시
  navigator.clipboard?.writeText(prompt).catch(() => {});

  chrome.runtime.sendMessage({
    type: 'AI_OPEN',
    service,
    prompt,
    screen: {
      left:   window.screen.availLeft  || 0,
      top:    window.screen.availTop   || 0,
      width:  window.screen.availWidth,
      height: window.screen.availHeight,
    },
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
