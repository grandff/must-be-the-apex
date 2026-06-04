const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const IRacingClient = require('./iracing-client');
const recorder = require('./recorder');

let mainWindow = null;
let iracingClient = null;
let uiUpdatesEnabled = true;
let frameCountSinceLastUIUpdate = 0;
const UI_UPDATE_THROTTLE_FACTOR = 6; // Send UI telemetry updates at ~10Hz (60Hz / 6)

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Start tracking iRacing
    iracingClient = new IRacingClient();
    setupIRacingHandlers();
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('session-info', info);
    }
  });

  // Listen to raw telemetry frames (60Hz)
  iracingClient.on('telemetry', (data) => {
    // 1. Record frame to memory buffer (unthrottled 60Hz)
    recorder.addFrame(data);

    // 2. Send throttled updates to UI (Renderer) to save CPU/GPU cycles
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

// Bind IPC commands from Renderer
ipcMain.handle('save-lap', async (event, lapId) => {
  if (mainWindow) {
    return await recorder.saveLapCSV(mainWindow, lapId);
  }
  return { success: false, error: 'Main window is not available.' };
});

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
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
