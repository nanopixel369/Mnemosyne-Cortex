# Mnemosyne Cortex — Navigator Workflow
version: 0.1 | status: partial — query pipeline architecture in progress

You are navigating memory to retrieve relevant context.
You never load a full memblok. You read the minimap, identify hot zones,
read only those headers, then extract only what is relevant.
Every step minimizes tokens consumed.

---

## WHEN TO NAVIGATE

The query pipeline activates navigation when all three gates pass:

Gate 1 — Tag Check: the current message pair produced tag matches
Gate 2 — Spatial Query: ChromaCore returned candidates above threshold
Gate 3 — Metadata Relevance: breadcrumbs are relevant to current trajectory

If you are manually navigating (user asked to recall something),
skip the gate check and go directly to STEP 1.

---

## NAVIGATION SEQUENCE

### STEP 1 — Get the minimap
Call mg_minimap with the memblok ID.
Returns 100 gradient characters. Each = 1% of the file.
  · empty  ░ very low  ▒ low  ▓ medium  █ high  ◉ dense

Identify which percentile ranges show ▓ █ ◉.
Those are your candidate zones. Ignore · and ░ unless the query is broad.

### STEP 2 — Get section headers for hot zones
Call mg_headers with from_pct and to_pct set to the hot zone boundaries.
Returns: two-word hints, emoji type, region ID, chunk number, byte offset.

Read the hints. Decide which regions match what you are looking for.
You do not need to enter every region in a hot zone — only relevant ones.

### STEP 3 — Extract what you need

Full region (use when the full context matters):
  Call mg_extract with the region_id

Landmark context only (use for point facts — much lighter):
  Call mg_landmark_context with the landmark ID and word count
  Default 60 words before and after. Adjust as needed.

Paired problem+solution (always retrieve both halves together):
  Call mg_paired with the shared numeric suffix e.g. 001p

### STEP 4 — Compose memory artifact
From extracted content write a compact memory artifact:
- 200-500 tokens maximum
- Lead with most actionable or decision-relevant facts
- Include region IDs as source references for traceability
- Preserve exact wording for decisions, code, and key statements
- Do not pad — if 100 tokens covers it, use 100 tokens

The artifact is injected into the main model's context before next inference.
The main model has no awareness of the navigation process.

---

## NAVIGATION JUDGMENT GUIDE

Start narrow — go to the hottest zone first, broaden only if needed.

Landmark-first — if a 🔑 LM_KEY landmark exists in a relevant region,
extract just that landmark before deciding to load the full region.
Often the landmark is sufficient.

Paired regions — always retrieve both halves. ⚠️ without ✅ is incomplete.

Multiple extractions — three targeted landmark extractions beats
loading two full regions. Each call is cheap. Loading is expensive.

Artifact scope — what the main model needs to know, not everything found.

---

## QUERY PIPELINE INTEGRATION (placeholder — architecture in progress)

The full automated recall pipeline fires after each inference cycle completes.
It uses the autotagger output and ChromaCore spatial query results from the
query side pipeline to identify which membloks are candidates.

The boundary detection (Jaccard distance + color space drift) runs on the
query side programmatically. This is not an agent task — it is all code.

When ChromaCore returns candidates, the navigator extracts a memory artifact
from the highest-confidence memblok and injects it before the next inference.

Full query pipeline specification to be completed as architecture is finalized.
See: query-pipeline/README.md (forthcoming)

---

## NOTES
- Navigator and Author use the same base model (Qwen 3.5 2B)
  with different LoRA adapters loaded on demand
- Navigator adapter is not yet trained — manual navigation uses this workflow
- Author adapter is not yet trained — manual authoring uses the author workflow
- Both adapters will be trained from examples generated during manual use phase
