/**
 * F1 25 트랙 코너 매핑 테이블
 * lapDistance 기반 코너 번호 태깅용
 * 
 * Track ID Reference (F1 25):
 * - Jeddah Corniche: ID 1
 * - Miami International: ID 2
 */

export interface CornerSegment {
  turn: number;
  name: string;
  startDistance: number;  // lapDistance 시작 (m)
  endDistance: number;   // lapDistance 종료 (m)
  entrySpeed: number;    // 진입 속도 (km/h) - 참고용
  typicalBrakeZone: number; // 브레이킹 포인트 lapDistance - 참고용
}

export interface TrackMapping {
  trackId: number;
  trackName: string;
  trackLength: number;     // 전체 길이 (m)
  corners: CornerSegment[];
}

// ============= Saudi Arabia - Jeddah Corniche =============
// 트랙 길이: 6.174km (6174m)
// 고속 스트레이트 + 체인 코너 조합
export const jeddahCorniche: TrackMapping = {
  trackId: 1,
  trackName: "Jeddah Corniche",
  trackLength: 6174,
  corners: [
    { turn: 1,  name: "Turn 1",       startDistance: 350,  endDistance: 480,  entrySpeed: 100, typicalBrakeZone: 300 },
    { turn: 2,  name: "Turn 2",       startDistance: 550,  endDistance: 650,  entrySpeed: 250, typicalBrakeZone: 580 },
    { turn: 3,  name: "Turn 3",       startDistance: 750,  endDistance: 900,  entrySpeed: 180, typicalBrakeZone: 800 },
    { turn: 4,  name: "Turn 4",       startDistance: 1000, endDistance: 1150, entrySpeed: 140, typicalBrakeZone: 1050 },
    { turn: 5,  name: "Turn 5",       startDistance: 1300, endDistance: 1450, entrySpeed: 220, typicalBrakeZone: 1350 },
    { turn: 6,  name: "Turn 6",       startDistance: 1600, endDistance: 1750, entrySpeed: 150, typicalBrakeZone: 1650 },
    { turn: 7,  name: "Turn 7",       startDistance: 1900, endDistance: 2050, entrySpeed: 230, typicalBrakeZone: 1950 },
    { turn: 8,  name: "Turn 8",       startDistance: 2200, endDistance: 2400, entrySpeed: 170, typicalBrakeZone: 2300 },
    { turn: 9,  name: "Turn 9",       startDistance: 2600, endDistance: 2800, entrySpeed: 210, typicalBrakeZone: 2700 },
    { turn: 10, name: "Turn 10",      startDistance: 3000, endDistance: 3200, entrySpeed: 140, typicalBrakeZone: 3100 },
    { turn: 11, name: "Turn 11",      startDistance: 3400, endDistance: 3600, entrySpeed: 230, typicalBrakeZone: 3500 },
    { turn: 12, name: "Turn 12",      startDistance: 3800, endDistance: 4000, entrySpeed: 250, typicalBrakeZone: 3900 },
    { turn: 13, name: "Turn 13",      startDistance: 4200, endDistance: 4400, entrySpeed: 150, typicalBrakeZone: 4300 },
    { turn: 14, name: "Turn 14",      startDistance: 4600, endDistance: 4800, entrySpeed: 200, typicalBrakeZone: 4700 },
    { turn: 15, name: "Turn 15",      startDistance: 5000, endDistance: 5200, entrySpeed: 160, typicalBrakeZone: 5100 },
    { turn: 16, name: "Turn 16",      startDistance: 5450, endDistance: 5700, entrySpeed: 100, typicalBrakeZone: 5550 },
    { turn: 17, name: "Turn 17",      startDistance: 5900, endDistance: 6100, entrySpeed: 280, typicalBrakeZone: 6000 },
  ]
};

