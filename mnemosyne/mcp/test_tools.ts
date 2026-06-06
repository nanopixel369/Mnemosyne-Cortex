// Quick smoke test for the TypeScript MCP tools
import { resolveType, DOMAIN_TYPES, LANDMARK_TYPES } from "./dictionary.ts";
import { findMemblok, finalizeMemblok, computeMinimap } from "./memblok.ts";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dir, "test_storage");
mkdirSync(TEST_DIR, { recursive: true });

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  [PASS] ${label}`); passed++; }
  else { console.log(`  [FAIL] ${label}${detail ? ": " + detail : ""}`); failed++; }
}

console.log("\n=== TypeScript MCP Tools — Smoke Test ===\n");

// 1. Dictionary
console.log("Dictionary:");
assert("INSIGHT resolves by typeId", resolveType("INSIGHT")?.emoji === "💡");
assert("💡 resolves by emoji",       resolveType("💡")?.typeId === "INSIGHT");
assert("FAKETYPE returns null",      resolveType("FAKETYPE") === null);
assert("LM_KEY resolves",            resolveType("LM_KEY")?.emoji === "🔑");

// 2. Minimap
console.log("\nMinimap:");
const sample = "hello world ".repeat(100) + "⟦💡-001:test insight⟧some content⟦💡-001/⟧";
const mm = computeMinimap(sample);
assert("Minimap is 100 chars", mm.length === 100, `got ${mm.length}`);
assert("Minimap has non-empty chars", mm.includes("░") || mm.includes("▒") || mm.includes("▓"));

// 3. Finalize round-trip
console.log("\nFinalize:");
const mid = "test1234";
const testFile = join(TEST_DIR, `wip_${mid}.mg`);
writeFileSync(testFile,
  `# Test memblok\n# id: ${mid}\n\n` +
  `The gravity system computes a weighted centroid.\n` +
  `⟦💡-001:gravity centroid⟧\n` +
  `The formula is mass = (base_mass + nudge) * multiplier.\n` +
  `⟦🔑LM_KEY-001⟧This is the key insight.\n` +
  `⟦💡-001/⟧\n`,
  "utf8"
);
const result = finalizeMemblok(mid, TEST_DIR);
assert("Finalize succeeds",      result.ok === true, result.error);
assert("Has regions",            (result.regions ?? 0) >= 1);
assert("Has landmarks",          (result.landmarks ?? 0) >= 1);
assert("Minimap in result",      typeof result.minimap === "string" && result.minimap.length === 100);

// 4. findMemblok
console.log("\nfindMemblok:");
const found = findMemblok(TEST_DIR, mid);
assert("Finds committed memblok", found !== null);

// Cleanup
import { rmSync } from "node:fs";
rmSync(TEST_DIR, { recursive: true, force: true });

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
