/**
 * WebSocket 서버 (standalone - Remix 서버와 별도로 실행)
 * 
 * 사용법: 
 *   로컬 개발: npx tsx ws-server.ts
 *   프로덕션: WS_PORT=3001 WS_HOST=0.0.0.0 npx tsx ws-server.ts
 * 
 * 심허브 포트포워딩 연동:
 *   심허브의 TCP/UDP 포트포워딩 기능을 사용하여 
 *   외부 IP에서 이 서버로 접근 가능하게 설정
 */

import { WebSocketServer, WebSocket } from 'ws';

// ===== 설정 (환경변수 또는 기본값) =====
const PORT = parseInt(process.env.WS_PORT || '3001', 10);
const HOST = process.env.WS_HOST || '0.0.0.0'; // 0.0.0.0 = 모든 인터페이스 (외부 접근 허용)
// const HOST = '127.0.0.1'; // 로컬만 접근 허용 (개발용)
// ================

// 타입 정의
interface TelemetryLive {
  type: 'telemetry_live';
  timestamp: number;
  data: {
    trackId: number;
    lapNumber: number;
    lapDistance: number;
    speedKmh: number;
    gear: number;
    throttle: number;
    brake: number;
    steer: number;
    coordinates: { x: number; y: number; z: number };
    tyreTemperature: number[];
  };
}

interface LapCompleted {
  type: 'lap_completed';
  data: {
    trackId: number;
    lapNumber: number;
    lapTimeMs: number;
    isPersonalBest: boolean;
    invalidated: boolean;
    cornerDeltas: Array<{
      turn: number;
      entrySpeedDiff: number;
      apexSpeedDiff: number;
      brakingPointDiffMeters: number;
    }>;
  };
}

interface SessionStart {
  type: 'session_start';
  data: {
    trackId: number;
    trackName: string;
    playerCarIndex: number;
  };
}

type IncomingMessage = TelemetryLive | LapCompleted | SessionStart;

// 연결된 클라이언트들
const clients = new Set<WebSocket>();

// 간단한 인메모리 DB (실제 환경에서는 SQLite)
const db = {
  bestLaps: new Map<number, { lapTimeMs: number; cornerDeltas: any[] }>(),
};

// 서버 정보
const serverInfo = {
  version: '1.0.0',
  startedAt: new Date().toISOString(),
  port: PORT,
  host: HOST,
};

// WebSocket 서버 시작
const wss = new WebSocketServer({ port: PORT, host: HOST });

console.log(`
╔═══════════════════════════════════════════════════╗
║   Must Be The Apex - WebSocket Server           ║
║   데이터 수집 파이프라인 v1.0                     ║
╠═══════════════════════════════════════════════════╣
║   Listen: ${HOST}:${PORT}                            ║
║   Started: ${serverInfo.startedAt}                   ║
║                                                   ║
║   🚗 Windows Agent 설정:                         ║
║      WebSocketUrl=ws://HOST_IP:${PORT}              ║
║                                                   ║
║   🌐 외부 접근 (심허브 포트포워딩):              ║
║      ${HOST}:${PORT} 포트를 포워딩 설정          ║
╚═══════════════════════════════════════════════════╝
`);

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`📡 Client connected: ${clientIp}`);
  clients.add(ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString()) as IncomingMessage;
      handleMessage(ws, message);
    } catch (e) {
      console.error('❌ Failed to parse message:', e);
    }
  });

  ws.on('close', () => {
    console.log(`📡 Client disconnected: ${clientIp}`);
    clients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error(`⚠️ WebSocket error (${clientIp}):`, err.message);
    clients.delete(ws);
  });
});

function handleMessage(ws: WebSocket, message: IncomingMessage) {
  switch (message.type) {
    case 'telemetry_live':
      // 브로드캐스트 (다른 클라이언트에게도 전송)
      broadcast(message, ws);
      break;

    case 'lap_completed':
      handleLapCompleted(message);
      broadcast(message, ws);
      break;

    case 'session_start':
      console.log(`🏎️ Session started: ${message.data.trackName} (Track ${message.data.trackId})`);
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    default:
      console.log('📥 Unknown message type:', (message as any).type);
  }
}

function handleLapCompleted(message: LapCompleted) {
  const { trackId, lapNumber, lapTimeMs, cornerDeltas } = message.data;
  
  const existingBest = db.bestLaps.get(trackId);
  const isNewBest = !existingBest || lapTimeMs < existingBest.lapTimeMs;
  
  if (isNewBest) {
    db.bestLaps.set(trackId, { lapTimeMs, cornerDeltas });
    console.log(`🏆 New best lap! Track ${trackId}: ${formatLapTime(lapTimeMs)}`);
  }
  
  console.log(`🏁 Lap ${lapNumber} completed: ${formatLapTime(lapTimeMs)}${isNewBest ? ' (NEW BEST!)' : ''}`);
}

function broadcast(message: object, exclude?: WebSocket) {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function formatLapTime(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${min}:${sec.toString().padStart(2, '0')}.${mil.toString().padStart(3, '0')}`;
}

// 연결된 클라이언트 수 확인
function getConnectedClients(): number {
  return clients.size;
}

// 주기적 상태 로그 (30초마다)
setInterval(() => {
  if (clients.size > 0) {
    console.log(`📊 Connected clients: ${clients.size}`);
  }
}, 30000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down WebSocket server...');
  wss.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down...');
  wss.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
