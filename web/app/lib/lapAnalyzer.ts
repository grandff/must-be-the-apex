/**
 * 랩 분석기 (Lap Analyzer)
 * 랩 완료 판단 + 델타 연산 로직
 */

import { TelemetryData } from '~/lib/useTelemetry';
import { getTrackMapping, getCurrentTurn, CornerSegment } from '~/lib/tracks/cornerMapping';

// ============= 코너별 데이터 저장 =============

export interface CornerSample {
  turn: number;
  lapDistance: number;
  speed: number;        // km/h
  throttle: number;     // 0-1
  brake: number;       // 0-1
  timestamp: number;
}

export interface LapAnalysis {
  trackId: number;
  lapNumber: number;
  lapTimeMs: number;
  isPersonalBest: boolean;
  invalidated: boolean;
  corners: CornerSample[];
  startTime: number;
  endTime: number;
}

// 현재 진행중인 랩 데이터
let currentLapData: {
  trackId: number;
  lapNumber: number;
  startTime: number;
  samples: CornerSample[];
  lastTurn: number;
  lastLapDistance: number;
  isInvalidated: boolean;
} | null = null;

// 베스트 랩 캐시 (trackId -> LapAnalysis)
const bestLapsCache = new Map<number, LapAnalysis>();

// ============= Public API =============

/**
 * 새 세션 시작 (트랙 변경 시 호출)
 */
export function startNewSession(trackId: number) {
  currentLapData = null;
  bestLapsCache.clear();
  console.log(`[LapAnalyzer] New session: Track ${trackId}`);
}

/**
 * 텔레메트리 데이터로 랩 분석기 업데이트
 * @returns 랩 완료 시 LapAnalysis, 아니면 null
 */
export function updateTelemetry(telemetry: TelemetryData): LapAnalysis | null {
  const { trackId, lapNumber, lapDistance, speedKmh, throttle, brake } = telemetry;
  const timestamp = Date.now();

  // 첫 데이터 또는 새 랩 시작
  if (!currentLapData || lapNumber !== currentLapData.lapNumber) {
    // 이전 랩 완료 처리
    if (currentLapData && currentLapData.lapNumber > 0) {
      const completedLap = finalizeLap(false);
      if (completedLap) {
        return completedLap;
      }
    }

    // 새 랩 시작
    currentLapData = {
      trackId,
      lapNumber,
      startTime: timestamp,
      samples: [],
      lastTurn: 0,
      lastLapDistance: 0,
      isInvalidated: false
    };
    
    console.log(`[LapAnalyzer] Lap ${lapNumber} started`);
    return null;
  }

  // 플래시백 감지 (lapDistance가 갑자기 줄어들면)
  if (lapDistance < currentLapData.lastLapDistance - 100) {
    console.log(`[LapAnalyzer] Flashback detected! Resetting lap data`);
    currentLapData.samples = [];
    currentLapData.isInvalidated = true;
  }

  // 현재 코너 번호
  const currentTurn = getCurrentTurn(trackId, lapDistance);

  // 새 코너에 진입했으면 샘플 추가
  if (currentTurn !== currentLapData.lastTurn && currentTurn > 0) {
    const sample: CornerSample = {
      turn: currentTurn,
      lapDistance,
      speed: speedKmh,
      throttle,
      brake,
      timestamp
    };
    currentLapData.samples.push(sample);
  }

  // 랩 완료 감지 (lapDistance가 trackLength 이상으로 증가했다가 줄어들면)
  const track = getTrackMapping(trackId);
  if (track && lapDistance < currentLapData.lastLapDistance && currentLapData.lastLapDistance > track.trackLength * 0.8) {
    // 랩 완료!
    const completedLap = finalizeLap(currentLapData.isInvalidated);
    if (completedLap) {
      return completedLap;
    }
  }

  currentLapData.lastTurn = currentTurn;
  currentLapData.lastLapDistance = lapDistance;

  return null;
}

/**
 * 랩 완료 처리
 */
