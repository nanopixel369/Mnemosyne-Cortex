# ChromaCore v3.0 — Corrected Master Specification

**A Deterministic Semantic Memory Database**

Status: Implementation-Ready Specification (Prototype Phase)
Version: 3.0.0 (supersedes v2.0)
Runtime: Bun (Anthropic) ≥ 1.3
Language: TypeScript ≥ 6.0 (TypeScript 7.0 ready)
Storage: SQLite via `bun:sqlite`
License: MIT

---

## Document Purpose

This specification replaces ChromaCore v2.0. It corrects architectural errors in the prior spec and reflects the system as it should actually be built. Key corrections from v2.0:

- The semantic stack is loaded into RAM as a HashMap at startup. SQLite is never queried during gravity computation or tag matching.
- Spatial queries use an in-memory KD-Tree built from the discrete CIELAB coordinate space, not SQLite spatial queries.
- The semantic stack and user entries live in separate SQLite tables. The `is_stack_anchor` discriminator is removed entirely.
- Custom tags are permanent the moment they are created. Session-scoped tags are removed entirely.
- All L\*a\*b\* coordinates are stored as integers, not floating-point.
- The plugin system is removed from v1. What were called "plugins" are now internal configurable behaviors.
- The Chroma Packer/Backpack system is deferred to a later version.
- The auto-tagger has a single canonical implementation, not three variants.
- ChromaChron decay is fully optional and configured at database creation time. Update frequency is mathematically derived from the configured decay rate.
- The KD-Tree (`kdtree_cielab.bin`) is a ChromaCore installation artifact, not a per-database artifact. One copy serves all databases. Never rebuilt, never per-session, never included in database files.
- The Halton sequence (`halton_10k.json`) is a bootstrap-only artifact. It is not loaded at startup of existing databases and is never kept in RAM during normal operation.

This is a prototype specification. The system is experimental — there is no prior art for this architecture. Implementation will be iterative with architectural review at feature milestones.

---

## 1. What ChromaCore Is

ChromaCore is a deterministic semantic storage engine that replaces vector embeddings with discrete color-space coordinates. It maps text content to positions in the CIELAB color space using gravitational physics over a fixed vocabulary, then retrieves related content through spatial proximity queries computed entirely in RAM. No GPU, no embedding model, no neural inference, no approximation.

**Core guarantee:** The same input text, processed against the same Semantic Stack, always produces the same L\*a\*b\* coordinate. Determinism is the architectural invariant.

**What it replaces:** Vector databases (Pinecone, Weaviate, Chroma, Qdrant) and RAG embedding pipelines for use cases involving content of 50+ words where explicit semantic vocabulary captures the relevant meaning.

**What it is not:** ChromaCore is not an application. It is a database layer — analogous to SQLite or LevelDB. Applications (like Mnemosyne Cortex) are built on top of it.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
│            (Mnemosyne Cortex, your app, etc.)           │
├─────────────────────────────────────────────────────────┤
│                    ChromaCore SDK                        │
│                  (Public API surface)                    │
├─────────────────────────────────────────────────────────┤
│                  In-Memory Runtime                       │
│                                                           │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │ Semantic Stack  │    │     KD-Tree Spatial Index   │ │
│  │    HashMap      │    │   (6.6M discrete CIELAB     │ │
│  │  (10K anchors)  │    │     coordinates, static)    │ │
│  └─────────────────┘    └─────────────────────────────┘ │
│           │                          │                    │
│           ▼                          ▼                    │
│  ┌─────────────────────────────────────────────────────┐ │
│  │   Pure Computation Layer                             │ │
│  │   Auto-Tagger · Chromatic Gravity · ChromaChron     │ │
│  └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                    Storage Layer                         │
│                 SQLite via bun:sqlite                    │
│                                                           │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │semantic_stack │  │ chroma_nodes │  │ custom_tags  │  │
│  └───────────────┘  └──────────────┘  └──────────────┘  │
│  ┌───────────────┐                                       │
│  │    config     │                                       │
│  └───────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

**Critical architectural rule:** SQLite is touched only at the boundaries — initial load, write operations, and final content retrieval. All semantic matching, gravity computation, and spatial neighborhood queries happen entirely in RAM. SQLite is the persistent store; RAM is the working space.

---

## 3. Technology Stack

### 3.1 Runtime: Bun

ChromaCore targets Bun (Anthropic-owned, MIT-licensed) as its runtime. Key properties:

- `bun:sqlite` is native, synchronous, and 3-6x faster than `better-sqlite3`
- Bun powers Claude Code and the broader AI coding ecosystem
- `bun build --compile` produces a single self-contained executable
- ~5ms startup, native syscalls, low memory footprint

### 3.2 Language: TypeScript

TypeScript ≥ 6.0, designed for TypeScript 7.0 (Go-based compiler) compatibility:

- Target ES2022 or later
- `moduleResolution: "bundler"`
- Strict mode enabled
- ESM imports with `.ts` extensions
- No AMD/UMD/SystemJS module formats

