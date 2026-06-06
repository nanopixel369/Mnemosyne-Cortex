/**
 * Mnemosyne Cortex — MCP Server v2
 * Location: mnemosyne/mcp/server.ts
 * Full TypeScript implementation — no Python subprocess dependencies.
 *
 * Run: bun run mnemosyne/mcp/server.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

import { resolveType, DOMAIN_TYPES, LANDMARK_TYPES } from "./dictionary.ts";
import { findMemblok, finalizeMemblok, computeMinimap } from "./memblok.ts";

// ── Storage paths ──────────────────────────────────────────────────────────
const SKILL_DIR    = join(import.meta.dir, "..", "..", "skills", "meridian-glyph");
const STORAGE_DIR  = join(SKILL_DIR, "membloks");
const WORKFLOW_JSON = join(SKILL_DIR, "workflow.json");

mkdirSync(STORAGE_DIR, { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────────────
function shortId(): string {
  return createHash("md5").update(String(Date.now() + Math.random())).digest("hex").slice(0, 8);
}

function nowIso(): string { return new Date().toISOString(); }

function loadWorkflow(): any {
  try { return JSON.parse(readFileSync(WORKFLOW_JSON, "utf8")); }
  catch { return { version: "0.1", in_progress: null, last_committed: null, session_log: [] }; }
}

function saveWorkflow(state: any): void {
  writeFileSync(WORKFLOW_JSON, JSON.stringify(state, null, 2), "utf8");
}

function ok(data: object) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, ...data }, null, 2) }] };
}

function err(message: string, extra: object = {}) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: message, ...extra }, null, 2) }],
    isError: true,
  };
}

function readFile(path: string): string {
  return readFileSync(path, "utf8");
}

// ── Server ─────────────────────────────────────────────────────────────────
const server = new McpServer({ name: "mnemosyne-cortex", version: "0.2.0" });

// ── UTILITY TOOLS ──────────────────────────────────────────────────────────

server.tool("mg_session_status", "Check for any in-progress authoring session.", {},
  async () => ok(loadWorkflow())
);

server.tool("mg_validate_type", "Validate an emoji type ID or emoji character.",
  { type: z.string() },
  async ({ type }) => {
    const entry = resolveType(type);
    if (!entry) return err(`'${type}' not found in dictionary. Add it to skills/meridian-glyph/workflows/dictionary.md`);
    return ok(entry);
  }
);

server.tool("mg_list_types", "List all valid annotation types.", {},
  async () => ok({
    domain:   Object.values(DOMAIN_TYPES).map(e => ({ typeId: e.typeId, emoji: e.emoji, description: e.description })),
    landmark: Object.values(LANDMARK_TYPES).map(e => ({ typeId: e.typeId, emoji: e.emoji, description: e.description })),
  })
);

// ── AUTHORING TOOLS ────────────────────────────────────────────────────────

server.tool("mg_create", "Create a new memblok. Returns memblok_id for subsequent calls.",
  { title: z.string().describe("Short descriptive title") },
  async ({ title }) => {
    const state = loadWorkflow();
    if (state.in_progress) {
      return err(`In-progress memblok exists: ${state.in_progress.id}. Commit or abandon first.`);
    }
    const mid   = shortId();
    const fname = `wip_${mid}.mg`;
    const fpath = join(STORAGE_DIR, fname);
    writeFileSync(fpath,
      `# ${title}\n# created: ${nowIso()}\n# id: ${mid}\n\n[CONTENT — paste or write below]\n\n`,
      "utf8"
    );
    state.in_progress = { id: mid, title, file: fpath, created: nowIso() };
    saveWorkflow(state);
    return ok({ memblok_id: mid, file: fpath, next: "Add content to the file then call mg_annotate." });
  }
);

server.tool("mg_annotate",
  "Annotate a region. Provide short unique text anchors — not byte positions.",
  {
    id:     z.string().describe("Memblok ID"),
    type:   z.string().describe("Type ID e.g. INSIGHT or emoji 💡"),
    hint:   z.string().describe("Two words describing this content"),
    start:  z.string().describe("Unique text where region begins"),
    end:    z.string().describe("Unique text where region ends"),
    paired: z.boolean().optional().describe("True if part of a problem/solution pair"),
  },
  async ({ id, type, hint, start, end, paired }) => {
    const entry = resolveType(type);
    if (!entry) return err(`Unknown type '${type}'. Call mg_list_types to see valid options.`);

    const fpath = findMemblok(STORAGE_DIR, id);
    if (!fpath) return err(`No in-progress memblok '${id}'`);

    let content = readFile(fpath);
    const startIdx = content.indexOf(start);
    const endIdx   = content.indexOf(end);
    if (startIdx === -1) return err(`Start anchor not found: '${start}'`);
    if (endIdx   === -1) return err(`End anchor not found: '${end}'`);
    if (endIdx < startIdx) return err("End anchor appears before start anchor.");

    // Generate region ID
    const existing = [...content.matchAll(new RegExp(`⟦${entry.emoji}-(\\d+)`, "gu"))];
    const nums = existing.map(m => parseInt(m[1])).filter(n => !isNaN(n));
    const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
    const suffix  = paired ? "p" : "";
    const regionId = `${entry.emoji}-${String(nextNum).padStart(3, "0")}${suffix}`;
    const cleanHint = hint.trim().replace(/\s+/g, " ").slice(0, 30);

    const openTag  = `⟦${regionId}:${cleanHint}⟧`;
    const closeTag = `⟦${regionId}/⟧`;
    const endInsert = endIdx + end.length;

    content = content.slice(0, startIdx) + openTag + content.slice(startIdx, endInsert) + closeTag + content.slice(endInsert);
    writeFileSync(fpath, content, "utf8");

    return ok({ region_id: regionId, open_tag: openTag, close_tag: closeTag });
  }
);

server.tool("mg_landmark", "Add a point landmark near specific text.",
  {
    id:     z.string().describe("Memblok ID"),
    type:   z.string().describe("LM_KEY | LM_CONCLUSION | LM_QUESTION | LM_QUOTE | LM_REVISION | LM_LOCATION"),
    anchor: z.string().describe("Short unique text to pin the landmark near"),
  },
  async ({ id, type, anchor }) => {
    const lmTypeKey = type.replace("LM_", "").toUpperCase();
    const emojiMap: Record<string, string> = {
      LOCATION: "📍", CONCLUSION: "🏁", KEY: "🔑", QUESTION: "❓", QUOTE: "💬", REVISION: "🔄"
    };
    const emoji = emojiMap[lmTypeKey];
    if (!emoji) return err(`Unknown landmark type '${type}'. Valid: LM_KEY, LM_CONCLUSION, LM_QUESTION, LM_QUOTE, LM_REVISION, LM_LOCATION`);

    const fpath = findMemblok(STORAGE_DIR, id);
    if (!fpath) return err(`No in-progress memblok '${id}'`);

    let content = readFile(fpath);
    const anchorIdx = content.indexOf(anchor);
    if (anchorIdx === -1) return err(`Anchor text not found: '${anchor}'`);

    const existing = [...content.matchAll(new RegExp(`⟦${emoji}LM_${lmTypeKey}-(\\d+)⟧`, "gu"))];
    const nums = existing.map(m => parseInt(m[1])).filter(n => !isNaN(n));
    const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
    const lmId  = `${emoji}LM_${lmTypeKey}-${String(nextNum).padStart(3, "0")}`;
    const tag   = `⟦${lmId}⟧`;

    content = content.slice(0, anchorIdx) + tag + content.slice(anchorIdx);
    writeFileSync(fpath, content, "utf8");

    return ok({ landmark_id: lmId, tag });
  }
);

server.tool("mg_preview", "Preview the computed header. Runs finalize automatically.",
  { id: z.string() },
  async ({ id }) => {
    const result = finalizeMemblok(id, STORAGE_DIR);
    if (!result.ok) return err(result.error!);
    const content = readFile(result.file!);
    const endMarker = "⟦HEADER_END⟧";
    const endIdx = content.indexOf(endMarker);
    const preview = endIdx !== -1 ? content.slice(0, endIdx + endMarker.length) : content.slice(0, 800);
    return ok({ preview, stats: { chunks: result.chunks, regions: result.regions, landmarks: result.landmarks, bytes: result.bytes } });
  }
);

server.tool("mg_commit", "Finalize and commit the memblok to storage.",
  { id: z.string() },
  async ({ id }) => {
    const result = finalizeMemblok(id, STORAGE_DIR);
    if (!result.ok) return err(result.error!);

    const wipPath   = result.file!;
    const finalPath = wipPath.replace(/wip_/, "");
    require("fs").renameSync(wipPath, finalPath);

    const state = loadWorkflow();
    state.last_committed = { id, file: finalPath, ts: nowIso() };
    state.in_progress    = null;
    if (!state.session_log) state.session_log = [];
    state.session_log.push({ id, committed: nowIso() });
    saveWorkflow(state);

    return ok({ memblok_id: id, file: finalPath, message: "Memblok committed." });
  }
);

server.tool("mg_abandon", "Abandon and delete an in-progress memblok.",
  { id: z.string() },
  async ({ id }) => {
    const fpath = findMemblok(STORAGE_DIR, id);
    if (!fpath) return err(`No in-progress memblok '${id}'`);
    if (!fpath.includes("wip_")) return err(`Memblok '${id}' is already committed. Cannot abandon.`);
    unlinkSync(fpath);
    const state = loadWorkflow();
    state.in_progress = null;
    saveWorkflow(state);
    return ok({ message: `Abandoned memblok ${id}` });
  }
);

// ── NAVIGATION TOOLS ───────────────────────────────────────────────────────

server.tool("mg_minimap", "Get the 100-char heat minimap. Call this first when navigating.",
  { id: z.string() },
  async ({ id }) => {
    const fpath = findMemblok(STORAGE_DIR, id);
    if (!fpath) return err(`Memblok '${id}' not found`);
    const content = readFile(fpath);

    // Try to read precomputed minimap from header first
    const mmMatch = content.match(/MINIMAP: (.{100})/u);
    const minimap = mmMatch ? mmMatch[1] : computeMinimap(content);

    const chunkMatches = [...content.matchAll(/⟦CHUNK:(\d+)\|/gu)];
    return ok({
      memblok_id: id,
      minimap,
      total_bytes: Buffer.byteLength(content, "utf8"),
      chunks: chunkMatches.length,
      hint: "Each char = 1% of file. ◉>█>▓>▒>░>· = dense to empty.",
    });
  }
);

server.tool("mg_headers", "Get section headers for a percentile range.",
  { id: z.string(), from_pct: z.number().min(0).max(100), to_pct: z.number().min(0).max(100) },
  async ({ id, from_pct, to_pct }) => {
    const fpath = findMemblok(STORAGE_DIR, id);
    if (!fpath) return err(`Memblok '${id}' not found`);
    const content   = readFile(fpath);
    const totalBytes = Buffer.byteLength(content, "utf8");
    const fromByte  = Math.floor(from_pct / 100 * totalBytes);
    const toByte    = Math.floor(to_pct   / 100 * totalBytes);

    const indexMatch = content.match(/⟦INDEX\|([^⟧]+)⟧/u);
    const indexRaw   = indexMatch ? indexMatch[1] : "";

    const headers: any[] = [];
    for (const m of indexRaw.matchAll(/R:([^:]+):([^(]+)\(c(\d+):byte=(\d+)\)/gu)) {
      const byte = parseInt(m[4]);
      if (byte >= fromByte && byte < toByte) {
        headers.push({ type: "region", id: m[1], hint: m[2].trim(), chunk: parseInt(m[3]), byte });
      }
    }

    return ok({ memblok_id: id, range: `${from_pct}%-${to_pct}%`, headers, count: headers.length });
  }
);

server.tool("mg_extract", "Extract the full content of a named region.",
  { id: z.string(), region_id: z.string() },
  async ({ id, region_id }) => {
    const fpath = findMemblok(STORAGE_DIR, id);
    if (!fpath) return err(`Memblok '${id}' not found`);
    const content = readFile(fpath);

    const openPat  = new RegExp(`⟦${escapeRegex(region_id)}:[^⟧]*⟧`, "u");
    const closePat = new RegExp(`⟦${escapeRegex(region_id)}/⟧`, "u");
    const openM    = openPat.exec(content);
    const closeM   = closePat.exec(content);

    if (!openM)  return err(`Region '${region_id}' open tag not found`);
    if (!closeM) return err(`Region '${region_id}' close tag not found`);

    const extracted = content.slice(openM.index, closeM.index + closeM[0].length);
    return ok({ region_id, content: extracted, bytes: Buffer.byteLength(extracted, "utf8") });
  }
);

server.tool("mg_landmark_context", "Extract words surrounding a landmark. Lighter than full region.",
  { id: z.string(), landmark: z.string(), words: z.number().optional() },
  async ({ id, landmark, words = 60 }) => {
    const fpath = findMemblok(STORAGE_DIR, id);
    if (!fpath) return err(`Memblok '${id}' not found`);
    const content = readFile(fpath);
    const tag     = `⟦${landmark}⟧`;
    const idx     = content.indexOf(tag);
    if (idx === -1) return err(`Landmark '${landmark}' not found`);

    const before  = content.slice(0, idx).split(/\s+/).filter(Boolean);
    const after   = content.slice(idx + tag.length).split(/\s+/).filter(Boolean);
    const snippet = [...before.slice(-words), tag, ...after.slice(0, words)].join(" ");

    return ok({ landmark, context: snippet, words_before: Math.min(words, before.length), words_after: Math.min(words, after.length) });
  }
);

server.tool("mg_paired", "Retrieve both halves of a paired region by shared numeric suffix.",
  { id: z.string(), pair_suffix: z.string() },
  async ({ id, pair_suffix }) => {
    const fpath = findMemblok(STORAGE_DIR, id);
    if (!fpath) return err(`Memblok '${id}' not found`);
    const content = readFile(fpath);

    const suffix  = pair_suffix.endsWith("p") ? pair_suffix : pair_suffix + "p";
    const pattern = new RegExp(`⟦([^⟧]+)-${escapeRegex(suffix)}:([^⟧]+)⟧`, "gu");
    const found   = [...content.matchAll(pattern)];

    if (!found.length) return err(`No paired regions found with suffix '${suffix}'`);

    const parts: Record<string, any> = {};
    for (const m of found) {
      const emoji    = m[1];
      const regionId = `${emoji}-${suffix}`;
      const openPat  = new RegExp(`⟦${escapeRegex(regionId)}:[^⟧]*⟧`, "u");
      const closePat = new RegExp(`⟦${escapeRegex(regionId)}/⟧`, "u");
      const openM    = openPat.exec(content);
      const closeM   = closePat.exec(content);
      if (openM && closeM) {
        const extracted = content.slice(openM.index, closeM.index + closeM[0].length);
        parts[`${emoji}_${suffix}`] = { region_id: regionId, hint: m[2], content: extracted, bytes: Buffer.byteLength(extracted, "utf8") };
      }
    }

    return ok({ pair_suffix: suffix, parts });
  }
);

// ── Utility ────────────────────────────────────────────────────────────────
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Start ──────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
