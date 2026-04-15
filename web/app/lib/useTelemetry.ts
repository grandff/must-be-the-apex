/**
 * WebSocket 클라이언트 훅 (브라우저용)
 * 프론트엔드에서 WebSocket 서버에 연결하여 실시간 텔레메트리 수신
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export interface TelemetryData {
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
}

export interface LapCompletedData {
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
}

export interface SessionInfo {
  trackId: number;
  trackName: string;
  playerCarIndex: number;
}

interface UseTelemetryResult {
  telemetry: TelemetryData | null;
  lastLap: LapCompletedData | null;
  session: SessionInfo | null;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  sendPing: () => void;
}

const WS_URL = typeof window !== 'undefined' 
  ? `ws://${window.location.hostname}:3001` 
  : 'ws://localhost:3001';

export function useTelemetry(): UseTelemetryResult {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [lastLap, setLastLap] = useState<LapCompletedData | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    setConnectionState('connecting');
    
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setConnectionState('connected');
        
        // 연결 시 ping 전송
        ws.send(JSON.stringify({ type: 'ping' }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'telemetry_live':
              setTelemetry(message.data);
              break;
            case 'lap_completed':
              setLastLap(message.data);
              break;
            case 'session_start':
              setSession(message.data);
              break;
            case 'pong':
              // ping 응답 (연결 유지 확인)
              break;
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        console.log('❌ WebSocket disconnected');
        setConnectionState('disconnected');
        wsRef.current = null;
        
        // 5초 후 재연결
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, 5000);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionState('error');
      };
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      setConnectionState('error');
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendPing = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ping' }));
    }
  }, []);

  return { telemetry, lastLap, session, connectionState, sendPing };
}