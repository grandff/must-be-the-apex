const fs = require('fs');
const path = require('path');

const originsDir = path.join(__dirname, '..', 'extensions', 'origins');
const tracksFile = path.join(originsDir, 'tacks.txt'); // Note: filename is tacks.txt
const carsFile = path.join(originsDir, 'cars.txt');

console.log('--- Parsing Origins HTML files to JSON ---');

// 1. Parse Tracks
if (fs.existsSync(tracksFile)) {
  const tracksHtml = fs.readFileSync(tracksFile, 'utf8');
  // Match href="/app/tracks/[id]">Name</a> or similar
  const trackRegex = /href="\/app\/tracks\/(\d+)"[^>]*>([^<]+)<\/a>/g;
  const tracks = {};
  
  let match;
  while ((match = trackRegex.exec(tracksHtml)) !== null) {
    const id = match[1];
    const name = match[2].trim();
    // Avoid HTML entities in name
    const cleanName = name.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    tracks[id] = cleanName;
  }

  const tracksJsonFile = path.join(originsDir, 'tracks.json');
  fs.writeFileSync(tracksJsonFile, JSON.stringify(tracks, null, 2), 'utf8');
  console.log(`[✓] Successfully parsed ${Object.keys(tracks).length} tracks and saved to: ${tracksJsonFile}`);

  // Also write to crawler extension folder
  const crawlerTracksDir = path.join(__dirname, '..', 'extensions', 'garage61-crawler', 'origins');
  if (!fs.existsSync(crawlerTracksDir)) {
    fs.mkdirSync(crawlerTracksDir, { recursive: true });
  }
  fs.writeFileSync(path.join(crawlerTracksDir, 'tracks.json'), JSON.stringify(tracks, null, 2), 'utf8');
  console.log(`[✓] Copied tracks.json to extension origins.`);
} else {
  console.error(`Error: Tracks file not found at: ${tracksFile}`);
}

// 2. Parse Cars
if (fs.existsSync(carsFile)) {
  const carsHtml = fs.readFileSync(carsFile, 'utf8');
  // Match href="/app/cars/[id]">Name</a> or similar
  const carRegex = /href="\/app\/cars\/(\d+)"[^>]*>([^<]+)<\/a>/g;
  const cars = {};
  
  let match;
  while ((match = carRegex.exec(carsHtml)) !== null) {
    const id = match[1];
    const name = match[2].trim();
    const cleanName = name.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    cars[id] = cleanName;
  }

  const carsJsonFile = path.join(originsDir, 'cars.json');
  fs.writeFileSync(carsJsonFile, JSON.stringify(cars, null, 2), 'utf8');
  console.log(`[✓] Successfully parsed ${Object.keys(cars).length} cars and saved to: ${carsJsonFile}`);

  // Also write to crawler extension folder
  const crawlerCarsDir = path.join(__dirname, '..', 'extensions', 'garage61-crawler', 'origins');
  if (!fs.existsSync(crawlerCarsDir)) {
    fs.mkdirSync(crawlerCarsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(crawlerCarsDir, 'cars.json'), JSON.stringify(cars, null, 2), 'utf8');
  console.log(`[✓] Copied cars.json to extension origins.`);
} else {
  console.error(`Error: Cars file not found at: ${carsFile}`);
}

console.log('Parsing completed.');

