/**
 * Mnemosyne Cortex — MCP Server
 * Location: mnemosyne/mcp/server.ts
 *
 * STATUS: Stub — TypeScript tools being built to replace Python script delegation.
 * The server starts and connects cleanly. Tools return placeholder responses.
 * Full TypeScript tool implementation is the next build step.
 *
 * Run: bun run mnemosyne/mcp/server.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { join } from "path";

const MEMBLOKS_DIR = join(import.meta.dir, "..", "..", "skills", "meridian-glyph", "membloks");
const WORKFLOW_JSON = join(import.meta.dir, "..", "..", "skills", "meridian-glyph", "workflow.json");

const server = new McpServer({
  name:    "mnemosyne-cortex",
  version: "0.2.0",
});

// ── Session status (reads workflow.json — works now) ───────────────────────
server.tool(
  "mg_session_status",
  "Check for any in-progress authoring session.",
  {},
  async () => {
    try {
      const wf = JSON.parse(await Bun.file(WORKFLOW_JSON).text());
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, ...wf }, null, 2) }] };
    } catch {
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, in_progress: null, message: "No session file found — starting fresh." }, null, 2) }] };
    }
  }
);

// ── Placeholder tools — TypeScript implementations coming next ─────────────
const STUB = (name: string) => async (_args: any) => ({
  content: [{
    type: "text" as const,
    text: JSON.stringify({
      ok: false,
      tool: name,
      message: "TypeScript implementation in progress. This tool will be fully functional in the next build.",
    }, null, 2),
  }],
  isError: true,
});

server.tool("mg_create",            "Create a new memblok.",
  { title: z.string() }, STUB("mg_create"));

server.tool("mg_annotate",          "Annotate a region in the current memblok.",
  { id: z.string(), type: z.string(), hint: z.string(), start: z.string(), end: z.string(), paired: z.boolean().optional() },
  STUB("mg_annotate"));

server.tool("mg_landmark",          "Add a landmark to the current memblok.",
  { id: z.string(), type: z.string(), anchor: z.string() }, STUB("mg_landmark"));

server.tool("mg_preview",           "Preview the current memblok header.",
  { id: z.string() }, STUB("mg_preview"));

server.tool("mg_commit",            "Commit the current memblok.",
  { id: z.string() }, STUB("mg_commit"));

server.tool("mg_abandon",           "Abandon the current memblok.",
  { id: z.string() }, STUB("mg_abandon"));

server.tool("mg_minimap",           "Get the 100-char minimap for a memblok.",
  { id: z.string() }, STUB("mg_minimap"));

server.tool("mg_headers",           "Get section headers for a percentile range.",
  { id: z.string(), from_pct: z.number(), to_pct: z.number() }, STUB("mg_headers"));

server.tool("mg_extract",           "Extract a full region from a memblok.",
  { id: z.string(), region_id: z.string() }, STUB("mg_extract"));

server.tool("mg_landmark_context",  "Extract context around a landmark.",
  { id: z.string(), landmark: z.string(), words: z.number().optional() }, STUB("mg_landmark_context"));

server.tool("mg_paired",            "Retrieve both halves of a paired region.",
  { id: z.string(), pair_suffix: z.string() }, STUB("mg_paired"));

server.tool("mg_validate_type",     "Validate an emoji type ID.",
  { type: z.string() }, STUB("mg_validate_type"));

server.tool("mg_list_types",        "List all valid annotation types.", {}, STUB("mg_list_types"));

// ── Start ──────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
