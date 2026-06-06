#!/bin/bash

# Ensure the system fails immediately if a command exits with an error
set -e

TARGET_FILE="kdtree_cielab.bin"
RELEASE_URL="https://github.com/nanopixel369/Mnemosyne-Cortex/releases/download/v0.1.0-alpha/kdtree_cielab.bin"

if [ ! -f "$TARGET_FILE" ]; then
  echo "🚀 Local KD-Tree binary missing. Fetching architectural asset from GitHub CDN..."
  curl -L -o "$TARGET_FILE" "$RELEASE_URL"
  echo "✅ Asset successfully cached in working directory."
else
  echo "📦 Heavy binary already present. Skipping download."
fi