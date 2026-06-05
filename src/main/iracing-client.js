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
        this.emit('connection-status', false);
        this.emit('session-info', {
          track: this.currentTrack,
          car: this.currentCar,
          sessionType: this.currentSessionType
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

        // Determine session type if telemetry is already active
        const sessions = data.SessionInfo?.Sessions || [];
        if (this.currentSessionNum !== undefined && sessions[this.currentSessionNum]) {
          this.currentSessionType = this.parseSessionType(sessions[this.currentSessionNum].SessionType);
        }

        this.emit('session-info', {
          track: this.currentTrack,
          car: this.currentCar,
          sessionType: this.currentSessionType
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
          sessionType: this.currentSessionType
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
    this.currentTrack = 'Spa-Francorchamps (Mock GP)';
    this.currentCar = 'Porsche 911 GT3 R (Mock)';
    this.currentSessionType = 'Practice';

    setTimeout(() => {
      this.emit('connection-status', true);
      this.emit('session-info', {
        track: this.currentTrack,
        car: this.currentCar,
        sessionType: this.currentSessionType
      });
    }, 500);

    let dist = 0;
    let lapTime = 0;
    let lapNumber = 1;
    const trackLength = 7004; // Spa track length
    let sessionNum = 0;
    const sessionTypes = ['Practice', 'Qualify', 'Race'];

    this.mockInterval = setInterval(() => {
      if (!this.isConnected) return;

      // Simulate a car moving
      // Speed changes depending on position (corners vs straight)
      let targetSpeed = 240; // straight speed
      
      // spa corners simulation (simple)
      if ((dist > 300 && dist < 600) || (dist > 1500 && dist < 1900) || (dist > 3000 && dist < 3400) || (dist > 5000 && dist < 5500) || (dist > 6500 && dist < 6800)) {
        targetSpeed = 80; // corner speed
      }

      // Smooth speed interpolation
      const currentSpeed = targetSpeed; // Keep it simple
      const speedMPS = currentSpeed / 3.6;
      
      // Update distance (60Hz -> divide by 60)
      dist += speedMPS / 60;
      lapTime += 1 / 60;

      if (dist >= trackLength) {
        dist = 0;
        lapNumber += 1;
        // Cycle session type every lap just to demonstrate session split in mock mode
        sessionNum = (sessionNum + 1) % sessionTypes.length;
        this.currentSessionType = sessionTypes[sessionNum];
        this.emit('session-info', {
          track: this.currentTrack,
          car: this.currentCar,
          sessionType: this.currentSessionType
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
        sessionType: this.currentSessionType
      };

      this.emit('telemetry', telemetryData);
    }, this.POLL_INTERVAL);
  }
}

module.exports = IRacingClient;
