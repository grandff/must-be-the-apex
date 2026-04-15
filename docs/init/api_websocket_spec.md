# 🔌 WebSocket API & Payload Specification

> [!IMPORTANT]
> 본 문서는 **C# Windows Agent**와 **Remix Server** 간의 실시간 양방향 통신을 위한 데이터 규격을 정의합니다.

---

## 1. Live Telemetry (실시간 대시보드용)

초당 **10회(10Hz)**로 샘플링되어 전송되며, 다음 UI 요소들을 렌더링하는 데 사용됩니다.
- 속도계 및 기어 표시
- 스로틀/브레이크 인풋 바
- 미니맵 내 소형 F1 머신 아이콘 위치 및 회전

### 📑 Specification
- **Event Type:** `telemetry_live`
- **Payload Schema:**

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

---

## 2. Lap Completed (AI 분석 트리거용)

결승선을 통과하여 한 랩이 유효하게(Invalid 상태가 아님) 종료되었을 때 전송됩니다. 해당 랩의 요약 데이터와 주요 코너별 **델타(Delta) 연산 지표**를 포함합니다.

### 📑 Specification
- **Event Type:** `lap_completed`
- **Payload Schema:**

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

> [!TIP]
> `cornerDeltas` 데이터는 AI 레이스 엔지니어가 드라이버에게 즉각적인 피드백을 생성하는 데 핵심적인 입력값으로 활용됩니다.