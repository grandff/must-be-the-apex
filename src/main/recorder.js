const { dialog } = require('electron');
const fs = require('fs');
const logger = require('./logger');

class TelemetryRecorder {
  constructor() {
    this.completedSessions = []; // Array of { id, sessionType, track, car, startTime, frameCount, lapCount }
    this.sessionFrames = {};     // Map of sessionId -> frames array
    this.activeSession = {
      id: null,
      sessionType: null,
      track: null,
      car: null,
      startTime: null,
      frames: []
    };
    this.isRecording = false;
  }

  start() {
    this.isRecording = true;
    logger.info('Telemetry recording started.');
  }

  stop() {
    this.isRecording = false;
    // Commit the active session on stop if it contains data
    if (this.activeSession.frames.length > 0) {
      this.saveActiveSession();
    }
    logger.info('Telemetry recording paused.');
  }

  clear() {
    this.completedSessions = [];
    this.sessionFrames = {};
    this.activeSession = {
      id: null,
      sessionType: null,
      track: null,
      car: null,
      startTime: null,
      frames: []
    };
    logger.info('Recorded telemetry buffers cleared.');
  }

  addFrame(frame, track, car) {
    if (!this.isRecording) return;
    
    const sessionType = frame.sessionType || 'Practice';
    const currentTrack = track || 'Unknown Track';
    const currentCar = car || 'Unknown Car';

    // Detect session type, track, or car boundary
    if (this.activeSession.sessionType !== sessionType || 
        this.activeSession.track !== currentTrack || 
        this.activeSession.car !== currentCar ||
        !this.activeSession.id) {
      
      // Commit previous active session if it contains data
      if (this.activeSession.frames.length > 0) {
        this.saveActiveSession();
      }

      // Start new active session
      const uniqueId = `${sessionType}_Session_${Date.now()}`;
      this.activeSession = {
        id: uniqueId,
        sessionType: sessionType,
        track: currentTrack,
        car: currentCar,
        startTime: new Date().toISOString(),
        frames: []
      };
    }

    // Append frame including the lap number
    this.activeSession.frames.push({
      sessionTime: frame.sessionTime,
      lap: frame.lap,
      lapDist: frame.lapDist,
      speed: frame.speed,
      throttle: frame.throttle,
      brake: frame.brake,
      gear: frame.gear,
      steering: frame.steering,
      rpm: frame.rpm
    });
  }

  saveActiveSession() {
    const id = this.activeSession.id;
    const uniqueLaps = new Set(this.activeSession.frames.map(f => f.lap));
    const lapCount = uniqueLaps.size;

    this.completedSessions.push({
      id: id,
      sessionType: this.activeSession.sessionType,
      track: this.activeSession.track,
      car: this.activeSession.car,
      startTime: this.activeSession.startTime,
      lapCount: lapCount,
      frameCount: this.activeSession.frames.length
    });
    this.sessionFrames[id] = this.activeSession.frames;
    
    logger.info(`Saved session: ${this.activeSession.sessionType} - ${this.activeSession.track} - ${this.activeSession.car} (${this.activeSession.frames.length} frames, ${lapCount} laps).`);
    
    // Silent background auto-save to local disk (no UI dialog needed)
    this.autoSaveSessionCSV(id);
  }

