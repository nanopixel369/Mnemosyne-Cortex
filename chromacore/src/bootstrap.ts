// src/bootstrap.ts
import { readFileSync, existsSync, unlinkSync } from "fs";
import { ChromaCoreDatabase } from "./database.ts";
import { HaltonEntry, SemanticAnchor, ChromaCoreConfig } from "./types.ts";

export function bootstrapDatabase(
  dbPath: string,
  haltonPath: string,
  presetPath: string,
  config: ChromaCoreConfig
): ChromaCoreDatabase {
  // If the file exists, we delete it to start fresh (as bootstrap is for creating a new database)
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }

  const db = new ChromaCoreDatabase(dbPath, config.storage.cache_size_mb);

  try {
    // 1. Read Halton entries
    const haltonData = readFileSync(haltonPath, "utf-8");
    const haltonEntries = JSON.parse(haltonData) as HaltonEntry[];

    // 2. Read preset words
    const presetData = readFileSync(presetPath, "utf-8");
    const presetWords = JSON.parse(presetData) as string[];

    console.log(`Bootstrapping database at ${dbPath} with preset containing ${presetWords.length} words...`);

    // 3. Write config to the config table
    db.setConfig("core.environment", config.core.environment);
    db.setConfig("core.log_level", config.core.log_level);
    db.setConfig("storage.cache_size_mb", config.storage.cache_size_mb.toString());
    db.setConfig("semantic_stack.preset", config.semantic_stack.preset);
    db.setConfig("semantic_stack.knn_radius_default", config.semantic_stack.knn_radius_default.toString());
    db.setConfig("semantic_stack.frequency_nudging_scale", config.semantic_stack.frequency_nudging_scale.toString());
    db.setConfig("semantic_stack.fuzzy_matching_enabled", config.semantic_stack.fuzzy_matching_enabled.toString());
    db.setConfig("semantic_stack.fuzzy_distance", config.semantic_stack.fuzzy_distance.toString());
    db.setConfig("semantic_stack.custom_tag_threshold", config.semantic_stack.custom_tag_threshold.toString());
    db.setConfig("decay.mode", config.decay.mode);
    if (config.decay.decay_to_rot_seconds !== undefined) {
      db.setConfig("decay.decay_to_rot_seconds", config.decay.decay_to_rot_seconds.toString());
    }
    db.setConfig("query.default_k", config.query.default_k.toString());
    db.setConfig("query.max_knn_radius", config.query.max_knn_radius.toString());
    db.setConfig("query.confidence_threshold", config.query.confidence_threshold.toString());

    // 4. Pair preset words with Halton coordinates inside a transaction
    const insertStackTransaction = db.db.transaction((entries: SemanticAnchor[]) => {
      for (const entry of entries) {
        db.addStackAnchor(entry);
      }
    });

    const now = Date.now();
    const anchorsToInsert: SemanticAnchor[] = [];

    // Ensure we don't exceed the Halton sequence length (10,000)
    const limit = Math.min(presetWords.length, haltonEntries.length);

    for (let i = 0; i < limit; i++) {
      const word = presetWords[i];
      const h = haltonEntries[i];
      
      // Tag words are stored with the "#" prefix
      const tagWord = word.startsWith("#") ? word : `#${word}`;

      anchorsToInsert.push({
        halton_index: h.index,
        tag_word: tagWord,
        lab_l: h.lab_l,
        lab_a: h.lab_a,
        lab_b: h.lab_b,
        base_mass: h.base_mass,
        zone: h.zone,
        source: "preset",
        created_at: now,
        updated_at: now,
      });
    }

    insertStackTransaction(anchorsToInsert);
    console.log(`Successfully bootstrapped ${anchorsToInsert.length} anchors.`);
    return db;
  } catch (error) {
    db.close();
    if (existsSync(dbPath)) {
      try {
        unlinkSync(dbPath);
      } catch (_) {}
    }
    throw error;
  }
}
