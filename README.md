# Must Be The Apex 🏎️🏁

> **외부 서버나 유료 구독(SaaS) 없이 드라이버의 로컬 자원만을 100% 활용하는 로컬 완결형 실시간 심레이싱 코칭 시스템**

`Must Be The Apex`는 VRS, Garage 61, Trophi.ai 등 기존 텔레메트리 코칭 플랫폼들의 한계(비싼 구독료, 데이터 업로드 지연, 복잡한 그래프 해석)를 해결하기 위해 설계된 **윈도우 네이티브 인게임 실시간 오버레이 코칭 서비스**입니다. 

아이레이싱(iRacing) SDK의 60Hz Shared Memory 데이터 스트리밍을 실시간으로 포착하고, 로컬에 저장된 세계 탑 랭커의 주행 라인 데이터를 무지연(Zero-latency)으로 대조하여 코너 진입 전에 음성 가이드를 제공하고 에이펙스(Apex)에서의 감속 상태를 실시간 시각 피드백으로 전송합니다.

---

## 🌟 핵심 가치 (Core Values)

* **Zero UX (원클릭 백그라운드 구동)**
  유저에게 어떠한 수동 트랙 설정이나 영역 지정을 요구하지 않습니다. 게임에 접속하면 SDK를 통해 차량과 트랙을 자동으로 인식하고 백그라운드에서 레퍼런스 주행 분석을 마칩니다.
* **Actionable Feedback (직관적인 실시간 피드백)**
  주행이 종료된 후 그래프 분석 툴을 보며 자책하는 스트레스를 제거합니다. 코너 진입 250m 전에 네이티브 TTS 음성이 공략 목표를 귀에 꽂아주고, 에이펙스 통과 순간 속도의 적절성을 오버레이 플래시로 깜빡여 줍니다.
* **Serverless / Low Resource (유지비 0원 & 고프레임 유지)**
  클라우드 서버나 외부 API 요금 없이 드라이버의 PC에서 100% 로컬 연산되므로 서비스 영구 무료화가 가능합니다. 무거운 AI 모델 대신 초고속 정밀 수학 비교 연산을 활용하여 게임 프레임(FPS) 저하를 방지합니다.

---

## 🛠️ 핵심 기능 (Key Features)

1. **코너 브레이크 타이밍 프로그레스 바 (Overlay)**
   * 탑 랭커의 제동 개시 미터(LapDist)와 유저의 실제 브레이킹 시점을 60Hz로 정밀 대조하여 오버레이 화면에 5단계(`TOO EARLY` / `EARLY` / `PERFECT` / `LATE` / `TOO LATE`) 제동 게이지 가로 스케일 바 시각화.
2. ** upcoming Corner Focus Guide (Overlay)**
   * 코너 200m 전방에서 실시간 남은 거리 카운트다운(m) 및 목표 공략 정보(기어 단수, 최대 브레이크 압력 %, 회전 방향)를 화면 오버레이 카드 형태로 상시 안내.
3. **코너 진입 전 실시간 음성 브리핑 (Zero-latency TTS)**
   * 코너 진입 250m 전방에서 해당 코너의 목표 단수(Gear)와 브레이크 압력(Max Brake Pressure)을 윈도우 네이티브 한국어 TTS로 무지연 오디오 브리핑.
4. **에이펙스(Apex) 속도 피드백 & 에지 플래시**
   * 코너 중심점(최저 속도점) 통과 시 고수와 유저의 속도차를 실시간 비교하여 화면 에두리에 풀스크린 에지 글로우 플래시 효과(`Overspeed` / `Too Slow` / `Perfect`) 제공.
5. **점진적 고스트 매칭 (Progressive Ghost Matching)**
   * 사용자의 랩 타임 최고 기록(PB)을 바탕으로, 사용자가 다음 번에 꺾을 수 있는 "약간 빠른 상위 레벨 탑 랭커 레퍼런스"를 SQLite DB에서 자동 매치합니다. 랩 완료 순간 기록이 경신되면 차세대 타겟으로 자동 업그레이드 됩니다.

---

## 📐 기술 아키텍처 및 세부 설계 (Technical Specifications)

본 프로젝트는 고주파수(60Hz) 시계열 데이터 대조를 프레임 저하 없이 소화하기 위해 최적화된 로컬 파이프라인을 구축하고 있습니다.

### 1. 프로세스 아키텍처 (Electron 구조)
* **Main Process (Node.js)**: `node-irsdk` 라이브러리를 통해 iRacing 공유 메모리와 연동하여 60Hz 주기로 물리 데이터를 직접 수집하고, 실시간 데이터 분석 엔진(`analyzer.js`)을 가동하여 델타 계산 및 코너 상태 머신을 처리합니다.
* **Renderer Process (HTML5/CSS/JS)**: 게임 위로 투명하게 띄워진 오버레이 UI 레이어입니다. Win32 API(`setIgnoreMouseEvents`)를 활성화하여 마우스 입력을 게임 화면으로 관통시키고, 브라우저 표준 Web Speech API를 통해 0ms의 즉각적인 음성 가이드를 재생합니다.

### 2. 고성능 인메모리 대조 아키텍처
* **SQLite 로컬 레퍼런스 DB**: 개발자나 사용자가 사전에 일괄 크롤링하여 채워 넣은(Pre-populated) Garage 61 Fixed 최고 랭커 데이터를 로드합니다. **런타임 시 어떠한 외부 다운로드 요청이나 네트워크 트래픽도 발생하지 않습니다.**
* **인메모리 배열 캐시 ($O(1)$ Lookup)**: 주행 중 실시간 DB 조회 오버헤드를 배제하기 위해, 세션 로드 시 SQLite DB에서 매칭 데이터를 꺼내어 **1m 단위 인덱스 배열 (`telemetryCache`)**로 메모리에 완전히 구조화합니다.

