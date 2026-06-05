// DOM Elements
const controlPanel = document.getElementById('control-panel');
const connectionBanner = document.getElementById('connection-banner');
const connectionText = document.getElementById('connection-text');
const recordingStatusBox = document.querySelector('.recording-status-box');
const recordingText = document.getElementById('recording-text');

const infoTrack = document.getElementById('info-track');
const infoCar = document.getElementById('info-car');

const lapsContainer = document.getElementById('laps-container');
const btnClear = document.getElementById('btn-clear');
const toast = document.getElementById('toast');

// HUD DOM Elements
const brakeHud = document.getElementById('brake-hud');
const brakeIndicator = document.getElementById('brake-indicator');
const brakeFeedbackBadge = document.getElementById('brake-feedback-badge');
const brakeDetails = document.getElementById('brake-details');

const apexHud = document.getElementById('apex-hud');
const apexFeedbackBadge = document.getElementById('apex-feedback-badge');
const apexDetails = document.getElementById('apex-details');

const warningHud = document.getElementById('warning-hud');
const flashScreen = document.getElementById('flash-screen');

// Subscriptions cleanups
let unsubConnection = null;
let unsubSessionInfo = null;
let unsubTelemetry = null;
let unsubTTSTrigger = null;
let unsubBrakeFeedback = null;
let unsubApexFeedback = null;
let unsubRefMissing = null;

// HUD timeouts
let brakeHudTimeout = null;
let apexHudTimeout = null;
let flashScreenTimeout = null;

// Initialize
async function init() {
  setupEventListeners();
  setupHUDListeners();
  
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
      // Show control panel when disconnected, hide HUDs
      controlPanel.classList.remove('hidden');
      warningHud.classList.add('hidden');
      hideAllHUDs();
    } else {
      // Hide control panel when iRacing is connected
      controlPanel.classList.add('hidden');
    }
  });

  unsubSessionInfo = window.electronAPI.onSessionInfo((info) => {
    updateSessionUI(info);
    // Hide reference missing warning when a new session details are received, 
    // it will be shown again if the new track/car lacks telemetry.
    warningHud.classList.add('hidden');
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

// Setup Real-time HUD and Audio Coaching Listeners
function setupHUDListeners() {
  if (!window.apexAPI) return;

  // 1. TTS Audio coaching trigger
  unsubTTSTrigger = window.apexAPI.onTTSTrigger((ttsData) => {
    const { gear, brakePercent, cornerId } = ttsData;
    const ttsText = `코너 ${cornerId}, 기어 ${gear}단, 브레이크 ${brakePercent} 퍼센트 준비`;

    // Immediately cancel previous speech to prevent delays or overlaps
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(ttsText);
    utterance.rate = 1.3; // Speed up slightly to deliver prompt in time
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const koVoice = voices.find(v => v.lang.includes('ko-KR'));
    if (koVoice) {
      utterance.voice = koVoice;
    }

    window.speechSynthesis.speak(utterance);
  });

  // 2. Real-time Braking Point feedback
  unsubBrakeFeedback = window.apexAPI.onBrakeTimingFeedback((fbData) => {
    const { result, deltaD } = fbData;
    
    // Clear existing timeout
    if (brakeHudTimeout) clearTimeout(brakeHudTimeout);

    // Map deltaD [-30m, +20m] to progress bar percentage [0%, 100%]
    // -30m = 0%, 0m (Perfect) = 50%, +20m = 100%
    let percentage = 50;
    if (deltaD < 0) {
      // Early braking (-30m to 0m)
      percentage = 50 + (deltaD / 30) * 50; 
    } else if (deltaD > 0) {
      // Late braking (0m to +20m)
      percentage = 50 + (deltaD / 20) * 50;
    }
    const boundedPct = Math.max(0, Math.min(100, percentage));
    
    // Update indicator dot position
    brakeIndicator.style.left = `${boundedPct}%`;

    // Update text and class names
    brakeFeedbackBadge.textContent = result.toUpperCase();
    brakeFeedbackBadge.className = `feedback-badge ${result.toLowerCase()}`;
    brakeDetails.textContent = `${deltaD > 0 ? '+' : ''}${deltaD.toFixed(1)}m`;

    // Show HUD
    brakeHud.classList.remove('hidden');

    // Auto-hide after 3 seconds
    brakeHudTimeout = setTimeout(() => {
      brakeHud.classList.add('hidden');
    }, 3000);
  });

  // 3. Real-time Apex speed feedback
  unsubApexFeedback = window.apexAPI.onApexSpeedFeedback((fbData) => {
    const { result, deltaV } = fbData;

    // Clear existing timeouts
    if (apexHudTimeout) clearTimeout(apexHudTimeout);
    if (flashScreenTimeout) clearTimeout(flashScreenTimeout);

    // Update text and classes
    apexFeedbackBadge.textContent = result.toUpperCase();
    
    let resultClass = 'perfect';
    if (result === 'Overspeed') resultClass = 'overspeed';
    if (result === 'Too Slow') resultClass = 'tooslow';
    
    apexFeedbackBadge.className = `feedback-badge ${resultClass}`;
    
    if (result === 'Perfect') {
      apexDetails.textContent = 'Perfect entry speed!';
    } else {
      apexDetails.textContent = `${deltaV > 0 ? '+' : ''}${deltaV.toFixed(1)} km/h`;
    }

    // Full-screen flash edge glow effect
    flashScreen.className = 'apex-flash-screen'; // reset
    void flashScreen.offsetWidth; // trigger reflow to restart animation
    flashScreen.classList.add(`flash-${resultClass}`);

    // Show HUD
    apexHud.classList.remove('hidden');

    // Auto-hide HUD and Edge Flash after 1.5 seconds
    apexHudTimeout = setTimeout(() => {
      apexHud.classList.add('hidden');
    }, 1500);

    flashScreenTimeout = setTimeout(() => {
      flashScreen.classList.remove(`flash-${resultClass}`);
    }, 1500);
  });

  // 4. Missing Reference Telemetry warning
  unsubRefMissing = window.apexAPI.onReferenceMissing(() => {
    warningHud.classList.remove('hidden');
  });
}

function hideAllHUDs() {
  brakeHud.classList.add('hidden');
  apexHud.classList.add('hidden');
  warningHud.classList.add('hidden');
  flashScreen.className = 'apex-flash-screen';
  
  if (brakeHudTimeout) clearTimeout(brakeHudTimeout);
  if (apexHudTimeout) clearTimeout(apexHudTimeout);
  if (flashScreenTimeout) clearTimeout(flashScreenTimeout);
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

// Save wrapper
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

// Toast handler
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
  if (unsubTTSTrigger) unsubTTSTrigger();
  if (unsubBrakeFeedback) unsubBrakeFeedback();
  if (unsubApexFeedback) unsubApexFeedback();
  if (unsubRefMissing) unsubRefMissing();
  
  if (brakeHudTimeout) clearTimeout(brakeHudTimeout);
  if (apexHudTimeout) clearTimeout(apexHudTimeout);
  if (flashScreenTimeout) clearTimeout(flashScreenTimeout);
});

// Start
init();
