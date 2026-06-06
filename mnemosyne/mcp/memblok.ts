/**
 * mnemosyne/mcp/memblok.ts
 * Core Meridian Glyph memblok operations in TypeScript.
 * Handles file I/O, annotation, finalization, and navigation.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  DOMAIN_TYPES, LANDMARK_TYPES, EMOJI_TO_TYPE, MINIMAP_SIZE,
  CHUNK_SIZE, heatSymbol, resolveType
} from "./dictionary.ts";

// ── Path helpers ───────────────────────────────────────────────────────────

export function findMemblok(storageDir: string, id: string): string | null {
  if (!existsSync(storageDir)) return null;
  const files = readdirSync(storageDir);
  for (const f of files) {
    if ((f === `${id}.mg` || f === `wip_${id}.mg`) && f.endsWith(".mg")) {
      return join(storageDir, f);
    }
  }
  // Partial match — id is prefix
  for (const f of files) {
    if (f.endsWith(".mg") && (f.includes(id))) return join(storageDir, f);
  }
  return null;
}

// ── Sentinel patterns ──────────────────────────────────────────────────────

// Matches region open:  ⟦EMOJI-NNN:hint⟧  or  ⟦EMOJI-NNNp:hint⟧
const REGION_OPEN_RE  = /⟦([^⟧/]+):([^⟧]+)⟧/gu;
// Matches region close: ⟦EMOJI-NNN/⟧
const REGION_CLOSE_RE = /⟦([^⟧/]+)\/⟧/gu;
// Matches landmarks:    ⟦EmojiLM_TYPE-NNN⟧
const LANDMARK_RE     = /⟦(📍|🏁|🔑|❓|💬|🔄)LM_([A-Z_]+)-(\d+)⟧/gu;
// Strips previously computed header block
const HEADER_BLOCK_RE = /^⟦HEADER_BEGIN⟧.*?⟦HEADER_END⟧\n*/su;
// Strips chunk headers
const CHUNK_HDR_RE    = /⟦CHUNK:\d+\|[^⟧]+⟧\n?/gu;

// ── Minimap computation ────────────────────────────────────────────────────

export function computeMinimap(content: string): string {
  const totalBytes = Buffer.byteLength(content, "utf8");
  if (totalBytes === 0) return "·".repeat(MINIMAP_SIZE);

  const buckets = new Array<number>(MINIMAP_SIZE).fill(0);

  // Find all annotation sentinels and their byte positions
  const allSentinels = /⟦[^⟧]+⟧/gu;
  let m: RegExpExecArray | null;
  while ((m = allSentinels.exec(content)) !== null) {
    const posByte = Buffer.byteLength(content.slice(0, m.index), "utf8");
    const pct     = Math.min(Math.floor(posByte / totalBytes * MINIMAP_SIZE), MINIMAP_SIZE - 1);

    // Extract emoji and get its weight
    const tag       = m[0].slice(1); // strip leading ⟦
    const firstChar = [...tag][0] ?? "";
    const entry     = EMOJI_TO_TYPE[firstChar];
    buckets[pct]   += entry?.weight ?? 1;
  }

  return buckets.map(heatSymbol).join("");
}

// ── Chunk splitting ────────────────────────────────────────────────────────

interface Chunk {
  num:       number;
  byteStart: number;
  byteEnd:   number;
  text:      string;
  regions:   Array<{ regionId: string; hint: string; byte: number }>;
  landmarks: Array<{ lmId: string; byte: number }>;
}

function splitIntoChunks(content: string): Chunk[] {
  const encoded = Buffer.from(content, "utf8");
  const chunks: Chunk[] = [];
  let offset = 0;
  let chunkNum = 1;

  while (offset < encoded.length) {
    let end = Math.min(offset + CHUNK_SIZE, encoded.length);

    // Don't split inside a sentinel — back up before any unclosed ⟦
    let chunkText = encoded.slice(offset, end).toString("utf8");
    const lastOpen  = chunkText.lastIndexOf("⟦");
    const lastClose = chunkText.lastIndexOf("⟧");
    if (lastOpen > lastClose) {
      // Mid-sentinel — back up to before ⟦
      const safeText = chunkText.slice(0, lastOpen);
      end = offset + Buffer.byteLength(safeText, "utf8");
      chunkText = safeText;
    }

    chunks.push({ num: chunkNum, byteStart: offset, byteEnd: end,
                  text: chunkText, regions: [], landmarks: [] });
    offset = end;
    chunkNum++;
  }
  return chunks;
}

