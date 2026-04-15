/**
 * Mock F1 25 Telemetry Agent (Mac에서 테스트용)
 * 
 * 실제 F1 25 게임 데이터 대신 목업 데이터를 생성하여
 * WebSocket으로 Remix 서버에 전송합니다.
 * 
 * 사용법: npm start
 * 서버 연결 실패 시 5초마다 재연결 시도
 */

import WebSocket from 'ws';

// ============= 설정 =============
const SERVER_URL = process.env.WS_URL || 'ws://localhost:3000/ws';
const TELEMETRY_INTERVAL_MS = 100; // 10Hz
const RECONNECT_DELAY_MS = 5000;
// ================================

// F1 25 트랙 ID (일부)
const TRACK_IDS = {
  0: 'Melbourne',
  1: 'Jeddah',        // Saudi Arabia - Jeddah Corniche
  14: 'Monza',
  19: 'Silverstone',
  22: 'Spa',
  3: 'Bahrain'
};

// 현재 차량 상태 (텔레메트리 데이터 생성용)
let currentState = {
  trackId: 1, // Jeddah Corniche
  lapNumber: 1,
  lapDistance: 0,
  speedKmh: 0,
  gear: 0,
  throttle: 0,
  brake: 0,
  steer: 0,
  x: 0,
  y: 0,
  z: 0,
  tyreTemp: [80, 80, 82, 82],
  sector: 0,
  isLapInvalid: false,
  lastLapTimeMs: 0,
  bestLapTimeMs: 85000 // 1:25.000 기준 (Jeddah는 Monza보다 느린 랩타겟)
};

// 랩 데이터 히스토리 (코너 분석용)
let lapHistory = [];

// ============= F1 데이터 생성 로직 =============

/**
 * Jeddah Corniche 트랙의 랩 거리 기반 위치 계산
 * 단위: 미터 (트랙 길이 약 6.174km)
 */
function calculatePosition(lapDistance) {
  const trackLength = 6174; // Jeddah一圈 약 6.174km
  
  // 실제 좌표 대신 상대적 위치 (데모용)
  const normalizedDist = lapDistance % trackLength;
  
  return {
    x: Math.sin(normalizedDist / 120) * 60,
    y: 0,
    z: Math.cos(normalizedDist / 120) * 60
  };
}

/**
 * Jeddah Corniche 코너 데이터 (랩 거리 기반)
 * Turn 1: ~400m (첫 턴인 긴 스트레이트 끝의 하드 브레이킹존)
 * Turn 2: ~700m (고속 오른쪽)
 * Turn 3: ~1100m (체인 코너)
 * Turn 4: ~1500m (느린 왼쪽)
 * Turn 5: ~1900m (빠른 오른쪽)
 * Turn 6: ~2300m (느린 왼쪽)
 * Turn 7: ~2700m (빠른 오른쪽)
 * Turn 8: ~3100m (체인)
 * Turn 9: ~3500m (빠른 왼쪽)
 * Turn 10: ~3900m (느린 오른쪽)
 * Turn 11: ~4200m (빠른 왼쪽)
 * Turn 12: ~4500m (빠른 오른쪽)
 * Turn 13: ~4800m (느린 왼쪽)
 * Turn 14: ~5200m (빠른 오른쪽)
 * Turn 15: ~5500m (느린 왼쪽)
 * Turn 16: ~5800m (결승선 직전 하드 브레이킹)
 * Turn 17: ~6000m (결승선 통과)
 */
function getCurrentCorner(lapDistance) {
  const corners = [
    { turn: 1,  start: 350,  end: 480 },   // Turn 1 - 하드 브레이킹
    { turn: 2,  start: 550,  end: 650 },   // Turn 2 - 고속 오른쪽
    { turn: 3,  start: 750,  end: 900 },   // Turn 3 - 체인
    { turn: 4,  start: 1000, end: 1150 },  // Turn 4 - 느린 왼쪽
    { turn: 5,  start: 1300, end: 1450 },  // Turn 5 - 빠른 오른쪽
    { turn: 6,  start: 1600, end: 1750 },  // Turn 6 - 느린 왼쪽
    { turn: 7,  start: 1900, end: 2050 },  // Turn 7 - 빠른 오른쪽
    { turn: 8,  start: 2200, end: 2400 },  // Turn 8 - 체인
    { turn: 9,  start: 2600, end: 2800 },  // Turn 9 - 빠른 왼쪽
    { turn: 10, start: 3000, end: 3200 },  // Turn 10 - 느린 오른쪽
    { turn: 11, start: 3400, end: 3600 },  // Turn 11 - 빠른 왼쪽
    { turn: 12, start: 3800, end: 4000 },  // Turn 12 - 빠른 오른쪽
    { turn: 13, start: 4200, end: 4400 },  // Turn 13 - 느린 왼쪽
    { turn: 14, start: 4600, end: 4800 },  // Turn 14 - 빠른 오른쪽
    { turn: 15, start: 5000, end: 5200 },  // Turn 15 - 느린 왼쪽
    { turn: 16, start: 5450, end: 5700 },  // Turn 16 - 결승선 전 하드 브레이킹
    { turn: 17, start: 5900, end: 6100 }   // Turn 17 - 결승선
  ];
  
  for (const c of corners) {
    if (lapDistance >= c.start && lapDistance < c.end) {
      return c.turn;
    }
  }
  return 0; // 스트레이트
}

