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
   * 탑 랭커의 제동 개시 미터(LapDist)와 유저의 실제 브레이킹 시점을 60Hz로 정밀 대조하여 오버레이 화면에 `Early` (빠름) / `Late` (느림) / `Perfect` (완벽) 시각적 표시.
2. **코너 진입 전 실시간 음성 브리핑 (Zero-latency TTS)**
   * 코너 진입 250m 전방에서 해당 코너의 목표 단수(Gear)와 브레이크 압력(Max Brake Pressure)을 윈도우 네이티브 한국어 TTS로 오디오 브리핑.
3. **에이펙스(Apex) 속도 피드백**
   * 코너 중심점(최저 속도점) 통과 시 고수와 유저의 속도차를 실시간으로 비교하여 플래시 효과(`Overspeed` / `Too Slow` / `Perfect`)와 함께 사운드 피드백 제공.

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
* 특정 트랙에 의존적인 하드코딩 데이터가 불필요합니다. 레퍼런스 텔레메트리 로드 시 속도의 로컬 미니멈(Local Minima)과 휠 조향률, 브레이크 최대 입력을 역추적하여 **코너 위치, 브레이크 시작 시점($D_{brake\_start}$), 에이펙스 위치($D_{apex}$)**를 자동으로 판정하고 가상 코너 맵을 메모리 상에 사전 구성합니다.

### 4. 오차 정밀 보정 및 예외 처리
* **트랙 길이 캘리브레이션**: iRacing과 외부 레퍼런스 파일 간의 트랙 누적 거리 오차를 스케일링 팩터 $S$로 변환하여 실시간 대조 시 축척을 완벽히 매핑합니다.
* **스핀/역주행 방어**: 유저가 코스를 이탈하거나 사고로 역주행할 경우 상태 머신이 오동작하는 것을 막기 위해 1프레임당 거리 이동량 및 역류 속도를 모니터링하여 코칭 연산을 자동으로 일시정지(`PAUSE`)하고 정상 주행 복귀 시 활성화합니다.

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
│   │   ├── iracing-client.js  # node-irsdk 연동 및 실시간 데이터 수집
│   │   ├── db-manager.js      # SQLite DB 조회 매니저
│   │   └── analyzer.js        # 실시간 데이터 대조, 코너 분석 및 코칭 상태 머신
│   ├── renderer/              # 렌더러 프로세스 (오버레이 UI)
│   │   ├── index.html         # 투명 뷰포트 레이아웃
│   │   ├── style.css          # 오버레이 CSS 애니메이션
│   │   └── ui-controller.js   # IPC 리스너, DOM 드로잉, Web Speech TTS 재생
│   └── preload.js             # Context Isolation 기반 IPC 브릿지
├── assets/
│   └── mock/                  # macOS 로컬 개발용 시뮬레이션용 더미 데이터 (.json)
├── package.json
└── electron-builder.json      # 빌드/패키징 배포 옵션
```

---

## 🚀 개발 및 실행 가이드 (Getting Started)

### 1. 의존성 설치
```bash
npm install
```

### 2. 로컬 실행
* **Windows (iRacing 실행 상태 또는 대기 상태)**:
  ```bash
  npm start
  ```
* **macOS / Linux (더미 텔레메트리를 활용한 화면 개발 및 테스트)**:
  `process.platform !== 'win32'`일 경우 자동으로 `assets/mock/`의 JSON 덤프 파일로 60Hz 더미 스트림을 생성하여 오버레이 연산 및 TTS 작동을 오프라인으로 테스트할 수 있습니다.
  ```bash
  npm start
  ```

### 3. 단일 실행 파일 (.exe) 빌드
```bash
npm run dist
```
* **GitHub Actions** CI와 연동되어 푸시 시 C++ 네이티브 모듈 컴파일 에러 없는 온전한 인스톨러 패키지가 배포됩니다.
