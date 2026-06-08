const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

let db = null;
let app = null;

try {
  const electron = require('electron');
  app = electron.app;
} catch (e) {
  // Running outside electron (e.g. scripts/testing)
}

// Get the user data directory for SQLite database
function getDatabasePath() {
  let userDataPath;
  if (app) {
    userDataPath = app.getPath('userData');
  } else {
    userDataPath = path.join(os.homedir(), '.must-be-the-apex');
  }
  
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  
  return path.join(userDataPath, 'telemetry.db');
}

// Helper to parse lap time from CSV filename (e.g. telemetry_01_38_404_thomas_strauven_...)
// Returns lap time in milliseconds. Returns Infinity if parsing fails.
function parseLapTimeFromFilename(filename) {
  try {
    // Pattern 1: telemetry_MM_SS_MS_...
    const match = filename.match(/^telemetry_(\d+)_(\d+)_(\d+)_/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = parseInt(match[3], 10);
      return minutes * 60 * 1000 + seconds * 1000 + ms;
    }
    
    // Pattern 2: telemetry_SS_MS_...
    const shortMatch = filename.match(/^telemetry_(\d+)_(\d+)_/);
    if (shortMatch) {
      const seconds = parseInt(shortMatch[1], 10);
      const ms = parseInt(shortMatch[2], 10);
      return seconds * 1000 + ms;
    }
  } catch (err) {
    console.error(`[DB Manager] Error parsing lap time from filename ${filename}:`, err);
  }
  return Infinity;
}

// Helper to parse weather and track metadata comments from CSV
function parseWeatherFromCsvComments(csvText) {
  const metadata = {
    sky: 'Unknown',
    airTemp: null,
    trackTemp: null
  };
  
  if (!csvText) return metadata;

  const lines = csvText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')) break; // End of header comments
    
    if (trimmed.startsWith('# G61_WEATHER:')) {
      metadata.sky = trimmed.replace('# G61_WEATHER:', '').trim();
    } else if (trimmed.startsWith('# G61_AIR_TEMP:')) {
      const val = trimmed.replace('# G61_AIR_TEMP:', '').replace('°C', '').trim();
      const num = parseFloat(val);
      if (!isNaN(num)) metadata.airTemp = num;
    } else if (trimmed.startsWith('# G61_TRACK_TEMP:')) {
      const val = trimmed.replace('# G61_TRACK_TEMP:', '').replace('°C', '').trim();
      const num = parseFloat(val);
      if (!isNaN(num)) metadata.trackTemp = num;
    }
  }
  return metadata;
}

// Initialize database and sync telemetry files
function initDatabase() {
  try {
    const dbPath = getDatabasePath();
    console.log(`[DB Manager] Opening SQLite database at: ${dbPath}`);
    
    db = new Database(dbPath);
    
    // Check if table contains old schema (without file_name) and drop it
    try {
      db.prepare(`SELECT file_name FROM reference_telemetry LIMIT 1`).get();
    } catch (e) {
      console.log('[DB Manager] Old schema detected in reference_telemetry. Dropping table for upgrade.');
      db.prepare(`DROP TABLE IF EXISTS reference_telemetry`).run();
    }

    // Create reference_telemetry table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS reference_telemetry (
        track_name TEXT,
        car_name TEXT,
        file_name TEXT,
        lap_time_ms INTEGER,
        sky TEXT,
        air_temp REAL,
        track_temp REAL,
        raw_csv_data TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (track_name, car_name, file_name)
      )
    `).run();

    // Create user_lap_records table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS user_lap_records (
        track_name TEXT,
        car_name TEXT,
        personal_best_ms INTEGER,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (track_name, car_name)
      )
    `).run();
    
    console.log('[DB Manager] SQLite database initialized successfully.');
    
    // Sync reference telemetry files
    syncPackagedTelemetry();
    
  } catch (err) {
    console.error('[DB Manager] Failed to initialize SQLite database:', err);
  }
}

