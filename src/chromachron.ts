// src/chromachron.ts
import { ChromaNode, LabCoordinate, Breadcrumb, ChromaCoreConfig } from "./types.ts";
import { ChromaCoreDatabase } from "./database.ts";

export class ChromaChronManager {
  private db: ChromaCoreDatabase;
  private config: ChromaCoreConfig;
  private updateIntervalMs: number;
  private operationsInFlight: () => number;
  private isProcessingTick = false;
  private timer: Timer | null = null;
  private batchSize = 100;
  private SANITY_FACTOR = 50;

  constructor(
    db: ChromaCoreDatabase,
    config: ChromaCoreConfig,
    getOperationsInFlight: () => number
  ) {
    this.db = db;
    this.config = config;
    this.operationsInFlight = getOperationsInFlight;

    // Derived update interval
    if (this.config.decay.mode === "none") {
      // Default to once per day if decay is disabled
      this.updateIntervalMs = 24 * 60 * 60 * 1000;
    } else {
      const decaySec = this.config.decay.decay_to_rot_seconds ?? 30 * 24 * 3600;
      this.updateIntervalMs = (decaySec * 1000) / this.SANITY_FACTOR;
    }
  }

  public start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.triggerTick();
    }, this.updateIntervalMs);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Allow manual tick triggering for tests
  public async triggerTick(): Promise<void> {
    if (this.isProcessingTick) return;
    this.isProcessingTick = true;

    try {
      const totalNodes = this.db.getNodeCount();
      let offset = 0;

      while (offset < totalNodes) {
        // Idle detection: if operations are in flight, yield and wait
        if (this.operationsInFlight() > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }

        // Paginate from SQLite — never load full table into RAM
        const batch = this.db.getNodesPaginated(this.batchSize, offset);
        if (batch.length === 0) break;

        const updates: any[] = [];
        const deletions: number[] = [];

        for (const node of batch) {
          const updated = this.processLifecycleTick(node);
          if (updated.state === "rot" && this.config.decay.mode !== "none") {
            deletions.push(node.id);
          } else {
            updates.push(updated);
          }
        }

        if (updates.length > 0) this.db.batchUpdateNodesLifecycle(updates);
        if (deletions.length > 0) this.db.batchDeleteNodes(deletions);

        offset += batch.length;

        // Yield so other tasks can run between batches
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) {
      console.error("Error in ChromaChron background tick:", error);
    } finally {
      this.isProcessingTick = false;
    }
  }

  private processLifecycleTick(node: ChromaNode): ChromaNode {
    const updated = { ...node };
    const now = Date.now();

    // 1. Apply false positive penalties if surfaced without engagement in this window
    // (surfaced > engaged)
    const surfacedUnengaged = node.recent_surfacing_sum - node.recent_engagement_sum;
    if (surfacedUnengaged > 0) {
      const ratio = node.engagement_count / Math.max(1, node.surfacing_count);
      const penalty = 0.05 * (1.0 - ratio) * surfacedUnengaged;
      updated.strength = Math.max(0.0, node.strength - penalty);
    }

    // 2. Apply rolling window decay (recent counters * 0.5)
    // We floor or keep as float? Keep as float or round to nearest.
    updated.recent_engagement_sum = Math.round(node.recent_engagement_sum * 0.5);
    updated.recent_surfacing_sum = Math.round(node.recent_surfacing_sum * 0.5);

    // 3. Evaluate state transition rules
    // (permanence is permanent)
    if (node.state !== "permanence") {
      if (node.state === "ascension") {
        if (updated.recent_engagement_sum >= 5) {
          updated.state = "permanence";
        }
      } else if (node.engagement_count >= 10) {
        updated.state = "ascension";
      } else if (node.surfacing_count >= 20 && node.engagement_count === 0) {
        updated.state = "rot";
      } else if (updated.strength < 0.5 && node.engagement_count === 0) {
        updated.state = "decay";
      } else {
        updated.state = "neutral";
      }
    }

    updated.updated_at = now;
    return updated;
  }

  // --- Confidence Scoring and Ranking ---
  public computeConfidence(
    node: ChromaNode,
    queryCoord: LabCoordinate,
    knnRadius: number
  ): number {
    // 1. Semantic Relevance
    const dist = Math.sqrt(
      (node.lab_l - queryCoord[0]) ** 2 +
        (node.lab_a - queryCoord[1]) ** 2 +
        (node.lab_b - queryCoord[2]) ** 2
    );
    const relevance = Math.max(0.0, 1.0 - dist / knnRadius);

    // 2. Engagement Ratio
    const engagementRatio =
      node.engagement_count / Math.max(1, node.surfacing_count);

    // 3. Strength Normalization
    const strengthNorm = Math.min(1.0, node.strength / 15.0);

    // 4. Recency Boost
    const lastActive = node.last_engaged_at || node.created_at;
    const daysSinceActive = (Date.now() - lastActive) / (24 * 3600 * 1000);
    let recency = 0.0;
    if (daysSinceActive <= 7) {
      recency = 1.0;
    } else if (daysSinceActive <= 30) {
      // Linear decay from 1.0 to 0.5
      recency = 1.0 - (daysSinceActive - 7) * (0.5 / 23);
    } else {
      recency = 0.0;
    }

    // 5. Trend Multiplier
    const recentRate =
      node.recent_engagement_sum / Math.max(1, node.recent_surfacing_sum);
    const longTermRate = engagementRatio;
    let trend = 1.0;
    if (recentRate > longTermRate * 1.1) {
      trend = 1.2;
    } else if (recentRate < longTermRate * 0.9) {
      trend = 0.8;
    }

    // Weighted sum
    const confidence =
      0.35 * relevance +
      0.30 * engagementRatio +
      0.15 * strengthNorm +
      0.10 * recency +
      0.10 * trend;

    // Clamp to [0, 1]
    return Math.max(0.0, Math.min(1.0, confidence));
  }

  // --- Second Life Reset ---
  // Triggers when a query's tags have significant overlap with a low-engagement entry.
  // "Significant" = at least half the node's tags appear in the query.
  // This fires in realistic query scenarios unlike the original exact-length match.
  public checkSecondLifeReset(node: ChromaNode, queryTags: string[]): boolean {
    const nodeTags = JSON.parse(node.tags_json) as Array<{ tag: string; count: number }>;
    if (nodeTags.length === 0 || queryTags.length === 0) return false;

    const querySet = new Set(queryTags);
    const matchCount = nodeTags.filter(t => querySet.has(t.tag)).length;
    const overlapRatio = matchCount / nodeTags.length;

    // Requires >= 50% of the node's tags to appear in the query
    if (overlapRatio >= 0.5) {
      const ratio = node.engagement_count / Math.max(1, node.surfacing_count);
      if (ratio < 0.3) {
        node.strength += 2.0;
        node.engagement_count = 1;
        node.surfacing_count = 2;
        node.state = "neutral";
        node.last_engaged_at = Date.now();
        node.updated_at = Date.now();
        this.db.updateNodeLifecycle(node);
        return true;
      }
    }
    return false;
  }
}