### 3.3 Future: Rust Port

The TypeScript implementation is the primary target. A future Rust port is anticipated for performance-critical deployments and to enable bindings for other language ecosystems (Python, Go, etc.) via FFI. The architecture keeps all core algorithms as pure functions operating on simple data structures specifically to make this port mechanical rather than architectural.

---

## 4. CIELAB Color Space — Discrete Integer Coordinates

### 4.1 Coordinate Bounds

ChromaCore uses CIELAB as a mathematical coordinate system, not a perceptual color model. All coordinates are integers within these bounds:

- **L\*** (Lightness): 0 to 100 inclusive — 101 discrete values
- **a\*** (Green–Red axis): -128 to 127 inclusive — 256 discrete values
- **b\*** (Blue–Yellow axis): -128 to 127 inclusive — 256 discrete values

Total discrete coordinate count: **101 × 256 × 256 = 6,619,136 positions**

Floating-point gravity computations are rounded to the nearest integer before storage or KD-Tree lookup. This guarantees that two semantically identical inputs always map to the exact same discrete coordinate, with no floating-point drift across hardware platforms.

### 4.2 Why Integer Coordinates

The continuous CIELAB space is mathematically infinite. The discrete integer space is finite, indexable, and deterministic. Two identical gravity computations on different hardware must produce identical results to byte equality — integer rounding enforces this. Floating-point arithmetic on different CPUs can drift in the lowest bits, breaking determinism.

The cost is acceptable precision loss. The semantic resolution of 6.6 million positions far exceeds what 10,000 anchor tags can meaningfully distinguish.

### 4.3 The Shape of ChromaCore's Color Space

Real CIELAB color space is a teardrop or irregular solid bounded by human vision limits. ChromaCore uses the full rectangular bounding box of all integer combinations, including combinations that wouldn't correspond to physically visible colors. This is correct for the system's purposes — ChromaCore performs spatial math on a coordinate system, not color rendering.

---

## 5. Semantic Stack

### 5.1 Concept

The Semantic Stack is ChromaCore's fixed vocabulary — 10,000 tag-words, each assigned to a unique L\*a\*b\* coordinate. It is the coordinate system that makes determinism possible.

### 5.2 Storage Locations

The semantic stack exists in three places during runtime:

**On disk — bootstrap only (`halton_10k.json` and preset file):**
These files are used **exactly once** at first-ever database creation. `halton_10k.json` provides the 10,000 L\*a\*b\* integer coordinates with zone and base mass values. The preset file provides the ordered word list for the chosen domain. Together they populate the `semantic_stack` table. After bootstrap, neither file is ever read again for this database. They are not loaded at startup of an existing database. They are not kept in RAM during normal operation.

**In the database (`semantic_stack` table):**
The persistent canonical source after database creation. The database is fully self-contained — it does not depend on `halton_10k.json` or preset files after creation. Modified only when custom tags are added or when the stack itself is updated.

**In RAM (HashMap):**
Loaded at startup from the `semantic_stack` table. The runtime structure used by the Auto-Tagger and Chromatic Gravity. Never persisted directly — it is a derived view of the database table.

### 5.3 Halton Sequence — Bootstrap Only

The 10,000 anchor positions are pre-computed using a Halton low-discrepancy sequence over bases 2, 3, 5. The sequence is generated once globally, shipped as `halton_10k.json`, and used only at database creation to assign coordinates to preset words. The sequence itself is never recomputed.

### 5.4 Zone System

Each anchor position falls into one of three concentric zones based on Euclidean distance from center (L\*=50, a\*=0, b\*=0):

| Zone | Radius | Base Mass Range |
|------|--------|-----------------|
| Core | 0 – 86.6 | 0.6 → 1.0 |
| Mid | 86.6 – 169.7 | 1.5 → 2.5 |
| Outer | 169.7 – 186.7 | 1.0 → 1.5 |

Zone radii are computed at sequence generation time from `maxDistance ≈ 186.7` (the diagonal of the half-bounded color space cube). Base mass values are pre-computed per anchor and stored in `halton_10k.json`.

### 5.5 Paradigm Presets

Five shipped presets define the domain vocabulary mapped to the Halton positions:

| Preset | Domain | Tag Count |
|--------|--------|-----------|
| `developer` | Software engineering | ~7,000 |
| `medical` | Healthcare & medicine | ~7,500 |
| `legal` | Law & compliance | ~6,500 |
| `science` | Research & academia | ~7,000 |
| `general` | Broad vocabulary | ~8,000 |

Each preset is a JSON file containing an ordered word list. At database creation, words are paired sequentially with Halton coordinates: word[0] → halton[0], word[1] → halton[1], etc. Remaining Halton positions are reserved for custom tags.

### 5.6 Custom Tags — Permanent on Creation

When a new custom tag is created (either by application action or auto-discovery), three writes happen atomically:

1. New row inserted into `semantic_stack` table at the next available reserved Halton index
2. HashMap in RAM updated immediately with the new entry
3. Semantic Stack Set updated immediately in RAM

