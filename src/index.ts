// src/index.ts
import { createHash } from "crypto";
import { join } from "path";
import {
  ChromaCoreConfig,
  LabCoordinate,
  ChromaNode,
  Breadcrumb,
  FullResult,
  ChangeReport,
  SemanticAnchor,
  TagWithCount
} from "./types.ts";
import { ChromaCoreDatabase } from "./database.ts";
import { bootstrapDatabase } from "./bootstrap.ts";
import { KDTree } from "./kdtree.ts";
import { AutoTagger } from "./autotagger.ts";
import { computeGravity } from "./gravity.ts";
import { ChromaChronManager } from "./chromachron.ts";
import { SemanticStackManager } from "./stack.ts";

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function getDefaultConfig(dbPath: string): ChromaCoreConfig {
  return {
    core: {
      environment: "development",
      log_level: "INFO",
    },
    storage: {
      db_path: dbPath,
      cache_size_mb: 64,
    },
    semantic_stack: {
      preset: "general",
      knn_radius_default: 5.0,
      frequency_nudging_scale: 1000.0,
      fuzzy_matching_enabled: false,
      fuzzy_distance: 2,
      custom_tag_threshold: 5,
    },
    decay: {
      mode: "none",
    },
    query: {
      default_k: 10,
      max_knn_radius: 20.0,
      confidence_threshold: 0.4,
    },
  };
}

export class ChromaCore {
  private db: ChromaCoreDatabase;
  private config: ChromaCoreConfig;
  private kdTree: KDTree;
  private autoTagger: AutoTagger;
  private chromachron: ChromaChronManager;
  private stackManager: SemanticStackManager;
  
  // Track operations in flight for idle-aware batch updates
  private activeOperations = 0;

  constructor(dbPath: string, configOverrides?: Partial<ChromaCoreConfig>) {
    // 1. Open SQLite connection & configure pragmas
    const initialConfig = getDefaultConfig(dbPath);
    const dbCacheSize = configOverrides?.storage?.cache_size_mb ?? initialConfig.storage.cache_size_mb;
    this.db = new ChromaCoreDatabase(dbPath, dbCacheSize);

    // 2. Load configuration from DB and overrides
    const dbConfig = this.readConfigFromDatabase();
    this.config = this.mergeConfigs(initialConfig, dbConfig, configOverrides);

    // 3. Load semantic stack into RAM (HashMap and Set)
    this.stackManager = new SemanticStackManager(this.db);

    // 4. Load KD-Tree static binary
    // Look for kdtree_cielab.bin in current working directory, or resolve relative
    const binPath = join(process.cwd(), "kdtree_cielab.bin");
    this.kdTree = new KDTree(binPath);

    // 5. Initialize Auto-Tagger
    this.autoTagger = new AutoTagger(
      this.stackManager.stackSet,
      this.config.semantic_stack.fuzzy_matching_enabled,
      this.config.semantic_stack.fuzzy_distance
    );

    // 6. Initialize ChromaChron manager
    this.chromachron = new ChromaChronManager(
      this.db,
      this.config,
      () => this.activeOperations
    );
    this.chromachron.start();
  }

  // Creating a new database (bootstrap)
  public static create(
    dbPath: string,
    haltonPath: string,
    presetPath: string,
    configOverrides?: Partial<ChromaCoreConfig>
  ): ChromaCore {
    const config = getDefaultConfig(dbPath);
    if (configOverrides) {
      // Merge overrides
      Object.assign(config.core, configOverrides.core);
      Object.assign(config.storage, configOverrides.storage);
      Object.assign(config.semantic_stack, configOverrides.semantic_stack);
      Object.assign(config.decay, configOverrides.decay);
      Object.assign(config.query, configOverrides.query);
    }
    
    // Bootstrap the tables and presets
    const db = bootstrapDatabase(dbPath, haltonPath, presetPath, config);
    db.close();

    // Instantiate using standard constructor
    return new ChromaCore(dbPath, configOverrides);
  }

