const EventEmitter = require('events');
const logger = require('./logger');

class IRacingClient extends EventEmitter {
  constructor() {
    super();
    this.isConnected = false;
    this.sdk = null;
    this.telemetryInterval = null;
    this.mockInterval = null;
    this.currentTrack = 'Unknown Track';
    this.currentCar = 'Unknown Car';
    this.currentSessionType = 'Practice'; // Practice, Qualify, Race
    
    // We poll at 60Hz (approx 16.6ms)
    this.POLL_INTERVAL = 16; 
    this.currentTrackLength = 4000; // Default fallback
  }

  parseTrackLength(lengthStr) {
    if (!lengthStr) return 4000;
    // Extract numbers and decimal point
    const num = parseFloat(lengthStr.replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return 4000;
    
    const normalized = lengthStr.toLowerCase();
    if (normalized.includes('km')) {
      return Math.round(num * 1000);
    }
    if (normalized.includes('mile')) {
      return Math.round(num * 1609.34);
    }
    return Math.round(num);
  }

  start() {
    if (process.platform === 'win32') {
      this.startNative();
    } else {
      this.startMock();
    }
  }

  stop() {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
    if (this.sdk) {
      this.sdk._stop();
      this.sdk = null;
    }
    this.isConnected = false;
    this.emit('connection-status', false);
  }

  startNative() {
    try {
      const irsdk = require('node-irsdk');
      
      // Initialize with required telemetry update interval
      this.sdk = irsdk.init({
        telemetryUpdateInterval: this.POLL_INTERVAL,
        sessionInfoUpdateInterval: 1000 // Poll SessionInfo every 1s
      });

      this.sdk.on('Connected', () => {
        this.isConnected = true;
        this.emit('connection-status', true);
        logger.info('iRacing Connected!');
      });

      this.sdk.on('Disconnected', () => {
        this.isConnected = false;
        this.currentTrack = 'Unknown Track';
        this.currentCar = 'Unknown Car';
        this.currentSessionType = 'Practice';
        this.currentTrackLength = 4000;
        this.emit('connection-status', false);
        this.emit('session-info', {
          track: this.currentTrack,
          car: this.currentCar,
          sessionType: this.currentSessionType,
          trackLength: this.currentTrackLength
        });
        logger.info('iRacing Disconnected.');
      });

      this.sdk.on('SessionInfo', (evt) => {
        if (!evt || !evt.data) return;
        const data = evt.data;

        // Extract track and car info
        const track = data.WeekendInfo?.TrackDisplayName || data.WeekendInfo?.TrackName || 'Unknown Track';
        const driverCarIdx = data.DriverInfo?.DriverCarIdx;
        const car = data.DriverInfo?.Drivers?.[driverCarIdx]?.CarScreenName || data.DriverInfo?.Drivers?.[driverCarIdx]?.CarPath || 'Unknown Car';

        this.currentTrack = track;
        this.currentCar = car;

        // Parse track length
        const rawTrackLength = data.WeekendInfo?.TrackLength || data.WeekendInfo?.TrackLengthOfficial;
        this.currentTrackLength = this.parseTrackLength(rawTrackLength);

        // Determine session type if telemetry is already active
        const sessions = data.SessionInfo?.Sessions || [];
        if (this.currentSessionNum !== undefined && sessions[this.currentSessionNum]) {
          this.currentSessionType = this.parseSessionType(sessions[this.currentSessionNum].SessionType);
        }

        this.emit('session-info', {
          track: this.currentTrack,
          car: this.currentCar,
          sessionType: this.currentSessionType,
          trackLength: this.currentTrackLength
        });
      });

      this.sdk.on('Telemetry', (evt) => {
        if (!evt || !evt.values) return;
        const values = evt.values;

        // Update current session type based on current SessionNum
        this.currentSessionNum = values.SessionNum;
        if (this.sdk.sessionInfo?.data?.SessionInfo?.Sessions) {
          const sessions = this.sdk.sessionInfo.data.SessionInfo.Sessions;
          if (sessions[this.currentSessionNum]) {
            this.currentSessionType = this.parseSessionType(sessions[this.currentSessionNum].SessionType);
          }
        }

        // Map telemetry values
        const telemetryData = {
          sessionTime: values.SessionTime || 0,
          lapDist: values.LapDist || 0,
          speed: values.Speed ? values.Speed * 3.6 : 0, // Convert m/s to km/h
          throttle: values.Throttle || 0,
          brake: values.Brake || 0,
          gear: values.Gear || 0,
          steering: values.SteeringWheelAngle || values.Steering || 0,
          rpm: values.RPM || 0,
          lap: values.Lap || 0,
          sessionType: this.currentSessionType,
          airTemp: values.AirTemp !== undefined ? values.AirTemp : null,
          trackTemp: values.TrackTemp !== undefined ? values.TrackTemp : null
        };

        this.emit('telemetry', telemetryData);
      });

    } catch (err) {
      logger.error('Native iRacing SDK failed to initialize. Falling back to mock.', err);
      this.startMock();
    }
  }

  parseSessionType(typeStr) {
    if (!typeStr) return 'Practice';
    const normalized = typeStr.toLowerCase();
    if (normalized.includes('qualify') || normalized.includes('qualifying')) {
      return 'Qualify';
    }
    if (normalized.includes('race')) {
      return 'Race';
    }
    return 'Practice';
  }

  startMock() {
    logger.info('Running in Mock iRacing telemetry mode (non-Windows platform or native error).');
    this.isConnected = true;

    const path = require('path');
    const fs = require('fs');
    const mockDir = path.join(__dirname, '..', '..', 'assets', 'mock');

    try {
      if (!fs.existsSync(mockDir)) {
        fs.mkdirSync(mockDir, { recursive: true });
      }

      const files = fs.readdirSync(mockDir).filter(f => f.endsWith('.csv'));
      if (files.length > 0) {
        const filePath = path.join(mockDir, files[0]);
        const dataStr = fs.readFileSync(filePath, 'utf-8');
        const lines = dataStr.split(/\r?\n/).filter(line => line.trim() !== '');

        if (lines.length > 1) {
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          const sessionTimeIdx = headers.indexOf('sessiontime');
          const lapIdx = headers.indexOf('lap');
          const lapDistIdx = headers.indexOf('lapdist');
          const speedIdx = headers.indexOf('speed');
          const throttleIdx = headers.indexOf('throttle');
          const brakeIdx = headers.indexOf('brake');
          const gearIdx = headers.indexOf('gear');
          const steeringIdx = headers.indexOf('steering');
          const rpmIdx = headers.indexOf('rpm');

          if (sessionTimeIdx !== -1 && lapDistIdx !== -1) {
            const csvFrames = [];
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(',');
              if (cols.length < headers.length) continue;
              csvFrames.push({
                sessionTime: parseFloat(cols[sessionTimeIdx]) || 0,
                lap: lapIdx !== -1 ? (parseInt(cols[lapIdx]) || 1) : 1,
                lapDist: parseFloat(cols[lapDistIdx]) || 0,
                speed: speedIdx !== -1 ? (parseFloat(cols[speedIdx]) || 0) : 0,
                throttle: throttleIdx !== -1 ? (parseFloat(cols[throttleIdx]) || 0) : 0,
                brake: brakeIdx !== -1 ? (parseFloat(cols[brakeIdx]) || 0) : 0,
                gear: gearIdx !== -1 ? (parseInt(cols[gearIdx]) || 0) : 0,
                steering: steeringIdx !== -1 ? (parseFloat(cols[steeringIdx]) || 0) : 0,
                rpm: rpmIdx !== -1 ? (parseFloat(cols[rpmIdx]) || 0) : 0
              });
            }

            if (csvFrames.length > 0) {
              let maxDist = 0;
              for (const f of csvFrames) {
                if (f.lapDist > maxDist) maxDist = f.lapDist;
              }
              this.currentTrackLength = Math.max(4000, Math.ceil(maxDist));

              // Attempt parsing track and car name from filename
              const basename = path.basename(filePath, '.csv');
              const parts = basename.split('_');
              if (parts.length >= 4) {
                this.currentSessionType = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
                this.currentTrack = parts[2].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                this.currentCar = parts[3].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              } else {
                this.currentTrack = 'Spa-Francorchamps (CSV Mock)';
                this.currentCar = 'Porsche 911 GT3 R (CSV Mock)';
                this.currentSessionType = 'Practice';
              }

              logger.info(`[Mock] Loaded CSV playback from ${filePath}: track="${this.currentTrack}", car="${this.currentCar}", length=${this.currentTrackLength}m, frames=${csvFrames.length}`);

              setTimeout(() => {
                this.emit('connection-status', true);
                this.emit('session-info', {
                  track: this.currentTrack,
                  car: this.currentCar,
                  sessionType: this.currentSessionType,
                  trackLength: this.currentTrackLength
                });
              }, 500);

              let frameIndex = 0;
              this.mockInterval = setInterval(() => {
                if (!this.isConnected || csvFrames.length === 0) return;
                const frame = csvFrames[frameIndex];
                const telemetryData = {
                  sessionTime: frame.sessionTime,
                  lapDist: frame.lapDist,
                  speed: frame.speed,
                  throttle: frame.throttle,
                  brake: frame.brake,
                  gear: frame.gear,
                  steering: frame.steering,
                  rpm: frame.rpm,
                  lap: frame.lap,
                  sessionType: this.currentSessionType,
                  airTemp: 22.0,
                  trackTemp: 28.0
                };

                this.emit('telemetry', telemetryData);
                frameIndex = (frameIndex + 1) % csvFrames.length;
              }, this.POLL_INTERVAL);

              return;
            }
          }
        }
      }
    } catch (err) {
      logger.error('Error scanning/parsing mock CSV files, falling back to Spa procedural generator:', err);
    }

    // Default Fallback: Spa procedural generator
    this.currentTrack = 'Spa-Francorchamps (Mock GP)';
    this.currentCar = 'Porsche 911 GT3 R (Mock)';
    this.currentSessionType = 'Practice';
    this.currentTrackLength = 7004;

    setTimeout(() => {
      this.emit('connection-status', true);
      this.emit('session-info', {
        track: this.currentTrack,
        car: this.currentCar,
        sessionType: this.currentSessionType,
        trackLength: this.currentTrackLength
      });
    }, 500);

    let dist = 0;
    let lapTime = 0;
    let lapNumber = 1;
    const trackLength = 7004;
    let sessionNum = 0;
    const sessionTypes = ['Practice', 'Qualify', 'Race'];

    this.mockInterval = setInterval(() => {
      if (!this.isConnected) return;

      let targetSpeed = 240;
      
      if ((dist > 300 && dist < 600) || (dist > 1500 && dist < 1900) || (dist > 3000 && dist < 3400) || (dist > 5000 && dist < 5500) || (dist > 6500 && dist < 6800)) {
        targetSpeed = 80;
      }

      const currentSpeed = targetSpeed;
      const speedMPS = currentSpeed / 3.6;
      
      dist += speedMPS / 60;
      lapTime += 1 / 60;

      if (dist >= trackLength) {
        dist = 0;
        lapNumber += 1;
        sessionNum = (sessionNum + 1) % sessionTypes.length;
        this.currentSessionType = sessionTypes[sessionNum];
        this.emit('session-info', {
          track: this.currentTrack,
          car: this.currentCar,
          sessionType: this.currentSessionType,
          trackLength: this.currentTrackLength
        });
      }

      const isCorner = currentSpeed < 120;
      const throttle = isCorner ? 0.2 : 1.0;
      const brake = isCorner ? 0.7 : 0.0;
      const gear = isCorner ? 2 : 5;
      const steering = isCorner ? 0.5 * Math.sin(dist / 50) : 0.0;

      const telemetryData = {
        sessionTime: lapTime,
        lapDist: dist,
        speed: currentSpeed,
        throttle: throttle,
        brake: brake,
        gear: gear,
        steering: steering,
        rpm: currentSpeed * 30 + 1000,
        lap: lapNumber,
        sessionType: this.currentSessionType,
        airTemp: 22.0,
        trackTemp: 28.0
      };

      this.emit('telemetry', telemetryData);
    }, this.POLL_INTERVAL);
  }
}

module.exports = IRacingClient;
