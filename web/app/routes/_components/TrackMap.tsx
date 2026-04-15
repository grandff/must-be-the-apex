/**
 * 실제 트랙 이미지를 사용한 미니맵
 * Jeddah Corniche (ID: 1) 전용
 */

import { useMemo } from 'react';

interface TrackMapProps {
  trackId: number;
  lapDistance: number;
  trackLength: number;
  theme?: 'dark' | 'light';
}

// Jeddah Corniche 트랙 위에서의 차량 위치 매핑
// lapDistance (0 ~ 6174m)를 트랙 이미지상의 좌표로 변환
function getPositionOnTrack(lapDistance: number, trackId: number): { x: number; y: number; rotation: number } {
  // Jeddah Corniche의 트랙 위치 좌표 (%)
  // 트랙 시작점(결승선)에서 lapDistance에 따라 위치 계산
  // 실제 Jeddah 레이아웃 기반으로 한 추정 좌표
  
  const normalizedDist = lapDistance % 6174;
  
  if (trackId === 1) {
    // Jeddah Corniche 레이아웃 좌표
    // lapDistance 0 = 결승선 (트랙 하단)
    // 트랙은 시계방향으로 진행
    
    // 좌표를 0-100%로 정규화
    const progress = normalizedDist / 6174;
    
    // Jeddah 특유의 와이드 형태 좌표
    // 결승선 -> T1(Turn 1) -> 길은 스트레이트 -> T2...T17 -> 결승선
    // 실제로는 매우 복잡한 레이아웃이지만, 간단한 매핑으로 추정
    
    if (progress < 0.08) {
      // 결승선 통과 구간 (0-8%)
      return { x: 50, y: 92, rotation: 0 };
    } else if (progress < 0.14) {
      // T1 하드 브레이킹 (8-14%)
      return { x: 45, y: 82, rotation: -20 };
    } else if (progress < 0.20) {
      // T1 진입 후 (14-20%)
      return { x: 40, y: 78, rotation: -45 };
    } else if (progress < 0.30) {
      // T2-T3 체인 (20-30%)
      return { x: 32, y: 72, rotation: -60 };
    } else if (progress < 0.40) {
      // T4-T5 (30-40%)
      return { x: 25, y: 62, rotation: -80 };
    } else if (progress < 0.48) {
      // T6-T7 (40-48%)
      return { x: 18, y: 50, rotation: -100 };
    } else if (progress < 0.55) {
      // T8-T9 (48-55%)
      return { x: 18, y: 38, rotation: -120 };
    } else if (progress < 0.62) {
      // T10 (55-62%)
      return { x: 25, y: 28, rotation: -140 };
    } else if (progress < 0.70) {
      // T11-T12 (62-70%)
      return { x: 35, y: 22, rotation: -160 };
    } else if (progress < 0.78) {
      // T13-T14 (70-78%)
      return { x: 50, y: 18, rotation: 180 };
    } else if (progress < 0.85) {
      // T15 (78-85%)
      return { x: 65, y: 25, rotation: 160 };
    } else if (progress < 0.92) {
      // T16 (85-92%)
      return { x: 75, y: 40, rotation: 140 };
    } else {
      // T17 - 결승선 (92-100%)
      return { x: 78, y: 55, rotation: 120 };
    }
  }
  
  // 기본값 (중앙)
  return { x: 50, y: 50, rotation: 0 };
}

export function TrackMap({ trackId, lapDistance, trackLength, theme = 'dark' }: TrackMapProps) {
  const position = useMemo(() => {
    return getPositionOnTrack(lapDistance, trackId);
  }, [lapDistance, trackId]);

  const trackImageUrl = theme === 'dark'
    ? `/assets/tracks/black/05_Saudi_Arabia_GP(Jeddah_Corniche_Circuit).jpg`
    : `/assets/tracks/white/05_Saudi_Arabia_GP(Jeddah_Corniche_Circuit).jpg`;

  return (
    <div className="track-map-container">
      <img 
        src={trackImageUrl}
        alt="Track Map"
        className="track-map-image"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
      <div 
        className="car-marker-track"
        style={{
          left: `${position.x}%`,
          top: `${position.y}%`,
          transform: `translate(-50%, -50%) rotate(${position.rotation}deg)`,
        }}
      >
        <span className="car-arrow">▲</span>
      </div>
      {/* DRS 존 표시 */}
      <div className="drs-zone-label" style={{ left: '50%', top: '88%' }}>
        DRS
      </div>
    </div>
  );
}