// ============= Miami International Autodrome =============
// 트랙 길이: 5.412km (5412m)
// 고속 코너 + 느린 코너 조합
export const miamiInternational: TrackMapping = {
  trackId: 2,
  trackName: "Miami International Autodrome",
  trackLength: 5412,
  corners: [
    { turn: 1,  name: "Turn 1",       startDistance: 400,  endDistance: 550,  entrySpeed: 100, typicalBrakeZone: 350 },
    { turn: 2,  name: "Turn 2",         startDistance: 600,  endDistance: 700,  entrySpeed: 200, typicalBrakeZone: 620 },
    { turn: 3,  name: "Turn 3",        startDistance: 800,  endDistance: 950,  entrySpeed: 180, typicalBrakeZone: 850 },
    { turn: 4,  name: "Turn 4",         startDistance: 1000, endDistance: 1100, entrySpeed: 140, typicalBrakeZone: 1020 },
    { turn: 5,  name: "Turn 5",         startDistance: 1150, endDistance: 1250, entrySpeed: 160, typicalBrakeZone: 1180 },
    { turn: 6,  name: "Turn 6 (Hairpin)", startDistance: 1350, endDistance: 1550, entrySpeed: 80, typicalBrakeZone: 1400 },
    { turn: 7,  name: "Turn 7",         startDistance: 1650, endDistance: 1800, entrySpeed: 200, typicalBrakeZone: 1700 },
    { turn: 8,  name: "Turn 8",         startDistance: 1900, endDistance: 2050, entrySpeed: 220, typicalBrakeZone: 1950 },
    { turn: 9,  name: "Turn 9",         startDistance: 2150, endDistance: 2300, entrySpeed: 170, typicalBrakeZone: 2200 },
    { turn: 10, name: "Turn 10",        startDistance: 2400, endDistance: 2550, entrySpeed: 190, typicalBrakeZone: 2450 },
    { turn: 11, name: "Turn 11",        startDistance: 2650, endDistance: 2800, entrySpeed: 250, typicalBrakeZone: 2700 },
    { turn: 12, name: "Turn 12",        startDistance: 2900, endDistance: 3100, entrySpeed: 150, typicalBrakeZone: 3000 },
    { turn: 13, name: "Turn 13",        startDistance: 3200, endDistance: 3350, entrySpeed: 230, typicalBrakeZone: 3250 },
    { turn: 14, name: "Turn 14",        startDistance: 3450, endDistance: 3600, entrySpeed: 200, typicalBrakeZone: 3500 },
    { turn: 15, name: "Turn 15",        startDistance: 3700, endDistance: 3850, entrySpeed: 180, typicalBrakeZone: 3750 },
    { turn: 16, name: "Turn 16",        startDistance: 4000, endDistance: 4200, entrySpeed: 120, typicalBrakeZone: 4100 },
    { turn: 17, name: "Turn 17",        startDistance: 4300, endDistance: 4500, entrySpeed: 250, typicalBrakeZone: 4350 },
    { turn: 18, name: "Turn 18",        startDistance: 4600, endDistance: 4800, entrySpeed: 200, typicalBrakeZone: 4650 },
    { turn: 19, name: "Turn 19",        startDistance: 4900, endDistance: 5100, entrySpeed: 160, typicalBrakeZone: 4950 },
  ]
};

// ============= Track Registry =============
export const trackRegistry: TrackMapping[] = [
  jeddahCorniche,
  miamiInternational,
];

// ============= Helper Functions =============

/**
 * trackId로 트랙 매핑 찾기
 */
export function getTrackMapping(trackId: number): TrackMapping | null {
  return trackRegistry.find(t => t.trackId === trackId) || null;
}

/**
 * lapDistance로 현재 코너 번호 찾기
 */
export function getCurrentTurn(trackId: number, lapDistance: number): number {
  const track = getTrackMapping(trackId);
  if (!track) return 0;

  // 결승선 통과 체크 (lapDistance가 trackLength 이상이면)
  const normalizedDistance = lapDistance % track.trackLength;

  for (const corner of track.corners) {
    if (normalizedDistance >= corner.startDistance && normalizedDistance < corner.endDistance) {
      return corner.turn;
    }
  }
  return 0; // 스트레이트 구간
}

/**
 * lapDistance로 코너 정보 찾기
 */
export function getCornerInfo(trackId: number, lapDistance: number): CornerSegment | null {
  const track = getTrackMapping(trackId);
  if (!track) return null;

  const normalizedDistance = lapDistance % track.trackLength;

  for (const corner of track.corners) {
    if (normalizedDistance >= corner.startDistance && normalizedDistance < corner.endDistance) {
      return corner;
    }
  }
  return null;
}
