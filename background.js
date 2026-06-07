'use strict';

// Service Worker: 창 열기·재사용·분할, 컨텍스트 메뉴, 창 복원 처리

const AI_URLS = {
  claude:  'https://claude.ai/new',
  gemini:  'https://gemini.google.com/app',
  chatgpt: 'https://chatgpt.com/',
};

const PRESET_SUFFIX = {
  explain_middle: '위 내용을 중학생도 이해할 수 있게 쉽게 설명해줘',
  explain_simple: '위 내용을 한 문장으로 아주 간단하게 요약해줘',
  explain_pro:    '위 내용을 전문가 수준으로 배경지식과 함께 자세히 설명해줘',
  translate_en:   '위 내용을 자연스러운 영어로 번역해줘',
  translate_ko:   '위 내용을 자연스러운 한국어로 번역해줘',
  key_points:     '위 내용의 핵심 포인트만 bullet 형식으로 정리해줘',
  pros_cons:      '위 내용의 장점과 단점을 분석해줘',
};

const SVC_WIN_KEYS = ['ai_win_claude', 'ai_win_gemini', 'ai_win_chatgpt'];

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
  const value      = saved?.value      || 'copy_only';
  const customText = saved?.customText || '';

  if (value === 'copy_only') return text + '\n';

  let suffix;
  if (value === 'custom') {
    suffix = customText || PRESET_SUFFIX.explain_middle;
  } else if (value === 'explain_middle') {
    const type = detectTextType(text);
    if (type === 'legal')         suffix = '위 법령 조문을 중학생도 이해할 수 있게 쉽게 설명하고, 인용된 조항이 있다면 그 조항도 간략히 요약해줘';
    else if (type === 'literary') suffix = '위 문학 작품(시·소설·수필 등)의 내용과 의미를 중학생도 이해할 수 있게 쉽게 설명해줘';
    else                          suffix = PRESET_SUFFIX.explain_middle;
  } else {
    suffix = PRESET_SUFFIX[value] || PRESET_SUFFIX.explain_middle;
  }

  return `${text}\n\n${suffix}`;
}

// ── 컨텍스트 메뉴 등록 ──────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'ai-parent', title: 'AI로 설명', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'ai-gemini',  parentId: 'ai-parent', title: 'Gemini로 설명',  contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'ai-claude',  parentId: 'ai-parent', title: 'Claude로 설명',  contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'ai-chatgpt', parentId: 'ai-parent', title: 'ChatGPT로 설명', contexts: ['selection'] });
  });
});

const CTX_MAP = { 'ai-gemini': 'gemini', 'ai-claude': 'claude', 'ai-chatgpt': 'chatgpt' };

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const service = CTX_MAP[info.menuItemId];
  if (!service || !info.selectionText) return;

  const { ai_enabled } = await chrome.storage.local.get('ai_enabled');
  if (ai_enabled === false) return;

  const prompt = await buildPrompt(info.selectionText);
  const { ai_screen: screen } = await chrome.storage.local.get('ai_screen');
  handleOpen(service, prompt, screen || null, tab?.windowId);
});

// ── 툴바 버튼 클릭 메시지 ────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'AI_OPEN') {
    handleOpen(msg.service, msg.prompt, msg.screen, sender.tab?.windowId);
  }
});

// ── AI 창 닫히면 복원 판단 ────────────────────────────────────
// ai_win_* 키로 모든 AI창을 추적한다.
// 닫힌 창이 AI창이면 해당 키를 제거하고, 남은 AI창이 하나도 없을 때만 원본 창을 복원.
chrome.windows.onRemoved.addListener(async (windowId) => {
  const stored = await chrome.storage.local.get(SVC_WIN_KEYS);
  const toRemove = SVC_WIN_KEYS.filter(k => stored[k] === windowId);

  // 우리가 관리하는 AI창이 아니면 무시
  if (toRemove.length === 0) return;

  await chrome.storage.local.remove(toRemove);

  // 나머지 AI창이 실제로 열려 있는지 확인
  const remainingKeys = SVC_WIN_KEYS.filter(k => !toRemove.includes(k));
  const remainingStored = await chrome.storage.local.get(remainingKeys);

  let anyOpen = false;
  for (const k of remainingKeys) {
    if (!remainingStored[k]) continue;
    try {
      await chrome.windows.get(remainingStored[k]);
      anyOpen = true;
      break;
    } catch {}
  }

  if (!anyOpen) {
    // 모든 AI창 닫힘 → 원본 창 복원
    const { ai_split_state: state } = await chrome.storage.local.get('ai_split_state');
    if (!state) return;
    await chrome.storage.local.remove('ai_split_state');
    try {
      if (state.originalState === 'maximized') {
        await chrome.windows.update(state.sourceWindowId, { state: 'maximized' });
      } else {
        await chrome.windows.update(state.sourceWindowId, {
          state: 'normal', left: state.left, top: state.top,
          width: state.width, height: state.height,
        });
      }
    } catch {}
  }
});

// ── 핵심 핸들러 ──────────────────────────────────────────────
async function handleOpen(service, prompt, screen, sourceWindowId) {
  const url = AI_URLS[service];
  if (!url) return;

  await chrome.storage.local.set({
    [`ai_pending_${service}`]: { prompt, ts: Date.now() },
  });

  // 기존 AI 창 재사용
  const winKey = `ai_win_${service}`;
  const stored = await chrome.storage.local.get(winKey);
  const existingWinId = stored[winKey];

  if (existingWinId) {
    try {
      await chrome.windows.get(existingWinId);
      await chrome.tabs.create({ windowId: existingWinId, url, active: true });
      await chrome.windows.update(existingWinId, { focused: true });
      return;
    } catch {
      await chrome.storage.local.remove(winKey);
    }
  }

  const mainRatio = 0.75;

  const sl = screen?.left   || 0;
  const st = screen?.top    || 0;
  const sw = screen?.width  || 1920;
  const sh = screen?.height || 1080;

  const MIN_SIDE  = 500;
  const sideWidth = Math.max(Math.round(sw * (1 - mainRatio)), MIN_SIDE);
  const mainWidth = sw - sideWidth + 4;
  const sideLeft  = sl + mainWidth - 16;

  // 원본 창 상태 저장 (첫 분할 시에만 — 이미 저장돼 있으면 덮어쓰지 않음)
  let originalBounds = null;
  const { ai_split_state: existingState } = await chrome.storage.local.get('ai_split_state');

  if (sourceWindowId) {
    if (!existingState) {
      try {
        const win = await chrome.windows.get(sourceWindowId);
        originalBounds = {
          sourceWindowId,
          originalState: win.state,
          left: win.left, top: win.top, width: win.width, height: win.height,
        };
      } catch {}
    }

    await chrome.windows.update(sourceWindowId, {
      state: 'normal', left: sl, top: st, width: mainWidth, height: sh,
    });
  }

  const aiWin = await chrome.windows.create({
    url, type: 'normal', left: sideLeft, top: st, width: sideWidth, height: sh,
  });

  if (aiWin) {
    await chrome.storage.local.set({ [winKey]: aiWin.id });
    if (originalBounds) {
      await chrome.storage.local.set({ ai_split_state: originalBounds });
    }
  }
}
