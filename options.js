'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const input     = document.getElementById('api-key');
  const saveBtn   = document.getElementById('save');
  const toggleBtn = document.getElementById('toggle-vis');
  const statusEl  = document.getElementById('status');

  const { lh_api_key } = await chrome.storage.local.get('lh_api_key');
  if (lh_api_key) input.value = lh_api_key;

  toggleBtn.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    toggleBtn.textContent = input.type === 'password' ? '표시' : '숨김';
  });

  saveBtn.addEventListener('click', async () => {
    const key = input.value.trim();
    if (!key) return setStatus('API 키를 입력해주세요.', 'err');
    if (key.length < 20) return setStatus('API 키가 너무 짧습니다. 확인해주세요.', 'err');
    await chrome.storage.local.set({ lh_api_key: key, lh_enabled: true });
    setStatus('✓ 저장되었습니다. law.go.kr 페이지를 새로고침하면 바로 적용됩니다.', 'ok');
  });

  function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = type;
  }
});
