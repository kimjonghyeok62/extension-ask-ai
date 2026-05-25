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

  // Claude·Gemini·ChatGPT 표시에 필요한 최소 너비 (Chrome 강제 최소 너비 포함)
  // 이 값보다 좁게 요청하면 Chrome이 강제로 늘려 X버튼이 화면 밖으로 밀림
  const MIN_SIDE = 500;
  const sideWidth = Math.max(Math.round(sw * 0.25), MIN_SIDE);
  // sideLeft + sideWidth = sl + sw - 12 이 되도록 mainWidth 역산
  // (sideLeft = sl + mainWidth - 16 이므로: mainWidth = sw - sideWidth + 4)
  const mainWidth = sw - sideWidth + 4;
  const sideLeft  = sl + mainWidth - 16;

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
