# 🎨 Design Guidelines (디자인 및 비주얼 가이드라인)

## 1. Design Concept & Theme
- **Theme:** Deep Dark Mode (주행 중 눈부심 및 시각적 방해 최소화)
- **Style:** 매트한 클레이모피즘 (Matte Claymorphism) - 과도한 그림자나 글래스모피즘을 지양하고, 부드럽고 차분한 입체감으로 UI 컴포넌트의 깊이를 표현.

## 2. Color Palette
- **Base / Background:** `#0F0F13` (Deep Dark Gray)
- **Surface / Card:** `#1C1C21` (Slightly lighter dark for components)
- **Primary / Point:** `#8400FF` (Electric Purple) - 베스트 랩 갱신, 긍정적 지표, 주요 활성화 버튼.
- **AI Highlight / Alert:** `#DC6075` (Soft Crimson) - AI가 지적하는 문제 구간(Delta 마이너스), 주의가 필요한 수치 (예: 15m 빠름).
- **Text (Primary):** `#FFFFFF` (87% Opacity)
- **Text (Secondary):** `#A0A0A5`

## 3. Typography
- **UI / 본문 텍스트:** `Inter` 또는 `Pretendard` (깔끔한 산세리프).
- **수치 / 텔레메트리 데이터:** `JetBrains Mono` 또는 `Fira Code` (가독성 높은 Monospace 폰트 필수 - 숫자가 빠르게 변할 때 레이아웃이 흔들리지 않도록 고정폭 사용).

## 4. UI Component Layout
- **PC View (종합 대시보드):** 
  - 좌측: 2D 실시간 트랙 미니맵.
  - 중앙: 실시간 속도계, 기어, 페달(스로틀/브레이크) 인풋 바 (가로/세로 바 형태).
  - 우측: AI 엔지니어 피드백 로그 및 코너별 델타(Delta) 차트.
- **Mobile View (미니멀 Dash):**
  - 스티어링 휠 거치를 가정.
  - 가로 모드 고정. 화면 전체를 기어 단수와 속도, 레브 리미터(RPM LED)로 채움. 부가 정보 과감히 생략.

## 5. CSS & Styling Rules
- **TailwindCSS 사용 금지:** 초기 기획에 따라 Vanilla CSS (또는 CSS Modules / Styled-Components)를 우선하여 렌더링 퍼포먼스와 유연성을 확보.
- **Animation:** 데이터 렌더링 시 초당 10프레임 변화가 눈에 띄게 끊기지 않도록, CSS `transition: all 0.1s ease-out` 등을 활용한 보간(Interpolation) 적용.