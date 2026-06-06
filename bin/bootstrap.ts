import { existsSync } from "node:fs";

const TARGET_FILE = "kdtree_cielab.bin";
const RELEASE_URL = "https://github.com/nanopixel369/Mnemosyne-Cortex/releases/download/v0.1.0-alpha/kdtree_cielab.bin";

async function run() {
  if (!existsSync(TARGET_FILE)) {
    console.log("🚀 Local KD-Tree binary missing. Fetching architectural asset from GitHub CDN...");
    
    const response = await fetch(RELEASE_URL);
    if (!response.ok) {
      throw new Error(`Failed to download binary: ${response.statusText}`);
    }
    
    // Efficiently stream the 129MB file directly to disk via Bun's native API
    await Bun.write(TARGET_FILE, response);
    console.log("✅ Asset successfully cached in working directory.");
  } else {
    console.log("📦 Heavy binary already present. Skipping download.");
  }
}

run().catch((err) => {
  console.error("❌ Bootstrap failed:", err);
  process.exit(1);
});