  autoSaveSessionCSV(sessionId) {
    const { app } = require('electron');
    const path = require('path');
    
    let frames = this.sessionFrames[sessionId];
    if (!frames && this.activeSession.id === sessionId) {
      frames = this.activeSession.frames;
    }
    if (!frames || frames.length === 0) return;

    const sessionMeta = this.completedSessions.find(s => s.id === sessionId) || 
                        (this.activeSession.id === sessionId ? this.activeSession : null);
    const sessionName = sessionMeta ? sessionMeta.sessionType : 'Session';
    const trackName = sessionMeta ? sessionMeta.track : 'UnknownTrack';
    const carName = sessionMeta ? sessionMeta.car : 'UnknownCar';

    // Sanitize values for safe filenames
    const cleanTrack = trackName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const cleanCar = carName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const cleanSession = sessionName.trim().toLowerCase();
    
    const filename = `session_${cleanSession}_${cleanTrack}_${cleanCar}_${Date.now()}.csv`;

    const headers = ['SessionTime', 'Lap', 'LapDist', 'Speed', 'Throttle', 'Brake', 'Gear', 'Steering', 'RPM'];
    let csvContent = headers.join(',') + '\n';
    
    const lines = frames.map(f => 
      `${f.sessionTime.toFixed(3)},${f.lap},${f.lapDist.toFixed(2)},${f.speed.toFixed(2)},${f.throttle.toFixed(4)},${f.brake.toFixed(4)},${f.gear},${f.steering.toFixed(4)},${Math.round(f.rpm)}`
    );
    csvContent += lines.join('\n') + '\n';

    // Try multiple directories in order of preference
    const saveDirs = [];
    try {
      saveDirs.push({ path: path.join(app.getPath('documents'), 'MustBeTheApex', 'Telemetry'), type: 'documents' });
    } catch (e) {}
    try {
      saveDirs.push({ path: path.join(app.getPath('userData'), 'Telemetry'), type: 'userData' });
    } catch (e) {}
    try {
      saveDirs.push({ path: path.join(app.getPath('temp'), 'MustBeTheApexTelemetry'), type: 'temp' });
    } catch (e) {}
    saveDirs.push({ path: path.join(process.cwd(), 'Telemetry'), type: 'cwd' });

    let saved = false;
    const errors = [];

    for (const dirObj of saveDirs) {
      try {
        if (!fs.existsSync(dirObj.path)) {
          fs.mkdirSync(dirObj.path, { recursive: true });
        }
        const filePath = path.join(dirObj.path, filename);
        fs.writeFileSync(filePath, csvContent, 'utf-8');
        
        if (dirObj.type === 'documents') {
          logger.info(`[Auto-Save] Successfully saved session telemetry to: ${filePath}`);
        } else {
          logger.warn(`[Auto-Save] Primary telemetry path failed. Saved to fallback path: ${filePath}`);
        }
        saved = true;
        break;
      } catch (err) {
        errors.push(`${dirObj.path} (${err.message})`);
      }
    }

    if (!saved) {
      logger.error(`[Auto-Save] Failed to auto-save CSV file for session ${sessionId}. Tried directories: ${errors.join(', ')}`);
    }
  }

  getLapsList() {
    // We return sessions matching the expected shape for UI list (rename key 'laps' to sessions implicitly, or just keep structural compatibility)
    const list = [...this.completedSessions];
    if (this.activeSession.frames && this.activeSession.frames.length > 0) {
      const uniqueLaps = new Set(this.activeSession.frames.map(f => f.lap));
      list.push({
        id: this.activeSession.id,
        sessionType: this.activeSession.sessionType,
        track: this.activeSession.track,
        car: this.activeSession.car,
        startTime: this.activeSession.startTime,
        lapCount: uniqueLaps.size,
        frameCount: this.activeSession.frames.length,
        isActive: true
      });
    }
    return list;
  }

  async saveLapCSV(window, sessionId) {
    let frames = this.sessionFrames[sessionId];
    
    // Check if the requested session is currently active
    if (!frames && this.activeSession.id === sessionId) {
      frames = this.activeSession.frames;
    }

    if (!frames || frames.length === 0) {
      return { success: false, error: 'No data recorded for this session.' };
    }

    const sessionMeta = this.completedSessions.find(s => s.id === sessionId) || 
                        (this.activeSession.id === sessionId ? this.activeSession : null);
    const sessionName = sessionMeta ? sessionMeta.sessionType : 'Session';
    const trackName = sessionMeta ? sessionMeta.track : 'UnknownTrack';
    const carName = sessionMeta ? sessionMeta.car : 'UnknownCar';

    // Sanitize values for default filename
    const cleanTrack = trackName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const cleanCar = carName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const cleanSession = sessionName.trim().toLowerCase();

    const { filePath } = await dialog.showSaveDialog(window, {
      title: `Save ${sessionName} Session Telemetry`,
      defaultPath: `session_${cleanSession}_${cleanTrack}_${cleanCar}.csv`,
      filters: [
        { name: 'CSV Files', extensions: ['csv'] }
      ]
    });

    if (!filePath) {
      return { success: false, cancelled: true };
    }

    try {
      const headers = ['SessionTime', 'Lap', 'LapDist', 'Speed', 'Throttle', 'Brake', 'Gear', 'Steering', 'RPM'];
      let csvContent = headers.join(',') + '\n';
      
      const lines = frames.map(f => 
        `${f.sessionTime.toFixed(3)},${f.lap},${f.lapDist.toFixed(2)},${f.speed.toFixed(2)},${f.throttle.toFixed(4)},${f.brake.toFixed(4)},${f.gear},${f.steering.toFixed(4)},${Math.round(f.rpm)}`
      );
      csvContent += lines.join('\n') + '\n';

      fs.writeFileSync(filePath, csvContent, 'utf-8');
      logger.info(`[Manual-Save] Successfully saved session telemetry to: ${filePath}`);
      return { success: true, filePath };
    } catch (err) {
      logger.error(`[Manual-Save] Failed to write CSV file for session ${sessionId}`, err);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new TelemetryRecorder();
