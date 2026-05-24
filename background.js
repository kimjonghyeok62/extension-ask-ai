'use strict';

const AI_URLS = {
  claude: 'https://claude.ai/new',
  gemini: 'https://gemini.google.com/app',
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AI_OPEN') {
    handleOpen(msg.service, msg.prompt);
  }
});

async function handleOpen(service, prompt) {
  const url = AI_URLS[service];
  if (!url) return;

  // Store prompt keyed by service so multiple clicks don't clobber each other
  await chrome.storage.local.set({
    [`ai_pending_${service}`]: { prompt, ts: Date.now() },
  });

  chrome.windows.create({ url, type: 'normal', width: 1200, height: 900 });
}
