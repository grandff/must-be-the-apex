const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Listeners with clean-up return functions
  onConnectionStatus: (callback) => {
    const subscription = (event, connected) => callback(connected);
    ipcRenderer.on('connection-status', subscription);
    return () => {
      ipcRenderer.removeListener('connection-status', subscription);
    };
  },

  onSessionInfo: (callback) => {
    const subscription = (event, info) => callback(info);
    ipcRenderer.on('session-info', subscription);
    return () => {
      ipcRenderer.removeListener('session-info', subscription);
    };
  },

  onTelemetryUpdate: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('telemetry-update', subscription);
    return () => {
      ipcRenderer.removeListener('telemetry-update', subscription);
    };
  },

  onToggleEditMode: (callback) => {
    const subscription = (event, isEditMode) => callback(isEditMode);
    ipcRenderer.on('toggle-edit-mode', subscription);
    return () => {
      ipcRenderer.removeListener('toggle-edit-mode', subscription);
    };
  },

  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  },

  // Invokers
  saveLap: (lapId) => ipcRenderer.invoke('save-lap', lapId),
  clearSessions: () => ipcRenderer.invoke('clear-sessions'),
  getRecordingStatus: () => ipcRenderer.invoke('get-recording-status')
});

contextBridge.exposeInMainWorld('apexAPI', {
  onTTSTrigger: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('tts-trigger', subscription);
    return () => {
      ipcRenderer.removeListener('tts-trigger', subscription);
    };
  },
  onBrakeTimingFeedback: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('brake-timing-fb', subscription);
    return () => {
      ipcRenderer.removeListener('brake-timing-fb', subscription);
    };
  },
  onApexSpeedFeedback: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('apex-speed-fb', subscription);
    return () => {
      ipcRenderer.removeListener('apex-speed-fb', subscription);
    };
  },
  onReferenceMissing: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('reference-missing', subscription);
    return () => {
      ipcRenderer.removeListener('reference-missing', subscription);
    };
  },
  onReferenceLoaded: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('reference-loaded', subscription);
    return () => {
      ipcRenderer.removeListener('reference-loaded', subscription);
    };
  },
  onUpcomingCorner: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('upcoming-corner', subscription);
    return () => {
      ipcRenderer.removeListener('upcoming-corner', subscription);
    };
  },
  onTargetUpgraded: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('target-upgraded', subscription);
    return () => {
      ipcRenderer.removeListener('target-upgraded', subscription);
    };
  }
});
