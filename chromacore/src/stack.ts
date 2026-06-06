// src/stack.ts
import { SemanticAnchor, LabCoordinate, TagWithCount, ChromaNode } from "./types.ts";
import { ChromaCoreDatabase } from "./database.ts";
import { getHaltonCoordinate, getZoneAndBaseMass } from "./halton.ts";
import { AutoTagger } from "./autotagger.ts";
import { computeGravity } from "./gravity.ts";

export class SemanticStackManager {
  private db: ChromaCoreDatabase;
  public stackMap = new Map<string, SemanticAnchor>();
  public stackSet = new Set<string>();
  private presetName = "general";

  constructor(db: ChromaCoreDatabase) {
    this.db = db;
    this.loadFromDatabase();
  }

  public loadFromDatabase() {
    this.stackMap.clear();
    this.stackSet.clear();
    const anchors = this.db.loadSemanticStack();
    for (const anchor of anchors) {
      this.stackMap.set(anchor.tag_word, anchor);
      this.stackSet.add(anchor.tag_word);
    }
    this.presetName = this.db.getConfig("semantic_stack.preset") || "general";
  }

  // --- Add Custom Tag ---
  public addCustomTag(
    tagWord: string,
    source: "custom" | "auto_discovered" = "custom",
    targetIndex?: number
  ): SemanticAnchor {
    const formattedTag = tagWord.startsWith("#") ? tagWord : `#${tagWord}`;

    if (this.stackSet.has(formattedTag)) {
      return this.stackMap.get(formattedTag)!;
    }

    // Determine the next available Halton index
    let index = targetIndex;
    if (index === undefined) {
      const anchors = Array.from(this.stackMap.values());
      const maxIndex = anchors.reduce((max, a) => Math.max(max, a.halton_index), 0);
      index = maxIndex + 1;
    }

    if (index > 10000) {
      throw new Error("Semantic Stack capacity exceeded (limit 10,000 anchors).");
    }

    // Generate Halton coordinate and zone details
    const [L, a, b] = getHaltonCoordinate(index);
    const { zone, base_mass } = getZoneAndBaseMass(L, a, b);

    const anchor: SemanticAnchor = {
      halton_index: index,
      tag_word: formattedTag,
      lab_l: L,
      lab_a: a,
      lab_b: b,
      base_mass,
      zone,
      source,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // Write 1: SQLite
    this.db.addStackAnchor(anchor);

    // Write 2 & 3: RAM Maps
    this.stackMap.set(formattedTag, anchor);
    this.stackSet.add(formattedTag);

    return anchor;
  }

  // --- Rename Tag ---
  public renameTag(oldWord: string, newWord: string, recomputeNodes: (node: ChromaNode, updatedTags: TagWithCount[]) => void) {
    const formattedOld = oldWord.startsWith("#") ? oldWord : `#${oldWord}`;
    const formattedNew = newWord.startsWith("#") ? newWord : `#${newWord}`;

    if (!this.stackSet.has(formattedOld)) {
      throw new Error(`Tag not found in semantic stack: ${oldWord}`);
    }
    if (this.stackSet.has(formattedNew)) {
      throw new Error(`Destination tag already exists: ${newWord}`);
    }

    // 1. Update SQLite semantic_stack
    this.db.renameStackAnchor(formattedOld, formattedNew);

    // 2. Update RAM Maps
    const anchor = this.stackMap.get(formattedOld)!;
    anchor.tag_word = formattedNew;
    anchor.updated_at = Date.now();
    this.stackMap.delete(formattedOld);
    this.stackMap.set(formattedNew, anchor);
    this.stackSet.delete(formattedOld);
    this.stackSet.add(formattedNew);

    // 3. Update only nodes that actually contain this tag — targeted query, not full scan
    const affectedNodes = this.db.getNodesByTagWord(formattedOld);
    for (const node of affectedNodes) {
      const tags = JSON.parse(node.tags_json) as TagWithCount[];
      const updatedTags = tags.map((t) => {
        if (t.tag === formattedOld) return { tag: formattedNew, count: t.count };
        return t;
      });
      recomputeNodes(node, updatedTags);
    }
  }

  // --- Remove Tag ---
  public removeTag(
    tagWord: string,
    recomputeNodes: (node: ChromaNode, updatedTags: TagWithCount[]) => void
  ): { recomputed_entries: number } {
    const formattedTag = tagWord.startsWith("#") ? tagWord : `#${tagWord}`;

    if (!this.stackSet.has(formattedTag)) {
      return { recomputed_entries: 0 };
    }

    // 1. Update SQLite semantic_stack
    this.db.removeStackAnchor(formattedTag);

    // 2. Update RAM Maps
    this.stackMap.delete(formattedTag);
    this.stackSet.delete(formattedTag);

    // 3. Recompute only nodes that actually contain this tag — targeted query, not full scan
    let recomputedCount = 0;
    const affectedNodes = this.db.getNodesByTagWord(formattedTag);
    for (const node of affectedNodes) {
      const tags = JSON.parse(node.tags_json) as TagWithCount[];
      const updatedTags = tags.filter((t) => t.tag !== formattedTag);
      recomputeNodes(node, updatedTags);
      recomputedCount++;
    }

    return { recomputed_entries: recomputedCount };
  }

  public getStackInfo() {
    const anchors = Array.from(this.stackMap.values());
    const customCount = anchors.filter((a) => a.source !== "preset").length;
    return {
      total_tags: anchors.length,
      preset: this.presetName,
      custom_count: customCount,
    };
  }
}