Custom tags are **never** session-scoped. Once written they are permanent until explicitly modified or removed by the user. There is no session lifecycle for vocabulary.

### 5.7 Semantic Stack Modification

The semantic stack is modifiable, not immutable. Three modification scenarios:

**Spelling correction:** Update `tag_word` in `semantic_stack` table, update HashMap key, update `tags_json` in affected `chroma_nodes` entries for consistency. No coordinate recomputation — the Halton index and L\*a\*b\* position are unchanged.

**Tag replacement or removal:** Query `chroma_nodes` for all entries whose `tags_json` contains the affected tag. Re-run each through the auto-tagger against the updated stack. Recompute gravity for each. Update coordinates and `tags_json` in `chroma_nodes`. ChromaChron lifecycle state is preserved throughout.

**New tag addition to reserved position:** Insert into `semantic_stack`, update HashMap. No existing entry recomputation needed.

The semantic stack protects against user content collision (user content cannot be written to the `semantic_stack` table — they are entirely separate tables) but is otherwise fully modifiable.

---

## 6. Auto-Tagger

### 6.1 Single Implementation

There is one Auto-Tagger. It uses a JavaScript `Set<string>` for O(1) exact vocabulary lookup. Fuzzy matching is an optional configuration parameter, not a separate implementation. No trie is needed — the auto-tagger performs exact token matching only, for which a Set is faster and simpler.

### 6.2 Pipeline

```
Raw Content (Buffer)
  → Decode (UTF-8, Latin-1 fallback)
  → Tokenize (regex: \b[\w]+(?:[-_][\w]+)*\b)
  → Lowercase
  → Filter (basic stop words, length < 3)
  → Match against Semantic Stack Set (in RAM, O(1) per token)
  → Optional: Custom Tag Auto-Discovery
  → Output: TagWithCount[] sorted by frequency descending
```

### 6.3 Tokenization

The regex `\b[\w]+(?:[-_][\w]+)*\b` captures:
- Simple words: `algorithm`, `database`
- Hyphenated compounds: `machine-learning`, `code-review`
- Underscored identifiers: `user_id`, `max_retries`

All tokens are lowercased before matching.

### 6.4 Stop Word Filtering

A small fixed set of ~60 English stop words is removed (articles, prepositions, pronouns, common verbs). Tokens shorter than 3 characters are also removed.

### 6.5 Stack Matching

Filtered tokens are checked against the Semantic Stack HashMap (with `#` prefix prepended). Matched tags accumulate frequency counts.

### 6.6 Fuzzy Matching (Optional)

When enabled via configuration, tokens that don't exactly match are compared against vocabulary using Levenshtein distance ≤ 2 (configurable). Significantly slower — O(V) per non-matching token. Off by default.

### 6.7 Custom Tag Auto-Discovery

During ingestion, unmatched tokens that:
1. Pass an extended stop list (~300 words, spaCy-style)
2. Are at least 4 characters long
3. Appear at frequency ≥ threshold (default 5) in the content

are promoted to permanent custom tags. The promotion writes immediately to the `semantic_stack` table and updates the in-memory HashMap.

Statistical signals to consider for v2+ enhancement: contextual diversity (number of distinct neighbor windows the token appears in) and burst detection (frequency outlier against rolling baseline). These improve detection of semantically central but rare terms. Not required for v1.

### 6.8 Output Type

```typescript
interface TagWithCount {
  tag: string;   // e.g., "#algorithm"
  count: number; // occurrence frequency in the content
}
```

Sorted by count descending. A typical 2,000-word document produces 40–200 matched tags.

---

## 7. Chromatic Gravity

### 7.1 Concept

Chromatic Gravity converts a set of weighted tags into a single L\*a\*b\* coordinate. Each tag is a gravitational body in color space with mass = (base mass from zone) + (logarithmic frequency nudge). The output is the iterative center of mass.

### 7.2 Frequency-to-Mass Nudge

```
nudge = min(1.0, ln(1 + count) / ln(1 + scale))
```

Default scale: 1000.0. Adjusted mass = base_mass + nudge.

### 7.3 Iterative Center-of-Mass Algorithm

```
1. Gather matched anchors with adjusted masses (all values from HashMap)
2. Initial COM = arithmetic mean of anchor coordinates
3. For 3 iterations (or until convergence < 0.01):
   a. For each anchor:
      weight[i] = adjusted_mass[i] / (ε + distance(anchor[i], COM)²)
   b. total_weight = Σ weight[i]
   c. new_COM = Σ (weight[i] × anchor[i].coord) / total_weight
   d. If distance(COM, new_COM) < 0.01: break
   e. COM = new_COM
4. Round each component to nearest integer
5. Clamp to bounds: L*∈[0,100], a*∈[-128,127], b*∈[-128,127]
6. Return integer L*a*b* coordinate
```

ε = 0.001 prevents division by zero.

### 7.4 Placement Mode vs Query Mode

**Placement mode** (storing content): Uses adjusted masses directly. No multiplier.

