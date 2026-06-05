const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const extSrcDir = path.join(rootDir, 'extensions', 'garage61-crawler');
const extDistDir = path.join(rootDir, 'extensions', 'dist');
const originsDir = path.join(rootDir, 'extensions', 'origins');

console.log('--- Building Garage 61 Scraper Extension ---');

// 1. Ensure tracks.json and cars.json are present. If not, generate them.
const tracksJsonPath = path.join(originsDir, 'tracks.json');
const carsJsonPath = path.join(originsDir, 'cars.json');

if (!fs.existsSync(tracksJsonPath) || !fs.existsSync(carsJsonPath)) {
  console.log('JSON metadata files not found, running parse-origins.js first...');
  require('./parse-origins.js');
}

const tracksData = JSON.parse(fs.readFileSync(tracksJsonPath, 'utf8'));
const carsData = JSON.parse(fs.readFileSync(carsJsonPath, 'utf8'));

// 2. Ensure target extensions/dist directory exists
if (!fs.existsSync(extDistDir)) {
  fs.mkdirSync(extDistDir, { recursive: true });
}

// 3. Read sidepanel.js
let sidepanelJs = fs.readFileSync(path.join(extSrcDir, 'sidepanel.js'), 'utf8');

// 4. Inject JSON data directly into the variables
sidepanelJs = sidepanelJs.replace(
  'let allTracks = {};',
  `let allTracks = ${JSON.stringify(tracksData)};`
);
sidepanelJs = sidepanelJs.replace(
  'let allCars = {};',
  `let allCars = ${JSON.stringify(carsData)};`
);

// 5. Replace loadTracksAndCars function to bypass fetch and use bundled data
const newLoadFunc = `async function loadTracksAndCars() {
  try {
    populateDropdown('track-select', allTracks);
    populateDropdown('car-select', allCars);
    addLog(\`Loaded \${Object.keys(allTracks).length} tracks and \${Object.keys(allCars).length} cars (bundled).\`, 'info');
  } catch (err) {
    console.error('Error populating tracks/cars:', err);
    addLog(\`Failed to populate tracks or cars: \${err.message}\`, 'error');
  }
}`;

const startIndex = sidepanelJs.indexOf('async function loadTracksAndCars()');
if (startIndex !== -1) {
  let braceCount = 0;
  let endIndex = -1;
  for (let i = startIndex; i < sidepanelJs.length; i++) {
    if (sidepanelJs[i] === '{') braceCount++;
    if (sidepanelJs[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  if (endIndex !== -1) {
    sidepanelJs = sidepanelJs.substring(0, startIndex) + newLoadFunc + sidepanelJs.substring(endIndex);
  }
}

// 6. Write sidepanel.js to dist
fs.writeFileSync(path.join(extDistDir, 'sidepanel.js'), sidepanelJs, 'utf8');
console.log('[✓] Bundled and wrote sidepanel.js to dist.');

// 7. Copy other extension assets
const assetsToCopy = [
  'manifest.json',
  'background.js',
  'content.js',
  'sidepanel.html',
  'sidepanel.css'
];

assetsToCopy.forEach(asset => {
  const srcPath = path.join(extSrcDir, asset);
  const destPath = path.join(extDistDir, asset);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`[✓] Copied ${asset} to dist.`);
  } else {
    console.error(`Error: Asset not found at: ${srcPath}`);
  }
});

console.log('--- Extension Build Completed successfully! ---');
console.log('Target folder to load in Chrome: extensions/dist/');
