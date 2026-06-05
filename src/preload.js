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
  }
});
