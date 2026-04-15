import { WebSocketServer, WebSocket } from 'ws';
import { saveBestLap, getBestLap, getSetting } from './db.server';

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

// 현재 연결된 클라이언트들
const clients = new Set<WebSocket>();

// Lap 완료 시 AI 분석 요청 (선택적)
async function analyzeWithAI(lapData: LapCompleted['data']) {
  const apiKey = getSetting('llm_api_key');
  const provider = getSetting('llm_provider') || 'openai';
  
  if (!apiKey) {
    console.log('⚠️ No LLM API key configured, skipping AI analysis');
    return null;
  }

  const bestLap = getBestLap(lapData.trackId);
  
  // 프롬프트 구성 (ai_prompt_engineering.md 기준)
  const systemPrompt = `너는 F1 25 게임의 전문 레이스 엔지니어다.
너의 목표는 드라이버(유저)가 자신의 랩타임을 단축할 수 있도록 텔레메트리 데이터를 바탕으로 실질적이고 물리적인 조작 가이드를 제공하는 것이다.

[제약 조건]
1. 제공된 데이터(Delta)에 명시된 코너(Turn)와 수치만 기반으로 분석할 것. 추측하거나 지어내지 마라.
2. 운전자의 실력을 탓하거나 감정적인 표현을 쓰지 마라.
3. 매우 간결하게 핵심만 말해라. 주행 중에 읽어야 하므로 긴 서론과 결론은 생략한다.
4. "브레이킹 포인트를 늦춰라", "트레일 브레이킹을 통해 에이펙스 속도를 높여라"와 같이 구체적인 행동 지침을 제시하라.`;

  const userPrompt = `방금 완료한 랩의 타임 손실 분석 데이터야. 베스트 랩과 비교했을 때 가장 큰 차이를 보인 구간에 대해 피드백을 해줘.

[분석 데이터]
- 트랙: ${lapData.trackId}
- 현재 랩타임: ${formatLapTime(lapData.lapTimeMs)}${lapData.isPersonalBest ? ' (신규 베스트!)' : ''}
- 주요 손실 구간: 
${lapData.cornerDeltas.map(d => `  * Turn ${d.turn}: 브레이킹 포인트 ${d.brakingPointDiffMeters > 0 ? d.brakingPointDiffMeters + 'm 빠름' : -d.brakingPointDiffMeters + 'm 늦음'}, 에이펙스 속도 ${d.apexSpeedDiff > 0 ? '+' + d.apexSpeedDiff : d.apexSpeedDiff}km/h`).join('\n')}

위 데이터를 바탕으로 다음 랩에서 운전자가 정확히 어떻게 페달과 스티어링을 조작해야 하는지 2문장 이내로 가이드해줘.`;

  try {
    // OpenAI/Anthropic API 호출 (구현 생략 - 나중에 추가)
    console.log('🤖 AI analysis requested (API key found but not yet implemented)');
    return null;
  } catch (error) {
    console.error('AI analysis failed:', error);
    return null;
  }
}

function formatLapTime(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${min}:${sec.toString().padStart(2, '0')}.${mil.toString().padStart(3, '0')}`;
}

// WebSocket 서버 시작
export function startWebSocketServer(port: number = 3001): WebSocketServer {
  const wss = new WebSocketServer({ port });

  console.log(`🔌 WebSocket server started on port ${port}`);

  wss.on('connection', (ws) => {
    console.log('📡 Client connected');
    clients.add(ws);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as IncomingMessage;
        handleMessage(ws, message);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });

    ws.on('close', () => {
      console.log('📡 Client disconnected');
      clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      clients.delete(ws);
    });
  });

  return wss;
}

function handleMessage(ws: WebSocket, message: IncomingMessage) {
  switch (message.type) {
    case 'telemetry_live':
      // 모든 클라이언트에게 브로드캐스트
      broadcast(message, ws);
      break;

    case 'lap_completed':
      console.log(`🏁 Lap completed: Track ${message.data.trackId}, Lap ${message.data.lapNumber}, Time ${formatLapTime(message.data.lapTimeMs)}`);
      
      // DB에 저장
      const lapId = saveBestLap({
        trackId: message.data.trackId,
        lapNumber: message.data.lapNumber,
        lapTimeMs: message.data.lapTimeMs,
        isPersonalBest: message.data.isPersonalBest ? 1 : 0,
        cornerDeltas: JSON.stringify(message.data.cornerDeltas)
      });

      // AI 분석 요청 (비동기)
      analyzeWithAI(message.data);

      // 모든 클라이언트에게 브로드캐스트
      broadcast(message, ws);
      break;

    case 'session_start':
      console.log(`🏎️ Session started: ${message.data.trackName} (Track ID: ${message.data.trackId})`);
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
  }
}

function broadcast(message: object, exclude?: WebSocket) {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// 브로드캐스트 함수 (외부에서 호출 가능)
export function broadcastToAll(message: object) {
  broadcast(message);
}