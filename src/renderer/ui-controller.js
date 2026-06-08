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
const editModeBanner = document.getElementById('edit-mode-banner');

const targetStatusHud = document.getElementById('target-status-hud');
const targetFile = document.getElementById('target-file');
const targetTime = document.getElementById('target-time');
const targetUserPB = document.getElementById('target-user-pb');
const targetWeather = document.getElementById('target-weather');
const targetUpgradeBadge = document.getElementById('target-upgrade-badge');

const nextLapFocusHud = document.getElementById('next-lap-focus-hud');
const focusContent = document.getElementById('focus-content');
const focusFallback = document.getElementById('focus-fallback');
const focusCornerTitle = document.getElementById('focus-corner-title');
const focusCornerDir = document.getElementById('focus-corner-dir');
const focusTargetGear = document.getElementById('focus-target-gear');
const focusTargetBrake = document.getElementById('focus-target-brake');
const focusDistanceValue = document.getElementById('focus-distance-value');
const focusCountdownBar = document.getElementById('focus-countdown-bar');

const liveGuideHud = document.getElementById('live-guide-hud');
const brakeIndicator = document.getElementById('brake-indicator');
const brakeFeedbackBadge = document.getElementById('brake-feedback-badge');
const brakeDetails = document.getElementById('brake-details');

const apexFeedbackBadge = document.getElementById('apex-feedback-badge');
const apexDetails = document.getElementById('apex-details');

const warningHud = document.getElementById('warning-hud');
const flashScreen = document.getElementById('flash-screen');

// Subscriptions cleanups
let unsubConnection = null;
let unsubSessionInfo = null;
let unsubTelemetry = null;
let unsubToggleEditMode = null;
let unsubRefLoaded = null;
let unsubUpcomingCorner = null;
let unsubTargetUpgraded = null;
let unsubTTSTrigger = null;
let unsubBrakeFeedback = null;
let unsubApexFeedback = null;
let unsubRefMissing = null;

// HUD timeouts
let liveHudTimeout = null;
let upgradeBadgeTimeout = null;
let flashScreenTimeout = null;

// Initialize
async function init() {
  setupDragAndResize();
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
    warningHud.classList.add('hidden');
  });

  unsubTelemetry = window.electronAPI.onTelemetryUpdate((data) => {
    updateRecordingStatus(data.telemetry);
    updateLapsUI(data.laps);
  });

  unsubToggleEditMode = window.electronAPI.onToggleEditMode((isEditMode) => {
    if (isEditMode) {
      document.body.classList.add('edit-mode');
      editModeBanner.classList.remove('hidden');
      // Show all HUD panels in edit mode so they can be positioned
      targetStatusHud.classList.remove('hidden');
      nextLapFocusHud.classList.remove('hidden');
      liveGuideHud.classList.remove('hidden');
      
      focusContent.classList.remove('hidden');
      focusFallback.classList.add('hidden');
    } else {
      document.body.classList.remove('edit-mode');
      editModeBanner.classList.add('hidden');
      
      // Hide coaching panels until triggered
      liveGuideHud.classList.add('hidden');
    }
  });
}

// Drag & Resize Layout Engine
function setupDragAndResize() {
  makeDraggableAndResizable(targetStatusHud, '.drag-handle', '.resize-handle', 'layout_target_status_hud');
  makeDraggableAndResizable(nextLapFocusHud, '.drag-handle', '.resize-handle', 'layout_next_lap_focus_hud');
  makeDraggableAndResizable(liveGuideHud, '.drag-handle', '.resize-handle', 'layout_live_guide_hud');
}

