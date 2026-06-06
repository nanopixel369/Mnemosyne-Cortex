# Meridian Glyph — Emoji Type Dictionary
# version: 0.1
# status: living document — add entries as gaps emerge during use
#
# FORMAT: EMOJI | TYPE_ID | DESCRIPTION | USAGE
# This file is the single source of truth for all valid annotation types.
# Tools validate against this file at invocation time.
# Unknown emojis are rejected with a suggestion to update the dictionary.

---

## DOMAIN TYPES
# Used in region open/close tags to declare content category.

💡 | INSIGHT       | Key insight, realization, or conceptual breakthrough
🔧 | IMPL          | Implementation code, working solution
🐛 | BUG           | Bug, error, or broken behavior
✅ | FIX           | Resolution, fix, or correction to a prior bug
⚠️ | RISK          | Risk, caveat, or known limitation
🧪 | EXPERIMENT    | Experimental idea, hypothesis, or test
📐 | DESIGN        | Architecture, system design, or structural decision
📋 | PLAN          | Plan, roadmap, or sequence of steps
🗣️ | CONVO         | Raw conversation exchange worth preserving
📌 | ANCHOR        | Key reference point, important named thing
🔢 | DATA          | Numerical data, measurements, metrics, benchmarks
👤 | PREF          | User preference, personal fact, or stated opinion
🔗 | REF           | External reference, citation, or source
❌ | ERROR         | Mistake made and acknowledged during session
🧠 | CONCEPT       | Abstract concept being defined or explored
📦 | ARTIFACT      | Named output — file, document, or deliverable produced
🌐 | CONTEXT       | Background context needed to understand the session
⚡ | DECISION      | Explicit decision made, with reasoning

---

## LANDMARK TYPES
# Used for inline point markers within content.
# Landmarks mark a specific moment, not a span.

📍 | LM_LOCATION   | Specific location in reasoning or narrative
🏁 | LM_CONCLUSION | Conclusion or summary point
🔑 | LM_KEY        | Single most important statement in a region
❓ | LM_QUESTION   | Open question left unresolved
💬 | LM_QUOTE      | Direct quote or verbatim statement worth preserving
🔄 | LM_REVISION   | Point where something was revised or reconsidered

---

## HEAT LEVELS
# Used by finalize.py to compute minimap gradient symbols.
# Higher weight = more heat contribution per annotation in that percentile bucket.

💡 | weight: 3
🔧 | weight: 3
🐛 | weight: 2
✅ | weight: 2
⚠️ | weight: 2
🧪 | weight: 2
📐 | weight: 3
📋 | weight: 1
🗣️ | weight: 1
📌 | weight: 3
🔢 | weight: 2
👤 | weight: 2
🔗 | weight: 1
❌ | weight: 1
🧠 | weight: 3
📦 | weight: 2
🌐 | weight: 1
⚡ | weight: 3
📍 | weight: 2
🏁 | weight: 3
🔑 | weight: 3
❓ | weight: 2
💬 | weight: 2
🔄 | weight: 2

---

## MINIMAP GRADIENT SYMBOLS
# 100 characters total. One per 1% of file. Computed by finalize.py.
# Density scale — heat score per bucket maps to one of these:

# 0        → · (empty)
# 1-2      → ░ (very low)
# 3-5      → ▒ (low)
# 6-9      → ▓ (medium)
# 10-14    → █ (high)
# 15+      → ◉ (dense)

---

## SENTINEL SYNTAX REFERENCE
# Region open:    ⟦EMOJI-ID:two-word-hint⟧
# Region close:   ⟦EMOJI-ID/⟧
# Paired open:    ⟦EMOJI-ID-NNNp:two-word-hint⟧
# Paired close:   ⟦EMOJI-ID-NNNp/⟧
# Landmark:       ⟦📍LM_TYPE-NNN⟧
# Chunk header:   ⟦CHUNK:NNN|byte:NNNNNN|regions:N|landmarks:N⟧
# Master index:   ⟦INDEX|EMOJI TYPE_ID:hint(cN:byte=NNNNNN)...⟧

# EXAMPLE:
# ⟦💡-001:gravity engine⟧
# ...content...
# ⟦💡-001/⟧
#
# ⟦⚠️-002p:context overflow⟧ ... ⟦✅-002p:sliding window fix⟧
