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
    
    // Copy file to all specified target directories
    targetDirs.forEach(baseDir => {
      const destFolder = path.join(baseDir, trackSlug, carSlug);
      if (!fs.existsSync(destFolder)) {
        fs.mkdirSync(destFolder, { recursive: true });
      }
      const destPath = path.join(destFolder, targetFileName);
      fs.copyFileSync(srcPath, destPath);
    });
    
    // Delete source file from Downloads to prevent duplicate imports and clean up
    fs.unlinkSync(srcPath);
    
    console.log(`[✓] Moved: "${file}"`);
    console.log(`    -> to: [extensions/data & src/data]/${trackSlug}/${carSlug}/${targetFileName}`);
    successCount++;
  } catch (err) {
    console.error(`[Error] Failed to process file "${file}":`, err.message);
  }
});

console.log('------------------------------------------------');
console.log(`SUCCESS: Imported and cleaned up ${successCount} telemetry CSV files.`);
console.log('Telemetry files are now organized under extensions/data/ and src/data/ by track/car.');
