'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const toggle     = document.getElementById('toggle');
  const optionsBtn = document.getElementById('open-options');
  const statusEl   = document.getElementById('status');

  const data = await chrome.storage.local.get(['lh_enabled', 'lh_api_key']);
  toggle.checked = data.lh_enabled !== false;

  if (data.lh_api_key) {
    statusEl.textContent = 'API 키 설정됨';
    statusEl.style.color = '#1e7e34';
  } else {
    statusEl.textContent = '⚙ API 키 설정을 눌러 키를 등록하세요.';
    statusEl.style.color = '#c62828';
  }

  toggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ lh_enabled: toggle.checked });
  });

  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
