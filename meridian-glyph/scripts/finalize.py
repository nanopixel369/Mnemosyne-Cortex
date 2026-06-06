"""
finalize.py — Meridian Glyph Memblok Finalizer
Computes minimap, master index, and chunk sub-headers from annotations.
Called after all authoring annotations are placed.

Usage:
    python finalize.py --id MEMBLOK_ID
    python finalize.py --id MEMBLOK_ID --storage C:\\path\\to\\storage
"""

import sys, json, re, argparse
from pathlib import Path
from validate import load_dictionary, HEAT_WEIGHTS

STORAGE_DEFAULT = Path(__file__).parent.parent.parent / "membloks"
MINIMAP_SIZE    = 100       # always exactly 100 characters
CHUNK_SIZE      = 4096      # bytes per chunk — fixed boundary

# Gradient scale: heat score → Unicode symbol
GRADIENT = [
    (0,   "·"),
    (2,   "░"),
    (5,   "▒"),
    (9,   "▓"),
    (14,  "█"),
    (999, "◉"),
]

REGION_OPEN_RE  = re.compile(r'⟦([^⟧]+):([^⟧]+)⟧')
REGION_CLOSE_RE = re.compile(r'⟦([^⟧/]+)/⟧')
LANDMARK_RE     = re.compile(r'⟦(📍|🏁|🔑|❓|💬|🔄)LM_([A-Z_]+)-(\d+)⟧')
CHUNK_HDR_RE    = re.compile(r'⟦CHUNK:\d+\|[^⟧]+⟧\n?')
MASTER_IDX_RE   = re.compile(r'⟦INDEX\|[^⟧]+⟧\n?')
HEADER_BLOCK_RE = re.compile(r'^⟦HEADER_BEGIN⟧.*?⟦HEADER_END⟧\n?', re.DOTALL)

def heat_symbol(score: int) -> str:
    for threshold, symbol in reversed(GRADIENT):
        if score > threshold:
            return symbol
    return "·"


def compute_minimap(content: str) -> str:
    """
    Scan content for all annotation sentinels.
    Map each to its byte position as a percentage of total length.
    Accumulate heat weights per 1% bucket.
    Return exactly 100 gradient characters.
    """
    load_dictionary()
    total_bytes = len(content.encode("utf-8"))
    if total_bytes == 0:
        return "·" * MINIMAP_SIZE

    buckets = [0] * MINIMAP_SIZE

    # Find all annotation sentinels and their byte positions
    for match in re.finditer(r'⟦([^⟧/]+)(?:/?)⟧', content):
        pos_bytes = len(content[:match.start()].encode("utf-8"))
        pct = min(int(pos_bytes / total_bytes * MINIMAP_SIZE), MINIMAP_SIZE - 1)

        # Extract emoji from match — first char is usually the emoji
        tag = match.group(1)
        first_char = tag[0] if tag else ""
        weight = HEAT_WEIGHTS.get(first_char, 1)
        buckets[pct] += weight

    return "".join(heat_symbol(b) for b in buckets)


def split_into_chunks(content: str) -> list[dict]:
    """Split content at CHUNK_SIZE byte boundaries. Returns list of chunk dicts."""
    encoded = content.encode("utf-8")
    chunks = []
    offset = 0
    chunk_num = 1

    while offset < len(encoded):
        end = min(offset + CHUNK_SIZE, len(encoded))
        # Ensure valid utf-8 boundary first
        while end > offset:
            try:
                encoded[offset:end].decode("utf-8")
                break
            except UnicodeDecodeError:
                end -= 1

        # Don't split inside a sentinel ⟦...⟧ — scan back to find safe boundary
        candidate_text = encoded[offset:end].decode("utf-8", errors="replace")
        # Find last complete sentinel before end — if end lands inside one, back up
        last_open  = candidate_text.rfind("⟦")
        last_close = candidate_text.rfind("⟧")
        if last_open > last_close:
            # We're inside an unclosed sentinel — back up to before the ⟦
            safe_text = candidate_text[:last_open]
            end = offset + len(safe_text.encode("utf-8"))

        chunk_text = encoded[offset:end].decode("utf-8", errors="replace")

        chunks.append({
            "chunk_num": chunk_num,
            "byte_start": offset,
            "byte_end": end,
            "text": chunk_text,
            "regions": [],
            "landmarks": [],
        })
        offset = end
        chunk_num += 1

    return chunks


