# ✅ TASKS.md

이 문서는 `Implementation_Plan.md`를 바탕으로 도출된 가장 작은 단위의 구체적인 개발 태스크 목록입니다. 개발을 진행할 때마다 이 문서를 체크리스트로 활용합니다.

## Phase 1: 기반 인프라 셋업 (Foundation)
- [x] **1.1.1** C# Worker Service (`/agent`) 프로젝트 보일러플레이트 생성 (명령어: `dotnet new worker`) ✅ 2026-04-14
- [x] **1.1.2** Remix (`/web`) 프로젝트 보일러플레이트 생성 (명령어: `npx create-remix@latest`) ✅ 2026-04-14
- [x] **1.2.1** Remix 서버 내 SQLite DB 드라이버 설치 (예: `better-sqlite3`) ✅ 2026-04-14
- [x] **1.2.2** SQLite 스키마 생성 스크립트 작성 (`best_laps`, `settings` 테이블 구조 정의) ✅ 2026-04-14
- [x] **1.3.1** C# Agent 내 WebSocket 클라이언트 기본 뼈대 코드 작성 (서버 주소를 외부 설정으로 받도록 설계) ✅ 2026-04-14
- [x] **1.3.2** Remix 내 WebSocket 서버 뼈대 코드 작성 및 C# Agent와 연결 테스트 ✅ 2026-04-14

## Phase 2: 데이터 수집 파이프라인 (Data Ingestion - Windows Agent)
- [x] **2.1.1** C# Agent 내 지정 포트(20777) 기반 UDP 리스너 클래스 구현 ✅ 2026-04-15
- [x] **2.1.2** 수신된 바이트 배열(UDP 패킷)을 콘솔에 임시 출력하여 연결 확인 ✅ 2026-04-15
- [x] **2.2.1** 패킷 헤더(Packet Header) 구조체(Struct) C# 파싱 로직 작성 ✅ 2026-04-15 (`PacketParser.cs`)
- [x] **2.2.2** Packet ID 기반 라우팅: Session(1), Lap Data(2), Car Telemetry(6) 외 나머지 패킷 드롭 처리 ✅ 2026-04-15
- [x] **2.3.1** 수신된 데이터를 `telemetry_live` 포맷으로 변환하는 매핑 로직 구현 ✅ 2026-04-15
- [x] **2.3.2** 10Hz(초당 10번) 주기로 샘플링하여 WebSocket으로 `telemetry_live` JSON 송신 ✅ 2026-04-15
- [x] **2.3.3** 텔레메트리 데이터를 JSON/CSV 형식으로 파일 저장하는 기능 추가 ✅ 2026-04-15 (`TelemetryFileWriter.cs`)
- [x] **2.3.4** appsettings.json에서 포트 및 WebSocket URL 설정 가능하도록 연동 ✅ 2026-04-15

## Phase 3: 프론트엔드 대시보드 (Visualization - Web Server)
- [ ] **3.1.1** PC 대시보드 React 라우터 및 기본 레이아웃 컴포넌트(Header, Main) 구성
- [ ] **3.1.2** WebSocket 클라이언트 훅(Hook) 작성 (서버에서 `telemetry_live` 데이터 수신)
- [ ] **3.1.3** 속도계 렌더링 컴포넌트 (숫자 및 게이지 바) 구현
- [ ] **3.1.4** 기어 단수 및 페달(스로틀/브레이크) 인풋 바 컴포넌트 구현
- [ ] **3.2.1** 2D 트랙 미니맵을 위한 SVG 또는 Canvas 컴포넌트 작성
- [ ] **3.2.2** 실시간 `lapDistance` 값에 맞춰 미니맵 위에 차량 아이콘(위치/회전) 렌더링 로직 구현
- [ ] **3.3.1** 접속된 디바이스(PC/Mobile) 크기에 따른 반응형 CSS (미니멀 Dash 모드) 적용
- [ ] **3.3.2** 로컬 IP(예: 192.168.x.x:3000)를 가리키는 QR 코드 생성 컴포넌트 작성 및 노출

## Phase 4: AI 레이스 엔지니어 연동 (AI Pipeline - Web Server)
- [x] **4.1.1** 트랙 ID별 코너 진입/탈출 구간(`lapDistance`) JSON 매핑 테이블 초안 작성 (Jeddah, Miami) ✅ 2026-04-15
  - 사우디아라비아 (ID 1): 17개 코너 매핑
  - 마이애미 (ID 2): 19개 코너 매핑
  - `cornerMapping.ts` 위치: `web/app/lib/tracks/cornerMapping.ts`
- [ ] **4.1.2** Remix 서버에서 현재 `lapDistance`를 바탕으로 Turn 번호 태깅 로직 구현
- [ ] **4.2.1** 한 랩 종료 시점(`lap_completed` 이벤트) 판단 로직 구현
- [ ] **4.2.2** 베스트 랩과 현재 랩의 코너별 진입 속도/브레이킹 포인트 차이(Delta) 연산 함수 작성
- [ ] **4.3.1** SQLite 설정 DB에서 유저가 입력한 LLM API Key 불러오기 기능 구현
- [ ] **4.3.2** OpenAI / Anthropic 등 LLM API 연동 클라이언트 작성 (System/User Prompt 주입)
- [ ] **4.4.1** AI 분석 결과(문자열)에서 주요 수치를 정규식으로 파싱하여 강조(Highlight)하는 유틸 함수 작성
- [ ] **4.4.2** 프론트엔드 중앙 팝업(클레이모피즘 스타일)으로 AI 피드백 텍스트 렌더링 로직 구현

## Phase 5: 안정성 확보 및 배포 (Polish & Release)
- [x] **5.1.1** `lapDistance`가 급격히 줄어들 경우(플래시백)를 감지하는 예외 처리 작성 ✅ 2026-04-15 (Worker.cs에 구현)
- [x] **5.1.2** 플래시백 감지 시 현재 랩 임시 메모리(캐시) 초기화(Reset) 로직 구현 ✅ 2026-04-15
- [x] **5.1.3** 비정상적인 스로틀/브레이크 패턴(트래픽 감지) 발생 시 델타 연산 대상에서 제외(Drop)하는 로직 구현 ✅ 2026-04-15
- [ ] **5.2.1** C# Agent를 .NET 런타임 없이 실행 가능한 초경량 단일 실행 파일(AOT)로 빌드 및 패키징 설정
- [ ] **5.2.2** Remix 서버 + SQLite DB 환경을 완벽히 포함하는 `Dockerfile` 및 `docker-compose.yml` 작성 (셀프 호스팅 배포용)