import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// DB 파일 경로 (프로젝트 루트의 data 폴더)
const DATA_DIR = path.join(process.cwd(), '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'must-be-the-apex.db');

// data 디렉토리 자동 생성
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// SQLite DB 초기화
let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  const database = db;

  // 트랙별 베스트 랩 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS best_laps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL,
      lap_number INTEGER NOT NULL,
      lap_time_ms INTEGER NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      telemetry_data TEXT, -- JSON 문자열로 저장
      is_personal_best INTEGER DEFAULT 0,
      corner_deltas TEXT -- JSON 문자열로 저장
    )
  `);

  // 세션 히스토리 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS session_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL,
      session_type TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      total_laps INTEGER DEFAULT 0,
      best_lap_id INTEGER,
      notes TEXT
    )
  `);

  // 설정 테이블 (API 키 등)
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 인덱스 생성
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_best_laps_track 
    ON best_laps(track_id)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_best_laps_personal_best 
    ON best_laps(is_personal_best)
  `);

  console.log('✅ SQLite schema initialized:', DB_PATH);
}

// ============= Repository Functions =============

export interface BestLap {
  id?: number;
  trackId: number;
  lapNumber: number;
  lapTimeMs: number;
  completedAt?: string;
  telemetryData?: string;
  isPersonalBest?: number;
  cornerDeltas?: string;
}

export interface SessionHistory {
  id?: number;
  trackId: number;
  sessionType?: string;
  startedAt?: string;
  endedAt?: string;
  totalLaps?: number;
  bestLapId?: number;
  notes?: string;
}

// 베스트 랩 저장
export function saveBestLap(lap: BestLap): number {
  const database = getDb();
  
  // 먼저 이 트랙의 기존 베스트인지 확인
  const existingBest = database.prepare(
    'SELECT id FROM best_laps WHERE track_id = ? AND is_personal_best = 1'
  ).get(lap.trackId) as { id: number } | undefined;

  const isNewPersonalBest = !existingBest || lap.lapTimeMs < getBestLapTime(lap.trackId);

  const stmt = database.prepare(`
    INSERT INTO best_laps (track_id, lap_number, lap_time_ms, telemetry_data, is_personal_best, corner_deltas)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    lap.trackId,
    lap.lapNumber,
    lap.lapTimeMs,
    lap.telemetryData || null,
    isNewPersonalBest ? 1 : 0,
    lap.cornerDeltas || null
  );

  // 기존 베스트였다면 해제 (새로운 베스트만 1로 유지)
  if (isNewPersonalBest && existingBest) {
    database.prepare('UPDATE best_laps SET is_personal_best = 0 WHERE track_id = ? AND id != ?')
      .run(lap.trackId, result.lastInsertRowid);
  }

  console.log(`📊 Best lap saved: Track ${lap.trackId}, Lap ${lap.lapNumber}, Time ${lap.lapTimeMs}ms${isNewPersonalBest ? ' (NEW BEST!)' : ''}`);
  
  return result.lastInsertRowid as number;
}

// 트랙별 베스트 랩타임 조회
export function getBestLapTime(trackId: number): number | null {
  const database = getDb();
  const row = database.prepare(
    'SELECT lap_time_ms FROM best_laps WHERE track_id = ? AND is_personal_best = 1'
  ).get(trackId) as { lap_time_ms: number } | undefined;
  
  return row ? row.lap_time_ms : null;
}

// 트랙별 베스트 랩 조회
export function getBestLap(trackId: number): BestLap | null {
  const database = getDb();
  const row = database.prepare(
    'SELECT * FROM best_laps WHERE track_id = ? AND is_personal_best = 1'
  ).get(trackId) as any;
  
  return row ? {
    id: row.id,
    trackId: row.track_id,
    lapNumber: row.lap_number,
    lapTimeMs: row.lap_time_ms,
    completedAt: row.completed_at,
    telemetryData: row.telemetry_data,
    isPersonalBest: row.is_personal_best,
    cornerDeltas: row.corner_deltas
  } : null;
}

// 설정 저장/조회
export function getSetting(key: string): string | null {
  const database = getDb();
  const row = database.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  const database = getDb();
  database.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
  `).run(key, value);
}

// 세션 히스토리 저장
export function saveSession(session: SessionHistory): number {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO session_history (track_id, session_type, total_laps, best_lap_id, notes)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    session.trackId,
    session.sessionType || null,
    session.totalLaps || 0,
    session.bestLapId || null,
    session.notes || null
  );
  return result.lastInsertRowid as number;
}