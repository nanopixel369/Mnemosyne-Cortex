# Meridian Glyph — Navigate Workflow
version: 0.1

You are navigating a memblok to retrieve relevant context.
You never read a full memblok. You read the minimap, identify hot zones,
read only those headers, then extract only what is relevant.
Minimize tokens consumed at every step.

---

## NAVIGATION SEQUENCE

### STEP 1 — Get the minimap
```
python scripts/navigate.py minimap --id MEMBLOK_ID
```
Returns 100 gradient characters. Each character = 1% of the file.
Symbols: · (empty) ░ (very low) ▒ (low) ▓ (medium) █ (high) ◉ (dense)

Read the minimap. Note which percentile ranges have ▓ █ or ◉ symbols.
Those are your candidate zones. Ignore · and ░ zones unless the query is broad.

### STEP 2 — Get section headers for hot zones
```
python scripts/navigate.py headers --id MEMBLOK_ID --from 12 --to 35
```
(where 12 and 35 are the percentile boundaries of a hot zone you identified)

Returns only the section headers in that range:
- Two-word hint
- Emoji type
- Region ID
- Chunk number and byte offset
- Landmark count within region

Read the hints. Decide which regions are relevant to the query.
You do not need to enter a region just because it is in a hot zone.

### STEP 3 — Extract relevant regions or landmarks

**Full region extract:**
```
python scripts/navigate.py extract --id MEMBLOK_ID --region REGION_ID
```

**Landmark context only (preferred for point facts):**
```
python scripts/navigate.py landmark --id MEMBLOK_ID --landmark LM_ID --words 60
```
Returns 60 words before and after the landmark. Adjust --words as needed.
Use this when you only need the key point, not the surrounding discussion.

**Paired region extract (gets both halves — problem + fix):**
```
python scripts/navigate.py paired --id MEMBLOK_ID --pair-suffix 001p
```

### STEP 4 — Compose memory artifact
From what you extracted, write a compact memory artifact:
- 200-500 tokens maximum
- Lead with the most actionable or identity-relevant facts
- Include region IDs as source references for traceability
- Do not paraphrase key decisions or code — preserve exact wording

### STEP 5 — Log the navigation
Navigation is logged automatically by the tool.
No manual logging required.

---

## NAVIGATION JUDGMENT GUIDE

**Start narrow** — if the query is specific, go directly to the hottest zone.
Only broaden if the specific zone doesn't answer it.

**Landmark-first** — if you see a 🔑 LM_KEY landmark in a relevant region,
extract just that landmark before deciding whether to load the full region.
Often the landmark is sufficient.

**Paired regions** — always retrieve both halves. A ⚠️ without its ✅ is incomplete context.

**Cross-chunk queries** — if the query spans multiple topics, make multiple
targeted extractions rather than loading large ranges. Each call is cheap.
Combining 3 landmark extractions beats loading 2 full regions.

**Memory artifact scope** — the artifact goes into the main model's context.
Keep it tight. What the main model needs to know, not a summary of everything you found.
