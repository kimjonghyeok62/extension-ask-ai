'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const input     = document.getElementById('api-key');
  const saveBtn   = document.getElementById('save');
  const toggleBtn = document.getElementById('toggle-vis');
  const statusEl  = document.getElementById('status');

  // ── 최소 글자 수 ──
  const minCharsInput = document.getElementById('min-chars');
  const minCharsOk    = document.getElementById('min-chars-ok');
  const { ai_min_chars } = await chrome.storage.local.get('ai_min_chars');
  minCharsInput.value = ai_min_chars || 10;

  document.getElementById('save-min-chars').addEventListener('click', async () => {
    const val = parseInt(minCharsInput.value, 10);
    if (!val || val < 1) return;
    await chrome.storage.local.set({ ai_min_chars: val });
    showOk(minCharsOk);
  });

  // ── 창 분할 비율 ──
  const splitSelect = document.getElementById('split-ratio');
  const splitOk     = document.getElementById('split-ok');
  const { ai_split_ratio } = await chrome.storage.local.get('ai_split_ratio');
  splitSelect.value = String(ai_split_ratio || 0.75);

  document.getElementById('save-split').addEventListener('click', async () => {
    const val = parseFloat(splitSelect.value);
    await chrome.storage.local.set({ ai_split_ratio: val });
    showOk(splitOk);
  });

  function showOk(el) {
    el.textContent = '✓ 저장됨';
    setTimeout(() => { el.textContent = ''; }, 1500);
  }

  // ── API 키 ──
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
