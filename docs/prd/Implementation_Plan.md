# 🚀 Implementation Plan (구현 계획)

전체 목표를 작고 검증 가능한 단위(Milestone)로 쪼개어 개발 순서를 정의합니다.

## Phase 1: 기반 인프라 셋업 (Foundation)
- [ ] **1.1. Workspace 초기화:** C# Worker Service(`/agent`) 및 Remix 프로젝트(`/web`) 보일러플레이트 생성.
- [ ] **1.2. Local DB 세팅:** Remix 서버 내 SQLite 설정 및 스키마(`best_laps`, `settings`) 구성.
- [ ] **1.3. WebSocket 뼈대:** C# Agent와 Remix 서버 간의 기본 WebSocket 통신 채널(Pub/Sub) 구축.

## Phase 2: 데이터 수집 파이프라인 (Data Ingestion)
- [ ] **2.1. UDP 리스너 구현:** C# Agent에서 F1 25 지정 포트(기본 20777) UDP 패킷 리슨.
- [ ] **2.2. 패킷 파싱 및 필터링:** 대상 패킷(Session, Lap Data, Car Telemetry) 디코딩 및 불필요한 패킷 드롭.
- [ ] **2.3. 샘플링 및 송신:** 실시간 UI용 10Hz 데이터 가공(`telemetry_live`) 및 WebSocket 송신.

## Phase 3: 프론트엔드 대시보드 (Visualization)
- [ ] **3.1. PC 대시보드 UI 레이아웃:** 속도계, 스로틀/브레이크 인풋 바, 기어 단수 렌더링.
- [ ] **3.2. 2D 트랙 미니맵 구현:** 실시간 `lapDistance` 기반 차량 위치 및 회전각 표기.
- [ ] **3.3. 모바일 뷰 및 QR 연동:** 반응형 라우팅 구현 및 로컬 IP 기반 QR 코드 생성기 연동.

## Phase 4: AI 레이스 엔지니어 연동 (AI Pipeline)
- [ ] **4.1. 트랙 코너 매핑:** `lapDistance` 기반 코너(Turn) 태깅 로직 및 JSON 매핑 테이블 작성.
- [ ] **4.2. 델타(Delta) 연산 엔진:** 랩 완료 시(`lap_completed`), 베스트 랩과 현재 랩의 코너별 속도/브레이킹 포인트 차이 계산.
- [ ] **4.3. LLM API 연동:** SQLite에 저장된 API 키를 활용하여 OpenAI/Anthropic/Gemini API 호출 및 프롬프트 주입.
- [ ] **4.4. 피드백 UI:** 피트인 또는 랩 완료 시 화면 중앙에 AI 피드백 팝업(클레이모피즘 스타일) 노출.

## Phase 5: 안정성 확보 및 패키징 (Polish & Release)
- [ ] **5.1. 예외 처리 로직:** 플래시백(역행) 및 트래픽 상황 감지 시 데이터 오염 방지 로직(Drop/Reset) 구현.
- [ ] **5.2. 원클릭 실행 래퍼:** Agent와 Web Server를 한 번에 켜고 끌 수 있는 배치/파워쉘 스크립트 작성.