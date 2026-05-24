'use strict';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL   = 'claude-haiku-4-5-20251001';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'LH_EXPLAIN') {
    handleExplain(msg.text, msg.apiKey)
      .then(sendResponse)
      .catch(e => { console.error('[LH BG]', e); sendResponse({ error: e.message }); });
    return true;
  }
});

async function handleExplain(text, apiKey) {
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다');

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: `법령 조문을 일반 시민이 쉽게 이해할 수 있도록 설명해주세요.

공통 규칙
- 어려운 법률 용어는 괄호 안에 쉬운 말로 병기 (예: 취소(무효화))
- 숫자·기간·금액은 원문 그대로 유지
- 전체 응답 1200토큰 이내

【조문 풀이】
▪ 한 줄 요약: 이 조문이 하려는 말을 한 문장으로
▪ 핵심 내용:
  · 쉬운 말로 풀어낸 핵심 포인트 (3~5개, 짧고 명확하게)

【적용 예시】← 조문이 복잡할 때만 작성
예) 실제 상황 → 이 조문이 어떻게 적용되는지 2~3문장
(1~2개 사례)

【관련 법령】← 인용 조항 있을 때만 작성
- 「법명」 제X조: 본 조문과의 관계 한 줄`,
      messages: [{ role: 'user', content: `다음 법령 조문을 위의 구조에 맞춰 설명해주세요:\n\n${text}` }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  return { explanation: data.content?.[0]?.text || '' };
}

