#!/bin/bash

echo "=== IMPORTING CRAWLED TELEMETRY DATA ==="

# 1. Run raw telemetry imports from Downloads folder to src/data
if [ -f "scripts/import-downloads-raw.js" ]; then
  echo "Checking Downloads folder for raw telemetry CSV files..."
  node scripts/import-downloads-raw.js
else
  echo "Error: scripts/import-downloads-raw.js not found!"
  exit 1
fi

# 2. Check for changes in src/data and automatically commit them
CHANGES=$(git status --porcelain src/data)
if [ -n "$CHANGES" ]; then
  echo "Detected new telemetry data. Committing to repository..."
  git add src/data
  git commit -m "chore: import reference telemetry data"
  echo "Telemetry data committed successfully."
else
  echo "No new telemetry data to commit."
fi
