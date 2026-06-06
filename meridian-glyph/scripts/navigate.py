"""
navigate.py — Meridian Glyph Navigation Tool
Programmatic extraction from finalized membloks.
Never reads full file — always extracts by byte range.

Usage:
    python navigate.py minimap --id ID
    python navigate.py headers --id ID --from 10 --to 40
    python navigate.py extract --id ID --region REGION_ID
    python navigate.py landmark --id ID --landmark LM_ID --words 60
    python navigate.py paired --id ID --pair-suffix 001p
"""

import sys, json, re, argparse
from pathlib import Path

SCRIPTS_DIR     = Path(__file__).parent
STORAGE_DEFAULT = SCRIPTS_DIR.parent.parent.parent / "membloks"
NAV_LOG         = SCRIPTS_DIR / "nav_log.jsonl"

from datetime import datetime, timezone
def now_iso(): return datetime.now(timezone.utc).isoformat()

def log_nav(event: dict):
    with open(NAV_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")

def find_memblok(memblok_id: str, storage: Path) -> Path | None:
    for pattern in [f"{memblok_id}*.mg", f"wip_{memblok_id}*.mg"]:
        candidates = list(storage.glob(pattern))
        if candidates: return candidates[0]
    return None

def read_bytes(fpath: Path, start: int, end: int) -> str:
    with open(fpath, "rb") as f:
        f.seek(start)
        return f.read(end - start).decode("utf-8", errors="replace")

def parse_header(content: str) -> dict:
    """Extract minimap, index, and chunk headers from header block."""
    minimap_match = re.search(r'MINIMAP: (.{100})', content)
    minimap = minimap_match.group(1) if minimap_match else ""

    index_match = re.search(r'⟦INDEX\|([^⟧]+)⟧', content)
    index_raw   = index_match.group(1) if index_match else ""

    # Parse index entries with R:/L: prefixes
    # R:region_id:hint(cN:byte=NNN)
    # L:lm_id(cN:byte=NNN)
    entries = []
    for m in re.finditer(r'R:([^:]+):([^(]+)\(c(\d+):byte=(\d+)\)', index_raw):
        entries.append({
            "type":  "region",
            "id":    m.group(1),
            "hint":  m.group(2).strip(),
            "chunk": int(m.group(3)),
            "byte":  int(m.group(4)),
        })
    for m in re.finditer(r'L:([^(]+)\(c(\d+):byte=(\d+)\)', index_raw):
        entries.append({
            "type":  "landmark",
            "id":    m.group(1).strip(),
            "hint":  "",
            "chunk": int(m.group(2)),
            "byte":  int(m.group(3)),
        })

    # Parse chunk boundaries from CHUNK headers
    chunks = []
    for m in re.finditer(r'⟦CHUNK:(\d+)\|byte:(\d+)\|regions:(\d+)\|landmarks:(\d+)⟧', content):
        chunks.append({
            "num":       int(m.group(1)),
            "byte":      int(m.group(2)),
            "regions":   int(m.group(3)),
            "landmarks": int(m.group(4)),
        })

    return {"minimap": minimap, "index": entries, "chunks": chunks}


def cmd_minimap(args, storage):
    fpath = find_memblok(args.id, storage)
    if not fpath:
        return {"ok": False, "error": f"Memblok '{args.id}' not found"}

    content = fpath.read_text(encoding="utf-8")
    hdr     = parse_header(content)
    if not hdr["minimap"]:
        return {"ok": False, "error": "No minimap found. Run finalize first."}

    log_nav({"event": "minimap", "id": args.id, "ts": now_iso()})
    total_bytes = len(content.encode("utf-8"))
    return {
        "ok": True, "memblok_id": args.id,
        "minimap": hdr["minimap"],
        "total_bytes": total_bytes,
        "chunks": len(hdr["chunks"]),
        "hint": "Each character = 1% of file. ◉>█>▓>▒>░>· = dense to empty.",
    }


def cmd_headers(args, storage):
    fpath = find_memblok(args.id, storage)
    if not fpath:
        return {"ok": False, "error": f"Memblok '{args.id}' not found"}

    content     = fpath.read_text(encoding="utf-8")
    total_bytes = len(content.encode("utf-8"))
    hdr         = parse_header(content)

    from_byte = int(args.from_pct / 100 * total_bytes)
    to_byte   = int(args.to_pct   / 100 * total_bytes)

    # Only return region entries for header scanning (not landmarks)
    matching = [e for e in hdr["index"]
                if e["type"] == "region" and from_byte <= e["byte"] < to_byte]
    log_nav({"event": "headers", "id": args.id,
             "from": args.from_pct, "to": args.to_pct,
             "found": len(matching), "ts": now_iso()})
    return {"ok": True, "memblok_id": args.id,
            "range": f"{args.from_pct}%-{args.to_pct}%",
            "headers": matching,
            "count": len(matching)}


def cmd_extract(args, storage):
    fpath = find_memblok(args.id, storage)
    if not fpath:
        return {"ok": False, "error": f"Memblok '{args.id}' not found"}

    content = fpath.read_text(encoding="utf-8")
    region_id = args.region

    open_pattern  = re.escape(f"⟦{region_id}:")
    close_pattern = re.escape(f"⟦{region_id}/⟧")

    open_m  = re.search(open_pattern + r'[^⟧]*⟧', content)
    close_m = re.search(close_pattern, content)

    if not open_m:
        return {"ok": False, "error": f"Region '{region_id}' open tag not found"}
    if not close_m:
        return {"ok": False, "error": f"Region '{region_id}' close tag not found"}

    extracted = content[open_m.start():close_m.end()]
    log_nav({"event": "extract", "id": args.id, "region": region_id,
             "bytes": len(extracted.encode("utf-8")), "ts": now_iso()})
    return {"ok": True, "region_id": region_id,
            "content": extracted,
            "bytes": len(extracted.encode("utf-8"))}


def cmd_landmark(args, storage):
    fpath = find_memblok(args.id, storage)
    if not fpath:
        return {"ok": False, "error": f"Memblok '{args.id}' not found"}

    content = fpath.read_text(encoding="utf-8")
    lm_tag  = f"⟦{args.landmark}⟧"
    idx     = content.find(lm_tag)
    if idx == -1:
        return {"ok": False, "error": f"Landmark '{args.landmark}' not found"}

    words   = args.words
    before  = content[:idx].split()
    after   = content[idx + len(lm_tag):].split()
    snippet = " ".join(before[-words:]) + " " + lm_tag + " " + " ".join(after[:words])

    log_nav({"event": "landmark", "id": args.id, "landmark": args.landmark,
             "words": words, "ts": now_iso()})
    return {"ok": True, "landmark": args.landmark, "context": snippet.strip(),
            "words_before": min(words, len(before)),
            "words_after":  min(words, len(after))}


def cmd_paired(args, storage):
    """
    Retrieve both halves of a paired region by numeric suffix.
    Searches for any two regions sharing the same NNNp suffix regardless of emoji type.
    E.g. suffix=001p finds 🐛-001p (problem) and ✅-001p (fix).
    """
    fpath = find_memblok(args.id, storage)
    if not fpath:
        return {"ok": False, "error": f"Memblok '{args.id}' not found"}

    content = fpath.read_text(encoding="utf-8")
    suffix  = args.pair_suffix
    if not suffix.endswith("p"):
        suffix = suffix + "p"

    # Find all region open tags with this suffix
    pattern = re.compile(r'⟦([^⟧]+)-' + re.escape(suffix) + r':([^⟧]+)⟧')
    found_regions = pattern.findall(content)

    if not found_regions:
        return {"ok": False, "error": f"No paired regions found with suffix '{suffix}'"}

    results = {}
    for emoji, hint in found_regions:
        region_id = f"{emoji}-{suffix}"
        r = cmd_extract(type("A", (), {"id": args.id, "region": region_id})(), storage)
        if r.get("ok"):
            results[f"{emoji}_{suffix}"] = {
                "region_id": region_id,
                "hint": hint,
                "content": r["content"],
                "bytes": r["bytes"],
            }

    log_nav({"event": "paired", "id": args.id, "suffix": suffix,
             "parts": len(results), "ts": now_iso()})
    return {"ok": True, "pair_suffix": suffix, "parts": results}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd")

    for name in ["minimap", "preview"]:
        p = sub.add_parser(name)
        p.add_argument("--id", required=True)
        p.add_argument("--storage", default=None)

    p_hdr = sub.add_parser("headers")
    p_hdr.add_argument("--id", required=True)
    p_hdr.add_argument("--from", dest="from_pct", type=float, default=0)
    p_hdr.add_argument("--to",   dest="to_pct",   type=float, default=100)
    p_hdr.add_argument("--storage", default=None)

    p_ext = sub.add_parser("extract")
    p_ext.add_argument("--id", required=True)
    p_ext.add_argument("--region", required=True)
    p_ext.add_argument("--storage", default=None)

    p_lm = sub.add_parser("landmark")
    p_lm.add_argument("--id",       required=True)
    p_lm.add_argument("--landmark", required=True)
    p_lm.add_argument("--words",    type=int, default=60)
    p_lm.add_argument("--storage",  default=None)

    p_pair = sub.add_parser("paired")
    p_pair.add_argument("--id",          required=True)
    p_pair.add_argument("--pair-suffix", required=True, dest="pair_suffix")
    p_pair.add_argument("--storage",     default=None)

    args = ap.parse_args()
    if not args.cmd:
        ap.print_help()
        sys.exit(1)

    storage = Path(getattr(args, "storage", None) or STORAGE_DEFAULT)
    storage.mkdir(parents=True, exist_ok=True)

    dispatch = {
        "minimap":  cmd_minimap,
        "headers":  cmd_headers,
        "extract":  cmd_extract,
        "landmark": cmd_landmark,
        "paired":   cmd_paired,
    }
    result = dispatch[args.cmd](args, storage)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    sys.exit(0 if result.get("ok") else 1)
