const { dialog } = require('electron');
const fs = require('fs');

class TelemetryRecorder {
  constructor() {
    this.completedLaps = []; // Array of { id, sessionType, lapNumber, frameCount }
    this.lapFrames = {};     // Map of lapId -> frames array
    this.activeLap = {
      id: null,
      sessionType: null,
      lapNumber: -1,
      frames: []
    };
    this.isRecording = false;
  }

  start() {
    this.isRecording = true;
    console.log('Telemetry recording started.');
  }

  stop() {
    this.isRecording = false;
    // Commit the active lap on stop if it contains data
    if (this.activeLap.frames.length > 0) {
      this.saveActiveLap();
    }
    console.log('Telemetry recording paused.');
  }

  clear() {
    this.completedLaps = [];
    this.lapFrames = {};
    this.activeLap = {
      id: null,
      sessionType: null,
      lapNumber: -1,
      frames: []
    };
    console.log('Recorded telemetry buffers cleared.');
  }

  addFrame(frame) {
    if (!this.isRecording) return;
    
    const sessionType = frame.sessionType || 'Practice';
    const lapNumber = frame.lap;

    // Detect lap boundary or session boundary
    if (this.activeLap.lapNumber !== lapNumber || this.activeLap.sessionType !== sessionType) {
      // Commit previous active lap if it contains data
      if (this.activeLap.frames.length > 0) {
        this.saveActiveLap();
      }

      // Start new active lap
      const uniqueId = `${sessionType}_Lap_${lapNumber}_${Date.now()}`;
      this.activeLap = {
        id: uniqueId,
        sessionType: sessionType,
        lapNumber: lapNumber,
        frames: []
      };
    }

    // Append frame
    this.activeLap.frames.push({
      sessionTime: frame.sessionTime,
      lapDist: frame.lapDist,
      speed: frame.speed,
      throttle: frame.throttle,
      brake: frame.brake,
      gear: frame.gear,
      steering: frame.steering,
      rpm: frame.rpm
    });
  }

  saveActiveLap() {
    const id = this.activeLap.id;
    this.completedLaps.push({
      id: id,
      sessionType: this.activeLap.sessionType,
      lapNumber: this.activeLap.lapNumber,
      frameCount: this.activeLap.frames.length
    });
    this.lapFrames[id] = this.activeLap.frames;
    
    console.log(`Saved lap: ${this.activeLap.sessionType} - Lap ${this.activeLap.lapNumber} (${this.activeLap.frames.length} frames).`);
  }

  getLapsList() {
    const list = [...this.completedLaps];
    if (this.activeLap.frames && this.activeLap.frames.length > 0) {
      list.push({
        id: this.activeLap.id,
        sessionType: this.activeLap.sessionType,
        lapNumber: this.activeLap.lapNumber,
        frameCount: this.activeLap.frames.length,
        isActive: true
      });
    }
    return list;
  }

  async saveLapCSV(window, lapId) {
    let frames = this.lapFrames[lapId];
    
    // Check if the requested lap is currently active
    if (!frames && this.activeLap.id === lapId) {
      frames = this.activeLap.frames;
    }

    if (!frames || frames.length === 0) {
      return { success: false, error: 'No data recorded for this lap.' };
    }

    // Find lap metadata to construct default path
    const lapMeta = this.completedLaps.find(l => l.id === lapId) || 
                    (this.activeLap.id === lapId ? this.activeLap : null);
    const sessionName = lapMeta ? lapMeta.sessionType : 'Session';
    const lapNum = lapMeta ? lapMeta.lapNumber : 0;

    const { filePath } = await dialog.showSaveDialog(window, {
      title: `Save ${sessionName} Lap ${lapNum} Telemetry`,
      defaultPath: `telemetry_${sessionName.toLowerCase()}_lap_${lapNum}.csv`,
      filters: [
        { name: 'CSV Files', extensions: ['csv'] }
      ]
    });

    if (!filePath) {
      return { success: false, cancelled: true };
    }

    try {
      const headers = ['SessionTime', 'LapDist', 'Speed', 'Throttle', 'Brake', 'Gear', 'Steering', 'RPM'];
      let csvContent = headers.join(',') + '\n';
      
      const lines = frames.map(f => 
        `${f.sessionTime.toFixed(3)},${f.lapDist.toFixed(2)},${f.speed.toFixed(2)},${f.throttle.toFixed(4)},${f.brake.toFixed(4)},${f.gear},${f.steering.toFixed(4)},${Math.round(f.rpm)}`
      );
      csvContent += lines.join('\n') + '\n';

      fs.writeFileSync(filePath, csvContent, 'utf-8');
      return { success: true, filePath };
    } catch (err) {
      console.error(`Failed to write CSV file for lap ${lapId}:`, err);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new TelemetryRecorder();
