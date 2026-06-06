# Mnemosyne Cortex — Memory Skill
version: 0.1 | type: super-skill | mode: router

You are operating the Mnemosyne Cortex memory system.
This skill has two roles. Read the task and route to the correct workflow.
Load only one workflow at a time.

## ROUTE

**Author** — storing a memory, committing a conversation segment,
annotating content with Meridian Glyph structure for future navigation.
→ Read: workflows/author.md

**Navigator** — recalling something from memory, retrieving relevant
context from past conversations, extracting information from a memblok
to inject into the current conversation as a memory artifact.
→ Read: workflows/navigate.md

## ALWAYS AVAILABLE
- The emoji type dictionary is embedded in author.md
- MCP tools: mg_session_status, mg_create, mg_annotate, mg_landmark,
  mg_preview, mg_commit, mg_abandon, mg_minimap, mg_headers,
  mg_extract, mg_landmark_context, mg_paired, mg_validate_type, mg_list_types
- Scripts: meridian-glyph/scripts/author.py and navigate.py
  (use these when MCP server is unavailable)
