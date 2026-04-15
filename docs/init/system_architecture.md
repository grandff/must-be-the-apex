# 🏗️ System Architecture & Tech Stack

## 1. System Overview
본 프로젝트는 F1 25 플레이어의 로컬 Windows 환경에서 구동되는 에이전트와, 이를 시각화하고 AI 분석을 제공하는 웹 대시보드로 구성된 **'Self-hosted 텔레메트리 & AI 레이스 엔지니어'** 서비스입니다.

---

## 2. Technology Stack

### 📡 2.1. Data Ingestion: Windows Agent
- **기술 스택:** `C# (.NET 8 Worker Service)`
- **선정 사유:** Windows OS와의 네이티브 호환성이 가장 뛰어나며, 초당 60회(60Hz) 쏟아지는 UDP 패킷을 백그라운드에서 메모리 누수 없이 가볍게 비동기로 수신하고 파싱하기에 최적화되어 있습니다.
- **주요 역할:**
  - F1 25 UDP 패킷 수신 및 타겟 패킷(Session, Lap Data, Telemetry) 필터링
  - 실시간 대시보드용 데이터 10Hz 샘플링 및 WebSocket 전송
  - 랩 완료 시 DB 저장을 위한 Batch 데이터 전송

### 🌐 2.2. Backend & Frontend: Web Dashboard
- **기술 스택:** `React Router + Remix (Node.js 환경)`
- **주요 역할:** 
  - WebSocket 연결 관리
  - 로컬 SQLite DB 연동
  - AI API 호출 (OpenAI / Anthropic 등)
  - 클라이언트 UI(PC 브라우저 및 모바일 QR 뷰) 렌더링

### 📂 2.3. Local Database (저장소 전략)
- **기술 스택:** `SQLite`
- **선정 사유:** 별도의 서버 설치가 필요 없는 임베디드 파일 DB로, 로컬 환경(n8n 방식)에서 즉시 실행하기에 진입 장벽이 낮습니다.
- **데이터 관리 전략:**
  - `best_laps`: 트랙별/조건별 유저의 최고 기록 텔레메트리 데이터 저장.
  - `session_history`: 최근 주행 세션의 랩 데이터 임시 저장 (일정 기간 후 자동 삭제).

---

## 🧭 3. Track Mapping Algorithm (코너 인식 알고리즘)

X, Y, Z 좌표만으로는 의미 있는 분석을 생성하기 어려우므로, **'트랙 진행 거리(lapDistance)'**를 기준으로 코너를 맵핑합니다.

1.  **트랙 정보 로드:** `Session` 패킷에서 현재 주행 중인 Track ID(예: 몬자)를 식별합니다.
2.  **사전 정의된 맵 매핑:** Remix 서버 내부에 각 트랙의 코너 진입/탈출 구간을 `lapDistance` 범위로 정의한 JSON 매핑 파일을 유지합니다.
    - *예시:* `{"trackId": 14, "corners": [{"turn": 1, "startDistance": 800, "endDistance": 950}]}`
3.  **실시간 태깅:** C# 에이전트가 보내는 `lapDistance` 값을 이 JSON과 대조하여, 현재 차량이 어떤 Turn을 지나고 있는지 태깅한 후 SQLite에 적재합니다.