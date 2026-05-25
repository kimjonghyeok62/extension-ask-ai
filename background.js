'use strict';

const AI_URLS = {
  claude: 'https://claude.ai/new',
  gemini: 'https://gemini.google.com/app',
};

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'AI_OPEN') {
    handleOpen(msg.service, msg.prompt, msg.screenWidth, msg.screenHeight, sender.tab?.windowId);
  }
});

// AI 창이 닫히면 원본 창을 원래 크기로 복원
chrome.windows.onRemoved.addListener(async (windowId) => {
  const { ai_split_state: state } = await chrome.storage.local.get('ai_split_state');
  if (!state || state.aiWindowId !== windowId) return;

  await chrome.storage.local.remove('ai_split_state');

  try {
    if (state.originalState === 'maximized') {
      await chrome.windows.update(state.sourceWindowId, { state: 'maximized' });
    } else {
      await chrome.windows.update(state.sourceWindowId, {
        state: 'normal',
        left:   state.left,
        top:    state.top,
        width:  state.width,
        height: state.height,
      });
    }
  } catch {}
});

async function handleOpen(service, prompt, screenWidth, screenHeight, sourceWindowId) {
  const url = AI_URLS[service];
  if (!url) return;

  await chrome.storage.local.set({
    [`ai_pending_${service}`]: { prompt, ts: Date.now() },
  });

  const sw = screenWidth  || 1920;
  const sh = screenHeight || 1080;
  const mainWidth = Math.round(sw * 0.75);
  const sideLeft  = mainWidth - 16;
  const sideWidth = sw - sideLeft - 1;

  // 원본 창의 현재 크기·위치·상태 저장
  let originalBounds = null;
  if (sourceWindowId) {
    try {
      const win = await chrome.windows.get(sourceWindowId);
      originalBounds = {
        sourceWindowId,
        originalState: win.state,
        left:   win.left,
        top:    win.top,
        width:  win.width,
        height: win.height,
      };
    } catch {}

    await chrome.windows.update(sourceWindowId, {
      state: 'normal',
      left: 0,
      top: 0,
      width: mainWidth,
      height: sh,
    });
  }

  // AI 창 생성
  const aiWin = await chrome.windows.create({
    url,
    type: 'normal',
    left: sideLeft,
    top: 0,
    width: sideWidth,
    height: sh,
  });

  // AI 창 ID와 원본 창 정보를 함께 저장
  if (originalBounds && aiWin) {
    await chrome.storage.local.set({
      ai_split_state: { ...originalBounds, aiWindowId: aiWin.id },
    });
  }
}
