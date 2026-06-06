'use strict';

const PRESETS = {
  explain_middle: '위 내용을 중학생도 이해할 수 있게 쉽게 설명해줘',
  explain_simple: '위 내용을 한 문장으로 아주 간단하게 요약해줘',
  explain_pro:    '위 내용을 전문가 수준으로 배경지식과 함께 자세히 설명해줘',
  translate_en:   '위 내용을 자연스러운 영어로 번역해줘',
  translate_ko:   '위 내용을 자연스러운 한국어로 번역해줘',
  key_points:     '위 내용의 핵심 포인트만 bullet 형식으로 정리해줘',
  pros_cons:      '위 내용의 장점과 단점을 분석해줘',
};

const sel      = document.getElementById('preset-select');
const custom   = document.getElementById('custom-input');
const saveBtn  = document.getElementById('save-btn');
const savedMsg = document.getElementById('saved-msg');
const preview  = document.getElementById('preview');
const toggle   = document.getElementById('enabled-toggle');
const tipBox   = document.getElementById('tip-box');

function updateUI(value, customText) {
  const isCustom = value === 'custom';
  custom.classList.toggle('visible', isCustom);
  saveBtn.classList.toggle('visible', isCustom);

  let suffix = '';
  if (value === 'copy_only') {
    preview.innerHTML = '선택한 텍스트만 입력됩니다. 사용자가 직접 질문을 입력할 수 있습니다.';
    preview.classList.add('visible');
    return;
  }
  suffix = isCustom ? (customText || '') : PRESETS[value] || '';
  if (suffix) {
    preview.innerHTML = `끝에 붙을 요청: <em>${suffix}</em>`;
    preview.classList.add('visible');
  } else {
    preview.innerHTML = '';
    preview.classList.remove('visible');
  }
}

function applyToggle(enabled) {
  toggle.checked = enabled;
  tipBox.classList.toggle('disabled', !enabled);
}

async function load() {
  const stored = await chrome.storage.local.get(
    ['ai_prompt_preset', 'ai_enabled']
  );
  const value      = stored.ai_prompt_preset?.value      || 'copy_only';
  const customText = stored.ai_prompt_preset?.customText || '';
  const enabled    = stored.ai_enabled ?? true;

  sel.value = value;
  if (value === 'custom') custom.value = customText;
  updateUI(value, customText);
  applyToggle(enabled);
}

toggle.addEventListener('change', async () => {
  const enabled = toggle.checked;
  await chrome.storage.local.set({ ai_enabled: enabled });
  applyToggle(enabled);
});

sel.addEventListener('change', async () => {
  const value = sel.value;
  if (value !== 'custom') {
    await chrome.storage.local.set({ ai_prompt_preset: { value, customText: '' } });
    showSaved();
  }
  updateUI(value, custom.value);
});

custom.addEventListener('input', () => {
  updateUI('custom', custom.value.trim());
});

saveBtn.addEventListener('click', async () => {
  const customText = custom.value.trim();
  await chrome.storage.local.set({ ai_prompt_preset: { value: 'custom', customText } });
  showSaved();
});

function showSaved() {
  savedMsg.textContent = '✓ 저장됨';
  setTimeout(() => { savedMsg.textContent = ''; }, 1500);
}

load();
