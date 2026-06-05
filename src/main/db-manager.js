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

// Initialize database and sync telemetry files
function initDatabase() {
  try {
    const dbPath = getDatabasePath();
    console.log(`[DB Manager] Opening SQLite database at: ${dbPath}`);
    
    db = new Database(dbPath);
    
    // Create reference_telemetry table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS reference_telemetry (
        track_name TEXT,
        car_name TEXT,
        raw_csv_data TEXT NOT NULL,
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

// Scan src/data/ and import the fastest lap telemetry for each track + car combination
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
        if (csvFiles.length === 0) continue;
        
        // Find the fastest CSV file based on filename lap time
        let fastestFile = null;
        let fastestTime = Infinity;
        
        for (const file of csvFiles) {
          const timeMs = parseLapTimeFromFilename(file);
          if (timeMs < fastestTime) {
            fastestTime = timeMs;
            fastestFile = file;
          }
        }
        
        if (fastestFile) {
          const csvFilePath = path.join(carPath, fastestFile);
          const rawCsvData = fs.readFileSync(csvFilePath, 'utf8');
          
          // Insert or update in SQLite database
          const stmt = db.prepare(`
            INSERT OR REPLACE INTO reference_telemetry (track_name, car_name, raw_csv_data, created_at)
            VALUES (?, ?, ?, ?)
          `);
          stmt.run(track, car, rawCsvData, new Date().toISOString());
          
          console.log(`[DB Manager] Synchronized: ${track} / ${car} (Best Lap Time: ${(fastestTime / 1000).toFixed(3)}s from ${fastestFile})`);
          syncCount++;
        }
      }
    }
    
    console.log(`[DB Manager] Successfully synchronized ${syncCount} track/car telemetry records to SQLite.`);
    
  } catch (err) {
    console.error('[DB Manager] Error during telemetry synchronization:', err);
  }
}

// Retrieve reference telemetry data for a specific track and car
function getReferenceTelemetry(trackName, carName) {
  if (!db) {
    console.error('[DB Manager] Cannot query telemetry: Database is not initialized.');
    return null;
  }
  
  try {
    const stmt = db.prepare(`
      SELECT raw_csv_data FROM reference_telemetry 
      WHERE track_name = ? AND car_name = ?
    `);
    const row = stmt.get(trackName, carName);
    return row ? row.raw_csv_data : null;
  } catch (err) {
    console.error(`[DB Manager] Error querying reference telemetry for track=${trackName}, car=${carName}:`, err);
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
  closeDatabase
};
