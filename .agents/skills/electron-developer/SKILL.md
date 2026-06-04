---
name: electron-developer
description: Electron 프로젝트의 메인/렌더러 프로세스 아키텍처 가이드, IPC 통신 구현, 보안 설정(Context Isolation), 빌드 오류 해결을 담당합니다. 특히 사용자의 로컬 PC에 Self-host 형태로 실행되는 환경을 고려하여 메모리 누수 방지, 가비지 컬렉션 최적화, CPU 및 백그라운드 리소스 최소화 규칙을 강제합니다.
---

# Goal
개인 사용자 PC 환경에서 실행되는 만큼 고사양 게임(iRacing 등)과 동시 실행 시에도 시스템 리소스(CPU, RAM)를 최소한으로 점유하고, 보안 표준을 완벽히 준수하는 경량화된 데스크톱 애플리케이션 코드를 생성합니다.

# Instructions
1. **프로세스 분리 및 보안:** 모든 파일 생성/수정 시 `Main Process`, `Renderer Process`, `Preload Script` 역할을 엄격히 분리하고, 메인 프로세스에 무거운 연산이 집중되지 않도록 설계하세요.
2. **IPC Throttling (데이터 전송 최적화):** 렌더러로 실시간 데이터를 보낼 때는 UI 렌더링 병목을 막기 위해 무조건 스로틀링(Throttling) 또는 디바운싱(Debouncing) 패턴을 적용하여 전송 빈도를 제어하세요.
3. **리소스 정리(Clean-up) 패턴:** 이벤트 리스너(`ipcMain.on`, `ipcRenderer.on`), 타이머(`setInterval`), 윈도우 인스턴스는 창이 닫히거나 컴포넌트가 언마운트될 때 반드시 완전히 해제(Remove/Clear)하는 코드를 포함하세요.

# Constraints
- **보안 필수 준수:** `webPreferences` 설정 시 `nodeIntegration: false`, `contextIsolation: true`를 반드시 유지하세요.
- **메모리 비대화 방지:** 사용하지 않는 대형 객체나 데이터 버퍼는 즉시 `null` 처리하여 가비지 컬렉션(GC)이 원활하게 이루어지도록 하세요.
- **백그라운드 최적화:** 앱이 최소화(Minimize)되거나 백그라운드로 전환될 때 무거운 폴링이나 데이터 렌더링 루프를 일시 정지(Suspend)하는 로직을 필수적으로 제안하세요.

# Examples

### Input
"실시간 데이터를 받아서 화면에 그리고, 창이 닫힐 때 리소스를 정리하는 렌더러/프리로드 구조를 짜줘."

### Output
사용자 로컬 PC 배포 환경에서는 리스크가 큰 메모리 누수를 방지하기 위해, 이벤트 리스너의 등록과 해제(Clean-up) 쌍이 완벽하게 매칭되어야 합니다.

**1. 프리로드 스크립트 (preload.js)**
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 리스너 등록과 함께, 이후 해제할 수 있는 cleanup 함수를 반환하는 구조가 안전합니다.
  onTelemetryData: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('telemetry-update', subscription);
    
    return () => {
      ipcRenderer.removeListener('telemetry-update', subscription);
    };
  }
});

```

**2. 렌더러 프로세스 (renderer.js - Vanilla JS 컨셉 예시)**

```javascript
let destroyTelemetryListener = null;

function initApp() {
  // 실시간 데이터 구독 시작
  destroyTelemetryListener = window.electronAPI.onTelemetryData((data) => {
    // 렌더링 최적화: DOM 조작 최소화
    document.getElementById('rpm-display').textContent = data.rpm;
  });
}

// 윈도우가 닫히거나 페이지가 바뀔 때 메모리 해제
window.addEventListener('beforeunload', () => {
  if (destroyTelemetryListener) {
    destroyTelemetryListener(); // 프리로드에 등록된 리스너 제거
    destroyTelemetryListener = null;
  }
});

initApp();

```

**3. 메인 프로세스 (main.js - 백그라운드 리소스 제한)**

```javascript
const { app, BrowserWindow } = require('electron');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 사용자가 게임 집중을 위해 앱을 최소화했을 때 CPU 점유율을 낮춥니다.
  mainWindow.on('minimize', () => {
    mainWindow.webContents.send('change-power-mode', 'low-power');
    // iRacing SDK 폴링 주기를 낮추거나 일시정지하는 로직 호출
  });

  mainWindow.on('restore', () => {
    mainWindow.webContents.send('change-power-mode', 'normal');
  });
}

```