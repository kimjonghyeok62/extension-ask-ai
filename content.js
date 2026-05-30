'use strict';

let toolbar = null;
let selectedText = '';

function init() {
  if (document.getElementById('ai-toolbar')) return;

  toolbar = document.createElement('div');
  toolbar.id = 'ai-toolbar';
  toolbar.innerHTML = `
    <button class="ai-btn ai-gemini-btn" data-ai="gemini" title="Gemini로 설명">Gemini</button>
    <button class="ai-btn ai-claude-btn" data-ai="claude" title="Claude로 설명">Claude</button>
    <button class="ai-btn ai-chatgpt-btn" data-ai="chatgpt" title="ChatGPT로 설명">ChatGPT</button>
    <button class="ai-btn ai-copy-btn" data-ai="copy" title="텍스트 복사">Copy</button>
  `;
  document.body.appendChild(toolbar);

  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ai]');
    if (!btn) return;
    if (btn.dataset.ai === 'copy') copyText();
    else openAI(btn.dataset.ai);
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

const PRESET_SUFFIX = {
  explain_middle: '위 내용을 중학생도 이해할 수 있게 쉽게 설명해줘',
  explain_simple: '위 내용을 한 문장으로 아주 간단하게 요약해줘',
  explain_pro:    '위 내용을 전문가 수준으로 배경지식과 함께 자세히 설명해줘',
  translate_en:   '위 내용을 자연스러운 영어로 번역해줘',
  translate_ko:   '위 내용을 자연스러운 한국어로 번역해줘',
  key_points:     '위 내용의 핵심 포인트만 bullet 형식으로 정리해줘',
  pros_cons:      '위 내용의 장점과 단점을 분석해줘',
};

function detectTextType(text) {
  const legalPatterns = [
    /제\s*\d+\s*조/, /제\s*\d+\s*항/, /제\s*\d+\s*호/,
    /법률\s*제\d+호/, /조례|시행령|시행규칙|헌법/,
    /법원|판결|판례|형법|민법|상법|행정법/,
  ];
  if (legalPatterns.some(p => p.test(text))) return 'legal';

  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length >= 3 && text.length / lines.length < 25) return 'literary';

  return 'general';
}

async function buildPrompt(text) {
  const { ai_prompt_preset: saved } = await chrome.storage.local.get('ai_prompt_preset');
  const value      = saved?.value      || 'explain_middle';
  const customText = saved?.customText || '';

  let suffix;
  if (value === 'custom') {
    suffix = customText || PRESET_SUFFIX.explain_middle;
  } else {
    // 법령/문학 텍스트일 때 기본 preset은 더 적합한 설명으로 오버라이드
    if (value === 'explain_middle') {
      const type = detectTextType(text);
      if (type === 'legal') {
        suffix = '위 법령 조문을 중학생도 이해할 수 있게 쉽게 설명하고, 인용된 조항이 있다면 그 조항도 간략히 요약해줘';
      } else if (type === 'literary') {
        suffix = '위 문학 작품(시·소설·수필 등)의 내용과 의미를 중학생도 이해할 수 있게 쉽게 설명해줘';
      } else {
        suffix = PRESET_SUFFIX.explain_middle;
      }
    } else {
      suffix = PRESET_SUFFIX[value] || PRESET_SUFFIX.explain_middle;
    }
  }

  return `${text}\n\n${suffix}`;
}

async function openAI(service) {
  if (!selectedText) return;
  hideToolbar();

  const prompt = await buildPrompt(selectedText);

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

function copyText() {
  if (!selectedText) return;
  hideToolbar();
  navigator.clipboard?.writeText(selectedText).catch(() => {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
