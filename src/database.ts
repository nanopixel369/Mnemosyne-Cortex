// src/database.ts
import { Database } from "bun:sqlite";
import { ChromaNode, SemanticAnchor, LabCoordinate, ChromaCoreConfig } from "./types.ts";

export class ChromaCoreDatabase {
  public db: Database;

  constructor(dbPath: string, cacheSizeMb: number = 64) {
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec(`PRAGMA cache_size = -${cacheSizeMb * 1000};`);
    
    this.initializeSchema();
  }

  private initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_stack (
        halton_index INTEGER PRIMARY KEY,
        tag_word TEXT NOT NULL UNIQUE,
        lab_l INTEGER NOT NULL CHECK(lab_l BETWEEN 0 AND 100),
        lab_a INTEGER NOT NULL CHECK(lab_a BETWEEN -128 AND 127),
        lab_b INTEGER NOT NULL CHECK(lab_b BETWEEN -128 AND 127),
        base_mass REAL NOT NULL,
        zone TEXT NOT NULL CHECK(zone IN ('core', 'mid', 'outer')),
        source TEXT NOT NULL CHECK(source IN ('preset', 'custom', 'auto_discovered')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stack_tag ON semantic_stack(tag_word);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chroma_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lab_l INTEGER NOT NULL CHECK(lab_l BETWEEN 0 AND 100),
        lab_a INTEGER NOT NULL CHECK(lab_a BETWEEN -128 AND 127),
        lab_b INTEGER NOT NULL CHECK(lab_b BETWEEN -128 AND 127),
        content BLOB NOT NULL,
        tags_json TEXT NOT NULL,
        content_type TEXT,
        content_hash TEXT,
        strength REAL DEFAULT 0.0,
        engagement_count INTEGER DEFAULT 0,
        surfacing_count INTEGER DEFAULT 0,
        state TEXT DEFAULT 'neutral' CHECK(state IN ('decay', 'neutral', 'ascension', 'permanence', 'rot')),
        last_engaged_at INTEGER,
        recent_engagement_sum INTEGER DEFAULT 0,
        recent_surfacing_sum INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_coords ON chroma_nodes(lab_l, lab_a, lab_b);
      CREATE INDEX IF NOT EXISTS idx_state ON chroma_nodes(state);
      CREATE INDEX IF NOT EXISTS idx_engagement ON chroma_nodes(engagement_count DESC);
      CREATE INDEX IF NOT EXISTS idx_content_hash ON chroma_nodes(content_hash) WHERE content_hash IS NOT NULL;
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  public close() {
    this.db.close();
  }

  // --- Config Operations ---
  public setConfig(key: string, value: string) {
    const stmt = this.db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)");
    stmt.run(key, value);
  }

  public getConfig(key: string): string | null {
    const stmt = this.db.prepare("SELECT value FROM config WHERE key = ?");
    const row = stmt.get(key) as { value: string } | null;
    return row ? row.value : null;
  }

  public getAllConfig(): Record<string, string> {
    const stmt = this.db.prepare("SELECT key, value FROM config");
    const rows = stmt.all() as Array<{ key: string; value: string }>;
    const config: Record<string, string> = {};
    for (const row of rows) {
      config[row.key] = row.value;
    }
    return config;
  }

  // --- Semantic Stack Operations ---
  public loadSemanticStack(): SemanticAnchor[] {
    const stmt = this.db.prepare("SELECT * FROM semantic_stack ORDER BY halton_index ASC");
    return stmt.all() as SemanticAnchor[];
  }

  public addStackAnchor(anchor: SemanticAnchor) {
    const stmt = this.db.prepare(`
      INSERT INTO semantic_stack (halton_index, tag_word, lab_l, lab_a, lab_b, base_mass, zone, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      anchor.halton_index,
      anchor.tag_word,
      anchor.lab_l,
      anchor.lab_a,
      anchor.lab_b,
      anchor.base_mass,
      anchor.zone,
      anchor.source,
      anchor.created_at || Date.now(),
      anchor.updated_at || Date.now()
    );
  }

  public removeStackAnchor(tagWord: string) {
    const stmt = this.db.prepare("DELETE FROM semantic_stack WHERE tag_word = ?");
    stmt.run(tagWord);
  }

  public renameStackAnchor(oldWord: string, newWord: string) {
    const stmt = this.db.prepare("UPDATE semantic_stack SET tag_word = ?, updated_at = ? WHERE tag_word = ?");
    stmt.run(newWord, Date.now(), oldWord);
  }

  // --- Chroma Nodes Operations ---
  public insertNode(node: Omit<ChromaNode, "id" | "strength" | "engagement_count" | "surfacing_count" | "state" | "last_engaged_at" | "recent_engagement_sum" | "recent_surfacing_sum">): number {
    const stmt = this.db.prepare(`
      INSERT INTO chroma_nodes (lab_l, lab_a, lab_b, content, tags_json, content_type, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      node.lab_l,
      node.lab_a,
      node.lab_b,
      node.content,
      node.tags_json,
      node.content_type || null,
      node.content_hash || null,
      node.created_at,
      node.updated_at
    );
    return result.lastInsertRowid as number;
  }

  public getNode(id: number): ChromaNode | null {
    const stmt = this.db.prepare("SELECT * FROM chroma_nodes WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      ...row,
      content: Buffer.from(row.content),
    };
  }

  public getNodeByHash(hash: string): ChromaNode | null {
    const stmt = this.db.prepare("SELECT * FROM chroma_nodes WHERE content_hash = ? LIMIT 1");
    const row = stmt.get(hash) as any;
    if (!row) return null;
    return {
      ...row,
      content: Buffer.from(row.content),
    };
  }

  public updateNodeContent(id: number, content: Buffer, tagsJson: string, L: number, a: number, b: number, contentHash?: string | null) {
    const stmt = this.db.prepare(`
      UPDATE chroma_nodes
      SET content = ?, tags_json = ?, lab_l = ?, lab_a = ?, lab_b = ?, content_hash = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(content, tagsJson, L, a, b, contentHash || null, Date.now(), id);
  }

  public deleteNode(id: number): boolean {
    const stmt = this.db.prepare("DELETE FROM chroma_nodes WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  public getNodesInBoundingBox(L_min: number, L_max: number, a_min: number, a_max: number, b_min: number, b_max: number): ChromaNode[] {
    const stmt = this.db.prepare(`
      SELECT * FROM chroma_nodes
      WHERE lab_l BETWEEN ? AND ?
        AND lab_a BETWEEN ? AND ?
        AND lab_b BETWEEN ? AND ?
    `);
    const rows = stmt.all(L_min, L_max, a_min, a_max, b_min, b_max) as any[];
    return rows.map(row => ({
      ...row,
      content: Buffer.from(row.content),
    }));
  }

  public getNodesByState(state: string): ChromaNode[] {
    const stmt = this.db.prepare("SELECT * FROM chroma_nodes WHERE state = ?");
    const rows = stmt.all(state) as any[];
    return rows.map(row => ({
      ...row,
      content: Buffer.from(row.content),
    }));
  }

  public updateNodeLifecycle(node: Pick<ChromaNode, "id" | "strength" | "engagement_count" | "surfacing_count" | "state" | "last_engaged_at" | "recent_engagement_sum" | "recent_surfacing_sum" | "updated_at">) {
    const stmt = this.db.prepare(`
      UPDATE chroma_nodes
      SET strength = ?, engagement_count = ?, surfacing_count = ?, state = ?, last_engaged_at = ?, recent_engagement_sum = ?, recent_surfacing_sum = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      node.strength,
      node.engagement_count,
      node.surfacing_count,
      node.state,
      node.last_engaged_at || null,
      node.recent_engagement_sum,
      node.recent_surfacing_sum,
      node.updated_at,
      node.id
    );
  }

  public batchUpdateNodesLifecycle(nodes: Array<Pick<ChromaNode, "id" | "strength" | "engagement_count" | "surfacing_count" | "state" | "last_engaged_at" | "recent_engagement_sum" | "recent_surfacing_sum" | "updated_at">>) {
    const updateTransaction = this.db.transaction((items) => {
      const stmt = this.db.prepare(`
        UPDATE chroma_nodes
        SET strength = ?, engagement_count = ?, surfacing_count = ?, state = ?, last_engaged_at = ?, recent_engagement_sum = ?, recent_surfacing_sum = ?, updated_at = ?
        WHERE id = ?
      `);
      for (const item of items) {
        stmt.run(
          item.strength,
          item.engagement_count,
          item.surfacing_count,
          item.state,
          item.last_engaged_at || null,
          item.recent_engagement_sum,
          item.recent_surfacing_sum,
          item.updated_at,
          item.id
        );
      }
    });
    updateTransaction(nodes);
  }

  public batchDeleteNodes(ids: number[]) {
    const deleteTransaction = this.db.transaction((items) => {
      const stmt = this.db.prepare("DELETE FROM chroma_nodes WHERE id = ?");
      for (const id of items) {
        stmt.run(id);
      }
    });
    deleteTransaction(ids);
  }

  public getAllNodes(): ChromaNode[] {
    const stmt = this.db.prepare("SELECT * FROM chroma_nodes");
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      ...row,
      content: Buffer.from(row.content),
    }));
  }

  // Paginated version — use this for large-scale operations to avoid full table RAM load
  public getNodesPaginated(limit: number, offset: number): ChromaNode[] {
    const stmt = this.db.prepare("SELECT * FROM chroma_nodes LIMIT ? OFFSET ?");
    const rows = stmt.all(limit, offset) as any[];
    return rows.map(row => ({
      ...row,
      content: Buffer.from(row.content),
    }));
  }

  public getNodeCount(): number {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM chroma_nodes");
    const row = stmt.get() as { count: number };
    return row.count;
  }

  public getNodesByTagWord(tagWord: string): ChromaNode[] {
    // SQLite JSON search — finds nodes whose tags_json contains the tag word
    const stmt = this.db.prepare(
      "SELECT * FROM chroma_nodes WHERE tags_json LIKE ?"
    );
    const rows = stmt.all(`%"${tagWord}"%`) as any[];
    return rows.map(row => ({
      ...row,
      content: Buffer.from(row.content),
    }));
  }
}