**Query mode** (searching): For manual queries with few tags, a mass multiplier tightens focus:
- ≤ 8 tags: multiplier = 2.0
- 8–20 tags: linear decay from 2.0 to 1.0
- \> 20 tags: multiplier = 1.0

Auto query mode always uses 1.0 — the auto-tagger produces enough tags that boosting would over-concentrate.

### 7.5 Default Coordinate

If no tags match (empty input, all stop words, unrecognized language), default coordinate is `[50, 0, 0]` — the center of color space. Entries at this position are semantically unclassified and can be flagged by the application layer.

### 7.6 RAM-Only Computation

Gravity computation never touches SQLite. All anchor positions and masses come from the in-memory HashMap. The output coordinate is held in RAM until either:
- A user entry is being stored (then written to `chroma_nodes`)
- A query is being executed (then passed to KD-Tree for neighborhood lookup)

---

## 8. KD-Tree Spatial Index

### 8.1 Purpose

The KD-Tree provides fast in-memory radius queries against the discrete CIELAB coordinate space. Given a center coordinate and radius, it returns the list of all integer L\*a\*b\* positions within that sphere.

### 8.2 Critical Property

The KD-Tree indexes the **discrete CIELAB coordinate space itself** — all 6,619,136 integer positions. It does NOT index user entries. It does NOT index semantic stack anchors. It indexes coordinate space geometry only.

This means:
- The KD-Tree is built once at startup and never modified
- Adding or removing entries from `chroma_nodes` does not affect the KD-Tree
- The KD-Tree has no knowledge of what is stored where — only that coordinates exist

### 8.3 Pre-Built ChromaCore Installation Artifact — Never Per-Database

The KD-Tree is a **pre-built artifact that ships with ChromaCore itself**, not with any individual database. There is exactly one copy per ChromaCore installation. It is generated once at the project level, committed to the repository, and distributed with the package as `kdtree_cielab.bin`.

Because the KD-Tree represents only the geometry of the discrete CIELAB coordinate space — which is mathematically fixed and universal — it is identical for every ChromaCore installation everywhere. It has nothing to do with any specific database, vocabulary, preset, or user data.

**What this means in practice:**
- Opening database A and database B uses the exact same `kdtree_cielab.bin` file
- No database file ever contains a copy of the KD-Tree
- A database file is fully self-contained for its own data but relies on the ChromaCore installation for the KD-Tree — which is always guaranteed, because you cannot run ChromaCore without ChromaCore
- The KD-Tree is never rebuilt, never updated, never modified across any session or any database

**Startup behavior:**
When ChromaCore opens any database, it loads `kdtree_cielab.bin` from the ChromaCore installation directory into RAM once. It stays in RAM for the duration of the session. All spatial queries use it. When the session ends, it is released.

### 8.4 Memory Footprint

6.6M points × 3 dimensions × 4 bytes (int32) = ~80MB raw point data. Tree structure overhead adds 20-40MB. Total roughly 100-120MB resident memory.

Load time at startup: deserialization from the shipped binary file. Expected under 1 second on modern hardware.

### 8.5 Query Operation

```
queryBallPoint(center: LabCoordinate, radius: number) → LabCoordinate[]
```

Returns all integer L\*a\*b\* coordinates within Euclidean distance `radius` of `center`. Branch pruning ensures the query examines a tiny fraction of total points. Typical query latency: microseconds.

### 8.6 Query Pipeline Integration

```
1. Auto-Tagger produces TagWithCount[] from query input (RAM only)
2. Chromatic Gravity produces query coordinate (RAM only)
3. KD-Tree.queryBallPoint(query_coord, radius) returns coordinate list (RAM only)
4. SQLite query: SELECT * FROM chroma_nodes WHERE (lab_l, lab_a, lab_b) IN (list)
5. ChromaChron scoring applied to results (RAM)
6. Sort and filter (RAM)
7. Return breadcrumbs
```

Only step 4 touches SQLite. Everything else is pure RAM computation.

### 8.7 Universal Across Backpacks

Because the KD-Tree represents only the color space geometry — not any database content — it is identical for every ChromaCore installation, every backpack, every paradigm preset. A backpack export does not include the KD-Tree because the receiving installation already has it.

---

## 9. Storage Layer

### 9.1 Database Configuration

