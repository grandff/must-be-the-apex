/**
 * Dashboard 레이아웃 및 실시간 텔레메트리 대시보드
 */

import { useTelemetry } from '~/lib/useTelemetry';
import './dashboard.css';

export default function Dashboard() {
  const { telemetry, lastLap, session, connectionState } = useTelemetry();

  // 연결 상태 표시
  const getConnectionBadge = () => {
    switch (connectionState) {
      case 'connected':
        return <span className="badge badge-connected">● Connected</span>;
      case 'connecting':
        return <span className="badge badge-connecting">◐ Connecting...</span>;
      case 'disconnected':
        return <span className="badge badge-disconnected">○ Disconnected</span>;
      case 'error':
        return <span className="badge badge-error">⚠ Error</span>;
    }
  };

  return (
    <div className="dashboard">
      {/* 헤더 */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="app-title">Must Be The Apex</h1>
          {session && (
            <span className="track-name">{session.trackName}</span>
          )}
        </div>
        <div className="header-right">
          {getConnectionBadge()}
        </div>
      </header>

      {/* 연결 안 된 상태 */}
      {connectionState !== 'connected' && (
        <div className="waiting-screen">
          <div className="waiting-content">
            <div className="f1-car-icon">🏎️</div>
            <h2>Waiting for F1 25 Telemetry...</h2>
            <p>
              {connectionState === 'connecting' 
                ? 'Connecting to WebSocket server...'
                : 'Start the agent to begin receiving telemetry data.'}
            </p>
            <div className="instructions">
              <h3>Quick Start</h3>
              <ol>
                <li>Start the Mock Agent: <code>cd agent/mock-agent && npm start</code></li>
                <li>Make sure the WebSocket server is running on port 3001</li>
                <li>Go to Settings to configure your LLM API key (optional)</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* 실시간 텔레메트리 패널 */}
      {connectionState === 'connected' && telemetry && (
        <div className="telemetry-grid">
          {/* 속도계 */}
          <div className="panel speed-panel">
            <div className="speed-value">
              <span className="speed-number">{telemetry.speedKmh}</span>
              <span className="speed-unit">km/h</span>
            </div>
            <div className="speed-bar">
              <div 
                className="speed-bar-fill" 
                style={{ width: `${Math.min(100, (telemetry.speedKmh / 350) * 100)}%` }}
              />
            </div>
          </div>

          {/* 기어 및 페달 */}
          <div className="panel gear-panel">
            <div className="gear-display">
              <span className="gear-label">GEAR</span>
              <span className="gear-number">{telemetry.gear}</span>
            </div>
            <div className="pedals">
              <div className="pedal throttle">
                <div 
                  className="pedal-bar" 
                  style={{ height: `${telemetry.throttle * 100}%` }}
                />
                <span className="pedal-label">T</span>
              </div>
              <div className="pedal brake">
                <div 
                  className="pedal-bar" 
                  style={{ height: `${telemetry.brake * 100}%` }}
                />
                <span className="pedal-label">B</span>
              </div>
            </div>
          </div>

          {/* 랩 정보 */}
          <div className="panel lap-panel">
            <div className="lap-info">
              <div className="lap-number">LAP {telemetry.lapNumber}</div>
              <div className="lap-distance">{telemetry.lapDistance.toFixed(1)}m</div>
            </div>
            <div className="lap-progress">
              <div 
                className="lap-progress-bar"
                style={{ width: `${(telemetry.lapDistance / 6174) * 100}%` }}
              />
            </div>
          </div>

          {/* 미니맵 (단순化了 - 나중에 실제 SVG로 교체) */}
          <div className="panel minimap-panel">
            <div className="minimap-container">
              <div className="track-map">
                <div 
                  className="car-marker" 
                  style={{ 
                    left: `${50 + Math.sin(telemetry.lapDistance / 100) * 30}%`,
                    top: `${50 + Math.cos(telemetry.lapDistance / 100) * 30}%`
                  }}
                />
              </div>
              <div className="minimap-label">Track Map</div>
            </div>
          </div>

          {/* 타이어 온도 */}
          <div className="panel tyres-panel">
            <div className="tyre-grid">
              {telemetry.tyreTemperature.map((temp, i) => (
                <div key={i} className="tyre">
                  <div className="tyre-temp">{temp}°</div>
                  <div className="tyre-label">
                    {['FL', 'FR', 'RL', 'RR'][i]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 마지막 랩 완료 이벤트 */}
      {lastLap && (
        <div className="lap-completed-toast">
          <div className="toast-content">
            <span className="toast-icon">🏁</span>
            <span className="toast-text">
              Lap {lastLap.lapNumber}: {formatLapTime(lastLap.lapTimeMs)}
              {lastLap.isPersonalBest && ' (NEW BEST!)'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatLapTime(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${min}:${sec.toString().padStart(2, '0')}.${mil.toString().padStart(3, '0')}`;
}