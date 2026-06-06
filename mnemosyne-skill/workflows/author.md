# Mnemosyne Cortex — Author Workflow
version: 0.1

You are authoring a memory block. Your job is semantic judgment only.
All counting, byte offsets, minimap computation, and header generation
is handled programmatically by the tools. You never do math manually.

---

## WHEN TO AUTHOR

Author a memory block when:
- A conversation segment has been flagged as Committed by the query pipeline
- The user explicitly asks you to store something in memory
- You are processing a batch of accumulated conversation content during idle time

Do NOT author during active conversation. Memory is always about past content,
never the current exchange.

---

## AUTHORING SEQUENCE

### STEP 1 — Check session state
Call mg_session_status before anything else.
If in_progress is not null, resume that session or abandon it before starting new.

### STEP 2 — Create the memblok
Call mg_create with a short descriptive title.
Record the returned memblok_id. Use it for all subsequent calls.

### STEP 3 — Read the content
Read the raw content you are committing to memory.
Identify topic boundaries, key insights, decisions, code, bugs/fixes, open questions.
Do not annotate yet. Plan first.

### STEP 4 — Annotate regions
For each meaningful span:
Call mg_annotate with:
  - id: the memblok_id
  - type: a valid type from the dictionary below
  - hint: exactly two words describing the content (not the type)
  - start: short unique text where the region begins
  - end: short unique text where the region ends
  - paired: true if this is one half of a problem/solution pair

Paired regions share a 3-digit suffix with p appended.
A BUG region and its FIX region share the same suffix: BUG-001p / FIX-001p.

### STEP 5 — Add landmarks
For single critical moments call mg_landmark with:
  - id: the memblok_id
  - type: a landmark type from the dictionary
  - anchor: short unique text near the landmark

Use landmarks sparingly. One per truly critical moment.

### STEP 6 — Preview
Call mg_preview to see the computed header.
Verify the two-word hints accurately describe the content.
If anything is wrong, re-annotate and preview again.

### STEP 7 — Commit
Call mg_commit when the preview looks correct.
This finalizes the memblok and clears the in-progress session.

---

## EMOJI TYPE DICTIONARY

### DOMAIN TYPES (use in mg_annotate --type)
INSIGHT     💡  Key insight or conceptual breakthrough          weight: 3
IMPL        🔧  Implementation code, working solution           weight: 3
BUG         🐛  Bug, error, or broken behavior                  weight: 2
FIX         ✅  Resolution or fix to a prior bug                weight: 2
RISK        ⚠️  Risk, caveat, or known limitation               weight: 2
EXPERIMENT  🧪  Experimental idea or hypothesis                 weight: 2
DESIGN      📐  Architecture or structural decision             weight: 3
PLAN        📋  Plan, roadmap, or sequence of steps             weight: 1
CONVO       🗣️  Raw conversation exchange worth preserving      weight: 1
ANCHOR      📌  Named thing that recurs and matters             weight: 3
DATA        🔢  Numerical data, measurements, benchmarks        weight: 2
PREF        👤  User preference or personal fact                weight: 2
REF         🔗  External reference or citation                  weight: 1
ERROR       ❌  Mistake made and acknowledged                   weight: 1
CONCEPT     🧠  Abstract concept being defined                  weight: 3
ARTIFACT    📦  Named output — file, document, deliverable      weight: 2
CONTEXT     🌐  Background context for the session              weight: 1
DECISION    ⚡  Explicit decision made with reasoning           weight: 3

### LANDMARK TYPES (use in mg_landmark --type)
LM_LOCATION   📍  Specific location in reasoning or narrative
LM_CONCLUSION 🏁  Conclusion or summary point
LM_KEY        🔑  Single most important statement in a region
LM_QUESTION   ❓  Open question left unresolved
LM_QUOTE      💬  Direct quote worth preserving verbatim
LM_REVISION   🔄  Point where something was revised

---

## SEMANTIC JUDGMENT GUIDE

INSIGHT over CONCEPT — if it changes how you'd approach a problem
DECISION over PLAN — if a choice was made between alternatives
ANCHOR over CONTEXT — if the named thing will be referenced again
LM_KEY — the one sentence that, if lost, loses the whole region's point

When unsure: call mg_validate_type or mg_list_types.

---

## MINIMAP GRADIENT REFERENCE
· empty  ░ very low  ▒ low  ▓ medium  █ high  ◉ dense
100 characters total. Computed automatically at mg_commit. Each = 1% of file.
