const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('=== GARAGE 61 DOWNLOADS IMPORT UTILITY ===');

const downloadsDir = path.join(os.homedir(), 'Downloads', 'must-be-the-apex', 'data');
const targetDir = path.join(__dirname, '..', 'extensions', 'data');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

function deleteRecursiveSync(src) {
  if (fs.existsSync(src)) {
    fs.readdirSync(src).forEach((file) => {
      const curPath = path.join(src, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteRecursiveSync(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(src);
  }
}

if (!fs.existsSync(downloadsDir)) {
  console.log(`No telemetry data found in: ${downloadsDir}`);
  console.log('Ensure the Chrome extension finished crawling & downloading telemetry first.');
  process.exit(0);
}

try {
  console.log(`Importing telemetry files from: ${downloadsDir}`);
  console.log(`Target directory: ${targetDir}`);
  console.log('------------------------------------------------');
  
  copyRecursiveSync(downloadsDir, targetDir);
  deleteRecursiveSync(downloadsDir);
  
  console.log('------------------------------------------------');
  console.log('[✓] SUCCESS: All telemetry files imported and cleaned up from Downloads.');
} catch (err) {
  console.error('Error during import:', err);
  process.exit(1);
}
