/**
 * F1 25 Telemetry Mock Generator
 * Jeddah Corniche - Target Lap Time: 1:26.567
 */

import { WebSocketServer, WebSocket } from 'ws';

// ============= State =============

let currentState = {
  trackId: 1,
  lapNumber: 1,
  lapDistance: 0,
  speed: 0,
  gear: 2,
  throttle: 0,
  brake: 0,
  steer: 0,
  sector1TimeMs: 0,
  sector2TimeMs: 0,
  sector3TimeMs: 0,
  lapStartTime: 0,
  bestLapTimeMs: 86667, // 1:26.667 기준
  lastLapTimeMs: 0,
  tyreTemp: [88, 88, 90, 90],
};

// Target: 1:26.567 = 86667ms
const TARGET_LAP_TIME = 86667;
const TRACK_LENGTH = 6174;

// ============= Jeddah Corner Data =============
// Turn number, start distance, end distance, typical entry speed (km/h)
const JEDDAH_CORNERS = [
  { turn: 1,  start: 300,  end: 500,  speed: 100 },  // Heavy braking T1
  { turn: 2,  start: 600,  end: 700,  speed: 180 },  // Medium T2
  { turn: 3,  start: 800,  end: 950,  speed: 200 },  // T3
  { turn: 4,  start: 1050, end: 1200, speed: 120 }, // Slow T4
  { turn: 5,  start: 1350, end: 1500, speed: 190 }, // T5
  { turn: 6,  start: 1650, end: 1800, speed: 130 }, // Slow T6
  { turn: 7,  start: 1950, end: 2100, speed: 195 }, // T7
  { turn: 8,  start: 2250, end: 2450, speed: 140 }, // Slow T8 ( chicane)
  { turn: 9,  start: 2650, end: 2850, speed: 210 }, // T9
  { turn: 10, start: 3050, end: 3250, speed: 150 }, // T10
  { turn: 11, start: 3450, end: 3650, speed: 200 }, // T11
  { turn: 12, start: 3850, end: 4050, speed: 210 }, // T12
  { turn: 13, start: 4250, end: 4450, speed: 120 }, // Slow T13
  { turn: 14, start: 4650, end: 4850, speed: 200 }, // T14
  { turn: 15, start: 5050, end: 5250, speed: 130 }, // T15
  { turn: 16, start: 5550, end: 5800, speed: 90 },  // Heavy braking T16
  { turn: 17, start: 5950, end: 6150, speed: 250 }, // T17 (fast)
];

// DRS Zone: ~5800-6100m (main straight)
const DRS_START = 5800;
const DRS_END = 6100;

// ============= Simulation =============

function getCurrentTurn(): number {
  const normalizedDist = currentState.lapDistance % TRACK_LENGTH;
  
  for (const corner of JEDDAH_CORNERS) {
    if (normalizedDist >= corner.start && normalizedDist < corner.end) {
      return corner.turn;
    }
  }
  return 0;
}

function getCurrentSector(): number {
  const normalizedDist = currentState.lapDistance % TRACK_LENGTH;
  if (normalizedDist < 2000) return 1;
  if (normalizedDist < 4000) return 2;
  return 3;
}