function annotateChunks(chunks: Chunk[], content: string): void {
  REGION_OPEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = REGION_OPEN_RE.exec(content)) !== null) {
    const pos = Buffer.byteLength(content.slice(0, m.index), "utf8");
    const regionId = m[1].trim();
    const hint     = m[2].trim();
    for (const chunk of chunks) {
      if (chunk.byteStart <= pos && pos < chunk.byteEnd) {
        chunk.regions.push({ regionId, hint, byte: pos });
        break;
      }
    }
  }

  LANDMARK_RE.lastIndex = 0;
  while ((m = LANDMARK_RE.exec(content)) !== null) {
    const pos  = Buffer.byteLength(content.slice(0, m.index), "utf8");
    const lmId = `${m[1]}LM_${m[2]}-${m[3]}`;
    for (const chunk of chunks) {
      if (chunk.byteStart <= pos && pos < chunk.byteEnd) {
        chunk.landmarks.push({ lmId, byte: pos });
        break;
      }
    }
  }
}

function buildMasterIndex(chunks: Chunk[]): string {
  const parts: string[] = [];
  for (const chunk of chunks) {
    for (const r of chunk.regions) {
      parts.push(`R:${r.regionId}:${r.hint}(c${chunk.num}:byte=${r.byte})`);
    }
    for (const lm of chunk.landmarks) {
      parts.push(`L:${lm.lmId}(c${chunk.num}:byte=${lm.byte})`);
    }
  }
  return `⟦INDEX|${parts.length ? parts.join(" ") : "empty"}⟧`;
}

// ── Finalize ───────────────────────────────────────────────────────────────

export interface FinalizeResult {
  ok:         boolean;
  memblokId?: string;
  file?:      string;
  minimap?:   string;
  chunks?:    number;
  regions?:   number;
  landmarks?: number;
  bytes?:     number;
  error?:     string;
}

export function finalizeMemblok(id: string, storageDir: string): FinalizeResult {
  const fpath = findMemblok(storageDir, id);
  if (!fpath) return { ok: false, error: `No memblok found for id '${id}'` };

  let content = Bun.file(fpath).toString ? "" : "";
  try {
    content = require("fs").readFileSync(fpath, "utf8");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  // Strip old computed headers
  content = content.replace(HEADER_BLOCK_RE, "").replace(CHUNK_HDR_RE, "");

  const chunks = splitIntoChunks(content);
  annotateChunks(chunks, content);

  const minimap      = computeMinimap(content);
  const masterIndex  = buildMasterIndex(chunks);
  const totalRegions = chunks.reduce((s, c) => s + c.regions.length, 0);
  const totalLm      = chunks.reduce((s, c) => s + c.landmarks.length, 0);

  // Build chunked content with sub-headers
  const chunkedParts = chunks.map(c =>
    `⟦CHUNK:${c.num}|byte:${c.byteStart}|regions:${c.regions.length}|landmarks:${c.landmarks.length}⟧\n${c.text}`
  );
  const chunkedContent = chunkedParts.join("\n");

  const headerBlock =
    `⟦HEADER_BEGIN⟧\n` +
    `MINIMAP: ${minimap}\n` +
    `CHUNKS: ${chunks.length} | REGIONS: ${totalRegions} | LANDMARKS: ${totalLm}\n` +
    `${masterIndex}\n` +
    `⟦HEADER_END⟧\n\n`;

  const finalContent = headerBlock + chunkedContent;

  try {
    require("fs").writeFileSync(fpath, finalContent, "utf8");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  return {
    ok: true, memblokId: id, file: fpath, minimap,
    chunks: chunks.length, regions: totalRegions, landmarks: totalLm,
    bytes: Buffer.byteLength(finalContent, "utf8"),
  };
}
