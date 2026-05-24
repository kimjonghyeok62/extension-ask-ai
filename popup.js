'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const toggle      = document.getElementById('toggle');
  const optionsBtn  = document.getElementById('open-options');
  const clearBtn    = document.getElementById('clear-cache');
  const statusEl    = document.getElementById('status');
  let statusTimer   = null;

  // ── 초기 상태 로드 ──────────────────────────────────────────────────────────

  const data = await chrome.storage.local.get(['lh_enabled', 'lh_api_key']);
  toggle.checked = data.lh_enabled !== false;
  if (data.lh_api_key) {
    await showCacheInfo();
  } else {
    showStatus('⚙ API 키 설정을 눌러 키를 등록하세요.', true);
  }

  // ── 토글 ────────────────────────────────────────────────────────────────────

  toggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ lh_enabled: toggle.checked });
  });

  // ── 옵션 페이지 열기 ────────────────────────────────────────────────────────

  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // ── 캐시 초기화 ─────────────────────────────────────────────────────────────

  clearBtn.addEventListener('click', async () => {
    const all = await chrome.storage.local.get(null);
    const cacheKeys = Object.keys(all).filter(k => k.startsWith('lh_cache_'));
    if (cacheKeys.length === 0) {
      showStatus('삭제할 캐시가 없습니다.');
      return;
    }
    await chrome.storage.local.remove(cacheKeys);
    showStatus(`캐시 ${cacheKeys.length}개 삭제됨`);
  });

  // ── 헬퍼 ────────────────────────────────────────────────────────────────────

  async function showCacheInfo() {
    const all = await chrome.storage.local.get(null);
    const count = Object.keys(all).filter(k => k.startsWith('lh_cache_')).length;
    statusEl.textContent = count > 0 ? `캐시된 조항: ${count}개` : 'API 키 설정됨';
    statusEl.style.color = '#1e7e34';
  }

  function showStatus(msg, isWarn = false) {
    statusEl.textContent = msg;
    statusEl.style.color = isWarn ? '#c62828' : '#888';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(async () => {
      await showCacheInfo();
    }, 5000);
  }
});
