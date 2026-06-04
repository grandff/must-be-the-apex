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
