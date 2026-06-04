# Must be The Apex

## 1. 프로젝트 개요 (Project Overview)
**Must be The Apex**는 외부 서버나 유료 구독(SaaS) 없이 드라이버의 윈도우 PC 자원만을 100% 활용하는 **로컬 완결형 실시간 심레이싱 코칭 시스템**입니다. 

기존 시장의 강자들(Trophi.ai, Garage 61, VRS)이 가진 약점인 '비싼 월 구독료', '데이터 서버 업로드 지연', '복잡한 그래프 해석의 어려움'을 정조준합니다. 아이레이싱(iRacing) SDK의 실시간 메모리 스트리밍(60Hz)과 로컬에 적재된 세계 톱 랭커의 데이터를 무지연(Zero-latency)으로 대조하여, 유저가 운전대를 잡고 있는 **주행 순간(In-game)**에 오버레이와 음성으로 즉각적인 행동 지침을 내립니다.

---

## 2. 제품 기획 및 디자인 (Product Specification)

### 2.1 핵심 가치 (Core Value)
* **Zero UX (원클릭 경험):** 유저에게 복잡한 영역 지정이나 세팅을 요구하지 않고, 게임에 진입하면 자동으로 트랙과 차량을 인식해 백그라운드에서 분석을 완료합니다.
* **Actionable Feedback (직관적 피드백):** 사후에 웹사이트에서 그래프를 분석하는 스트레스를 없애고, 코너 진입 전과 탈출 직후 실시간 오버레이/음성 가이드를 제공합니다.
* **Serverless / Low Resource:** 중앙 인프라가 필요 없어 서버 유지비가 0원이며, 무거운 딥러닝 비전 모델 대신 고속 수치 대조 알고리즘을 사용해 게임 프레임(FPS) 드랍을 방지합니다.

### 2.2 3대 핵심 기능 (Key Features)
1. **코너별 브레이크 타이밍 프로그레스 바 (Overlay)**
   * 베스트 랩의 브레이크 시작 지점을 기준으로 유저의 입력 시점을 계산하여 인게임 화면에 실시간으로 표시 (`Early` / `Late` / `Perfect`).
2. **코너 진입 전 실시간 음성 지시 (Web Speech API TTS)**
   * 코너 진입 250m 전방에서 고수의 공략(목표 기어 단수, 브레이크 압력 목표치)을 레이턴시 없이 음성 사전 브리핑.
3. **에이펙스(Apex) 구간 속도 및 조향 피드백**
   * 코너 중심점(최저 속도 마크 지점)에서 고수 대비 유저의 속도 및 휠 조향 적정성을 평가하여 오버레이 화면에 순간 플래시 효과(`Overspeed` / `Too Slow` / `Perfect`) 제공.

---

## 3. 기술 아키텍처 및 스택 (Tech Stack)

### 3.1 프로세스 아키텍처
* **런타임 환경:** Windows 10/11 전용 (iRacing 및 Win32 API 종속성)
* **프레임워크:** **Electron (일렉트론)**
  * **Main Process (Node.js):** iRacing SDK 데이터 수집, 데이터 가공 및 인메모리 비교 연산, 실시간 코칭 로직 제어.
  * **Renderer Process (HTML5/CSS/JS):** 투명도 및 마우스 관통(Click-through)이 적용된 게임 가상 오버레이 UI 레이어 및 Web Speech API TTS 출력 담당.

### 3.2 데이터베이스 및 파이프라인
* **로컬 데이터베이스:** **SQLite**
  * 사전에 일괄 크롤링하여 저장된 Garage 61 베스트 랭커 텔레메트리 데이터(`raw_csv_data` 등)를 로컬에서 조회/적재하는 용도로만 사용.
* **인메모리 배열 캐싱 (High-performance Memory Cache):**
  * 60Hz 텔레메트리 연산 시 SQLite DB의 잦은 쿼리 지연을 방어하기 위해, 세션 로딩 시 DB에서 레퍼런스 데이터를 읽어와 트랙 거리(`LapDist`) 1m 단위 인덱스 배열(`telemetryCache`)로 메모리에 통째로 로드하여 $O(1)$ 상수 시간으로 룩업을 수행합니다.
