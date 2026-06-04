// DOM Elements
const connectionBanner = document.getElementById('connection-banner');
const connectionText = document.getElementById('connection-text');
const recordingStatusBox = document.querySelector('.recording-status-box');
const recordingText = document.getElementById('recording-text');

const infoTrack = document.getElementById('info-track');
const infoCar = document.getElementById('info-car');

const lapsContainer = document.getElementById('laps-container');
const btnClear = document.getElementById('btn-clear');
const toast = document.getElementById('toast');

// Subscriptions cleanups
let unsubConnection = null;
let unsubSessionInfo = null;
let unsubTelemetry = null;

// Initialize
async function init() {
  setupEventListeners();
  
  // Sync state on startup
  try {
    const status = await window.electronAPI.getRecordingStatus();
    updateConnectionUI(status.isConnected);
    updateSessionUI(status);
    updateLapsUI(status.laps);
  } catch (err) {
    console.error('Failed to sync initial recording status:', err);
  }

  // Subscribe to real-time events
  unsubConnection = window.electronAPI.onConnectionStatus((connected) => {
    updateConnectionUI(connected);
    if (!connected) {
      resetRecordingUI();
    }
  });

  unsubSessionInfo = window.electronAPI.onSessionInfo((info) => {
    updateSessionUI(info);
  });

  unsubTelemetry = window.electronAPI.onTelemetryUpdate((data) => {
    updateRecordingStatus(data.telemetry);
    updateLapsUI(data.laps);
  });
}

// UI State Updates
function updateConnectionUI(connected) {
  if (connected) {
    connectionBanner.classList.remove('disconnected');
    connectionBanner.classList.add('connected');
    connectionText.textContent = 'CONNECTED';
  } else {
    connectionBanner.classList.remove('connected');
    connectionBanner.classList.add('disconnected');
    connectionText.textContent = 'DISCONNECTED';
  }
}

function updateSessionUI(info) {
  infoTrack.textContent = info.track || '-';
  infoCar.textContent = info.car || '-';
}

function updateRecordingStatus(t) {
  recordingStatusBox.classList.add('active');
  recordingText.textContent = '데이터 기록 중...';
}

function resetRecordingUI() {
  recordingStatusBox.classList.remove('active');
  recordingText.textContent = 'iRacing 연결 대기 중...';
  infoTrack.textContent = '-';
  infoCar.textContent = '-';
}

function updateLapsUI(laps) {
  lapsContainer.innerHTML = '';

  if (!laps || laps.length === 0) {
    const noLaps = document.createElement('div');
    noLaps.className = 'no-laps-message';
    noLaps.textContent = '기록된 랩 데이터가 없습니다. 트랙 주행을 시작하세요.';
    lapsContainer.appendChild(noLaps);
    return;
  }

  // Loop in reverse order to show the latest laps at the top
  for (let i = laps.length - 1; i >= 0; i--) {
    const lap = laps[i];
    const row = document.createElement('div');
    row.className = 'lap-row';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'lap-info';

    const badge = document.createElement('span');
    badge.className = `lap-session-badge badge-${lap.sessionType.toLowerCase()}`;
    badge.textContent = lap.sessionType.toUpperCase();
    infoDiv.appendChild(badge);

    const title = document.createElement('span');
    title.className = 'lap-title';
    title.textContent = `Lap ${lap.lapNumber}`;
    infoDiv.appendChild(title);

    if (lap.isActive) {
      const activeBadge = document.createElement('span');
      activeBadge.className = 'lap-status-active';
      activeBadge.textContent = 'REC';
      infoDiv.appendChild(activeBadge);
    }

    row.appendChild(infoDiv);

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-download';
    downloadBtn.textContent = 'Download CSV';
    if (lap.frameCount === 0) {
      downloadBtn.disabled = true;
    }

    downloadBtn.addEventListener('click', () => {
      handleSave(lap.id, lap.sessionType, lap.lapNumber);
    });

    row.appendChild(downloadBtn);
    lapsContainer.appendChild(row);
  }
}

// Event Listeners setup
function setupEventListeners() {
  btnClear.addEventListener('click', async () => {
    try {
      const response = await window.electronAPI.clearSessions();
      if (response.success) {
        updateLapsUI([]);
        showToast('All telemetry data cleared successfully.');
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, true);
    }
  });
}

// Save trigger wrapper
async function handleSave(lapId, sessionType, lapNumber) {
  try {
    showToast(`Saving ${sessionType} Lap ${lapNumber} telemetry...`);
    const result = await window.electronAPI.saveLap(lapId);
    
    if (result.success) {
      showToast(`Saved Lap ${lapNumber} to: ${result.filePath}`);
    } else if (result.error) {
      showToast(`Failed to save: ${result.error}`, true);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

// Toast message handler
let toastTimeout = null;
function showToast(message, isError = false) {
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  
  toast.textContent = message;
  toast.className = 'toast';
  
  if (isError) {
    toast.classList.add('error');
  }
  
  toast.classList.remove('hidden');
  
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

// Clean-up on unload
window.addEventListener('beforeunload', () => {
  if (unsubConnection) unsubConnection();
  if (unsubSessionInfo) unsubSessionInfo();
  if (unsubTelemetry) unsubTelemetry();
});

// Start
init();
