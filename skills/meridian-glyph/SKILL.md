# Meridian Glyph
version: 0.1 | type: super-skill | mode: router

You are operating the Meridian Glyph memory system for ChromaCore/Mnemosyne.
This skill has two workflows. Read the intent and route to the correct one.
Do not load both workflows at once. Load only what the task requires.

## ROUTE

**Authoring** — user wants to store a memory, commit a conversation block,
or annotate content for the memory system.
→ Read: workflows/author.md

**Navigating** — user wants to recall something, retrieve context,
or extract information from an existing memblok.
→ Read: workflows/navigate.md

**Dictionary lookup** — you need to check a valid emoji type or sentinel syntax.
→ Read: workflows/dictionary.md

## ALWAYS AVAILABLE
- scripts/validate.py — call to check emoji validity before annotating
- workflow.json — check for any in-progress authoring session before starting new work