* **데이터 로드 및 코너 자동 추출 (Auto-detection):**
  * 유저 세션 진입 시 해당 트랙/차량 조건에 맞춰 사전에 로컬 DB에 적재된 Garage 61 Fixed 주간 최고 랭커 텔레메트리 데이터를 로드.
  * 데이터를 1m 단위로 리샘플링하여 메모리에 적재할 때, **감속 속도율 및 브레이크/조향 입력 프로파일을 알고리즘으로 분석하여 각 코너의 진입 구간 및 에이펙스 위치를 자동으로 추출(Pre-calculation)**합니다.

### 3.3 오버레이 및 시스템 제어 기술
* **iRacing 연동:** `node-irsdk` 라이브러리를 활용한 60Hz Shared Memory 데이터 래핑.
* **오버레이 윈도우 창 설정:**
  * `transparent: true`, `hasShadow: false`, `alwaysOnTop: true`
  * Win32 API (`setIgnoreMouseEvents`)를 통한 마우스 클릭 관통 구현.
* **무지연 오디오 출력 (Zero-latency TTS):**
  * 기존 외부 프로세스(PowerShell) 실행 방식 대신, 일렉트론 렌더러 프로세스 내장 **Web Speech API (`window.speechSynthesis`)**를 직접 호출하여 지연 속도를 0ms로 단축하며, 단일 앱 내에서 로컬 OS 시스템 TTS를 무지연 제어합니다.

---

## 4. 순차적 개발 로드맵 (Development Roadmap)

### 🚀 Phase 1: 데이터 커널 및 수치 연산 엔진 (Core Kernel)
* [ ] `node-irsdk` 연동 테스트 환경 구축 및 실시간 메모리 스트리밍 데이터 구조 분석.
* [ ] 로컬 SQLite DB 연동 및 1m 단위 정형화 리샘플링 파서(Parser) 구현.
* [ ] 레퍼런스 데이터 파싱 시 코너 구간 및 에이펙스 지점을 분석하여 메모리에 적재하는 **코너 자동 추출 알고리즘** 구현.
* [ ] 주행 중 유저의 현재 디스턴스(`LapDist`)와 메모리 캐시 배열을 0ms 랙으로 매칭하는 비교 연산 엔진 구현.
* [ ] 브레이킹 시점 감지 및 코너 상태 머신(State Machine)을 활용한 에이펙스 판정 알고리즘 검증.

### 🚀 Phase 2: 인게임 오버레이 UI 및 오디오 레이어 (UI & Sound)
* [ ] 일렉트론 기반의 윈도우 투명 마우스 관통 오버레이 윈도우 프로토타입 셋업.
* [ ] Web Speech API를 활용하여 메인 프로세스로부터 `tts-trigger` IPC 신호를 받는 즉시 동작하는 **무지연 TTS 큐 관리 모듈** 구현.
* [ ] 판단 결과(`Early`/`Late`/`Perfect`) 및 에이펙스 플래시(`Overspeed`/`Too Slow`/`Perfect`)에 따라 실시간 렌더링되는 CSS 애니메이션 컴포넌트 개발.

### 🚀 Phase 3: 테스트 및 자동 배포 파이프라인 (Integration & CD)
* [ ] 맥(macOS) 로컬 개발 환경용 가짜 텔레메트리 스트림 더미 모듈(Mocking Service) 구축.
* [ ] 실제 윈도우 PC 환경에서 아이레이싱을 구동하며 실차 테스트 및 UI 동기화 오차(물리적 맵 보정) 디버깅.
* [ ] **GitHub Actions** 워크플로우를 연동하여 `windows-latest` 러너 기반으로 C++ 네이티브 모듈 컴파일 충돌 없는 단일 `.exe` 배포 설치 패키지 빌드 자동화 완료.