const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const IRacingClient = require('./iracing-client');
const recorder = require('./recorder');
const dbManager = require('./db-manager');
const analyzer = require('./analyzer');

let mainWindow = null;
let iracingClient = null;
let uiUpdatesEnabled = true;
let frameCountSinceLastUIUpdate = 0;
const UI_UPDATE_THROTTLE_FACTOR = 6; // Send UI telemetry updates at ~10Hz (60Hz / 6)

// Helper to recursively copy directories/files
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

// Helper to recursively delete directories/files
function deleteRecursiveSync(src) {
  if (fs.existsSync(src)) {
    fs.readdirSync(src).forEach((file) => {
      const curPath = path.join(src, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteRecursiveSync(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(src);
  }
}

// Auto-import crawled telemetry files from default Downloads folder
function autoImportFromDownloads() {
  try {
    const downloadsDir = path.join(os.homedir(), 'Downloads', 'must-be-the-apex', 'data');
    const targetDir = path.join(__dirname, '..', '..', 'extensions', 'data');

    if (fs.existsSync(downloadsDir)) {
      console.log(`[Auto-Import] Found downloaded telemetry data at: ${downloadsDir}`);
      
      // Copy to project extensions/data folder
      copyRecursiveSync(downloadsDir, targetDir);
      
      // Clean up downloads folder
      deleteRecursiveSync(downloadsDir);
      
      console.log(`[Auto-Import] Successfully imported telemetry data to: ${targetDir}`);
    }
  } catch (err) {
    console.error('[Auto-Import] Failed to automatically import downloaded telemetry:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    focusable: false, // 게임 윈도우 포커스 빼앗기 방지
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Windows OS 레벨에서 투명창 마우스 관통 완벽 보장 (Click-through)
  mainWindow.setIgnoreMouseEvents(true, { forwardToPanel: true });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Start tracking iRacing
    iracingClient = new IRacingClient();
    setupIRacingHandlers();
    setupAnalyzerHandlers();
    iracingClient.start();
  });

  // Performance optimization: Stop UI updates in Renderer when app is minimized
  mainWindow.on('minimize', () => {
    uiUpdatesEnabled = false;
  });

  mainWindow.on('restore', () => {
    uiUpdatesEnabled = true;
  });

  mainWindow.on('closed', () => {
    if (iracingClient) {
      iracingClient.stop();
      iracingClient = null;
    }
    mainWindow = null;
  });
}

function setupIRacingHandlers() {
  if (!iracingClient) return;

  // Listen to connection changes
  iracingClient.on('connection-status', (connected) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('connection-status', connected);
    }
    if (connected) {
      recorder.start();
    } else {
      recorder.stop();
    }
  });

  // Listen to session info updates
  iracingClient.on('session-info', (info) => {
    if (info && info.track && info.car) {
      // Slugify names to match database folder structure
      const trackSlug = info.track.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const carSlug = info.car.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      
      const success = analyzer.loadTrackTelemetry(trackSlug, carSlug, info.trackLength || 4000);
      if (success) {
        console.log(`[Main] Loaded reference telemetry for track=${trackSlug}, car=${carSlug}`);
      } else {
        console.log(`[Main] No reference telemetry found/loaded for track=${trackSlug}, car=${carSlug}`);
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('session-info', info);
    }
  });

  // Listen to raw telemetry frames (60Hz)
  iracingClient.on('telemetry', (data) => {
    // 1. Record frame to memory buffer (unthrottled 60Hz)
    recorder.addFrame(data);

    // 2. Update real-time coaching state machine (60Hz)
    analyzer.updateTelemetry(data);

    // 3. Send throttled updates to UI (Renderer) to save CPU/GPU cycles
    if (uiUpdatesEnabled && mainWindow && !mainWindow.isDestroyed()) {
      frameCountSinceLastUIUpdate++;
      if (frameCountSinceLastUIUpdate >= UI_UPDATE_THROTTLE_FACTOR) {
        frameCountSinceLastUIUpdate = 0;
        
        // Expose current frame counts and telemetry values
        mainWindow.webContents.send('telemetry-update', {
          telemetry: data,
          laps: recorder.getLapsList()
        });
      }
    }
  });
}

function setupAnalyzerHandlers() {
  analyzer.on('tts-trigger', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tts-trigger', data);
    }
  });

  analyzer.on('brake-timing-fb', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('brake-timing-fb', data);
    }
  });

  analyzer.on('apex-speed-fb', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('apex-speed-fb', data);
    }
  });

  analyzer.on('reference-missing', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('reference-missing', data);
    }
  });
}

// Bind IPC commands from Renderer
ipcMain.handle('save-lap', async (event, lapId) => {
  if (mainWindow) {
    return await recorder.saveLapCSV(mainWindow, lapId);
  }
  return { success: false, error: 'Main window is not available.' };
});

// Bind IPC commands from Renderer
ipcMain.handle('clear-sessions', () => {
  recorder.clear();
  return { success: true };
});

ipcMain.handle('get-recording-status', () => {
  return {
    isConnected: iracingClient ? iracingClient.isConnected : false,
    track: iracingClient ? iracingClient.currentTrack : 'Unknown Track',
    car: iracingClient ? iracingClient.currentCar : 'Unknown Car',
    sessionType: iracingClient ? iracingClient.currentSessionType : 'Practice',
    laps: recorder.getLapsList()
  };
});

// App Lifecycle
app.whenReady().then(() => {
  // Bypassing autoplay policy for Chromium
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  
  // Initialize SQLite database and sync reference telemetry
  dbManager.initDatabase();
  
  // Auto-import telemetry from Downloads folder
  autoImportFromDownloads();
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Close database connection
  dbManager.closeDatabase();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  dbManager.closeDatabase();
});