function simulateFrame(deltaMs: number) {
  const normalizedDist = currentState.lapDistance % TRACK_LENGTH;
  const turn = getCurrentTurn();
  const isInDrs = normalizedDist >= DRS_START && normalizedDist < DRS_END;
  
  // Target speed based on track position
  let targetSpeed: number;
  let targetThrottle: number;
  let targetBrake: number;
  let targetGear: number;
  
  if (turn === 1) {
    // T1 - Heavy braking zone
    targetSpeed = 100;
    targetThrottle = 0.3;
    targetBrake = 0.85;
    targetGear = 2;
  } else if (turn === 16) {
    // T16 - Heavy braking into final corner
    targetSpeed = 90;
    targetThrottle = 0.25;
    targetBrake = 0.88;
    targetGear = 2;
  } else if (turn === 4 || turn === 6 || turn === 8 || turn === 10 || turn === 13 || turn === 15) {
    // Slow corners (120-150 km/h)
    targetSpeed = turn === 8 ? 140 : 130;
    targetThrottle = 0.55;
    targetBrake = 0.15;
    targetGear = 3;
  } else if (turn === 3 || turn === 5 || turn === 7 || turn === 9 || turn === 11 || turn === 14) {
    // Medium-high speed corners (190-210 km/h)
    targetSpeed = turn === 9 ? 215 : turn === 14 ? 205 : 195;
    targetThrottle = 0.88;
    targetBrake = 0.02;
    targetGear = 5;
  } else if (turn === 17) {
    // T17 - Fast sweeper
    targetSpeed = 260;
    targetThrottle = 0.92;
    targetBrake = 0;
    targetGear = 6;
  } else {
    // Straights / DRS zone
    if (isInDrs) {
      targetSpeed = 325;
      targetThrottle = 0.98;
      targetBrake = 0;
      targetGear = 8;
    } else {
      targetSpeed = 300;
      targetThrottle = 0.95;
      targetBrake = 0;
      targetGear = 8;
    }
  }
  
  // Smooth interpolation
  currentState.speed += (targetSpeed - currentState.speed) * 0.12;
  currentState.throttle += (targetThrottle - currentState.throttle) * 0.18;
  currentState.brake += (targetBrake - currentState.brake) * 0.25;
  
  // Speed to gear mapping
  if (currentState.speed < 80) currentState.gear = 2;
  else if (currentState.speed < 130) currentState.gear = 3;
  else if (currentState.speed < 170) currentState.gear = 4;
  else if (currentState.speed < 210) currentState.gear = 5;
  else if (currentState.speed < 260) currentState.gear = 6;
  else if (currentState.speed < 300) currentState.gear = 7;
  else currentState.gear = 8;
  
  // Steering - varies by corner
  currentState.steer = Math.sin(normalizedDist / 120) * 0.35;
  
  // Distance calculation (speed in km/h -> m/s = /3.6)
  const speedMs = currentState.speed / 3.6;
  const distIncrement = speedMs * (deltaMs / 1000);
  currentState.lapDistance += distIncrement;
  
  // Lap completion
  if (currentState.lapDistance >= TRACK_LENGTH) {
    currentState.lapDistance -= TRACK_LENGTH;
    currentState.lapNumber++;
    
    const lapTime = Date.now() - currentState.lapStartTime;
    currentState.lastLapTimeMs = lapTime;
    
    if (lapTime < currentState.bestLapTimeMs) {
      currentState.bestLapTimeMs = lapTime;
      console.log(`🏆 NEW BEST LAP: ${formatLapTime(lapTime)}`);
    } else {
      console.log(`🏁 Lap ${currentState.lapNumber - 1}: ${formatLapTime(lapTime)}`);
    }
    
    currentState.lapStartTime = Date.now();
    currentState.sector1TimeMs = 0;
    currentState.sector2TimeMs = 0;
  }
  
  // Sector times
  const currentSector = getCurrentSector();
  if (currentSector === 2 && currentState.sector1TimeMs === 0) {
    currentState.sector1TimeMs = Date.now() - currentState.lapStartTime;
  } else if (currentSector === 3 && currentState.sector2TimeMs === 0) {
    currentState.sector2TimeMs = Date.now() - currentState.lapStartTime;
  }
  
  // Tire temperature
  const baseTemp = 88;
  const cornerHeat = turn > 0 ? 0.08 : 0;
  const brakingHeat = currentState.brake > 0.5 ? 0.1 : 0;
  const cooling = currentState.speed > 280 ? 0.03 : 0.015;
  for (let i = 0; i < 4; i++) {
    currentState.tyreTemp[i] += (baseTemp + Math.random() * 4 + cornerHeat + brakingHeat - currentState.tyreTemp[i]) * 0.08 - cooling;
    currentState.tyreTemp[i] = Math.max(82, Math.min(115, currentState.tyreTemp[i]));
  }
}

// ============= WebSocket Server =============

function formatLapTime(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${min}:${sec.toString().padStart(2, '0')}.${mil.toString().padStart(3, '0')}`;
}

const PORT = parseInt(process.env.WS_PORT || '3001', 10);
const HOST = process.env.WS_HOST || '0.0.0.0';

const wss = new WebSocketServer({ port: PORT, host: HOST });
const clients = new Set<WebSocket>();

console.log(`
╔═══════════════════════════════════════════════════╗
║   F1 25 Telemetry Mock - Jeddah Corniche        ║
╠═══════════════════════════════════════════════════╣
║   WebSocket: ${HOST}:${PORT}                          ║
║   Track: Jeddah Corniche (ID: 1)                 ║
║   Target Lap Time: 1:26.567                      ║
║   Track Length: 6174m                            ║
║   Corners: 17 | DRS Zones: 1                     ║
╚═══════════════════════════════════════════════════╝
`);

wss.on('connection', (ws, req) => {
  console.log(`📡 Client connected: ${req.socket.remoteAddress}`);
  clients.add(ws);
  
  ws.send(JSON.stringify({
    type: 'session_start',
    data: {
      trackId: 1,
      trackName: 'Jeddah Corniche',
      playerCarIndex: 0
    }
  }));
  
  ws.on('close', () => {
    console.log('📡 Client disconnected');
    clients.delete(ws);
  });
});

// Main telemetry loop - 10Hz
let lastTime = Date.now();
currentState.lapStartTime = Date.now();

setInterval(() => {
  const now = Date.now();
  const deltaMs = now - lastTime;
  lastTime = now;
  
  simulateFrame(deltaMs);
  
  const telemetry = {
    type: 'telemetry_live',
    timestamp: now,
    data: {
      trackId: currentState.trackId,
      lapNumber: currentState.lapNumber,
      lapDistance: Math.round(currentState.lapDistance * 10) / 10,
      speedKmh: Math.round(currentState.speed),
      gear: currentState.gear,
      throttle: Math.round(currentState.throttle * 100) / 100,
      brake: Math.round(currentState.brake * 100) / 100,
      steer: Math.round(currentState.steer * 100) / 100,
      coordinates: { x: 0, y: 0, z: 0 },
      tyreTemperature: currentState.tyreTemp.map(t => Math.round(t))
    }
  };
  
  const message = JSON.stringify(telemetry);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
  
  // Log every ~1.3 seconds
  if (Math.floor(now / 1333) * 1333 === now) {
    const turn = getCurrentTurn();
    const lapTime = now - currentState.lapStartTime;
    console.log(
      `[${formatLapTime(lapTime)}] ` +
      `Lap ${currentState.lapNumber} | ` +
      `${currentState.lapDistance.toFixed(1)}m | ` +
      `${Math.round(currentState.speed)} km/h | ` +
      `G${currentState.gear} | ` +
      `T:${Math.round(currentState.throttle * 100)}% ` +
      `B:${Math.round(currentState.brake * 100)}%` +
      (turn > 0 ? ` | T${turn}` : '')
    );
  }
}, 100);

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  wss.close();
  process.exit(0);
});
