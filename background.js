'use strict';

const AI_URLS = {
  claude: 'https://claude.ai/new',
  gemini: 'https://gemini.google.com/app',
  chatgpt: 'https://chatgpt.com/',
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

  // chrome.system.display로 실제 작업 영역 취득 (DPI 스케일링·멀티모니터 대응)
  // content.js의 window.screen 값은 DPI 환경에 따라 오차가 생길 수 있으므로 fallback으로만 사용
  let wa = { left: 0, top: 0, width: screenWidth || 1920, height: screenHeight || 1080 };
  try {
    const displays = await chrome.system.display.getInfo();
    let display;
    if (sourceWindowId) {
      const win = await chrome.windows.get(sourceWindowId);
      const cx = win.left + win.width  / 2;
      const cy = win.top  + win.height / 2;
      display = displays.find(d =>
        cx >= d.workArea.left && cx < d.workArea.left + d.workArea.width &&
        cy >= d.workArea.top  && cy < d.workArea.top  + d.workArea.height
      );
    }
    display = display || displays.find(d => d.isPrimary) || displays[0];
    if (display && display.workArea) wa = display.workArea;
  } catch {}

  const sw = wa.width;
  const sh = wa.height;
  const mainWidth = Math.round(sw * 0.75);
  // DWM 비가시 테두리 보정: 두 창 사이 8px×2=16px 빈틈을 없애 시각적으로 붙어 보이게 함
  const sideLeft  = wa.left + mainWidth - 16;
  // 우측 여유 8px 확보 → DWM 그림자와 무관하게 X버튼이 항상 화면 안에 표시됨
  const sideWidth = sw - mainWidth + 8;

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
      left: wa.left,
      top:  wa.top,
      width: mainWidth,
      height: sh,
    });
  }

  // AI 창 생성
  const aiWin = await chrome.windows.create({
    url,
    type: 'normal',
    left: sideLeft,
    top:  wa.top,
    width:  sideWidth,
    height: sh,
  });

  // AI 창 ID와 원본 창 정보를 함께 저장
  if (originalBounds && aiWin) {
    await chrome.storage.local.set({
      ai_split_state: { ...originalBounds, aiWindowId: aiWin.id },
    });
  }
}
