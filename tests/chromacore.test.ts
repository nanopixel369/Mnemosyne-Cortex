// tests/chromacore.test.ts
import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { existsSync, unlinkSync } from "fs";
import { ChromaCore } from "../src/index.ts";
import { getHaltonCoordinate, getZoneAndBaseMass } from "../src/halton.ts";
import { levenshteinDistance } from "../src/autotagger.ts";

const TEST_DB = "test.db";
const DECAY_DB = "decay_test.db";
const HALTON_JSON = "halton_10k.json";
const PRESET_DEV = "presets/developer.json";

function cleanupDB(path: string) {
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch (_) {}
  }
}

describe("ChromaCore v3.0 Prototype Tests", () => {
  
  beforeAll(() => {
    cleanupDB(TEST_DB);
    cleanupDB(DECAY_DB);
  });

  afterAll(() => {
    cleanupDB(TEST_DB);
    cleanupDB(DECAY_DB);
  });

  test("Halton calculations and zones math", () => {
    // Test base mapping for index 1
    const [L, a, b] = getHaltonCoordinate(1);
    expect(L).toBeGreaterThanOrEqual(0);
    expect(L).toBeLessThanOrEqual(100);
    expect(a).toBeGreaterThanOrEqual(-128);
    expect(a).toBeLessThanOrEqual(127);
    expect(b).toBeGreaterThanOrEqual(-128);
    expect(b).toBeLessThanOrEqual(127);

    // Test zone and base mass ranges
    const zoneInfo1 = getZoneAndBaseMass(50, 0, 0); // distance 0 (Core)
    expect(zoneInfo1.zone).toBe("core");
    expect(zoneInfo1.base_mass).toBe(0.6);

    const zoneInfo2 = getZoneAndBaseMass(100, 120, 120); // distance ~176.9 (Outer)
    expect(zoneInfo2.zone).toBe("outer");
    expect(zoneInfo2.base_mass).toBeGreaterThanOrEqual(1.0);
    expect(zoneInfo2.base_mass).toBeLessThanOrEqual(1.5);
  });

  test("Levenshtein distance calculation", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
    expect(levenshteinDistance("hello", "helo")).toBe(1);
    expect(levenshteinDistance("hello", "hell")).toBe(1);
    expect(levenshteinDistance("hello", "hallo")).toBe(1);
    expect(levenshteinDistance("hello", "world")).toBe(4);
  });

  test("End-to-End Bootstrapping and Ingestion", () => {
    let core: ChromaCore | null = null;
    try {
      // 1. Create instance (bootstrap from assets)
      core = ChromaCore.create(TEST_DB, HALTON_JSON, PRESET_DEV, {
        decay: {
          mode: "standard",
          decay_to_rot_seconds: 300, // 5 minutes decay
        },
        semantic_stack: {
          preset: "developer",
          knn_radius_default: 5.0,
          frequency_nudging_scale: 10.0,
          fuzzy_matching_enabled: true,
          fuzzy_distance: 2,
          custom_tag_threshold: 2,
        }
      });

      const stackInfo = core.getStackInfo();
      expect(stackInfo.preset).toBe("developer");
      expect(stackInfo.total_tags).toBeGreaterThan(0);

      // 2. Ingest first entry (developer preset keywords)
      // "algorithm", "compiler" should match developer preset
      const content1 = Buffer.from("algorithm compiler");
      const id1 = core.storeEntry(content1);
      expect(id1).toBe(1);

      const node1 = core.getEntry(id1);
      expect(node1).not.toBeNull();
      expect(node1!.lab_l).not.toBe(50); // Should be gravitated away from center
      const tags = JSON.parse(node1!.tags_json);
      expect(tags.some((t: any) => t.tag === "#algorithm")).toBe(true);
      expect(tags.some((t: any) => t.tag === "#compiler")).toBe(true);

      // 3. Query — same keywords should land at same/nearby coordinate
      // Second Life Reset may or may not fire depending on overlap ratio with stored tags.
      // What matters: breadcrumbs are returned and our node appears.
      const breadcrumbs = core.query({
        user_input: "algorithm compiler",
        k: 5,
        knn_radius: 10.0
      });
      expect(breadcrumbs.length).toBeGreaterThan(0);
      expect(breadcrumbs[0].id).toBe(id1);

      // Verify surfacing was logged (at minimum 1 surfacing from this query)
      const updatedNode1 = core.getEntry(id1)!;
      expect(updatedNode1.surfacing_count).toBeGreaterThanOrEqual(1);

      // 4. Ingest second entry with deduplication
      const id2 = core.storeEntry(content1, { deduplicate: true });
      expect(id2).toBe(id1); // Returns existing ID

      // 5. Engagement logging (Phase 2 retrieval)
      const selected = core.getSelectedResults([id1]);
      expect(selected.length).toBe(1);
      expect(selected[0].id).toBe(id1);
      expect(selected[0].engagement_count).toBeGreaterThanOrEqual(1);
      expect(selected[0].strength).toBeGreaterThan(0);

      // 6. Update entry content
      const report = core.updateEntryContent(id1, Buffer.from("database container socket transaction"));
      expect(report.entry_id).toBe(id1);
      expect(report.coordinate_changed).toBe(true);
      
      // 7. Test custom tag operations
      const newAnchor = core.addCustomTag("my-special-technology");
      expect(newAnchor.tag_word).toBe("#my-special-technology");

      core.renameTag("my-special-technology", "my-renamed-tech");
      const stackInfo2 = core.getStackInfo();
      expect(stackInfo2.custom_count).toBe(1);

      core.removeTag("my-renamed-tech");
      const stackInfo3 = core.getStackInfo();
      expect(stackInfo3.custom_count).toBe(0);

    } finally {
      if (core) {
        core.close();
      }
      cleanupDB(TEST_DB);
    }
  });

  test("ChromaChron Decay and State transitions", async () => {
    let core: ChromaCore | null = null;
    try {
      core = ChromaCore.create(DECAY_DB, HALTON_JSON, PRESET_DEV, {
        decay: {
          mode: "standard",
          decay_to_rot_seconds: 1, // Rapid 1 second to rot
        },
        semantic_stack: {
          preset: "developer",
          knn_radius_default: 10.0,
          frequency_nudging_scale: 1000.0,
          fuzzy_matching_enabled: false,
          fuzzy_distance: 2,
          custom_tag_threshold: 1,
        }
      });

      // Store node
      const id = core.storeEntry(Buffer.from("compiler debug loop socket event"));
      const initialNode = core.getEntry(id)!;
      expect(initialNode.state).toBe("neutral");
      expect(initialNode.strength).toBe(0.0);

      // 1. Surface the node via query — Second Life Reset may fire if overlap >= 50%
      // Either way, node gets surfaced and logged.
      core.query({
        user_input: "compiler debug loop socket event",
        knn_radius: 20.0
      });

      const surfacedNode = core.getEntry(id)!;
      expect(surfacedNode.surfacing_count).toBeGreaterThanOrEqual(1);

      // Trigger tick to apply any pending penalties
      await core.triggerDecayTick();

      const nodeAfterTick = core.getEntry(id)!;
      // State should still be neutral or decay — not yet ascension
      expect(["neutral", "decay"]).toContain(nodeAfterTick.state);

      // Engage enough times to reach ascension (10 total engagement_count)
      const currentEngagements = nodeAfterTick.engagement_count;
      const needed = Math.max(0, 10 - currentEngagements);
      for (let i = 0; i < needed; i++) {
        core.getSelectedResults([id]);
      }
      
      const ascNode = core.getEntry(id)!;
      expect(ascNode.state).toBe("ascension");
      expect(ascNode.engagement_count).toBe(10);
      expect(ascNode.recent_engagement_sum).toBe(9);

      // 3. Move to permanence
      // Permanence needs ascension state + recent_engagement_sum >= 5.
      // Since we are in ascension and recent_engagement_sum is 9 (>= 5), the tick should transition it!
      await core.triggerDecayTick();

      const permNode = core.getEntry(id)!;
      expect(permNode.state).toBe("permanence");

      // 4. Verify permanence prevents decay/rot deletion
      // Run surfacing 20 times without engagement (would normally cause rot deletion)
      for (let i = 0; i < 21; i++) {
        core.query({
          user_input: "compiler debug loop socket event",
          knn_radius: 20.0
        });
      }
      
      await core.triggerDecayTick();
      const stillHere = core.getEntry(id);
      expect(stillHere).not.toBeNull();
      expect(stillHere!.state).toBe("permanence"); // Stays permanent

    } finally {
      if (core) {
        core.close();
      }
      cleanupDB(DECAY_DB);
    }
  });
});