def annotate_chunks(chunks: list[dict], content: str):
    """Find all regions and landmarks in content, assign to chunks by byte offset."""
    # Find region opens
    for match in re.finditer(REGION_OPEN_RE, content):
        pos = len(content[:match.start()].encode("utf-8"))
        region_id = match.group(1).strip()
        hint = match.group(2).strip()
        for chunk in chunks:
            if chunk["byte_start"] <= pos < chunk["byte_end"]:
                chunk["regions"].append({"region_id": region_id,
                                         "hint": hint, "byte": pos})
                break

    # Find landmarks
    for match in re.finditer(LANDMARK_RE, content):
        pos = len(content[:match.start()].encode("utf-8"))
        lm_type = match.group(2)
        lm_num  = match.group(3)
        lm_id   = f"LM_{lm_type}-{lm_num}"
        for chunk in chunks:
            if chunk["byte_start"] <= pos < chunk["byte_end"]:
                chunk["landmarks"].append({"lm_id": lm_id, "byte": pos})
                break

def build_master_index(chunks: list[dict]) -> str:
    """
    Build master index string from all chunks.
    Regions and landmarks use distinct prefixes so the parser can tell them apart:
      REGION: R:region_id:hint(cN:byte=NNN)
      LANDMARK: L:lm_id(cN:byte=NNN)
    """
    parts = []
    for chunk in chunks:
        for r in chunk["regions"]:
            parts.append(f"R:{r['region_id']}:{r['hint']}(c{chunk['chunk_num']}:byte={r['byte']})")
        for lm in chunk["landmarks"]:
            parts.append(f"L:{lm['lm_id']}(c{chunk['chunk_num']}:byte={lm['byte']})")
    index_body = " ".join(parts) if parts else "empty"
    return f"⟦INDEX|{index_body}⟧"


def build_chunk_header(chunk: dict) -> str:
    region_count   = len(chunk["regions"])
    landmark_count = len(chunk["landmarks"])
    return (f"⟦CHUNK:{chunk['chunk_num']}|"
            f"byte:{chunk['byte_start']}|"
            f"regions:{region_count}|"
            f"landmarks:{landmark_count}⟧")


def strip_existing_headers(content: str) -> str:
    """Remove any previously computed headers so we can recompute cleanly."""
    content = HEADER_BLOCK_RE.sub("", content)
    content = CHUNK_HDR_RE.sub("", content)
    return content


def finalize(memblok_id: str, storage_path: Path) -> dict:
    """
    Full finalize pipeline:
    1. Load raw memblok file
    2. Strip any existing computed headers
    3. Split into chunks
    4. Annotate chunks with region/landmark positions
    5. Compute minimap
    6. Build master index and chunk headers
    7. Prepend header block to file
    8. Write back to disk
    """
    # Find the file
    candidates = list(storage_path.glob(f"{memblok_id}*.mg"))
    if not candidates:
        # Also check in-progress path
        candidates = list(storage_path.glob(f"wip_{memblok_id}*.mg"))
    if not candidates:
        return {"ok": False, "error": f"No memblok found for id '{memblok_id}'"}

    filepath = candidates[0]
    content  = filepath.read_text(encoding="utf-8")
    content  = strip_existing_headers(content)

    chunks   = split_into_chunks(content)
    annotate_chunks(chunks, content)

    minimap       = compute_minimap(content)
    master_index  = build_master_index(chunks)
    total_chunks  = len(chunks)
    total_regions = sum(len(c["regions"])   for c in chunks)
    total_lm      = sum(len(c["landmarks"]) for c in chunks)

    # Insert chunk sub-headers into content at chunk boundaries
    result_parts = []
    for chunk in chunks:
        header = build_chunk_header(chunk)
        result_parts.append(header + "\n" + chunk["text"])
    chunked_content = "\n".join(result_parts)

    # Build full header block
    header_block = (
        f"⟦HEADER_BEGIN⟧\n"
        f"MINIMAP: {minimap}\n"
        f"CHUNKS: {total_chunks} | REGIONS: {total_regions} | LANDMARKS: {total_lm}\n"
        f"{master_index}\n"
        f"⟦HEADER_END⟧\n\n"
    )

    final_content = header_block + chunked_content
    filepath.write_text(final_content, encoding="utf-8")

    return {
        "ok": True,
        "memblok_id": memblok_id,
        "file": str(filepath),
        "minimap": minimap,
        "chunks": total_chunks,
        "regions": total_regions,
        "landmarks": total_lm,
        "bytes": len(final_content.encode("utf-8")),
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--id",      required=True, help="Memblok ID to finalize")
    ap.add_argument("--storage", default=str(STORAGE_DEFAULT))
    args = ap.parse_args()

    import json as _json
    result = finalize(args.id, Path(args.storage))
    print(_json.dumps(result, indent=2, ensure_ascii=False))
    sys.exit(0 if result["ok"] else 1)