  private readConfigFromDatabase(): Record<string, string> {
    return this.db.getAllConfig();
  }

  private mergeConfigs(
    initial: ChromaCoreConfig,
    dbConf: Record<string, string>,
    overrides?: Partial<ChromaCoreConfig>
  ): ChromaCoreConfig {
    const result = { ...initial };

    // Apply DB values if present
    if (dbConf["core.environment"]) result.core.environment = dbConf["core.environment"] as any;
    if (dbConf["core.log_level"]) result.core.log_level = dbConf["core.log_level"] as any;
    if (dbConf["storage.cache_size_mb"]) result.storage.cache_size_mb = parseInt(dbConf["storage.cache_size_mb"]);
    if (dbConf["semantic_stack.preset"]) result.semantic_stack.preset = dbConf["semantic_stack.preset"];
    if (dbConf["semantic_stack.knn_radius_default"]) result.semantic_stack.knn_radius_default = parseFloat(dbConf["semantic_stack.knn_radius_default"]);
    if (dbConf["semantic_stack.frequency_nudging_scale"]) result.semantic_stack.frequency_nudging_scale = parseFloat(dbConf["semantic_stack.frequency_nudging_scale"]);
    if (dbConf["semantic_stack.fuzzy_matching_enabled"]) result.semantic_stack.fuzzy_matching_enabled = dbConf["semantic_stack.fuzzy_matching_enabled"] === "true";
    if (dbConf["semantic_stack.fuzzy_distance"]) result.semantic_stack.fuzzy_distance = parseInt(dbConf["semantic_stack.fuzzy_distance"]);
    if (dbConf["semantic_stack.custom_tag_threshold"]) result.semantic_stack.custom_tag_threshold = parseInt(dbConf["semantic_stack.custom_tag_threshold"]);
    if (dbConf["decay.mode"]) result.decay.mode = dbConf["decay.mode"] as any;
    if (dbConf["decay.decay_to_rot_seconds"]) result.decay.decay_to_rot_seconds = parseInt(dbConf["decay.decay_to_rot_seconds"]);
    if (dbConf["query.default_k"]) result.query.default_k = parseInt(dbConf["query.default_k"]);
    if (dbConf["query.max_knn_radius"]) result.query.max_knn_radius = parseFloat(dbConf["query.max_knn_radius"]);
    if (dbConf["query.confidence_threshold"]) result.query.confidence_threshold = parseFloat(dbConf["query.confidence_threshold"]);

    // Apply code overrides
    if (overrides) {
      if (overrides.core) Object.assign(result.core, overrides.core);
      if (overrides.storage) Object.assign(result.storage, overrides.storage);
      if (overrides.semantic_stack) Object.assign(result.semantic_stack, overrides.semantic_stack);
      if (overrides.decay) Object.assign(result.decay, overrides.decay);
      if (overrides.query) Object.assign(result.query, overrides.query);
    }

    return result;
  }