### 3. 코너 자동 추출 엔진 (Dynamic Corner Extraction)
* 특정 트랙에 의존적인 하드코딩 데이터가 불필요합니다. 레퍼런스 텔레메트리 로드 시 속도의 로컬 미니멈(Local Minima)과 휠 조향률, 브레이크 최대 입력을 역추적하여 **코너 위치, 브레이크 시작 시점($D_{brake\_start}$), 에이펙스 위치($D_{apex}$), 코너 회전 방향(Left/Right)**을 자동으로 판정하고 가상 코너 맵을 메모리 상에 사전 구성합니다.

---

## 📂 디렉토리 구조 (Directory Structure)

```text
must-be-the-apex/
├── .github/
│   └── workflows/
│       └── build.yml          # GitHub Actions 자동 빌드 스크립트 (Windows용)
├── src/
│   ├── main/                  # 메인 프로세스 (Node.js Core)
│   │   ├── index.js           # 일렉트론 엔트리, 윈도우 생성 및 생명주기
│   │   ├── iracing-client.js  # node-irsdk 연동 및 실시간 데이터 수집 / macOS Mock 플레이백
│   │   ├── db-manager.js      # SQLite DB 조회 매니저 및 PB 관리
│   │   └── analyzer.js        # 실시간 데이터 대조, 코너 분석 및 코칭 상태 머신
│   ├── renderer/              # 렌더러 프로세스 (오버레이 UI)
│   │   ├── index.html         # 투명 뷰포트 레이아웃
│   │   ├── style.css          # F1 스타일 그래픽 및 스킨
│   │   └── ui-controller.js   # IPC 리스너, DOM 드로잉, Web Speech TTS 재생, 드래그/리사이즈
│   └── preload.js             # Context Isolation 기반 IPC 브릿지
├── assets/
│   └── mock/                  # macOS 로컬 개발용 실주행 텔레메트리 데이터 (.csv)
├── package.json
└── electron-builder.json      # 빌드/패키징 배포 옵션
```

---

## 🚀 개발 및 실행 가이드 (Getting Started)

### 1. 의존성 설치
```bash
npm install
```

### 2. 로컬 실행 및 오프라인 검증 (macOS 개발 환경 테스트)
macOS 환경에서 주행 데이터 연동과 오버레이 HUD 기능을 검증하기 위해 **실주행 CSV 덤프 플레이백 엔진**이 포함되어 있습니다.
1. `assets/mock/` 폴더를 생성합니다. (자동 생성됨)
2. 일렉트론 실행 중에 기록되어 자동 저장되거나 수동 다운로드한 실주행 CSV 파일(예: `session_practice_spa-francorchamps_porsche-911-gt3-r.csv`) 중 검증하고자 하는 파일을 `assets/mock/` 폴더 내에 위치시킵니다.
3. 애플리케이션을 구동합니다:
   ```bash
   npm start
   ```
4. 플레이백 엔진이 CSV 파일명과 내용을 분석하여 트랙명, 차량명, 최대 길이를 파싱하고 60Hz 주기로 텔레메트리 데이터를 방출합니다. 유저는 맥북 환경에서도 오버레이의 브레이크 타이밍 게이지, 코너 Focus Guide 카운트다운, 에이펙스 에지 글로우 깜빡임 및 무지연 음성 가이드를 실시간으로 테스트할 수 있습니다.
5. `assets/mock/` 내에 CSV가 없는 경우, 기본 Spa-Francorchamps 수학 제네레이터 폴백이 적용됩니다.

### 3. HUD 위젯 위치 및 크기 편집 (Edit Mode)
1. 앱이 실행된 상태에서 글로벌 단축키 **`Command+Shift+O` (macOS)** 또는 **`Control+Shift+O` (Windows)**를 입력합니다.
2. 화면 상단에 붉은색 **"HUD EDIT MODE"** 배너가 켜지며 마우스 클릭이 오버레이에 차단되지 않고 위젯을 잡을 수 있게 됩니다.
3. 각 HUD 위젯 상단의 빨간색 바(Drag Handle)를 잡아 드래그하여 위치를 옮기고, 하단 우측 모서리(Resize Handle)를 드래그해 위젯 크기를 재설정합니다.
4. 다시 **`Command+Shift+O` / `Control+Shift+O`**를 누르면 편집 모드가 잠금 해제되고 레이아웃이 로컬 저장소(`localStorage`)에 영구 보존된 채 마우스 클릭 관통(Click-Through) 게임 오버레이 모드로 복원됩니다.

### 4. 세션 단위 데이터 관리
* 주행 중 데이터 수집 시 랩마다 누적되던 기록을 단일 통합 세션 CSV 파일 포맷으로 일체화하였습니다.
* CSV 데이터 내에 `Lap` 칼럼이 추가 기재되므로 세션 이력 관리가 정돈되며, 다운로드 목록 카드에도 날짜, 서킷, 차량, 총 랩 수 및 프레임 크기가 직관적으로 표출됩니다.

### 5. 단일 실행 파일 (.exe) 빌드
```bash
npm run dist
```
* **GitHub Actions** CI 워크플로우와 연동되어 있으므로 저장소 푸시 시 C++ 네이티브 모듈 컴파일 충돌 없이 온전한 윈도우 단일 인스톨러 패키지가 빌드 완료됩니다.
