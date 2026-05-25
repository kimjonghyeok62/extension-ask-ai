# extension-ask-ai 프로젝트

## 목적
어느 웹페이지에서나 텍스트를 드래그하면 Gemini·Claude 버튼이 뜨고, 클릭하면 해당 AI 새 창에 선택한 텍스트가 자동 입력되어 쉽게 설명해달라고 요청하는 Chrome 확장 프로그램.

## 파일 구조
```
manifest.json       — Manifest V3 설정
content.js          — 모든 페이지에 삽입 (툴바 표시, 텍스트 선택 감지)
styles.css          — 툴바 스타일
background.js       — Service Worker (창 열기, 창 크기 관리)
claude-inject.js    — claude.ai 페이지에 삽입 (프롬프트 자동 입력)
gemini-inject.js    — gemini.google.com에 삽입 (프롬프트 자동 입력)
popup.html          — 확장 팝업 (사용 안내)
icons/icon.svg      — 아이콘
```

## 동작 흐름
1. 사용자가 텍스트를 드래그 (10자 이상)
2. `content.js`가 Gemini/Claude 버튼 툴바를 선택 영역 근처에 표시
3. 버튼 클릭 → `chrome.runtime.sendMessage({ type: 'AI_OPEN', service, prompt, screenWidth, screenHeight })`
4. `background.js`의 `handleOpen()`이:
   - 원본 창을 화면 왼쪽 75%로 리사이즈 (left=0)
   - AI 창을 오른쪽 25%에 생성
   - `chrome.storage.local`에 `ai_split_state`로 원본 창 정보 저장
   - `ai_pending_{service}`에 프롬프트 저장 (30초 TTL)
5. AI 창이 열리면 inject 스크립트가 `ai_pending_{service}`를 읽어 입력창에 자동 주입
6. AI 창을 닫으면 `chrome.windows.onRemoved`가 원본 창을 원래 크기로 복원

## 창 분할 수식 (background.js)
```js
const mainWidth = Math.round(sw * 0.75);
const sideLeft  = mainWidth - 16;   // Windows DWM 8px×2 border 보정 (겹침 방지 위한 -16)
const sideWidth = sw - sideLeft - 1; // -1: 우측 끝 X버튼 클리핑 방지
```
- Windows DWM 비가시 테두리가 창마다 8px씩 있어서, 두 창 사이 16px 빈틈이 생김
- `sideLeft = mainWidth - 16` 으로 겹쳐서 시각적으로 붙어 보이게 함

## 프롬프트 형식
```
{선택한 텍스트}

위 내용을 쉽게 설명해주세요
```

## 텍스트 주입 방법 (inject 스크립트)
세 가지 방법을 순서대로 시도:
1. `document.execCommand('insertText')` — contenteditable/ProseMirror 최우선
2. `ClipboardEvent('paste')` — React SyntheticEvent 경유
3. `el.innerText = text` + input/change 이벤트 — 마지막 수단

Gemini는 textarea도 처리 (HTMLTextAreaElement.prototype.value 네이티브 setter 사용).

## 주요 chrome.storage 키
- `ai_pending_claude` / `ai_pending_gemini` — 주입할 프롬프트 (30초 TTL)
- `ai_split_state` — 창 분할 상태 (sourceWindowId, aiWindowId, 원본 bounds)

## 코드 수정 시 주의사항
- 전체 파일 재출력 하지 말고 수정 부분만 before → after 형태로
- manifest.json: permissions `["storage", "windows", "clipboardWrite"]` — 추가 권한 필요 시 명시
- claude.ai, gemini.google.com은 content_scripts exclude_matches에서 제외되어 있음 (inject 전용)
- 창 분할 수식 건드릴 때는 DWM 보정값(-16) 유지할 것