/**
 * Jeddah Corniche 랩 타임 시뮬레이션
 * Jeddah는 고속 스트레이트 + 체인 코너 조합
 */
function simulateLapProgression(deltaMs) {
  const trackLength = 6174; // Jeddah
  
  // Jeddah 평균 속도 (~250km/h, 하지만 하드 브레이킹존에서 감속)
  const avgSpeedMs = 68; // ~245 km/h
  const distIncrement = (avgSpeedMs * deltaMs) / 1000;
  
  currentState.lapDistance += distIncrement;
  
  // 一圈 완료 체크
  if (currentState.lapDistance >= trackLength) {
    currentState.lapDistance -= trackLength;
    currentState.lapNumber++;
    
    const lapTime = currentState.lastLapTimeMs;
    const isPersonalBest = lapTime < currentState.bestLapTimeMs;
    
    if (isPersonalBest) {
      currentState.bestLapTimeMs = lapTime;
    }
    
    // 랩 완료 이벤트 (실제로는 서버에서 처리)
    onLapCompleted(currentState.lapNumber - 1, lapTime, isPersonalBest);
    
    console.log(`🏁 Lap ${currentState.lapNumber - 1} completed: ${formatLapTime(lapTime)}${isPersonalBest ? ' (NEW BEST!)' : ''}`);
    
    // 새 랩 시작
    currentState.lastLapTimeMs = 0;
  }
  
  // 현재 코너
  const currentCorner = getCurrentCorner(currentState.lapDistance);
  
  // Jeddah 속도 패턴 (고속 코너 위주)
  let targetSpeed;
  if (currentCorner === 0) {
    targetSpeed = 320; // 긴 스트레이트
    currentState.throttle = 0.98;
    currentState.brake = 0;
  } else if ([1, 16].includes(currentCorner)) {
    // Turn 1, 16은 하드 브레이킹존 (느린 턴)
    targetSpeed = 100 + Math.random() * 30;
    currentState.throttle = 0.3;
    currentState.brake = 0.7;
  } else if ([4, 6, 13, 15].includes(currentCorner)) {
    // 느린 코너
    targetSpeed = 120 + Math.random() * 40;
    currentState.throttle = 0.5 + Math.random() * 0.2;
    currentState.brake = 0.2;
  } else if ([3, 8, 10].includes(currentCorner)) {
    // 체인 코너
    targetSpeed = 150 + Math.random() * 30;
    currentState.throttle = 0.6;
    currentState.brake = 0.1;
  } else {
    // 고속 코너 (대부분의 Jeddah 코너)
    targetSpeed = 200 + Math.random() * 40;
    currentState.throttle = 0.85;
    currentState.brake = 0.05;
  }
  
  // 속도 보간
  if (currentState.speedKmh < targetSpeed) {
    currentState.speedKmh = Math.min(targetSpeed, currentState.speedKmh + 6);
  } else {
    currentState.speedKmh = Math.max(targetSpeed, currentState.speedKmh - 15);
  }
  
  // 기어 계산 (Jeddah는 8단 mostly)
  if (currentState.speedKmh < 80) currentState.gear = 2;
  else if (currentState.speedKmh < 130) currentState.gear = 3;
  else if (currentState.speedKmh < 170) currentState.gear = 4;
  else if (currentState.speedKmh < 200) currentState.gear = 5;
  else if (currentState.speedKmh < 235) currentState.gear = 6;
  else if (currentState.speedKmh < 270) currentState.gear = 7;
  else if (currentState.speedKmh < 310) currentState.gear = 8;
  else currentState.gear = 8;
  
  // 위치 업데이트
  const pos = calculatePosition(currentState.lapDistance);
  currentState.x = pos.x;
  currentState.y = pos.y;
  currentState.z = pos.z;
  
  // 타이어 온도 (랩 진행에 따라 서서히 상승)
  const tempIncrease = 0.01;
  currentState.tyreTemp = currentState.tyreTemp.map(t => Math.min(110, t + tempIncrease * Math.random()));
  
  // 스티어링 (코너 진입/탈출 시 변화)
  currentState.steer = Math.sin(currentState.lapDistance / 120) * 0.6;
  
  // 시간 업데이트
  currentState.lastLapTimeMs += deltaMs;
}

