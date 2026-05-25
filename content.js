'use strict';

let toolbar = null;
let selectedText = '';

function init() {
  if (document.getElementById('ai-toolbar')) return;

  toolbar = document.createElement('div');
  toolbar.id = 'ai-toolbar';
  toolbar.innerHTML = `
    <button class="ai-btn ai-gemini-btn" data-ai="gemini" title="Gemini로 쉽게 설명">
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2C12 7.52 16.48 12 22 12C16.48 12 12 16.48 12 22C12 16.48 7.52 12 2 12C7.52 12 12 7.52 12 2Z" fill="currentColor"/>
      </svg>
      Gemini
    </button>
    <button class="ai-btn ai-claude-btn" data-ai="claude" title="Claude로 쉽게 설명">
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3L2 20h20L12 3zm0 5l5.5 10h-11L12 8z" fill="currentColor"/>
      </svg>
      Claude
    </button>
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
  navigator.clipboard.writeText(prompt).catch(() => {});

  chrome.runtime.sendMessage({
    type: 'AI_OPEN',
    service,
    prompt,
    screenWidth: window.screen.availWidth,
    screenHeight: window.screen.availHeight,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