// Scan src/data/ and import all telemetry files
function syncPackagedTelemetry() {
  if (!db) {
    console.error('[DB Manager] Cannot sync telemetry: Database is not initialized.');
    return;
  }
  
  try {
    let dataDir;
    if (app) {
      dataDir = path.join(app.getAppPath(), 'src', 'data');
    } else {
      dataDir = path.join(__dirname, '..', 'data');
    }
    
    if (!fs.existsSync(dataDir)) {
      console.log(`[DB Manager] Telemetry data source directory not found at: ${dataDir}. Skipping sync.`);
      return;
    }
    
    console.log(`[DB Manager] Syncing telemetry files from: ${dataDir}`);
    
    const tracks = fs.readdirSync(dataDir);
    let syncCount = 0;
    
    for (const track of tracks) {
      const trackPath = path.join(dataDir, track);
      if (!fs.statSync(trackPath).isDirectory()) continue;
      
      const cars = fs.readdirSync(trackPath);
      for (const car of cars) {
        const carPath = path.join(trackPath, car);
        if (!fs.statSync(carPath).isDirectory()) continue;
        
        // Find all CSV files in this directory
        const files = fs.readdirSync(carPath);
        const csvFiles = files.filter(f => f.endsWith('.csv'));
        
        for (const file of csvFiles) {
          const csvFilePath = path.join(carPath, file);
          const rawCsvData = fs.readFileSync(csvFilePath, 'utf8');
          const timeMs = parseLapTimeFromFilename(file);
          const weather = parseWeatherFromCsvComments(rawCsvData);
          
          // Insert or update in SQLite database
          const stmt = db.prepare(`
            INSERT OR REPLACE INTO reference_telemetry 
            (track_name, car_name, file_name, lap_time_ms, sky, air_temp, track_temp, raw_csv_data, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          stmt.run(track, car, file, timeMs, weather.sky, weather.airTemp, weather.trackTemp, rawCsvData, new Date().toISOString());
          syncCount++;
        }
      }
    }
    
    console.log(`[DB Manager] Successfully synchronized ${syncCount} track/car telemetry records to SQLite.`);
    
  } catch (err) {
    console.error('[DB Manager] Error during telemetry synchronization:', err);
  }
}

// Retrieve reference telemetry data for a specific track, car, and weather condition
function getReferenceTelemetry(trackName, carName, userAirTemp, userTrackTemp) {
  if (!db) {
    console.error('[DB Manager] Cannot query telemetry: Database is not initialized.');
    return null;
  }
  
  try {
    const rows = db.prepare(`
      SELECT file_name, lap_time_ms, air_temp, track_temp, raw_csv_data 
      FROM reference_telemetry 
      WHERE track_name = ? AND car_name = ?
    `).all(trackName, carName);
    
    if (rows.length === 0) return null;
    
    let bestRow = null;
    if (userAirTemp !== undefined && userAirTemp !== null && userTrackTemp !== undefined && userTrackTemp !== null) {
      // Find temperature-based matches
      const tempMatches = rows.filter(r => r.air_temp !== null && r.track_temp !== null);
      
      if (tempMatches.length > 0) {
        // Step 1: Filter matches within 5 degrees Celsius
        const closeMatches = tempMatches.filter(r => 
          Math.abs(r.track_temp - userTrackTemp) <= 5.0 && 
          Math.abs(r.air_temp - userAirTemp) <= 5.0
        );
        
        if (closeMatches.length > 0) {
          // Choose the fastest lap time among close temperature matches
          closeMatches.sort((a, b) => a.lap_time_ms - b.lap_time_ms);
          bestRow = closeMatches[0];
          console.log(`[DB Manager] Weather match found within 5°C. Selected: ${bestRow.file_name} (Air: ${bestRow.air_temp}°C, Track: ${bestRow.track_temp}°C)`);
        } else {
          // Step 2: Choose the one with the minimum weighted temperature deviation (1.5x on Track Temp)
          tempMatches.sort((a, b) => {
            const diffA = Math.abs(a.track_temp - userTrackTemp) * 1.5 + Math.abs(a.air_temp - userAirTemp);
            const diffB = Math.abs(b.track_temp - userTrackTemp) * 1.5 + Math.abs(b.air_temp - userAirTemp);
            return diffA - diffB;
          });
          bestRow = tempMatches[0];
          console.log(`[DB Manager] Closest weather match selected: ${bestRow.file_name} (Air: ${bestRow.air_temp}°C, Track: ${bestRow.track_temp}°C, UserAir: ${userAirTemp}°C, UserTrack: ${userTrackTemp}°C)`);
        }
      }
    }
    
    // Fallback if no temperature matching rows exist or no temperature parameters are provided
    if (!bestRow) {
      rows.sort((a, b) => a.lap_time_ms - b.lap_time_ms);
      bestRow = rows[0];
      console.log(`[DB Manager] Default fastest telemetry selected: ${bestRow.file_name} (Lap Time: ${(bestRow.lap_time_ms/1000).toFixed(3)}s)`);
    }
    
    return bestRow.raw_csv_data;
  } catch (err) {
    console.error(`[DB Manager] Error querying reference telemetry for track=${trackName}, car=${carName}:`, err);
    return null;
  }
}

// Retrieve user's personal best (PB) in milliseconds
function getUserPB(trackName, carName) {
  if (!db) return null;
  try {
    const row = db.prepare(`
      SELECT personal_best_ms 
      FROM user_lap_records 
      WHERE track_name = ? AND car_name = ?
    `).get(trackName, carName);
    return row ? row.personal_best_ms : null;
  } catch (err) {
    console.error(`[DB Manager] Error getting user PB for track=${trackName}, car=${carName}:`, err);
    return null;
  }
}

// Update/insert user's personal best (PB) in milliseconds
function updateUserPB(trackName, carName, lapTimeMs) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO user_lap_records (track_name, car_name, personal_best_ms, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(trackName, carName, lapTimeMs, new Date().toISOString());
    console.log(`[DB Manager] Saved new User PB for track=${trackName}, car=${carName}: ${(lapTimeMs/1000).toFixed(3)}s`);
    return true;
  } catch (err) {
    console.error(`[DB Manager] Error updating user PB for track=${trackName}, car=${carName}:`, err);
    return false;
  }
}

// Retrieve reference telemetry data for a specific track, car, and weather condition, matched against User's PB
function getTargetTelemetry(trackName, carName, userAirTemp, userTrackTemp, userPB) {
  if (!db) {
    console.error('[DB Manager] Cannot query telemetry: Database is not initialized.');
    return null;
  }
  
  try {
    const rows = db.prepare(`
      SELECT file_name, lap_time_ms, air_temp, track_temp, raw_csv_data 
      FROM reference_telemetry 
      WHERE track_name = ? AND car_name = ?
    `).all(trackName, carName);
    
    if (rows.length === 0) return null;
    
    let matchedRows = [...rows];
    
    // Step 1: Perform weather/temperature closest match if temperatures are provided
    if (userAirTemp !== undefined && userAirTemp !== null && userTrackTemp !== undefined && userTrackTemp !== null) {
      const tempMatches = rows.filter(r => r.air_temp !== null && r.track_temp !== null);
      
      if (tempMatches.length > 0) {
        // Step 1a: Filter matches within 5 degrees Celsius
        const closeMatches = tempMatches.filter(r => 
          Math.abs(r.track_temp - userTrackTemp) <= 5.0 && 
          Math.abs(r.air_temp - userAirTemp) <= 5.0
        );
        
        if (closeMatches.length > 0) {
          matchedRows = closeMatches;
        } else {
          // Step 1b: Sort by weighted temperature deviation (1.5x on Track Temp)
          tempMatches.sort((a, b) => {
            const diffA = Math.abs(a.track_temp - userTrackTemp) * 1.5 + Math.abs(a.air_temp - userAirTemp);
            const diffB = Math.abs(b.track_temp - userTrackTemp) * 1.5 + Math.abs(b.air_temp - userAirTemp);
            return diffA - diffB;
          });
          matchedRows = tempMatches;
        }
      }
    }
    
    // Sort weather-matched reference rows by lap time DESCENDING (slowest first)
    matchedRows.sort((a, b) => b.lap_time_ms - a.lap_time_ms);
    
    let targetRow = null;
    
    if (userPB === undefined || userPB === null || userPB <= 0) {
      // User has no record yet -> select the slowest matched reference lap
      targetRow = matchedRows[0];
      console.log(`[DB Manager] Target progression: No user PB. Selected slowest reference: ${targetRow.file_name} (Lap Time: ${(targetRow.lap_time_ms/1000).toFixed(3)}s)`);
    } else {
      // Find the first reference lap that is faster than the user's PB (the next step up!)
      const nextStepUp = matchedRows.find(r => r.lap_time_ms < userPB);
      if (nextStepUp) {
        targetRow = nextStepUp;
        console.log(`[DB Manager] Target progression: User PB = ${(userPB/1000).toFixed(3)}s. Selected next level up reference: ${targetRow.file_name} (Lap Time: ${(targetRow.lap_time_ms/1000).toFixed(3)}s)`);
      } else {
        // User PB is faster than all available reference laps -> select the fastest reference lap (last element)
        targetRow = matchedRows[matchedRows.length - 1];
        console.log(`[DB Manager] Target progression: User PB = ${(userPB/1000).toFixed(3)}s is faster than all references. Selected fastest reference: ${targetRow.file_name} (Lap Time: ${(targetRow.lap_time_ms/1000).toFixed(3)}s)`);
      }
    }
    
    return targetRow;
  } catch (err) {
    console.error(`[DB Manager] Error querying target telemetry for track=${trackName}, car=${carName}:`, err);
    return null;
  }
}

// Close database connection
function closeDatabase() {
  if (db) {
    try {
      db.close();
      db = null;
      console.log('[DB Manager] SQLite database connection closed.');
    } catch (err) {
      console.error('[DB Manager] Error closing database connection:', err);
    }
  }
}

module.exports = {
  initDatabase,
  getReferenceTelemetry,
  getUserPB,
  updateUserPB,
  getTargetTelemetry,
  closeDatabase
};
