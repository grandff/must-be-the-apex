# 🛠️ SKILL.md (반복 작업 및 API 명세 지침)

이 문서는 프로젝트 내에서 반복적으로 참조해야 하는 **복잡한 통신 규격(WebSocket Payload)** 및 **필수 유틸리티 패턴**을 모아둔 스킬셋 문서입니다.
AI 에이전트와 개발자는 이 문서를 참고하여 코드의 일관성을 유지해야 합니다.

## 1. WebSocket Payload Specs (통신 규격)

모든 WebSocket 이벤트는 `type`, `timestamp`, `data` 구조를 엄격히 따라야 합니다.

### 1.1 실시간 텔레메트리 (Live Telemetry)
초당 10회(10Hz)로 전송되며 프론트엔드 대시보드의 계기판을 실시간으로 렌더링하는 데 사용됩니다.
```json
{
  "type": "telemetry_live",
  "timestamp": 1713000000000,
  "data": {
    "trackId": 14,
    "lapNumber": 5,
    "lapDistance": 845.2,
    "speedKmh": 315,
    "gear": 8,
    "throttle": 1.0,
    "brake": 0.0,
    "steer": 0.0,
    "coordinates": { 
      "x": 105.2, 
      "y": 12.0, 
      "z": -40.5 
    },
    "tyreTemperature": [95, 95, 98, 98]
  }
}
```
**[스킬 활용처]:** 프론트엔드 `UI 렌더링 컴포넌트` 작성 시 및 C# `UDP 패킷 파싱 후 변환` 시 위 스키마를 TypeScript의 `interface` 나 C#의 `Record/Struct`로 그대로 차용할 것.

### 1.2 랩 완료 분석 트리거 (Lap Completed)
한 랩이 정상적으로(Invalid 되지 않게) 완료되었을 때, 델타 연산 지표와 함께 1회 전송되어 AI 분석을 트리거합니다.
```json
{
  "type": "lap_completed",
  "data": {
    "trackId": 14,
    "lapNumber": 5,
    "lapTimeMs": 81500,
    "isPersonalBest": false,
    "invalidated": false,
    "cornerDeltas": [
      {
        "turn": 1,
        "entrySpeedDiff": 5,
        "apexSpeedDiff": -8,
        "brakingPointDiffMeters": 15
      }
    ]
  }
}
```
**[스킬 활용처]:** LLM 프롬프트에 주입하기 전, 위 `cornerDeltas` 배열을 순회하며 자연어 텍스트로 변환하는 백엔드 유틸 함수 작성 시 참조.

## 2. 반목적인 예외 처리 스킬 (Exception Handling)
- **에러 로그 형식 통일:** `[모듈명] 에러내용 - 세부값` (예: `[UDP_Receiver] Packet Parse Error - Invalid Packet ID 99`)
- **JSON 파싱 안전성:** C#이나 TypeScript 모두 JSON 파싱/직렬화 시 반드시 `try-catch` 블록으로 감싸거나 안전한 래퍼 함수(Safe Parser)를 사용할 것.