const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let cachedLogFilePath = null;

function getLogPaths() {
  if (cachedLogFilePath) {
    return [
      {
        dir: path.dirname(cachedLogFilePath),
        file: cachedLogFilePath,
        type: 'cached'
      }
    ];
  }

  const paths = [];

  // 1. Primary path in Documents folder
  try {
    const docPath = app.getPath('documents');
    if (docPath) {
      const appDir = path.join(docPath, 'MustBeTheApex');
      paths.push({
        dir: appDir,
        file: path.join(appDir, 'must-be-the-apex.log'),
        type: 'documents'
      });
    }
  } catch (err) {
    // Ignore error, app may not be ready
  }

  // 2. Fallback in AppData/userData folder (standard for Electron and always writable)
  try {
    const userPath = app.getPath('userData');
    if (userPath) {
      paths.push({
        dir: userPath,
        file: path.join(userPath, 'must-be-the-apex.log'),
        type: 'userData'
      });
    }
  } catch (err) {
    // Ignore error
  }

  // 3. Fallback in Temp folder (writable)
  try {
    const tempPath = app.getPath('temp');
    if (tempPath) {
      paths.push({
        dir: tempPath,
        file: path.join(tempPath, 'must-be-the-apex.log'),
        type: 'temp'
      });
    }
  } catch (err) {
    // Ignore error
  }

  // 4. Ultimate fallback to current working directory
  paths.push({
    dir: process.cwd(),
    file: path.join(process.cwd(), 'must-be-the-apex.log'),
    type: 'cwd'
  });

  return paths;
}

function writeLog(level, message, error = null) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  let logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  if (error) {
    logLine += `[ERROR STACK] ${error.stack || error.message || error}\n`;
  }

  // Always output to standard console
  if (level === 'error') {
    console.error(`[${level.toUpperCase()}] ${message}`, error || '');
  } else {
    console.log(`[${level.toUpperCase()}] ${message}`);
  }

  const logPaths = getLogPaths();
  let written = false;
  const writeErrors = [];

  for (const pathObj of logPaths) {
    try {
      if (!fs.existsSync(pathObj.dir)) {
        fs.mkdirSync(pathObj.dir, { recursive: true });
      }
      fs.appendFileSync(pathObj.file, logLine, 'utf8');

      // Cache primary writable paths when app is ready
      if (!cachedLogFilePath && (pathObj.type === 'documents' || pathObj.type === 'userData') && app.isReady()) {
        cachedLogFilePath = pathObj.file;
      }
      written = true;
      break;
    } catch (err) {
      writeErrors.push(`${pathObj.file} (${err.message})`);
    }
  }

  if (!written) {
    console.error('All diagnostic log paths failed to write! Errors:', writeErrors.join(', '));
  }
}

const logger = {
  info: (msg) => writeLog('info', msg),
  warn: (msg) => writeLog('warn', msg),
  error: (msg, err) => writeLog('error', msg, err)
};

// Global unhandled error handlers for robust crash-logging
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception in main process:', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection in main process:', reason instanceof Error ? reason : new Error(String(reason)));
});

module.exports = logger;