  // --- Ingestion APIs ---
  public storeEntry(
    content: Buffer,
    options?: { content_type?: string; deduplicate?: boolean }
  ): number {
    this.activeOperations++;
    try {
      const hash = sha256(content);
      if (options?.deduplicate) {
        const existing = this.db.getNodeByHash(hash);
        if (existing) {
          return existing.id;
        }
      }

      // 1. Tag Content
      const tags = this.autoTagger.tagContent(content, {
        autoDiscover: true,
        autoDiscoverThreshold: this.config.semantic_stack.custom_tag_threshold,
        onDiscover: (tagWord) => {
          this.stackManager.addCustomTag(tagWord, "auto_discovered");
        }
      });

      // 2. Compute Gravity
      const coord = computeGravity(
        tags,
        this.stackManager.stackMap,
        "placement",
        this.config.semantic_stack.frequency_nudging_scale
      );

      // 3. Store in DB
      return this.db.insertNode({
        lab_l: coord[0],
        lab_a: coord[1],
        lab_b: coord[2],
        content,
        tags_json: JSON.stringify(tags),
        content_type: options?.content_type || null,
        content_hash: hash,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    } finally {
      this.activeOperations--;
    }
  }

  public batchStoreEntries(
    entries: Array<{ content: Buffer; content_type?: string }>
  ): number[] {
    this.activeOperations++;
    try {
      const ids: number[] = [];
      const batchTransaction = this.db.db.transaction(() => {
        for (const entry of entries) {
          const tags = this.autoTagger.tagContent(entry.content, {
            autoDiscover: true,
            autoDiscoverThreshold: this.config.semantic_stack.custom_tag_threshold,
            onDiscover: (tagWord) => {
              this.stackManager.addCustomTag(tagWord, "auto_discovered");
            }
          });

          const coord = computeGravity(
            tags,
            this.stackManager.stackMap,
            "placement",
            this.config.semantic_stack.frequency_nudging_scale
          );

          const hash = sha256(entry.content);

          const id = this.db.insertNode({
            lab_l: coord[0],
            lab_a: coord[1],
            lab_b: coord[2],
            content: entry.content,
            tags_json: JSON.stringify(tags),
            content_type: entry.content_type || null,
            content_hash: hash,
            created_at: Date.now(),
            updated_at: Date.now(),
          });
          ids.push(id);
        }
      });
      batchTransaction();
      return ids;
    } finally {
      this.activeOperations--;
    }
  }

  public getEntry(entryId: number): ChromaNode | null {
    this.activeOperations++;
    try {
      return this.db.getNode(entryId);
    } finally {
      this.activeOperations--;
    }
  }

  public updateEntryContent(entryId: number, newContent: Buffer): ChangeReport {
    this.activeOperations++;
    try {
      const existing = this.db.getNode(entryId);
      if (!existing) {
        throw new Error(`Node not found: ${entryId}`);
      }

      const oldTags = JSON.parse(existing.tags_json) as TagWithCount[];
      const oldCoord: LabCoordinate = [existing.lab_l, existing.lab_a, existing.lab_b];

      // Re-run Auto-Tagger
      const newTags = this.autoTagger.tagContent(newContent, {
        autoDiscover: true,
        autoDiscoverThreshold: this.config.semantic_stack.custom_tag_threshold,
        onDiscover: (tagWord) => {
          this.stackManager.addCustomTag(tagWord, "auto_discovered");
        }
      });

      // Compute new gravity
      const newCoord = computeGravity(
        newTags,
        this.stackManager.stackMap,
        "placement",
        this.config.semantic_stack.frequency_nudging_scale
      );

      const hash = sha256(newContent);
      this.db.updateNodeContent(
        entryId,
        newContent,
        JSON.stringify(newTags),
        newCoord[0],
        newCoord[1],
        newCoord[2],
        hash
      );

      const coordinate_changed =
        oldCoord[0] !== newCoord[0] ||
        oldCoord[1] !== newCoord[1] ||
        oldCoord[2] !== newCoord[2];

      return {
        entry_id: entryId,
        old_tags: oldTags,
        new_tags: newTags,
        old_coordinates: oldCoord,
        new_coordinates: newCoord,
        coordinate_changed,
      };
    } finally {
      this.activeOperations--;
    }
  }

  public deleteEntry(entryId: number): boolean {
    this.activeOperations++;
    try {
      return this.db.deleteNode(entryId);
    } finally {
      this.activeOperations--;
    }
  }

  // --- Query API ---
  public query(options?: {
    user_input?: string;
    query_mode?: "auto" | "manual";
    custom_tags?: string[];
    k?: number;
    knn_radius?: number;
    confidence_threshold?: number;
  }): Breadcrumb[] {
    this.activeOperations++;
    try {
      const mode = options?.query_mode ?? "auto";
      const knnRadius = options?.knn_radius ?? this.config.semantic_stack.knn_radius_default;
      const confidenceThreshold = options?.confidence_threshold ?? this.config.query.confidence_threshold;
      const k = options?.k ?? this.config.query.default_k;

      // 1. Determine query tags
      let queryTags: TagWithCount[] = [];
      if (options?.user_input) {
        // Tag query input without auto-discovery
        queryTags = this.autoTagger.tagContent(Buffer.from(options.user_input));
      } else if (options?.custom_tags) {
        queryTags = options.custom_tags.map((t) => ({
          tag: t.startsWith("#") ? t : `#${t}`,
          count: 1,
        }));
      }

      const queryTagStrings = queryTags.map((qt) => qt.tag);

      // 2. Compute query coordinate via Chromatic Gravity (Query Mode uses mass multipliers)
      const queryCoord = computeGravity(
        queryTags,
        this.stackManager.stackMap,
        mode === "auto" ? "placement" : "query",
        this.config.semantic_stack.frequency_nudging_scale
      );

      // 3. KD-Tree radius query returns coordinate list
      const sphereCoords = this.kdTree.queryBallPoint(queryCoord, knnRadius);
      if (sphereCoords.length === 0) {
        return [];
      }

      // Convert array of coords to a Set of keys for O(1) matching
      const coordKeys = new Set<string>();
      let L_min = 101, L_max = -1;
      let a_min = 128, a_max = -129;
      let b_min = 128, b_max = -129;

      for (const [L, a, b] of sphereCoords) {
        coordKeys.add(`${L},${a},${b}`);
        L_min = Math.min(L_min, L);
        L_max = Math.max(L_max, L);
        a_min = Math.min(a_min, a);
        a_max = Math.max(a_max, a);
        b_min = Math.min(b_min, b);
        b_max = Math.max(b_max, b);
      }

      // 4. Fetch candidate nodes within the bounding box range
      const candidates = this.db.getNodesInBoundingBox(
        L_min, L_max,
        a_min, a_max,
        b_min, b_max
      );

      const filteredCandidates: Array<{ node: ChromaNode; confidence: number }> = [];

      for (let node of candidates) {
        // Verify node coordinate is inside the sphere matches (not just the box)
        const key = `${node.lab_l},${node.lab_a},${node.lab_b}`;
        if (!coordKeys.has(key)) continue;

        // Try Second Life Reset
        const resetHappened = this.chromachron.checkSecondLifeReset(node, queryTagStrings);
        if (resetHappened) {
          // Reload updated node lifecycle
          node = this.db.getNode(node.id)!;
        }

        // Compute confidence
        const confidence = this.chromachron.computeConfidence(node, queryCoord, knnRadius);
        if (confidence >= confidenceThreshold) {
          filteredCandidates.push({ node, confidence });
        }
      }

      // Sort by confidence descending
      filteredCandidates.sort((c1, c2) => c2.confidence - c1.confidence);

      // Take top K
      const topCandidates = filteredCandidates.slice(0, k);

      // Log surfacing and construct breadcrumbs
      const now = Date.now();
      const breadcrumbs: Breadcrumb[] = [];

      for (const item of topCandidates) {
        const { node, confidence } = item;
        
        // Log surfacing event: bump count, add to rolling sum
        node.surfacing_count += 1;
        node.recent_surfacing_sum += 1;
        node.updated_at = now;
        this.db.updateNodeLifecycle(node);

        // Decode content summary (first 150 characters)
        const textContent = AutoTagger.decodeContent(node.content);
        const summary = textContent.slice(0, 150);

        breadcrumbs.push({
          id: node.id,
          summary,
          tags: JSON.parse(node.tags_json),
          confidence: parseFloat(confidence.toFixed(4)),
          strength: parseFloat(node.strength.toFixed(4)),
          engagement_ratio: parseFloat((node.engagement_count / Math.max(1, node.surfacing_count)).toFixed(4)),
          state: node.state,
        });
      }

      return breadcrumbs;
    } finally {
      this.activeOperations--;
    }
  }

  public getSelectedResults(breadcrumb_ids: number[]): FullResult[] {
    this.activeOperations++;
    try {
      const now = Date.now();
      const results: FullResult[] = [];

      for (const id of breadcrumb_ids) {
        const node = this.db.getNode(id);
        if (!node) continue;

        // Log engagement: increment count, recent sum, set timestamp, and bump strength by 1.0
        node.engagement_count += 1;
        node.recent_engagement_sum += 1;
        node.last_engaged_at = now;
        node.strength += 1.0;
        node.updated_at = now;

        // State update check
        if (node.state !== "permanence") {
          if (node.state === "ascension") {
            if (node.recent_engagement_sum >= 5) {
              node.state = "permanence";
            }
          } else if (node.engagement_count >= 10) {
            node.state = "ascension";
          } else {
            node.state = "neutral"; // Return to neutral from rot/decay on engagement
          }
        }

        this.db.updateNodeLifecycle(node);

        const ratio = node.engagement_count / Math.max(1, node.surfacing_count);

        results.push({
          ...node,
          engagement_ratio: parseFloat(ratio.toFixed(4)),
        });
      }

      return results;
    } finally {
      this.activeOperations--;
    }
  }

  // --- Stack Operations ---
  public addCustomTag(tagWord: string, targetIndex?: number): SemanticAnchor {
    this.activeOperations++;
    try {
      const anchor = this.stackManager.addCustomTag(tagWord, "custom", targetIndex);
      // Reinitialize Auto-Tagger to reflect updated vocabulary Set
      this.autoTagger = new AutoTagger(
        this.stackManager.stackSet,
        this.config.semantic_stack.fuzzy_matching_enabled,
        this.config.semantic_stack.fuzzy_distance
      );
      return anchor;
    } finally {
      this.activeOperations--;
    }
  }

  public renameTag(oldWord: string, newWord: string) {
    this.activeOperations++;
    try {
      this.stackManager.renameTag(oldWord, newWord, (node, updatedTags) => {
        // Spelling correction doesn't change coordinates
        this.db.updateNodeContent(
          node.id,
          node.content,
          JSON.stringify(updatedTags),
          node.lab_l,
          node.lab_a,
          node.lab_b,
          node.content_hash
        );
      });
      // Reinitialize AutoTagger
      this.autoTagger = new AutoTagger(
        this.stackManager.stackSet,
        this.config.semantic_stack.fuzzy_matching_enabled,
        this.config.semantic_stack.fuzzy_distance
      );
    } finally {
      this.activeOperations--;
    }
  }

  public removeTag(tagWord: string): { recomputed_entries: number } {
    this.activeOperations++;
    try {
      const result = this.stackManager.removeTag(tagWord, (node, updatedTags) => {
        // Recompute coordinates since tag is gone
        const newCoord = computeGravity(
          updatedTags,
          this.stackManager.stackMap,
          "placement",
          this.config.semantic_stack.frequency_nudging_scale
        );
        this.db.updateNodeContent(
          node.id,
          node.content,
          JSON.stringify(updatedTags),
          newCoord[0],
          newCoord[1],
          newCoord[2],
          node.content_hash
        );
      });
      // Reinitialize AutoTagger
      this.autoTagger = new AutoTagger(
        this.stackManager.stackSet,
        this.config.semantic_stack.fuzzy_matching_enabled,
        this.config.semantic_stack.fuzzy_distance
      );
      return result;
    } finally {
      this.activeOperations--;
    }
  }

  public getStackInfo() {
    this.activeOperations++;
    try {
      return this.stackManager.getStackInfo();
    } finally {
      this.activeOperations--;
    }
  }

  // --- Lifecycle Operations ---
  public close() {
    this.chromachron.stop();
    this.db.close();
  }

  // For testing
  public async triggerDecayTick(): Promise<void> {
    await this.chromachron.triggerTick();
  }
}
