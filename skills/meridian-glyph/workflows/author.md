# Meridian Glyph — Author Workflow
version: 0.1

You are authoring a memblok. Your job is to make semantic decisions.
The tools handle all counting, byte offsets, and structural computation.
You never manually count characters, compute byte positions, or write headers.

---

## AUTHORING SEQUENCE

### STEP 1 — Check for in-progress session
Read workflow.json. If an in-progress memblok exists, resume it.
Do not start a new memblok until the previous one is finalized or abandoned.

### STEP 2 — Create the memblok
```
python scripts/author.py create --title "short descriptive title"
```
Tool returns a memblok_id. Record it. All subsequent calls use this id.

### STEP 3 — Read the content
Read the raw content you are committing to memory.
Identify: topic boundaries, key insights, decisions, code, bugs/fixes, open questions.
Do not annotate yet. Just read and plan.

### STEP 4 — Annotate regions
For each meaningful span of content, call:
```
python scripts/author.py annotate \
  --id MEMBLOK_ID \
  --type EMOJI_TYPE_ID \
  --hint "two words" \
  --start "exact text where region begins" \
  --end "exact text where region ends"
```

Rules:
- hint is always exactly two words describing the content, not the type
- start and end are short unique text anchors, not byte positions
- check dictionary.md if unsure which type to use
- run validate.py before annotating if using a type you haven't used recently
- paired regions (problem+solution) share a 3-digit suffix with p appended: ⚠️-001p / ✅-001p

### STEP 5 — Add landmarks
For individual points of high importance within regions:
```
python scripts/author.py landmark \
  --id MEMBLOK_ID \
  --type LM_TYPE_ID \
  --anchor "exact text to pin the landmark near"
```

Use landmarks sparingly. One per truly critical moment, not one per paragraph.

### STEP 6 — Finalize
When all annotations and landmarks are placed:
```
python scripts/finalize.py --id MEMBLOK_ID
```

This computes and writes automatically:
- 100-character minimap (heat gradient from annotation density)
- Master index with chunk numbers and byte offsets
- All chunk sub-headers
- Complete header block at top of file

You do not write or review these outputs unless something looks semantically wrong.

### STEP 7 — Preview and confirm
```
python scripts/author.py preview --id MEMBLOK_ID
```
Review the header and master index. Check that two-word hints accurately
describe the content. If anything is semantically off, re-annotate that region
and re-run finalize. Do not manually edit headers.

### STEP 8 — Commit
```
python scripts/author.py commit --id MEMBLOK_ID
```
Writes the finalized memblok to the ChromaCore storage path.
Updates workflow.json to clear the in-progress session.
Logs the authoring event to scripts/author_log.jsonl.

---

## SEMANTIC JUDGMENT GUIDE

**Topic boundary** — a shift in what is being discussed, not just a new paragraph.
**Key insight** 💡 — something that would change how you approach a problem if you forgot it.
**Decision** ⚡ — an explicit choice made between alternatives, with reasoning attached.
**Anchor** 📌 — a named thing (project, tool, concept, person) that recurs and matters.
**Risk** ⚠️ — something that could go wrong and hasn't been resolved yet.
**Landmark** 🔑 — the single sentence in a region that, if lost, loses the whole point.

When in doubt about type: prefer specificity over generality.
💡 over 🧠, ⚡ over 📋, 📌 over 🌐.
