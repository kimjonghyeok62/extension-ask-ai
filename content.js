'use strict';

let isEnabled = true;
let apiKey = '';

// 설명 기능 상태
let explainBtn = null;
let explainPanel = null;
let explainTarget = null;

// ── 초기화 ────────────────────────────────────────────────────────────────────

async function init() {
  const data = await chrome.storage.local.get(['lh_enabled', 'lh_api_key']);
  isEnabled = data.lh_enabled !== false;
  apiKey = data.lh_api_key || '';

  initExplain();

  chrome.storage.onChanged.addListener((changes) => {
    if ('lh_enabled' in changes) {
      isEnabled = changes.lh_enabled.newValue !== false;
    }
    if ('lh_api_key' in changes) {
      apiKey = changes.lh_api_key.newValue || '';
    }
  });
}

// ── 쉬운 설명 기능 ────────────────────────────────────────────────────────────

function initExplain() {
  if (document.getElementById('lh-explain-btn')) return;

  // 플로팅 버튼
  explainBtn = document.createElement('button');
  explainBtn.id = 'lh-explain-btn';
  explainBtn.textContent = '💬 쉽게 설명';
  document.body.appendChild(explainBtn);

  // 사이드 패널
  explainPanel = document.createElement('div');
  explainPanel.id = 'lh-panel';
  explainPanel.innerHTML = `
    <div id="lh-panel-head">
      <span>💬 쉬운 설명</span>
      <button id="lh-panel-close">✕</button>
    </div>
    <div id="lh-panel-body"></div>
  `;
  document.body.appendChild(explainPanel);

  document.getElementById('lh-panel-close').addEventListener('click', closePanel);
  explainBtn.addEventListener('click', onExplainClick);

  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('click', onDocClick);
}

function onMouseUp(e) {
  if (e.target.closest('#lh-panel') || e.target === explainBtn) return;

  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (text.length >= 20) {
      explainTarget = text;
      positionBtnNearSelection(e);
    } else if (!e.target.closest('#lh-explain-btn')) {
      hideBtn();
    }
  }, 10);
}

function onDocClick(e) {
  if (e.target.closest('#lh-panel') || e.target === explainBtn) return;

  const sel = window.getSelection();
  if (sel && sel.toString().trim().length >= 20) return;

  const block = e.target.closest('p, li, td, dd, div[class], article');
  if (block) {
    const text = block.textContent.trim();
    if (text.length >= 20) {
      explainTarget = text.slice(0, 1000);
      positionBtnAtEvent(e, block);
      return;
    }
  }
  hideBtn();
}

function positionBtnNearSelection(e) {
  const btnWidth = 110;
  const btnHeight = 30;

  // 선택 영역 전체 bounding rect 를 구해 드래그 방향 판단
  const sel = window.getSelection();
  const rect = (sel && sel.rangeCount > 0)
    ? sel.getRangeAt(0).getBoundingClientRect()
    : null;

  let top, left;

  if (rect && rect.height > 0) {
    const midY = rect.top + rect.height / 2;

    if (e.clientY >= midY) {
      // 아래쪽에서 드래그 끝남 → 선택 영역 아래에 표시
      top = window.scrollY + rect.bottom + 8;
    } else {
      // 위쪽에서 드래그 끝남 → 선택 영역 위에 표시
      top = window.scrollY + rect.top - btnHeight - 8;
    }
    left = Math.min(
      Math.max(e.clientX - btnWidth / 2, 10),
      window.innerWidth - btnWidth - 10
    );
  } else {
    // 폴백: rect 를 못 구한 경우
    top  = window.scrollY + e.clientY + 8;
    left = Math.min(
      Math.max(e.clientX - btnWidth / 2, 10),
      window.innerWidth - btnWidth - 10
    );
  }

  explainBtn.style.top  = top + 'px';
  explainBtn.style.left = left + 'px';
  explainBtn.classList.add('lh-visible');
}

function positionBtnAtEvent(e, block) {
  const btnWidth = 110;
  if (block) {
    const rect = block.getBoundingClientRect();
    explainBtn.style.top  = (window.scrollY + rect.bottom + 6) + 'px';
    explainBtn.style.left = Math.min(
      window.scrollX + rect.right - btnWidth,
      window.innerWidth - btnWidth - 10
    ) + 'px';
  } else {
    explainBtn.style.top  = (window.scrollY + e.clientY + 8) + 'px';
    explainBtn.style.left = Math.min(e.clientX, window.innerWidth - btnWidth - 10) + 'px';
  }
  explainBtn.classList.add('lh-visible');
}

function hideBtn() {
  if (explainBtn) explainBtn.classList.remove('lh-visible');
}

async function onExplainClick() {
  hideBtn();
  if (!explainTarget) return;

  const body = document.getElementById('lh-panel-body');
  body.innerHTML = '<div class="lh-loading">분석 중…</div>';
  openPanel();

  if (!apiKey) {
    body.innerHTML = '<div class="lh-error">API 키가 설정되지 않았습니다.<br>팝업에서 API 키를 저장해주세요.</div>';
    return;
  }

  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'LH_EXPLAIN',
      text: explainTarget,
      apiKey,
    });

    if (resp?.error) {
      body.innerHTML = `<div class="lh-error">오류: ${resp.error}</div>`;
    } else {
      const sourceText = explainTarget.slice(0, 80) + (explainTarget.length > 80 ? '…' : '');
      body.innerHTML = `
        <div class="lh-source">${esc(sourceText)}</div>
        <div class="lh-result">${renderSections(resp.explanation || '')}</div>
      `;
    }
  } catch (e) {
    body.innerHTML = `<div class="lh-error">오류: ${e.message}</div>`;
  }
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function md(escaped) {
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^#{1,2} (.+)$/gm, '<b>$1</b>')
    .replace(/^[▪·]\s*/gm, '• ')
    .replace(/\n/g, '<br>');
}

function renderSections(text) {
  const SECTION_RE = /【([^】]+)】/g;
  let html = '';
  let lastIndex = 0;
  let match;

  while ((match = SECTION_RE.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index).trim();
    if (before) html += `<div class="lh-sec-body">${md(esc(before))}</div>`;
    html += `<div class="lh-sec-head">${esc(match[1])}</div>`;
    lastIndex = match.index + match[0].length;
  }

  const tail = text.slice(lastIndex).trim();
  if (tail) html += `<div class="lh-sec-body">${md(esc(tail))}</div>`;

  return html || md(esc(text));
}

function openPanel() {
  explainPanel.classList.add('lh-open');
  document.documentElement.classList.add('lh-panel-open');
  document.body.classList.add('lh-panel-open');
  document.querySelectorAll('iframe').forEach(fr => {
    fr.dataset.lhPrevZ = fr.style.zIndex;
    fr.style.setProperty('z-index', '-1', 'important');
  });
}

function closePanel() {
  explainPanel.classList.remove('lh-open');
  document.documentElement.classList.remove('lh-panel-open');
  document.body.classList.remove('lh-panel-open');
  document.querySelectorAll('iframe').forEach(fr => {
    fr.style.zIndex = fr.dataset.lhPrevZ || '';
    delete fr.dataset.lhPrevZ;
  });
}

// ── 시작 ──────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
