const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('=== GARAGE 61 RAW DOWNLOADS IMPORT UTILITY ===');

const downloadsDir = path.join(os.homedir(), 'Downloads');
const targetDirs = [
  path.join(__dirname, '..', 'extensions', 'data'),
  path.join(__dirname, '..', 'src', 'data')
];

if (!fs.existsSync(downloadsDir)) {
  console.error(`Downloads directory not found at: ${downloadsDir}`);
  process.exit(1);
}

// Read all files in Downloads folder
const files = fs.readdirSync(downloadsDir);
const telemetryFiles = files.filter(f => f.startsWith('Garage 61 - ') && f.endsWith('.csv'));

if (telemetryFiles.length === 0) {
  console.log('No raw Garage 61 telemetry CSV files found in the Downloads folder.');
  console.log('Expected filename pattern: "Garage 61 - [Driver] - [Car] - [Track] - [Time] - [Token].csv"');
  process.exit(0);
}

console.log(`Found ${telemetryFiles.length} telemetry files to import.\n`);

let successCount = 0;

telemetryFiles.forEach(file => {
  try {
    // Remove duplicate number suffixes like (1), (2) and extension
    let cleanName = file.replace(/\s*\(\d+\)\.csv$/i, '.csv');
    cleanName = cleanName.replace('.csv', '');
    
    const parts = cleanName.split(' - ');
    if (parts.length < 6) {
      console.warn(`[Skip] File name does not match expected pattern: ${file}`);
      return;
    }
    
    const driverName = parts[1];
    const carName = parts[2];
    const trackName = parts[3];
    const lapTime = parts[4];
    const lapToken = parts[5];
    
    // Create safe slugs for folder paths
    const trackSlug = trackName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const carSlug = carName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    const driverClean = driverName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const timeClean = lapTime.replace(/[^a-zA-Z0-9]/g, '_');
    
    // We default setup to telemetry since raw filename doesn't contain fixed/open details
    const targetFileName = `telemetry_${timeClean}_${driverClean}_${lapToken}.csv`;
    
    const srcPath = path.join(downloadsDir, file);
    
    // Find corresponding weather JSON file
    // Check both literal match and sanitized versions if suffixes exist
    const cleanBaseName = file.replace(/\.csv$/i, '');
    const weatherJsonFile = cleanBaseName + ' - weather.json';
    const weatherJsonPath = path.join(downloadsDir, weatherJsonFile);
    
    let metaComments = '';
    if (fs.existsSync(weatherJsonPath)) {
      try {
        const w = JSON.parse(fs.readFileSync(weatherJsonPath, 'utf8'));
        const metaLines = [
          `# G61_WEATHER: ${w.sky || 'Unknown'}`,
          `# G61_AIR_TEMP: ${w.airTemp || 'Unknown'}`,
          `# G61_TRACK_TEMP: ${w.trackTemp || 'Unknown'}`,
          `# G61_WIND_SPEED: ${w.windSpeed || 'Unknown'}`,
          `# G61_WIND_DIR: ${w.windDir || 'Unknown'}`,
          `# G61_HUMIDITY: ${w.humidity || 'Unknown'}`,
          `# G61_PRESSURE: ${w.pressure || 'Unknown'}`,
          `# G61_AIR_DENSITY: ${w.density || 'Unknown'}`,
          `# G61_PRECIPITATION: ${w.precip || 'Unknown'}`,
          `# G61_TRACK_WETNESS: ${w.wetness || 'Unknown'}`,
          `# G61_TRACK_USAGE: ${w.trackUsage || 'Unknown'}`,
          `# G61_FUEL_LEFT: ${w.fuel || 'Unknown'}`,
          `# G61_SCRAPED_AT: ${new Date(w.scrapedAt || Date.now()).toISOString()}`
        ];
        metaComments = metaLines.join('\n') + '\n';
        console.log(`[Weather] Attached weather conditions for: "${file}"`);
      } catch (err) {
        console.warn(`[Weather Warn] Failed to parse weather JSON for "${file}":`, err.message);
      }
    } else {
      console.log(`[Weather Info] No weather JSON found for: "${file}"`);
    }

    // Read raw CSV data and prepend weather meta comments
    const csvContent = fs.readFileSync(srcPath, 'utf8');
    const finalCsvContent = metaComments + csvContent;
    
    // Copy/Write file to all specified target directories
    targetDirs.forEach(baseDir => {
      const destFolder = path.join(baseDir, trackSlug, carSlug);
      if (!fs.existsSync(destFolder)) {
        fs.mkdirSync(destFolder, { recursive: true });
      }
      const destPath = path.join(destFolder, targetFileName);
      fs.writeFileSync(destPath, finalCsvContent, 'utf8');
    });
    
    // Delete source files from Downloads to clean up
    fs.unlinkSync(srcPath);
    if (fs.existsSync(weatherJsonPath)) {
      fs.unlinkSync(weatherJsonPath);
    }
    
    console.log(`[✓] Moved & Processed: "${file}"`);
    console.log(`    -> to: [extensions/data & src/data]/${trackSlug}/${carSlug}/${targetFileName}`);
    successCount++;
  } catch (err) {
    console.error(`[Error] Failed to process file "${file}":`, err.message);
  }
});

console.log('------------------------------------------------');
console.log(`SUCCESS: Imported and processed ${successCount} telemetry CSV files.`);
console.log('Telemetry files (now with weather comments) are organized under extensions/data/ and src/data/ by track/car.');

