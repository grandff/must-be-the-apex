---
name: iracing-sdk-handler
description: iRacing SDK 및 Telemetry 데이터 연동, 실시간 데이터 폴링, 메모리 버퍼 최적화, 트랙 상태(랩타임, 세션 정보) 및 차량 동역학 데이터 추출을 담당하는 스킬입니다. iRacing SDK, node-iracing-sdk, 텔레메트리 관련 구현 요청 시 활성화됩니다.
---

# Goal
iRacing 시뮬레이터로부터 실시간 텔레메트리 데이터를 누수 없이 안전하게 수집하고, 드라이버의 트랙 경험을 향상시키기 위한 데이터 가공 및 분석 파이프라인을 구축합니다.

# Instructions
1. **실시간 데이터 스트리밍 최적화:** iRacing SDK의 데이터 업데이트 주기에 맞춰 메인 루프(정기적 폴링 또는 이벤트 리스너 방식)를 효율적으로 설계하고, CPU 오버헤드를 최소화하는 코드를 제안하세요.
2. **데이터 필터링 및 매핑:** 수백 가지의 텔레메트리 변수 중 앱에 필요한 핵심 데이터(예: `Speed`, `RPM`, `Gear`, `LapDistPct`, `TrackSurface`)만 골라내어 가공하는 구조를 정의하세요.
3. **연결 상태 예외 처리:** 시뮬레이터가 켜지거나 꺼질 때(`IsConnected` 상태 변경), 또는 세션이 전환될 때 데이터 수집 프로세스가 안전하게 재시작되거나 대기하도록 예외 처리를 명시하세요.

# Constraints
- **Electron 아키텍처 연동:** iRacing SDK 데이터 로깅 및 C++ 바인딩 라이브러리 호출은 반드시 메인 프로세스(Main Process)에서 처리하고, IPC 통신 시 데이터 크기를 최적화(Throttling/Debouncing)하여 렌더러로 전송하세요.
- 메모리 누수를 방지하기 위해 사용하지 않는 세션 메모리나 버퍼는 즉시 해제(Clean-up)하는 코딩 패턴을 유지하세요.

# Examples

### Input
"iRacing에서 현재 RPM과 속도, 기어 단수를 가져와서 렌더러로 보낼 수 있는 메인 프로세스 코드를 짜줘."

### Output
iRacing SDK의 실시간 데이터를 메인 프로세스에서 주기적으로 폴링하고, Electron의 `webContents.send`를 통해 렌더러로 안전하게 전달하는 구조입니다. UI 프레임 드랍을 막기 위해 60Hz(약 16ms) 또는 30Hz 주기로 스로틀링하여 전송하는 것이 좋습니다.

**메인 프로세스 (iracing-manager.js)**
```javascript
const iracingSdk = require('node-iracing-sdk'); // 혹은 프로젝트에서 사용하는 SDK 라이브러리
const { BrowserWindow } = require('electron');

let updateInterval = null;

function startTelemetryTracking(mainWindow) {
  // 1. iRacing SDK 초기화 및 연결
  iracingSdk.init({
    requestParams: ['Speed', 'RPM', 'Gear', 'IsConnected']
  });

  // 2. 60Hz 주기로 데이터 폴링 루프 시작 (약 16.6ms)
  updateInterval = setInterval(() => {
    const sample = iracingSdk.getTelemetry();

    if (sample && sample.IsConnected) {
      // 렌더러에 필요한 핵심 데이터만 정제
      const telemetryData = {
        speed: Math.round(sample.Speed * 3.6), // m/s -> km/h 변환
        rpm: Math.round(sample.RPM),
        gear: sample.Gear // -1: R, 0: N, 1~: Gears
      };

      // 렌더러 프로세스로 전송
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('telemetry-update', telemetryData);
      }
    }
  }, 16);
}

function stopTelemetryTracking() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  iracingSdk.shutdown();
}

module.exports = { startTelemetryTracking, stopTelemetryTracking };
```