function makeDraggableAndResizable(el, handleQuery, resizeQuery, storageKey) {
  const handle = el.querySelector(handleQuery);
  const resizeHandle = el.querySelector(resizeQuery);

  // Load layout from localStorage
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      const { left, top, width, height } = JSON.parse(saved);
      if (left !== undefined) {
        el.style.left = left;
        el.style.right = 'auto';
      }
      if (top !== undefined) {
        el.style.top = top;
        el.style.bottom = 'auto';
      }
      if (width !== undefined) el.style.width = width;
      if (height !== undefined) el.style.height = height;
    } catch (e) {
      console.error(`Failed to restore layout for ${el.id}:`, e);
    }
  }

  let isDragging = false;
  let isResizing = false;
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;
  let startWidth = 0, startHeight = 0;

  handle.addEventListener('mousedown', (e) => {
    if (!document.body.classList.contains('edit-mode')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    e.preventDefault();
  });

  resizeHandle.addEventListener('mousedown', (e) => {
    if (!document.body.classList.contains('edit-mode')) return;
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = el.offsetWidth;
    startHeight = el.offsetHeight;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = `${startLeft + dx}px`;
      el.style.top = `${startTop + dy}px`;
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }
    if (isResizing) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.width = `${startWidth + dx}px`;
      el.style.height = `${startHeight + dy}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging || isResizing) {
      isDragging = false;
      isResizing = false;
      localStorage.setItem(storageKey, JSON.stringify({
        left: el.style.left,
        top: el.style.top,
        width: el.style.width,
        height: el.style.height
      }));
    }
  });
}

// Helpers
function formatLapTime(ms) {
  if (ms === undefined || ms === null || ms === Infinity || ms <= 0) return '--:--.---';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
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

function updateLapsUI(sessions) {
  lapsContainer.innerHTML = '';

  if (!sessions || sessions.length === 0) {
    const noLaps = document.createElement('div');
    noLaps.className = 'no-laps-message';
    noLaps.textContent = '기록된 세션 데이터가 없습니다. 트랙 주행을 시작하세요.';
    lapsContainer.appendChild(noLaps);
    return;
  }

  // Loop in reverse order to show the latest sessions at the top
  for (let i = sessions.length - 1; i >= 0; i--) {
    const session = sessions[i];
    const row = document.createElement('div');
    row.className = 'lap-row';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'lap-info';

    const badge = document.createElement('span');
    badge.className = `lap-session-badge badge-${session.sessionType.toLowerCase()}`;
    badge.textContent = session.sessionType.toUpperCase();
    infoDiv.appendChild(badge);

    const title = document.createElement('span');
    title.className = 'lap-title';
    title.textContent = `${session.track} | ${session.car}`;
    infoDiv.appendChild(title);

    if (session.isActive) {
      const activeBadge = document.createElement('span');
      activeBadge.className = 'lap-status-active';
      activeBadge.textContent = 'REC';
      infoDiv.appendChild(activeBadge);
    }

    // Add session metadata details
    const date = new Date(session.startTime);
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const metaText = document.createElement('div');
    metaText.style.fontSize = '10px';
    metaText.style.color = 'var(--text-secondary)';
    metaText.style.marginTop = '4px';
    metaText.textContent = `${dateStr} • ${session.lapCount} Laps (${session.frameCount} frames)`;
    infoDiv.appendChild(metaText);

    row.appendChild(infoDiv);

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-download';
    downloadBtn.textContent = 'Download CSV';
    if (session.frameCount === 0) {
      downloadBtn.disabled = true;
    }

    downloadBtn.addEventListener('click', () => {
      handleSave(session.id, session.sessionType);
    });

    row.appendChild(downloadBtn);
    lapsContainer.appendChild(row);
  }
}

// Setup Real-time HUD listeners
function setupHUDListeners() {
  if (!window.apexAPI) return;

  // 1. Matched target telemetry loaded
  unsubRefLoaded = window.apexAPI.onReferenceLoaded((data) => {
    warningHud.classList.add('hidden');
    targetStatusHud.classList.remove('hidden');
    
    // Update target HUD values
    targetFile.textContent = data.fileName;
    targetTime.textContent = formatLapTime(data.targetLapTimeMs);
    targetUserPB.textContent = formatLapTime(data.userPBMs);
    if (data.airTemp !== undefined && data.trackTemp !== undefined && data.airTemp !== null && data.trackTemp !== null) {
      targetWeather.textContent = `Air: ${data.airTemp.toFixed(0)}°C | Track: ${data.trackTemp.toFixed(0)}°C`;
    } else {
      targetWeather.textContent = 'Air: --°C | Track: --°C';
    }
  });

  // 2. Upcoming corner guide warning (within 200m)
  unsubUpcomingCorner = window.apexAPI.onUpcomingCorner((data) => {
    // If edit-mode is active, don't modify panel visibility based on telemetry
    if (document.body.classList.contains('edit-mode')) return;

    if (data) {
      focusFallback.classList.add('hidden');
      focusContent.classList.remove('hidden');
      
      focusCornerTitle.textContent = `TURN ${data.cornerId}`;
      focusCornerDir.textContent = data.turnDirection.toUpperCase();
      focusCornerDir.className = `corner-dir ${data.turnDirection}`;
      
      focusTargetGear.textContent = `G${data.targetGear || '-'}`;
      focusTargetBrake.textContent = `${Math.round((data.targetBrakeMax || 0) * 100)}%`;
      
      focusDistanceValue.textContent = `${Math.round(data.distanceToBrake)}m`;
      
      // Countdown progress bar (0m to 200m)
      const progressPct = Math.max(0, Math.min(100, (data.distanceToBrake / 200) * 100));
      focusCountdownBar.style.width = `${progressPct}%`;
    } else {
      focusContent.classList.add('hidden');
      focusFallback.classList.remove('hidden');
    }
  });

  // 3. Ghost/target telemetry upgraded
  unsubTargetUpgraded = window.apexAPI.onTargetUpgraded((data) => {
    if (upgradeBadgeTimeout) clearTimeout(upgradeBadgeTimeout);

    targetUpgradeBadge.classList.remove('hidden');
    targetFile.textContent = data.fileName;
    targetTime.textContent = formatLapTime(data.targetLapTimeMs);
    targetUserPB.textContent = formatLapTime(data.userPBMs);

    upgradeBadgeTimeout = setTimeout(() => {
      targetUpgradeBadge.classList.add('hidden');
    }, 4000);
  });

  // 4. TTS audio trigger (Web Speech API)
  unsubTTSTrigger = window.apexAPI.onTTSTrigger((ttsData) => {
    const { gear, brakePercent, cornerId } = ttsData;
    const ttsText = `코너 ${cornerId}, 기어 ${gear}단, 브레이크 ${brakePercent} 퍼센트 준비`;

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(ttsText);
    utterance.rate = 1.25;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const koVoice = voices.find(v => v.lang.includes('ko-KR'));
    if (koVoice) {
      utterance.voice = koVoice;
    }

    window.speechSynthesis.speak(utterance);
  });

  // 5. Brake Timing feedback
  unsubBrakeFeedback = window.apexAPI.onBrakeTimingFeedback((fbData) => {
    if (document.body.classList.contains('edit-mode')) return;

    const { result, deltaD } = fbData;
    if (liveHudTimeout) clearTimeout(liveHudTimeout);

    // Map deltaD [-30m, +20m] to progress bar percentage [0%, 100%]
    let percentage = 50;
    if (deltaD < 0) {
      percentage = 50 + (deltaD / 30) * 50; 
    } else if (deltaD > 0) {
      percentage = 50 + (deltaD / 20) * 50;
    }
    const boundedPct = Math.max(0, Math.min(100, percentage));
    brakeIndicator.style.left = `${boundedPct}%`;

    // Map result class
    let resultClass = 'perfect';
    let resultText = 'PERFECT';
    
    if (result === 'Too Early') { resultClass = 'too-early'; resultText = 'TOO EARLY'; }
    else if (result === 'Early') { resultClass = 'early'; resultText = 'EARLY'; }
    else if (result === 'Late') { resultClass = 'late'; resultText = 'LATE'; }
    else if (result === 'Too Late') { resultClass = 'too-late'; resultText = 'TOO LATE'; }

    brakeFeedbackBadge.textContent = resultText;
    brakeFeedbackBadge.className = `feedback-badge ${resultClass}`;
    brakeDetails.textContent = `${deltaD > 0 ? '+' : ''}${deltaD.toFixed(1)}m`;

    liveGuideHud.classList.remove('hidden');

    liveHudTimeout = setTimeout(() => {
      liveGuideHud.classList.add('hidden');
    }, 4000);
  });

  // 6. Apex Speed feedback
  unsubApexFeedback = window.apexAPI.onApexSpeedFeedback((fbData) => {
    if (document.body.classList.contains('edit-mode')) return;

    const { result, deltaV } = fbData;
    if (liveHudTimeout) clearTimeout(liveHudTimeout);
    if (flashScreenTimeout) clearTimeout(flashScreenTimeout);

    let resultClass = 'perfect';
    let resultText = 'PERFECT';
    if (result === 'Overspeed') { resultClass = 'overspeed'; resultText = 'OVERSPEED'; }
    if (result === 'Too Slow') { resultClass = 'tooslow'; resultText = 'TOO SLOW'; }

    apexFeedbackBadge.textContent = resultText;
    apexFeedbackBadge.className = `feedback-badge ${resultClass}`;

    if (result === 'Perfect') {
      apexDetails.textContent = 'Perfect apex speed!';
    } else {
      apexDetails.textContent = `${deltaV > 0 ? '+' : ''}${deltaV.toFixed(1)} km/h`;
    }

    // Trigger fullscreen edge flash
    flashScreen.className = 'apex-flash-screen';
    void flashScreen.offsetWidth;
    flashScreen.classList.add(`flash-${resultClass}`);

    liveGuideHud.classList.remove('hidden');

    liveHudTimeout = setTimeout(() => {
      liveGuideHud.classList.add('hidden');
    }, 4000);

    flashScreenTimeout = setTimeout(() => {
      flashScreen.classList.remove(`flash-${resultClass}`);
    }, 1500);
  });

  // 7. Missing Reference Telemetry warning
  unsubRefMissing = window.apexAPI.onReferenceMissing(() => {
    warningHud.classList.remove('hidden');
    targetStatusHud.classList.add('hidden');
  });
}

function hideAllHUDs() {
  if (document.body.classList.contains('edit-mode')) return;
  
  targetStatusHud.classList.add('hidden');
  liveGuideHud.classList.add('hidden');
  warningHud.classList.add('hidden');
  flashScreen.className = 'apex-flash-screen';
  
  if (liveHudTimeout) clearTimeout(liveHudTimeout);
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
async function handleSave(sessionId, sessionType) {
  try {
    showToast(`Saving ${sessionType} session telemetry...`);
    const result = await window.electronAPI.saveLap(sessionId);
    
    if (result.success) {
      showToast(`Saved session to: ${result.filePath}`);
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
  if (unsubToggleEditMode) unsubToggleEditMode();
  if (unsubRefLoaded) unsubRefLoaded();
  if (unsubUpcomingCorner) unsubUpcomingCorner();
  if (unsubTargetUpgraded) unsubTargetUpgraded();
  if (unsubTTSTrigger) unsubTTSTrigger();
  if (unsubBrakeFeedback) unsubBrakeFeedback();
  if (unsubApexFeedback) unsubApexFeedback();
  if (unsubRefMissing) unsubRefMissing();
  
  if (liveHudTimeout) clearTimeout(liveHudTimeout);
  if (upgradeBadgeTimeout) clearTimeout(upgradeBadgeTimeout);
  if (flashScreenTimeout) clearTimeout(flashScreenTimeout);
});

// Start
init();