SQLite via `bun:sqlite`. Pragmas at connection time:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;  -- 64MB cache
```

### 9.2 Schema — Four Tables

**`semantic_stack` — vocabulary anchors:**

```sql
CREATE TABLE semantic_stack (
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

CREATE UNIQUE INDEX idx_stack_tag ON semantic_stack(tag_word);
```

**`chroma_nodes` — user entries only:**

```sql
CREATE TABLE chroma_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Integer coordinates
  lab_l INTEGER NOT NULL CHECK(lab_l BETWEEN 0 AND 100),
  lab_a INTEGER NOT NULL CHECK(lab_a BETWEEN -128 AND 127),
  lab_b INTEGER NOT NULL CHECK(lab_b BETWEEN -128 AND 127),
  
  -- Content
  content BLOB NOT NULL,
  tags_json TEXT NOT NULL,        -- JSON array of TagWithCount
  content_type TEXT,
  content_hash TEXT,               -- SHA-256 for optional deduplication
  
  -- ChromaChron lifecycle (nullable if decay disabled)
  strength REAL DEFAULT 0.0,
  engagement_count INTEGER DEFAULT 0,
  surfacing_count INTEGER DEFAULT 0,
  state TEXT DEFAULT 'neutral' 
    CHECK(state IN ('decay', 'neutral', 'ascension', 'permanence', 'rot')),
  last_engaged_at INTEGER,
  recent_engagement_sum INTEGER DEFAULT 0,
  recent_surfacing_sum INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_coords ON chroma_nodes(lab_l, lab_a, lab_b);
CREATE INDEX idx_state ON chroma_nodes(state);
CREATE INDEX idx_engagement ON chroma_nodes(engagement_count DESC);
CREATE INDEX idx_content_hash ON chroma_nodes(content_hash) WHERE content_hash IS NOT NULL;
```

**`config` — persistent settings:**

```sql
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**Removed from v2 schema:**
- `is_stack_anchor` field — gone (tables are separate)
- `stack_tag_word` field on chroma_nodes — gone
- `zone_mass` field on chroma_nodes — gone
- `plugins` table — gone (plugin system deferred)
- Separate `custom_tags` table — merged into `semantic_stack` with `source` field

### 9.3 Multiple Entries Per Coordinate

A single L\*a\*b\* coordinate can hold multiple `chroma_nodes` entries. Coordinate columns are not unique — the auto-increment `id` is the primary key. When a query returns rows at a given coordinate, all entries at that coordinate are returned and ChromaChron scoring determines ranking.

### 9.4 Two-Table Separation Guarantees No Collision

`semantic_stack` and `chroma_nodes` are entirely separate tables. User content can never be written into `semantic_stack` because the code paths for storing user entries only touch `chroma_nodes`. The spatial query and KD-Tree never read from `semantic_stack`. There is no possibility of confusion between vocabulary anchors and stored entries.

---

## 10. ChromaChron — Optional Lifecycle Engine

### 10.1 Three Decay Modes

At database creation, the application chooses one mode:

**No Decay:** ChromaChron still tracks engagement and surfacing counts for confidence scoring, but no entry is ever automatically deleted or rotted. Lifecycle states still transition but no consequences for `rot`. Update tick frequency: once per day or less.

**Standard Decay:** Entries weaken over time when not engaged. Can reach `rot` state and become deletion candidates. Decay rate configured as "time until unengaged entry reaches rot." Update frequency derived mathematically.

**Volatile Decay:** Rapid decay for high-velocity data (stock prices, news feeds). Decay measured in seconds or minutes. Update frequency derived accordingly, potentially sub-second.

### 10.2 Update Frequency Derivation

Update frequency is computed from the configured decay rate, not set independently:

```
update_interval = decay_to_rot_duration / SANITY_FACTOR
```

`SANITY_FACTOR` is an internal constant (initially ~50) tuned during prototyping. This guarantees enough update resolution to track decay accurately without over-ticking.

Examples:
- Decay to rot: 30 days → update interval ~14 hours
- Decay to rot: 1 hour → update interval ~72 seconds
- Decay to rot: 5 minutes → update interval ~6 seconds

The application does not configure update frequency directly. Only the decay rate is exposed.

### 10.3 Metrics Tracked Per Entry

| Field | Description |
|-------|-------------|
| `strength` | Cumulative reinforcement score, starts at 0.0 |
| `engagement_count` | Total times user/model selected this entry from results |
| `surfacing_count` | Total times this entry appeared in query results |
| `state` | Lifecycle state |
| `last_engaged_at` | Timestamp of most recent engagement |
| `recent_engagement_sum` | Engagements in current rolling window |
| `recent_surfacing_sum` | Surfacings in current rolling window |

### 10.4 Engagement Ratio

```
engagement_ratio = engagement_count / max(1, surfacing_count)
```

Clamped to [0.0, 1.0].

### 10.5 Confidence Scoring

Because the KD-Tree radius query pre-filters all candidates to within `knn_radius` of the query coordinate, semantic relevance is normalized against the search radius — not the full color space diagonal. An entry at the exact query coordinate scores 1.0. An entry at the edge of the search radius scores 0.0. This is a pure RAM computation using the distance already computed during candidate retrieval — no additional database access needed.

Five components weighted:

| Component | Weight | Signal |
|-----------|--------|--------|
| Semantic relevance | 35% | 1.0 − (distance / knn_radius) |
| Engagement ratio | 30% | Historical selectivity |
| Strength | 15% | min(1.0, strength / 15.0) |
| Recency boost | 10% | 0–7 days: 1.0, 7–30 days: linear to 0.5, 30+ days: 0.0 |
| Trend multiplier | 10% | Recent rate vs long-term: up = 1.2, down = 0.8, stable = 1.0 |

```
confidence = 0.35 × relevance + 0.30 × engagement_ratio
           + 0.15 × strength_norm + 0.10 × recency + 0.10 × trend
```

Clamped to [0.0, 1.0]. Entries below `confidence_threshold` (default 0.4) are filtered.

### 10.6 Lifecycle States

```
              ┌──────────┐
         ┌───→│  neutral │←──── (default on creation)
         │    └────┬─────┘
         │         │
         │    ┌────▼─────┐        ┌─────────────┐
         │    │ ascension│───────→│ permanence  │
         │    └────┬─────┘        └─────────────┘
         │         │                (never deleted)
         │    ┌────▼─────┐
         │    │  decay   │
         │    └────┬─────┘
         │         │
         │    ┌────▼─────┐
         └────│   rot    │───→ (candidate for deletion)
              └──────────┘
```

| To State | Condition |
|----------|-----------|
| `ascension` | `engagement_count ≥ 10` |
| `permanence` | `ascension` + `recent_engagement_sum ≥ 5` |
| `decay` | `strength < 0.5` AND `engagement_count = 0` |
| `rot` | `surfacing_count ≥ 20` AND `engagement_count = 0` |
| `neutral` | Default / none of the above |

`rot` only triggers deletion in Standard or Volatile decay modes. In No Decay mode, entries can reach `rot` state but are never automatically deleted — the application can query for rotted entries and decide what to do.

### 10.7 False Positive Penalty

When surfaced but not engaged:

```
penalty = 0.05 × (1.0 − engagement_ratio)
new_strength = max(0.0, strength − penalty)
```

### 10.8 Second Life Reset

Direct query with exact tags matching a low-engagement entry (ratio < 0.3) triggers:

```
strength += 2.0
engagement_count = 1
surfacing_count = 2
```

### 10.9 Background Update Tick — Idle-Aware Batching

The tick runs at the derived update interval but is idle-aware — it only executes when the system is not actively processing queries or ingesting content. It processes in configurable batch sizes and yields immediately if load increases.

**Idle detection:** Before starting a batch, the tick checks whether any operations are in flight. If yes, it defers and checks again after a short wait. If no, it proceeds with the next batch.

**Batch processing:** Entries are processed in batches within a single SQLite transaction per batch. This is dramatically more efficient than per-entry reads and writes. A single  with computed values replaces thousands of individual operations.

**Cycle completion:** After each batch completes, if the system is still idle, the next batch begins immediately. If not, it waits for the next idle window. A full tick cycle (all entries evaluated) may span multiple idle windows — this is correct behavior.

For each entry in a batch:
1. Evaluate state transition rules
2. Apply rolling window decay (recent counters × 0.5)
3. Update state if changed
4. Apply false positive penalties if surfaced without engagement

In No Decay mode, the tick still runs for engagement tracking but skips the `rot`-deletion step.

---

## 11. Two-Phase Query System

### 11.1 Phase 1 — Breadcrumbs

```typescript
query(options?: {
  user_input?: string;
  query_mode?: 'auto' | 'manual';
  custom_tags?: string[];
  k?: number;                     // default 10
  knn_radius?: number;            // default 5.0
  confidence_threshold?: number;  // default 0.4
}): Breadcrumb[]
```

**Pipeline:**

1. Determine query tags (from user_input via auto-tagger, or explicit custom_tags)
2. Compute query coordinate via Chromatic Gravity (RAM)
3. KD-Tree radius query returns coordinate list (RAM)
4. SQLite query: fetch entries at those coordinates
5. Compute confidence score per candidate (RAM)
6. Filter by confidence_threshold
7. Sort by final_confidence descending
8. Take top k
9. Log surfacing event per returned breadcrumb
10. Return breadcrumbs

```typescript
interface Breadcrumb {
  id: number;
  summary: string;           // first 150 chars of content
  tags: TagWithCount[];
  confidence: number;
  strength: number;
  engagement_ratio: number;
  state: string;
}
```

### 11.2 Phase 2 — Full Retrieval

```typescript
getSelectedResults(breadcrumb_ids: number[]): FullResult[]
```

Returns full ChromaNode rows including content blob. Each selection logs an engagement event, incrementing engagement_count and strength.

---

## 12. SDK Public API

### 12.1 Constructor

```typescript
// Opening an existing database
const core = new ChromaCore(
  dbPath: string,
  config?: Partial<ChromaCoreConfig>
);

// Creating a new database (bootstrap)
ChromaCore.create(
  dbPath: string,
  haltonPath: string,
  presetPath: string,
  config?: Partial<ChromaCoreConfig>
): ChromaCore
```

Opening an existing database requires only the database path. The `halton_10k.json` and preset files are not consulted — the database is fully self-contained.

Creating a new database uses the static `create()` method which explicitly requires the bootstrap files. This makes the distinction clear at the call site: bootstrap files are only provided when intentionally creating a new database from scratch.

### 12.2 Storage Operations

```typescript
storeEntry(content: Buffer, options?: {
  content_type?: string;
  deduplicate?: boolean;
}): number  // returns entry ID

batchStoreEntries(entries: Array<{
  content: Buffer;
  content_type?: string;
}>): number[]

getEntry(entryId: number): ChromaNode | null

updateEntryContent(entryId: number, newContent: Buffer): ChangeReport

deleteEntry(entryId: number): boolean
```

### 12.3 Query Operations

```typescript
query(options?): Breadcrumb[]
getSelectedResults(breadcrumb_ids: number[]): FullResult[]
```

### 12.4 Semantic Stack Operations

```typescript
addCustomTag(tagWord: string, targetIndex?: number): SemanticAnchor
removeTag(tagWord: string): { recomputed_entries: number }
renameTag(oldWord: string, newWord: string): void
getStackInfo(): { total_tags: number, preset: string, custom_count: number }
```

### 12.5 Lifecycle

```typescript
close(): void
```

### 12.6 Internal Behaviors (Not Plugins)

The following are implemented as internal functions and parameters, not as a plugin system:

- Content normalization before tagging — built into the ingestion pipeline
- Confidence score adjustment based on application context — implemented as a callback option in `query()`
- Query input transformation — implemented as a callback option in `query()`

These are designed to be exposed as API endpoints in future versions when the actual extensibility needs are known from real application building. For v1, they exist as configurable internal behavior only.

---

---

## 13. Startup Sequence

No external access to ChromaCore is permitted until the startup sequence completes successfully. The sequence is strictly ordered:

1. **Open SQLite connection** — set WAL mode and other pragmas
2. **Load semantic stack** — read entire `semantic_stack` table inside a `BEGIN IMMEDIATE` transaction for a consistent snapshot, build in-memory `Set<string>` vocabulary and HashMap of tag → anchor data. Release transaction.
3. **Load KD-Tree** — deserialize `kdtree_cielab.bin` from ChromaCore installation directory into RAM
4. **Load configuration** — read `config` table, merge with provided overrides
5. **Initialize ChromaChron** — configure decay mode and derive update interval from decay rate
6. **Mark ready** — only now does the SDK expose its public API surface

If any step fails, ChromaCore throws before reaching ready state. The application layer receives the error and no partial state is exposed.

---

## 14. Configuration

```typescript
interface ChromaCoreConfig {
  core: {
    environment: 'development' | 'production';
    log_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  };
  storage: {
    db_path: string;
    cache_size_mb: number;     // default 64
  };
  semantic_stack: {
    preset: string;
    knn_radius_default: number; // default 5.0
    frequency_nudging_scale: number; // default 1000.0
    fuzzy_matching_enabled: boolean; // default false
    fuzzy_distance: number;     // default 2
    custom_tag_threshold: number; // default 5
  };
  decay: {
    mode: 'none' | 'standard' | 'volatile';
    decay_to_rot_seconds?: number; // required if mode != 'none'
  };
  query: {
    default_k: number;          // default 10
    max_knn_radius: number;     // default 20.0
    confidence_threshold: number; // default 0.4
  };
}
```

Configuration is loaded at initialization, persisted in the `config` table, and merged with provided overrides (overrides win).

---

## 15. Determinism Contract

The following invariants must hold absolutely:

1. **Same content + same semantic stack → same integer L\*a\*b\* coordinate**, every time, on every platform, byte-equivalent.

2. **Halton sequence reproducibility:** Index N always produces the same (x, y, z) triple. The shipped `halton_10k.json` is the canonical artifact.

3. **Auto-tagger output stability:** Same content produces same tag list in same order with same counts. Sort is by count descending, with stable secondary sort by tag string ascending for ties.

4. **Gravity convergence:** Three iterations maximum, convergence threshold 0.01, integer rounding at the end. Floating-point comparisons during iteration must use the same epsilon on all platforms.

5. **KD-Tree determinism:** Query results are returned in a stable order (by coordinate distance ascending, then by L\*, a\*, b\* ascending for ties).

These invariants are enforced through test vectors. Any change to the implementation that breaks a test vector is a determinism violation and must be reverted unless the test vector itself is updated as part of an intentional semantic change.

---

## 16. What v1 Does Not Include

Explicitly deferred to later versions:

- **Plugin system:** Internal behaviors are configurable functions, not pluggable. External plugin architecture comes after real application experience reveals what needs to be exposed.
- **Chroma Packer / Backpack export/import:** Cannot pack what isn't tested. Deferred until core is validated.
- **PubSub / Honker integration:** External extension, deferred.
- **Predictive pre-filtering, batch distillation, cross-instance federation:** All deferred.
- **Multiple paradigm presets active simultaneously:** v1 supports one preset per database.
- **Rust port:** v1 is TypeScript only.
- **Multimodal embeddings:** Text only for v1.

---

## 17. Implementation Sequence

Recommended order for building v1:

1. **Pre-build artifacts** (one-time project setup, committed to repo):
   - Halton sequence generation utility → `halton_10k.json`
   - KD-Tree generation utility over all 6.6M discrete CIELAB coordinates → `kdtree_cielab.bin`
2. **Preset files** for at least `developer` and `general`
3. **Bootstrap** — first-time database creation: load Halton + preset, populate `semantic_stack` table, create empty `chroma_nodes`
4. **Startup load** — read `semantic_stack` into HashMap, deserialize `kdtree_cielab.bin` into memory
5. **Auto-tagger** — Set construction from semantic_stack HashMap, tokenization, stop word filter, matching
6. **Chromatic Gravity** — iterative center-of-mass, integer rounding
7. **storeEntry** — full ingestion pipeline producing `chroma_nodes` row
8. **Query Phase 1** — gravity → KD-Tree → SQLite fetch → confidence scoring → breadcrumbs
9. **Query Phase 2** — full retrieval with engagement logging
10. **ChromaChron** — engagement tracking, state transitions, background tick (no-decay mode first)
11. **Standard and Volatile decay modes** — full lifecycle including rot deletion
12. **Custom tag operations** — add, remove, rename, with affected entry recomputation
13. **Custom tag auto-discovery** — during ingestion

Each milestone is a working checkpoint where architectural review with the human collaborator is expected before proceeding.

---

## 18. Testing Approach

Per CLAUDE.md conventions:

- All deterministic functions have frozen test vector files in `test-vectors/`
- The `test-author` agent writes vectors before the implementer agent writes code
- The `determinism-verifier` agent runs vectors as a fast check
- The `validator` agent reviews completed work with fresh context
- Critical algorithms (Halton, gravity, zone math) get the strictest vector coverage
- Integration tests verify the full ingestion → query → retrieval flow against stored expected outputs

---

## Appendix A: Type Definitions (Provisional)

```typescript
type LabCoordinate = [number, number, number]; // all integers

interface HaltonEntry {
  index: number;
  lab_l: number;
  lab_a: number;
  lab_b: number;
  base_mass: number;
  zone: 'core' | 'mid' | 'outer';
}

interface SemanticAnchor {
  halton_index: number;
  tag_word: string;
  lab_l: number;
  lab_a: number;
  lab_b: number;
  base_mass: number;
  zone: 'core' | 'mid' | 'outer';
  source: 'preset' | 'custom' | 'auto_discovered';
}

interface TagWithCount {
  tag: string;
  count: number;
}

interface ChromaNode {
  id: number;
  lab_l: number;
  lab_a: number;
  lab_b: number;
  content: Buffer;
  tags_json: string;
  content_type?: string;
  content_hash?: string;
  strength: number;
  engagement_count: number;
  surfacing_count: number;
  state: 'decay' | 'neutral' | 'ascension' | 'permanence' | 'rot';
  last_engaged_at?: number;
  recent_engagement_sum: number;
  recent_surfacing_sum: number;
  created_at: number;
  updated_at: number;
}

interface Breadcrumb {
  id: number;
  summary: string;
  tags: TagWithCount[];
  confidence: number;
  strength: number;
  engagement_ratio: number;
  state: string;
}

interface FullResult extends ChromaNode {
  engagement_ratio: number;
}

interface ChangeReport {
  entry_id: number;
  old_tags: TagWithCount[];
  new_tags: TagWithCount[];
  old_coordinates: LabCoordinate;
  new_coordinates: LabCoordinate;
  coordinate_changed: boolean;
}
```

---

## Appendix B: File Manifest (Provisional)

| File | Purpose | Layer |
|------|---------|-------|
| `index.ts` | SDK entry point, public API | SDK |
| `types.ts` | All TypeScript type definitions | Shared |
| `halton.ts` | Halton sequence generation, CIELAB integer mapping, zones | Processing |
| `stack.ts` | Semantic stack HashMap, custom tag management | Processing |
| `autotagger.ts` | Auto-tagger pipeline with Set-based vocabulary lookup | Processing |
| `gravity.ts` | Chromatic gravity iterative center-of-mass | Processing |
| `kdtree.ts` | In-memory KD-Tree of discrete CIELAB space | Processing |
| `chromachron.ts` | Lifecycle scoring, state transitions, decay tick | Processing |
| `database.ts` | SQLite schema, CRUD operations | Storage |
| `bootstrap.ts` | First-time database creation from Halton + preset | Storage |
| `halton_10k.json` | Precomputed Halton coordinates (shipped artifact) | Data |
| `kdtree_cielab.bin` | Precomputed KD-Tree of all 6.6M discrete CIELAB coordinates (shipped artifact) | Data |
| `presets/developer.json` | Developer paradigm preset word list | Data |
| `presets/general.json` | General paradigm preset word list | Data |
| `package.json` | Package metadata, Bun scripts | Config |
| `tsconfig.json` | TypeScript compiler configuration | Config |

---

*ChromaCore v3.0 — Corrected Specification, May 2026*
*Runtime: Bun · Language: TypeScript 6.0+ · Storage: SQLite*
*Deterministic semantic memory. No embeddings. No GPU. No approximation. No drift.*
