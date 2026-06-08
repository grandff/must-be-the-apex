const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const dbManager = require('./db-manager');

// Load tracks/cars metadata for mapping
const tracksJsonPath = path.join(__dirname, '..', 'data', 'tracks.json');
const carsJsonPath = path.join(__dirname, '..', 'data', 'cars.json');

let tracksData = {};
let carsData = {};

try {
  if (fs.existsSync(tracksJsonPath)) {
    tracksData = JSON.parse(fs.readFileSync(tracksJsonPath, 'utf8'));
  }
  if (fs.existsSync(carsJsonPath)) {
    carsData = JSON.parse(fs.readFileSync(carsJsonPath, 'utf8'));
  }
} catch (err) {
  console.error('[Analyzer] Failed to load tracks/cars metadata JSON:', err.message);
}

class TelemetryAnalyzer extends EventEmitter {
  constructor() {
    super();
    this.telemetryCache = [];
    this.detectedCorners = [];
    this.trackLength = 0;
    this.currentTrack = '';
    this.currentCar = '';
    
    // State machine tracking
    this.prevLapDist = -1;
    this.prevLap = -1;
    this.lapStartTime = 0;
    this.isPaused = false;
    this.pausedDistAccumulator = 0;
    
    // Apex speed evaluation temporary tracking
    // Key: cornerId, Value: min user speed observed in the window
    this.cornerMinSpeeds = {};
  }

