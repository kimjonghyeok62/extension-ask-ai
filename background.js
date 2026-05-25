'use strict';

const AI_URLS = {
  claude: 'https://claude.ai/new',
  gemini: 'https://gemini.google.com/app',
  chatgpt: 'https://chatgpt.com/',
};

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'AI_OPEN') {
    handleOpen(msg.service, msg.prompt, msg.screen, sender.tab?.windowId);
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

async function handleOpen(service, prompt, screen, sourceWindowId) {
  const url = AI_URLS[service];
  if (!url) return;

  await chrome.storage.local.set({
    [`ai_pending_${service}`]: { prompt, ts: Date.now() },
  });

  // window.screen.avail* 값 사용 — chrome.windows API와 동일한 논리 픽셀 좌표계
  // availLeft/availTop: 태스크바가 왼쪽·위에 있거나 멀티모니터 오프셋 대응
  const sl = screen?.left   || 0;
  const st = screen?.top    || 0;
  const sw = screen?.width  || 1920;
  const sh = screen?.height || 1080;

  const mainWidth = Math.round(sw * 0.75);
  // DWM 비가시 테두리 보정: 두 창 사이 8px×2=16px 빈틈 제거 (시각적으로 붙어 보이게)
  const rawSideLeft  = sl + mainWidth - 16;
  // 오른쪽에서 최소 12px 여유 + Chrome 최소 창 너비(360px) 보장
  const rawSideWidth = sw - mainWidth + 12;
  const sideWidth    = Math.max(rawSideWidth, 360);
  // sideWidth가 클램프된 경우 sideLeft를 왼쪽으로 당겨 화면 안에 맞춤
  const sideLeft     = Math.min(rawSideLeft, sl + sw - sideWidth - 12);

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
      left: sl,
      top:  st,
      width: mainWidth,
      height: sh,
    });
  }

  // AI 창 생성
  const aiWin = await chrome.windows.create({
    url,
    type: 'normal',
    left: sideLeft,
    top:  st,
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
