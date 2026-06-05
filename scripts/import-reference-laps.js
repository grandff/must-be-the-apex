const fs = require('fs');
const path = require('path');
const readline = require('readline');

console.log('=== GARAGE 61 REFERENCE DATA IMPORT UTILITY ===');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Please enter the path to the exported Garage 61 JSON file: ', (filePath) => {
  const resolvedPath = path.resolve(filePath.trim());
  
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: File does not exist at: ${resolvedPath}`);
    rl.close();
    process.exit(1);
  }

  try {
    const rawData = fs.readFileSync(resolvedPath, 'utf8');
    const data = JSON.parse(rawData);

    const track = data.track || 'unknown-track';
    const car = data.car || 'unknown-car';
    const laps = data.laps || [];

    if (laps.length === 0) {
      console.warn('Warning: No laps found in the JSON file.');
      rl.close();
      process.exit(0);
    }

    // Determine target directory (extensions/data/[track]/[car])
    const targetDir = path.join(__dirname, '..', 'extensions', 'data', track, car);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    console.log(`\nImporting laps to: ${targetDir}`);
    console.log('------------------------------------------------');

    let importCount = 0;
    let missingTelemetryCount = 0;

    laps.forEach((lap, index) => {
      if (!lap.csvData) {
        missingTelemetryCount++;
        return;
      }

      const setupType = lap.isFixed ? 'fixed' : 'open';
      const driverClean = lap.driverName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const timeClean = lap.lapTime.replace(/[^a-zA-Z0-9]/g, '_');
      
      const fileName = `${index + 1}_${setupType}_${timeClean}_${driverClean}.csv`;
      const targetFilePath = path.join(targetDir, fileName);

      fs.writeFileSync(targetFilePath, lap.csvData, 'utf8');
      console.log(`[✓] Imported: ${fileName}`);
      importCount++;
    });

    console.log('------------------------------------------------');
    console.log(`SUCCESS: Imported ${importCount} reference telemetry CSV files.`);
    if (missingTelemetryCount > 0) {
      console.log(`INFO: Skipped ${missingTelemetryCount} laps (no telemetry CSV data downloaded in the JSON file).`);
      console.log('      Make sure to click "Download Telemetry CSVs" in the Chrome extension before exporting.');
    }

  } catch (err) {
    console.error('Error importing data:', err);
  } finally {
    rl.close();
  }
});
