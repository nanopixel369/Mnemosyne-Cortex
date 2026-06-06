import { existsSync, statSync } from "node:fs";

const TARGET_FILE = "kdtree_cielab.bin";
const EXPECTED_MIN_BYTES = 100_000_000; // 100MB minimum — sanity check
const RELEASE_URL =
  "https://github.com/nanopixel369/Mnemosyne-Cortex/releases/download/v0.1.0-alpha/kdtree_cielab.bin";

async function run() {
  if (existsSync(TARGET_FILE)) {
    const size = statSync(TARGET_FILE).size;
    if (size >= EXPECTED_MIN_BYTES) {
      console.log(`📦 KD-Tree binary already present (${(size / 1e6).toFixed(1)}MB). Skipping download.`);
      return;
    }
    console.log(`⚠️  Existing file too small (${size} bytes) — re-downloading.`);
  }

  console.log("🚀 Fetching KD-Tree binary from GitHub Releases...");
  console.log(`   URL: ${RELEASE_URL}`);

  const response = await fetch(RELEASE_URL);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    console.log(`   Size: ${(parseInt(contentLength) / 1e6).toFixed(1)}MB`);
  }

  // Read the full response body as ArrayBuffer then write to disk
  const buffer = await response.arrayBuffer();
  await Bun.write(TARGET_FILE, buffer);

  // Verify the file actually landed
  if (!existsSync(TARGET_FILE)) {
    throw new Error("Write appeared to succeed but file not found on disk.");
  }

  const written = statSync(TARGET_FILE).size;
  if (written < EXPECTED_MIN_BYTES) {
    throw new Error(`File written but too small: ${written} bytes. Download may be corrupt.`);
  }

  console.log(`✅ KD-Tree binary downloaded and verified (${(written / 1e6).toFixed(1)}MB).`);
}

run().catch((err) => {
  console.error("❌ Bootstrap failed:", err.message);
  process.exit(1);
});