function finalizeLap(isInvalidated: boolean): LapAnalysis | null {
  if (!currentLapData || currentLapData.samples.length === 0) {
    return null;
  }

  const endTime = Date.now();
  const lapTimeMs = endTime - currentLapData.startTime;

  const analysis: LapAnalysis = {
    trackId: currentLapData.trackId,
    lapNumber: currentLapData.lapNumber,
    lapTimeMs,
    isPersonalBest: false, // 아래에서 설정
    invalidated: isInvalidated,
    corners: [...currentLapData.samples],
    startTime: currentLapData.startTime,
    endTime
  };

  // 베스트 랩 체크
  const existingBest = bestLapsCache.get(analysis.trackId);
  if (!existingBest || lapTimeMs < existingBest.lapTimeMs) {
    analysis.isPersonalBest = true;
    bestLapsCache.set(analysis.trackId, analysis);
    console.log(`🏆 New best lap! Track ${analysis.trackId}: ${formatLapTime(lapTimeMs)}`);
  } else {
    console.log(`🏁 Lap ${analysis.lapNumber}: ${formatLapTime(lapTimeMs)}`);
  }

  // 랩 완료 후 리셋
  currentLapData = null;

  return analysis;
}

/**
 * 두 랩의 코너별 델타 계산
 */
export function calculateCornerDeltas(
  currentLap: LapAnalysis,
  referenceLap: LapAnalysis
): CornerDelta[] {
  const deltas: CornerDelta[] = [];

  // 기준 랩의 코너별 평균 데이터 구성
  const referenceCorners = buildCornerAverages(referenceLap.corners);
  const currentCorners = buildCornerAverages(currentLap.corners);

  // 공통 코너에 대해 델타 계산
  for (const turn of Object.keys(referenceCorners)) {
    const ref = referenceCorners[turn];
    const cur = currentCorners[turn];

    if (ref && cur) {
      deltas.push({
        turn: parseInt(turn),
        entrySpeedDiff: cur.avgSpeed - ref.avgSpeed,
        apexSpeedDiff: cur.avgSpeed - ref.avgSpeed, // 단순화를 위해 동일하게 사용
        brakePointDiffMeters: calculateBrakePointDiff(cur, ref),
        throttleDiff: cur.avgThrottle - ref.avgThrottle
      });
    }
  }

  return deltas;
}

interface CornerAverage {
  avgSpeed: number;
  avgThrottle: number;
  avgBrake: number;
  sampleCount: number;
}

function buildCornerAverages(samples: CornerSample[]): Record<number, CornerAverage> {
  const averages: Record<number, CornerAverage> = {};

  for (const sample of samples) {
    if (!averages[sample.turn]) {
      averages[sample.turn] = {
        avgSpeed: 0,
        avgThrottle: 0,
        avgBrake: 0,
        sampleCount: 0
      };
    }

    const a = averages[sample.turn];
    a.avgSpeed += sample.speed;
    a.avgThrottle += sample.throttle;
    a.avgBrake += sample.brake;
    a.sampleCount++;
  }

  // 평균 계산
  for (const turn of Object.keys(averages)) {
    const a = averages[parseInt(turn)];
    a.avgSpeed /= a.sampleCount;
    a.avgThrottle /= a.sampleCount;
    a.avgBrake /= a.sampleCount;
  }

  return averages;
}

function calculateBrakePointDiff(current: CornerAverage, reference: CornerAverage): number {
  // 브레이크 포인트는 브레이크 값이 0.5 이상인 첫 샘플의 lapDistance로 추정
  // 단순화를 위해 속도 차이로 대략적인 브레이킹 포인트 차이 추정
  // (실제로는 더 정교한 알고리즘 필요)
  return (reference.avgSpeed - current.avgSpeed) * 0.5; // 경험적 계수
}

export interface CornerDelta {
  turn: number;
  entrySpeedDiff: number;   // 양수 = 현재가 더 빠름
  apexSpeedDiff: number;
  brakePointDiffMeters: number; // 양수 = 현재가 더 늦게 브레이크
  throttleDiff: number;
}

// ============= Helper Functions =============

export function formatLapTime(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${min}:${sec.toString().padStart(2, '0')}.${mil.toString().padStart(3, '0')}`;
}

/**
 * 현재 진행중인 랩 정보 반환
 */
export function getCurrentLapProgress(): { lapNumber: number; samples: number } | null {
  if (!currentLapData) return null;
  return {
    lapNumber: currentLapData.lapNumber,
    samples: currentLapData.samples.length
  };
}