function formatLapTime(ms) {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${min}:${sec.toString().padStart(2, '0')}.${mil.toString().padStart(3, '0')}`;
}

function onLapCompleted(lapNumber, lapTimeMs, isPersonalBest) {
  const cornerDeltas = generateCornerDeltas();
  
  const lapCompletedEvent = {
    type: 'lap_completed',
    data: {
      trackId: currentState.trackId,
      lapNumber,
      lapTimeMs,
      isPersonalBest,
      invalidated: currentState.isLapInvalid,
      cornerDeltas
    }
  };
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(lapCompletedEvent));
    console.log(`📤 Lap completed event sent: Turn delta analysis included (${cornerDeltas.length} corners)`);
  }
}

/**
 * Jeddah 코너별 델타 분석 데이터 생성 (목업)
 * 실제에서는 베스트 랩 대비하여 계산
 */
function generateCornerDeltas() {
  return [
    { turn: 1,  entrySpeedDiff: 8,  apexSpeedDiff: -5,  brakingPointDiffMeters: 18 },
    { turn: 3,  entrySpeedDiff: -2, apexSpeedDiff: -3,  brakingPointDiffMeters: 5 },
    { turn: 4,  entrySpeedDiff: 0,  apexSpeedDiff: -10, brakingPointDiffMeters: 25 },
    { turn: 13, entrySpeedDiff: 5,  apexSpeedDiff: -7,  brakingPointDiffMeters: 12 },
    { turn: 16, entrySpeedDiff: 3,  apexSpeedDiff: -4,  brakingPointDiffMeters: 8 },
  ];
}

// ============= WebSocket 연결 =============

let ws = null;
let reconnectTimer = null;

function connect() {
  console.log(`\n🔌 Connecting to ${SERVER_URL}...`);
  
  ws = new WebSocket(SERVER_URL);
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected! Starting telemetry stream...');
    console.log('   (Mock F1 25 data - Jeddah Corniche circuit)\n');
    
    // 세션 시작 알림
    const sessionStart = {
      type: 'session_start',
      data: {
        trackId: currentState.trackId,
        trackName: TRACK_IDS[currentState.trackId] || 'Unknown',
        playerCarIndex: 0
      }
    };
    ws.send(JSON.stringify(sessionStart));
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📥 Server message: ${message.type || 'unknown'}`);
      
      // 서버에서 오는 메시지 처리 (예: 설정 변경 등)
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (e) {
      // ignore
    }
  });
  
  ws.on('close', () => {
    console.log('❌ WebSocket disconnected. Reconnecting in 5s...');
    scheduleReconnect();
  });
  
  ws.on('error', (err) => {
    console.log(`⚠️ WebSocket error: ${err.message}`);
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

// ============= 메인 텔레메트리 루프 =============

let lastTimestamp = Date.now();

function sendTelemetry() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  
  const now = Date.now();
  const deltaMs = now - lastTimestamp;
  lastTimestamp = now;
  
  // 랩 진행 시뮬레이션
  simulateLapProgression(deltaMs);
  
  // 텔레메트리 데이터 구성
  const telemetry = {
    type: 'telemetry_live',
    timestamp: now,
    data: {
      trackId: currentState.trackId,
      lapNumber: currentState.lapNumber,
      lapDistance: Math.round(currentState.lapDistance * 10) / 10,
      speedKmh: Math.round(currentState.speedKmh),
      gear: currentState.gear,
      throttle: Math.round(currentState.throttle * 100) / 100,
      brake: Math.round(currentState.brake * 100) / 100,
      steer: Math.round(currentState.steer * 100) / 100,
      coordinates: {
        x: Math.round(currentState.x * 100) / 100,
        y: Math.round(currentState.y * 100) / 100,
        z: Math.round(currentState.z * 100) / 100
      },
      tyreTemperature: currentState.tyreTemp.map(t => Math.round(t))
    }
  };
  
  ws.send(JSON.stringify(telemetry));
  
  // 로그 출력 (1초에 한 번만)
  if (now % 1000 < TELEMETRY_INTERVAL_MS) {
    const corner = getCurrentCorner(currentState.lapDistance);
    console.log(
      `[${formatLapTime(currentState.lastLapTimeMs)}] ` +
      `Lap ${currentState.lapNumber} | ` +
      `${currentState.lapDistance.toFixed(1)}m | ` +
      `${currentState.speedKmh} km/h | ` +
      `Gear ${currentState.gear} | ` +
      `T: ${(currentState.throttle * 100).toFixed(0)}% ` +
      `B: ${(currentState.brake * 100).toFixed(0)}%` +
      (corner > 0 ? ` | Turn ${corner}` : '')
    );
  }
}

// ============= 시작 =============

console.log('═══════════════════════════════════════');
console.log('   Must Be The Apex - Mock Agent');
console.log('   (F1 25 Telemetry Simulator for Mac)');
console.log('═══════════════════════════════════════');
console.log(`Server: ${SERVER_URL}`);
console.log(`Sample Rate: ${1000 / TELEMETRY_INTERVAL_MS}Hz`);
console.log(`Track: Jeddah Corniche (6.174km)`);
console.log('───────────────────────────────────────\n');

connect();

setInterval(sendTelemetry, TELEMETRY_INTERVAL_MS);