  // Helper to slugify names exactly like the crawler and raw import script
  slugify(name) {
    if (!name) return '';
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  // Find best G61 track slug match from iRacing track name
  findBestTrackSlug(iracingTrackName) {
    const iracingSlug = this.slugify(iracingTrackName);
    
    // 1. Direct exact slug match
    for (const [id, name] of Object.entries(tracksData)) {
      const g61Slug = this.slugify(name);
      if (g61Slug === iracingSlug) {
        return g61Slug;
      }
    }
    
    // 2. Substring slug match (e.g. G61 track name contains iRacing name or vice versa)
    for (const [id, name] of Object.entries(tracksData)) {
      const g61Slug = this.slugify(name);
      if (g61Slug.includes(iracingSlug) || iracingSlug.includes(g61Slug)) {
        console.log(`[Analyzer] Track mapping match: iRacing="${iracingTrackName}" -> G61="${name}"`);
        return g61Slug;
      }
    }
    
    // 3. Fallback to raw iRacing slug
    return iracingSlug;
  }

  // Find best G61 car slug match from iRacing car name
  findBestCarSlug(iracingCarName) {
    const iracingSlug = this.slugify(iracingCarName);
    
    // 1. Direct exact slug match
    for (const [id, name] of Object.entries(carsData)) {
      const g61Slug = this.slugify(name);
      if (g61Slug === iracingSlug) {
        return g61Slug;
      }
    }
    
    // 2. Substring slug match
    for (const [id, name] of Object.entries(carsData)) {
      const g61Slug = this.slugify(name);
      if (g61Slug.includes(iracingSlug) || iracingSlug.includes(g61Slug)) {
        console.log(`[Analyzer] Car mapping match: iRacing="${iracingCarName}" -> G61="${name}"`);
        return g61Slug;
      }
    }
    
    // 3. Fallback to raw iRacing slug
    return iracingSlug;
  }

  // Load telemetry from DB, resample it, and extract corners
  loadTrackTelemetry(rawTrackName, rawCarName, trackLength, airTemp, trackTemp) {
    const trackSlug = this.findBestTrackSlug(rawTrackName);
    const carSlug = this.findBestCarSlug(rawCarName);
    
    this.currentTrack = trackSlug;
    this.currentCar = carSlug;
    this.trackLength = Math.round(trackLength);
    this.telemetryCache = [];
    this.detectedCorners = [];
    this.prevLapDist = -1;
    this.prevLap = -1;
    this.lapStartTime = 0;
    this.isPaused = false;
    this.pausedDistAccumulator = 0;
    this.cornerMinSpeeds = {};
    
    // Cache the loaded temperatures to prevent redundant reloads
    this.loadedAirTemp = airTemp;
    this.loadedTrackTemp = trackTemp;
    
    console.log(`[Analyzer] Loading telemetry for mapped track="${trackSlug}" car="${carSlug}" trackLength=${trackLength}m (AirTemp=${airTemp}°C, TrackTemp=${trackTemp}°C)`);
    
    const userPB = dbManager.getUserPB(trackSlug, carSlug);
    const targetRow = dbManager.getTargetTelemetry(trackSlug, carSlug, airTemp, trackTemp, userPB);
    
    if (!targetRow) {
      console.warn(`[Analyzer] No reference telemetry found in SQLite for track=${trackSlug}, car=${carSlug}`);
      this.emit('reference-missing', { trackName: trackSlug, carName: carSlug });
      return false;
    }
    
    const success = this.parseAndResample(targetRow.raw_csv_data);
    if (success) {
      this.extractCorners();
      this.emit('reference-loaded', {
        fileName: targetRow.file_name,
        targetLapTimeMs: targetRow.lap_time_ms,
        userPBMs: userPB,
        trackName: trackSlug,
        carName: carSlug,
        airTemp: targetRow.air_temp,
        trackTemp: targetRow.track_temp
      });
    }
    return success;
  }

  // Parse G61 CSV and interpolate to 1m steps
  parseAndResample(csvText) {
    try {
      const allLines = csvText.trim().split('\n');
      const lines = [];
      for (const line of allLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          lines.push(trimmed);
        }
      }
      
      if (lines.length < 2) return false;
      
      const header = lines[0].split(',');
      const speedIdx = header.indexOf('Speed');
      const distPctIdx = header.indexOf('LapDistPct');
      const brakeIdx = header.indexOf('Brake');
      const throttleIdx = header.indexOf('Throttle');
      const gearIdx = header.indexOf('Gear');
      const steeringIdx = header.indexOf('SteeringWheelAngle');
      
      if (speedIdx === -1 || distPctIdx === -1 || brakeIdx === -1 || throttleIdx === -1) {
        console.error('[Analyzer] CSV is missing essential columns.');
        return false;
      }
      
      const dataPoints = [];
      
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        if (row.length < header.length) continue;
        
        const distPct = parseFloat(row[distPctIdx]);
        if (isNaN(distPct)) continue;
        
        const distMeters = distPct * this.trackLength;
        const speed = parseFloat(row[speedIdx]) * 3.6; // convert m/s to km/h
        const throttle = parseFloat(row[throttleIdx]);
        const brake = parseFloat(row[brakeIdx]);
        const gear = gearIdx !== -1 ? parseInt(row[gearIdx], 10) : 0;
        const steering = steeringIdx !== -1 ? parseFloat(row[steeringIdx]) : 0;
        
        dataPoints.push({
          dist: distMeters,
          speed,
          throttle,
          brake,
          gear,
          steering
        });
      }
      
      if (dataPoints.length === 0) return false;
      
      // Sort data points by distance ascending
      dataPoints.sort((a, b) => a.dist - b.dist);
      
      // Linear interpolation to fill telemetryCache at 1m resolution (0 to trackLength)
      this.telemetryCache = new Array(this.trackLength + 1);
      
      let pIndex = 0;
      for (let d = 0; d <= this.trackLength; d++) {
        while (pIndex < dataPoints.length - 1 && dataPoints[pIndex + 1].dist <= d) {
          pIndex++;
        }
        
        const p1 = dataPoints[pIndex];
        const p2 = dataPoints[pIndex + 1];
        
        if (p2) {
          const denom = p2.dist - p1.dist;
          const t = denom > 0.0001 ? (d - p1.dist) / denom : 0;
          this.telemetryCache[d] = {
            speed: p1.speed + t * (p2.speed - p1.speed),
            throttle: p1.throttle + t * (p2.throttle - p1.throttle),
            brake: p1.brake + t * (p2.brake - p1.brake),
            steering: p1.steering + t * (p2.steering - p1.steering),
            gear: t < 0.5 ? p1.gear : p2.gear
          };
        } else {
          this.telemetryCache[d] = {
            speed: p1.speed,
            throttle: p1.throttle,
            brake: p1.brake,
            steering: p1.steering,
            gear: p1.gear
          };
        }
      }
      
      console.log(`[Analyzer] Successfully resampled telemetry cache to ${this.telemetryCache.length} meters.`);
      return true;
      
    } catch (err) {
      console.error('[Analyzer] Error during telemetry resampling:', err);
      return false;
    }
  }

  // Automatically detect corners from resampled reference telemetry
  extractCorners() {
    const k = 15; // window size for local minima search (15m)
    const candidates = [];
    
    // 1. Find Local Minima (Apex candidates)
    for (let d = k; d < this.trackLength - k; d++) {
      const vCurr = this.telemetryCache[d].speed;
      const vPrev = this.telemetryCache[d - k].speed;
      const vNext = this.telemetryCache[d + k].speed;
      
      if (vPrev > vCurr && vCurr < vNext) {
        candidates.push(d);
      }
    }
    
    // 2. Filter false positives & define corners
    const validApexes = [];
    for (const apex of candidates) {
      // Look at window [apex - 20m, apex + 20m]
      const startW = Math.max(0, apex - 20);
      const endW = Math.min(this.trackLength, apex + 20);
      
      let maxBrake = 0;
      let sumSteering = 0;
      let count = 0;
      
      for (let w = startW; w <= endW; w++) {
        const pt = this.telemetryCache[w];
        if (pt.brake > maxBrake) maxBrake = pt.brake;
        sumSteering += Math.abs(pt.steering);
        count++;
      }
      
      const avgSteering = count > 0 ? sumSteering / count : 0;
      
      // Filter: must have significant steering (> 0.10 rad) and some brake application (> 10% max brake)
      if (avgSteering >= 0.10 && maxBrake >= 0.10) {
        validApexes.push(apex);
      }
    }
    
    // 3. Find brake start distance for each valid apex & assemble corner objects
    this.detectedCorners = [];
    let cornerId = 1;
    
    for (const apex of validApexes) {
      // Prevent duplicate corners that are too close (within 50m of the last registered corner)
      if (this.detectedCorners.length > 0 && apex - this.detectedCorners[this.detectedCorners.length - 1].apexDist < 50) {
        continue;
      }
      
      // Scan backwards from apex up to 300m to find where brake pressure was >= 5%
      let brakeStart = apex;
      for (let d = apex; d >= Math.max(0, apex - 300); d--) {
        if (this.telemetryCache[d].brake >= 0.05) {
          brakeStart = d;
        }
      }
      
      // Calculate max brake in the entry zone
      let targetBrakeMax = 0;
      for (let d = brakeStart; d <= apex; d++) {
        if (this.telemetryCache[d].brake > targetBrakeMax) {
          targetBrakeMax = this.telemetryCache[d].brake;
        }
      }

      // Calculate turn direction based on steering angle sign around the apex
      let steeringSum = 0;
      let steeringPoints = 0;
      const scanStart = Math.max(0, apex - 10);
      const scanEnd = Math.min(this.trackLength, apex + 10);
      for (let d = scanStart; d <= scanEnd; d++) {
        steeringSum += this.telemetryCache[d].steering;
        steeringPoints++;
      }
      const avgSteeringVal = steeringPoints > 0 ? steeringSum / steeringPoints : 0;
      const turnDirection = avgSteeringVal >= 0 ? 'Left' : 'Right';
      
      this.detectedCorners.push({
        id: cornerId++,
        brakeStartDist: brakeStart,
        apexDist: apex,
        targetGear: this.telemetryCache[apex].gear,
        targetBrakeMax: targetBrakeMax,
        turnDirection: turnDirection,
        state: 'INIT'
      });
    }
    
    console.log(`[Analyzer] Detected ${this.detectedCorners.length} corners on track:`);
    this.detectedCorners.forEach(c => {
      console.log(`  Corner #${c.id}: ${c.turnDirection} | BrakeStart=${c.brakeStartDist}m, Apex=${c.apexDist}m, TargetGear=${c.targetGear}, MaxBrake=${(c.targetBrakeMax * 100).toFixed(0)}%`);
    });
  }

  // Handle lap completion: check for PB, update DB and reload progressive target telemetry
  handleLapCompletion(lapTimeMs) {
    if (this.isPaused) {
      console.log('[Analyzer] Lap was marked invalid/paused due to course out or spin. Skipping PB update.');
      return;
    }

    if (lapTimeMs < 30000 || lapTimeMs > 600000) {
      console.log(`[Analyzer] Lap time of ${(lapTimeMs/1000).toFixed(3)}s is out of reasonable range (30s-10m). Skipping PB update.`);
      return;
    }

    const trackSlug = this.currentTrack;
    const carSlug = this.currentCar;
    const oldPB = dbManager.getUserPB(trackSlug, carSlug);

    if (!oldPB || lapTimeMs < oldPB) {
      dbManager.updateUserPB(trackSlug, carSlug, lapTimeMs);
      console.log(`[Analyzer] NEW PERSONAL BEST! Old PB: ${oldPB ? (oldPB/1000).toFixed(3) + 's' : 'None'}, New PB: ${(lapTimeMs/1000).toFixed(3)}s`);

      // Query if a new target telemetry was unlocked
      const airTemp = this.loadedAirTemp;
      const trackTemp = this.loadedTrackTemp;
      const newTargetRow = dbManager.getTargetTelemetry(trackSlug, carSlug, airTemp, trackTemp, lapTimeMs);

      if (newTargetRow) {
        console.log(`[Analyzer] Upgrading target telemetry to: ${newTargetRow.file_name} (${(newTargetRow.lap_time_ms/1000).toFixed(3)}s)`);
        const success = this.parseAndResample(newTargetRow.raw_csv_data);
        if (success) {
          this.extractCorners();
          this.emit('target-upgraded', {
            fileName: newTargetRow.file_name,
            targetLapTimeMs: newTargetRow.lap_time_ms,
            userPBMs: lapTimeMs,
            trackName: trackSlug,
            carName: carSlug
          });
        }
      }
    }
  }

  // Real-time loop updater called at 60Hz or throttled rate
  updateTelemetry(userTelemetry) {
    if (!userTelemetry) return;
    
    // Trigger lazy reload when we detect valid temperatures from iRacing for the first time in this session
    if (userTelemetry.airTemp !== undefined && userTelemetry.airTemp !== null && 
        userTelemetry.trackTemp !== undefined && userTelemetry.trackTemp !== null && 
        this.loadedAirTemp === undefined) {
      console.log(`[Analyzer] Valid iRacing temperatures detected (Air: ${userTelemetry.airTemp}°C, Track: ${userTelemetry.trackTemp}°C). Lazy-reloading weather matched reference telemetry...`);
      this.loadTrackTelemetry(this.currentTrack, this.currentCar, this.trackLength, userTelemetry.airTemp, userTelemetry.trackTemp);
    }
    
    if (this.detectedCorners.length === 0) return;
    
    const lapDist = Math.round(userTelemetry.lapDist);
    const userSpeed = userTelemetry.speed; // already in km/h from iracing-client.js
    const userBrake = userTelemetry.brake;
    const currentLap = userTelemetry.lap;
    const sessionTime = userTelemetry.sessionTime;

    // Lap tracking and completion detection
    if (this.prevLap === -1) {
      this.prevLap = currentLap;
      this.lapStartTime = sessionTime;
    } else if (currentLap > this.prevLap) {
      const lapTimeMs = Math.round((sessionTime - this.lapStartTime) * 1000);
      this.handleLapCompletion(lapTimeMs);
      this.prevLap = currentLap;
      this.lapStartTime = sessionTime;
    }
    
    // 1. Handle new lap / reset
    if (this.prevLapDist === -1 || lapDist < this.prevLapDist - 500) {
      console.log('[Analyzer] New lap distance detected or telemetry reset. Resetting corner states.');
      this.detectedCorners.forEach(c => c.state = 'INIT');
      this.cornerMinSpeeds = {};
      this.isPaused = false;
      this.pausedDistAccumulator = 0;
      this.prevLapDist = lapDist;
      return;
    }
    
    const deltaD = lapDist - this.prevLapDist;
    
    // 2. Exception Handling (Spin, course out, backward driving)
    if (deltaD < 0) {
      if (!this.isPaused) {
        console.warn(`[Analyzer] Backward driving detected (deltaD=${deltaD}). Pausing state machine.`);
        this.isPaused = true;
        this.pausedDistAccumulator = 0;
      }
    } else if (Math.abs(deltaD) > 100) {
      // Sudden teleport (towing, reset, etc.)
      console.warn(`[Analyzer] Telemetry teleportation detected (deltaD=${deltaD}). Resetting.`);
      this.detectedCorners.forEach(c => c.state = 'INIT');
      this.cornerMinSpeeds = {};
      this.isPaused = false;
      this.pausedDistAccumulator = 0;
    }
    
    // If paused, track how long they drive forward. Must drive 50m forward to resume.
    if (this.isPaused) {
      if (deltaD > 0) {
        this.pausedDistAccumulator += deltaD;
        if (this.pausedDistAccumulator >= 50) {
          console.log('[Analyzer] Driver resumed normal forward racing. Reactivating state machine.');
          this.isPaused = false;
          this.pausedDistAccumulator = 0;
        }
      } else {
        // Reset accumulator if they go backward again
        this.pausedDistAccumulator = 0;
      }
      
      this.prevLapDist = lapDist;
      return;
    }
    
    // 3. Process each corner's state machine
    for (const corner of this.detectedCorners) {
      // State: INIT -> TTS_PLAYED (TTS pre-briefing 250m before braking)
      if (corner.state === 'INIT') {
        const triggerMin = corner.brakeStartDist - 250;
        const triggerMax = corner.brakeStartDist - 240;
        
        if (lapDist >= triggerMin && lapDist <= triggerMax) {
          const ttsData = {
            cornerId: corner.id,
            gear: corner.targetGear,
            brakePercent: Math.round(corner.targetBrakeMax * 100)
          };
          this.emit('tts-trigger', ttsData);
          corner.state = 'TTS_PLAYED';
          console.log(`[Analyzer] Triggered TTS for Corner #${corner.id}: Gear ${ttsData.gear}, Brake ${ttsData.brakePercent}%`);
        }
      }
      
      // State: TTS_PLAYED -> BRAKE_EVALUATED (Brake timing evaluation window)
      if (corner.state === 'TTS_PLAYED') {
        const entryMin = corner.brakeStartDist - 30;
        const entryMax = corner.brakeStartDist + 20;
        
        if (lapDist >= entryMin && lapDist <= entryMax) {
          // If user inputs brake >= 10%
          if (userBrake >= 0.10) {
            const deltaBrakeDist = lapDist - corner.brakeStartDist;
            let result = 'Perfect';
            
            if (deltaBrakeDist < -15) {
              result = 'Too Early';
            } else if (deltaBrakeDist < -5) {
              result = 'Early';
            } else if (deltaBrakeDist > 15) {
              result = 'Too Late';
            } else if (deltaBrakeDist > 5) {
              result = 'Late';
            }
            
            const brakeFb = {
              cornerId: corner.id,
              result,
              deltaD: deltaBrakeDist
            };
            this.emit('brake-timing-fb', brakeFb);
            corner.state = 'BRAKE_EVALUATED';
            console.log(`[Analyzer] Brake Feedback Corner #${corner.id}: ${result} (deltaD=${deltaBrakeDist.toFixed(1)}m)`);
          }
        } else if (lapDist > entryMax) {
          // If they pass the entry zone without braking, skip evaluation to prevent ghost events
          corner.state = 'BRAKE_EVALUATED';
          console.log(`[Analyzer] Passed entry zone of Corner #${corner.id} without braking. Skipping evaluation.`);
        }
      }
      
      // State: BRAKE_EVALUATED -> APEX_EVALUATED (Apex speed evaluation window)
      if (corner.state === 'BRAKE_EVALUATED') {
        const apexMin = corner.apexDist - 15;
        const apexMax = corner.apexDist + 15;
        
        if (lapDist >= apexMin && lapDist <= apexMax) {
          // Record lowest speed observed in the window
          if (this.cornerMinSpeeds[corner.id] === undefined || userSpeed < this.cornerMinSpeeds[corner.id]) {
            this.cornerMinSpeeds[corner.id] = userSpeed;
          }
        } else if (lapDist > apexMax) {
          // Once they pass the apex evaluation window, evaluate the lowest speed observed
          const userMinSpeed = this.cornerMinSpeeds[corner.id];
          
          if (userMinSpeed !== undefined) {
            const refApexSpeed = this.telemetryCache[corner.apexDist].speed;
            const deltaSpeed = userMinSpeed - refApexSpeed;
            let result = 'Perfect';
            
            if (deltaSpeed > 5.0) {
              result = 'Overspeed';
            } else if (deltaSpeed < -5.0) {
              result = 'Too Slow';
            }
            
            const apexFb = {
              cornerId: corner.id,
              result,
              deltaV: deltaSpeed
            };
            this.emit('apex-speed-fb', apexFb);
            corner.state = 'APEX_EVALUATED';
            console.log(`[Analyzer] Apex Speed Feedback Corner #${corner.id}: ${result} (deltaV=${deltaSpeed.toFixed(1)}km/h, UserMin=${userMinSpeed.toFixed(1)}, Ref=${refApexSpeed.toFixed(1)})`);
          } else {
            // No speed data collected, just skip
            corner.state = 'APEX_EVALUATED';
          }
        }
      }
    }
    
    // 4. Emit upcoming-corner distance info within 200m of braking points
    const upcoming = this.detectedCorners.find(c => lapDist < c.brakeStartDist && c.state !== 'APEX_EVALUATED');
    if (upcoming && (upcoming.brakeStartDist - lapDist <= 200)) {
      this.emit('upcoming-corner', {
        cornerId: upcoming.id,
        turnDirection: upcoming.turnDirection,
        targetGear: upcoming.targetGear,
        targetBrakeMax: upcoming.targetBrakeMax,
        distanceToBrake: upcoming.brakeStartDist - lapDist
      });
    } else {
      this.emit('upcoming-corner', null);
    }
    
    this.prevLapDist = lapDist;
  }
}

module.exports = new TelemetryAnalyzer();
