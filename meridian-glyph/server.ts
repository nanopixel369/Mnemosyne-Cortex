/**
 * Meridian Glyph MCP Server
 * Exposes ChromaCore memory authoring and navigation as MCP tools.
 * All operations delegate to the Python scripts in ./scripts/
 *
 * Run with: bun run meridian-glyph/server.ts
 * Or add to Claude Desktop config (see README below)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { join } from "path";
import { spawnSync } from "child_process";

// ── Paths ──────────────────────────────────────────────────────────────────
const SCRIPT_DIR = join(import.meta.dir, "scripts");
const STORAGE    = join(import.meta.dir, "membloks");

// ── Python script runner ───────────────────────────────────────────────────
function runScript(script: string, args: string[]): { ok: boolean; data: any; raw: string } {
  const result = spawnSync(
    "python",
    [join(SCRIPT_DIR, script), ...args, "--storage", STORAGE],
    {
      encoding: "buffer",   // get raw bytes, handle encoding ourselves
      timeout: 15000,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    }
  );

  const stdout = result.stdout ? result.stdout.toString("utf-8").trim() : "";
  const stderr = result.stderr ? result.stderr.toString("utf-8").trim() : "";

  try {
    const data = JSON.parse(stdout);
    return { ok: data.ok === true, data, raw: stdout };
  } catch {
    return {
      ok: false,
      data: { ok: false, error: stderr || stdout || "No output from script" },
      raw: stdout,
    };
  }
}

function respond(result: { ok: boolean; data: any }) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(result.data, null, 2),
    }],
    isError: !result.ok,
  };
}

// ── Server setup ───────────────────────────────────────────────────────────
const server = new McpServer({
  name: "meridian-glyph",
  version: "0.1.0",
});

// ── AUTHORING TOOLS ────────────────────────────────────────────────────────

server.tool(
  "mg_create",
  "Create a new Meridian Glyph memblok. Call this before annotating. Returns a memblok_id to use in subsequent calls.",
  { title: z.string().describe("Short descriptive title for this memory block") },
  async ({ title }) => respond(runScript("author.py", ["create", "--title", title]))
);

server.tool(
  "mg_annotate",
  "Annotate a region in the current memblok. Provide text anchors (not byte positions) — the tool finds exact locations. Check dictionary.md for valid type IDs.",
  {
    id:     z.string().describe("Memblok ID from mg_create"),
    type:   z.string().describe("Type ID from dictionary e.g. INSIGHT, BUG, FIX, DECISION, CONTEXT"),
    hint:   z.string().describe("Exactly two words describing the content (not the type)"),
    start:  z.string().describe("Short unique text snippet where the region begins"),
    end:    z.string().describe("Short unique text snippet where the region ends"),
    paired: z.boolean().optional().describe("True if this is one half of a problem/solution pair"),
  },
  async ({ id, type, hint, start, end, paired }) => {
    const args = ["annotate", "--id", id, "--type", type, "--hint", hint, "--start", start, "--end", end];
    if (paired) args.push("--paired");
    return respond(runScript("author.py", args));
  }
);

server.tool(
  "mg_landmark",
  "Add a point landmark near a specific piece of text in the memblok. Use sparingly — one per truly critical moment.",
  {
    id:     z.string().describe("Memblok ID"),
    type:   z.string().describe("Landmark type: LM_KEY, LM_CONCLUSION, LM_QUESTION, LM_QUOTE, LM_REVISION, LM_LOCATION"),
    anchor: z.string().describe("Short unique text to pin the landmark near"),
  },
  async ({ id, type, anchor }) =>
    respond(runScript("author.py", ["landmark", "--id", id, "--type", type, "--anchor", anchor]))
);

server.tool(
  "mg_preview",
  "Preview the computed header block of the current memblok (minimap + index). Runs finalize automatically. Use to verify semantic accuracy before committing.",
  { id: z.string().describe("Memblok ID") },
  async ({ id }) => respond(runScript("author.py", ["preview", "--id", id]))
);

server.tool(
  "mg_commit",
  "Finalize and commit the memblok to permanent storage. Clears the in-progress session. Call after preview confirms everything looks correct.",
  { id: z.string().describe("Memblok ID") },
  async ({ id }) => respond(runScript("author.py", ["commit", "--id", id]))
);

server.tool(
  "mg_abandon",
  "Abandon and delete an in-progress memblok. Use if authoring needs to be restarted.",
  { id: z.string().describe("Memblok ID") },
  async ({ id }) => respond(runScript("author.py", ["abandon", "--id", id]))
);

// ── NAVIGATION TOOLS ───────────────────────────────────────────────────────

server.tool(
  "mg_minimap",
  "Get the 100-character heat minimap for a memblok. Always call this first when navigating. Each character = 1% of file. ◉>█>▓>▒>░>· = dense to empty.",
  { id: z.string().describe("Memblok ID") },
  async ({ id }) => respond(runScript("navigate.py", ["minimap", "--id", id]))
);

server.tool(
  "mg_headers",
  "Get section headers for a percentile range of the memblok. Use after reading the minimap to identify hot zones. Returns 2-word hints and byte offsets — no content loaded.",
  {
    id:       z.string().describe("Memblok ID"),
    from_pct: z.number().describe("Start percentile 0-100"),
    to_pct:   z.number().describe("End percentile 0-100"),
  },
  async ({ id, from_pct, to_pct }) =>
    respond(runScript("navigate.py", ["headers", "--id", id,
      "--from", String(from_pct), "--to", String(to_pct)]))
);

server.tool(
  "mg_extract",
  "Extract the full content of a specific named region. Use region IDs from mg_headers. Prefer mg_landmark_context for point facts — this loads the full region.",
  {
    id:        z.string().describe("Memblok ID"),
    region_id: z.string().describe("Region ID from headers e.g. 💡-001 or 🐛-002p"),
  },
  async ({ id, region_id }) =>
    respond(runScript("navigate.py", ["extract", "--id", id, "--region", region_id]))
);

server.tool(
  "mg_landmark_context",
  "Extract words surrounding a specific landmark. Much lighter than full region extract. Good for retrieving a key fact without loading surrounding discussion.",
  {
    id:       z.string().describe("Memblok ID"),
    landmark: z.string().describe("Landmark ID e.g. 🔑LM_KEY-001 or 🏁LM_CONCLUSION-001"),
    words:    z.number().optional().describe("Words before and after the landmark (default 60)"),
  },
  async ({ id, landmark, words }) => {
    const args = ["landmark", "--id", id, "--landmark", landmark];
    if (words) args.push("--words", String(words));
    return respond(runScript("navigate.py", args));
  }
);

server.tool(
  "mg_paired",
  "Retrieve both halves of a paired problem/solution region by their shared numeric suffix. Always use this instead of two separate mg_extract calls for paired regions.",
  {
    id:          z.string().describe("Memblok ID"),
    pair_suffix: z.string().describe("Shared suffix e.g. '001p' or just '001'"),
  },
  async ({ id, pair_suffix }) =>
    respond(runScript("navigate.py", ["paired", "--id", id, "--pair-suffix", pair_suffix]))
);

// ── UTILITY TOOLS ──────────────────────────────────────────────────────────

server.tool(
  "mg_validate_type",
  "Check if an emoji type ID is valid before using it in mg_annotate. Returns full entry including description and heat weight.",
  { type: z.string().describe("Type ID or emoji to validate e.g. INSIGHT or 💡") },
  async ({ type }) => respond(runScript("validate.py", ["--type", type]))
);

server.tool(
  "mg_list_types",
  "List all valid annotation types from the dictionary. Call this when unsure which type to use for authoring.",
  {},
  async () => respond(runScript("validate.py", ["--list"]))
);

server.tool(
  "mg_session_status",
  "Check workflow.json for any in-progress authoring session. Always call this before mg_create to avoid orphaning a session.",
  {},
  async () => {
    const wfPath = join(import.meta.dir, "workflow.json");
    try {
      const wf = JSON.parse(await Bun.file(wfPath).text());
      return respond({ ok: true, data: { ok: true, ...wf } });
    } catch {
      return respond({ ok: false, data: { ok: false, error: "Could not read workflow.json" } });
    }
  }
);

// ── Start server ───────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);

/*
 * ── Claude Desktop Config ──────────────────────────────────────────────────
 * Add this to your claude_desktop_config.json:
 *
 * "mcpServers": {
 *   "meridian-glyph": {
 *     "command": "bun",
 *     "args": ["run", "C:\\Users\\elxnd\\Projects\\ChomaCorev3\\meridian-glyph\\server.ts"]
 *   }
 * }
 *
 * Tools available after connecting:
 *   AUTHORING:   mg_session_status, mg_create, mg_annotate, mg_landmark,
 *                mg_preview, mg_commit, mg_abandon
 *   NAVIGATION:  mg_minimap, mg_headers, mg_extract, mg_landmark_context, mg_paired
 *   UTILITY:     mg_validate_type, mg_list_types
 */
