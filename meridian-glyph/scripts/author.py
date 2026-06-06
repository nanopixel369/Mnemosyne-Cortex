"""
author.py — Meridian Glyph Authoring Tool
Handles create, annotate, landmark, preview, commit operations.
All structural computation is delegated to finalize.py.

Usage:
    python author.py create --title "my title"
    python author.py annotate --id ID --type INSIGHT --hint "gravity engine" --start "text" --end "text"
    python author.py landmark --id ID --type LM_KEY --anchor "text near landmark"
    python author.py preview --id ID
    python author.py commit --id ID
    python author.py abandon --id ID
"""

import sys, json, re, argparse, time, uuid, hashlib
from pathlib import Path
from datetime import datetime, timezone

SCRIPTS_DIR     = Path(__file__).parent
STORAGE_DEFAULT = SCRIPTS_DIR.parent.parent.parent / "membloks"
WIP_PREFIX      = "wip_"
LOG_FILE        = SCRIPTS_DIR / "author_log.jsonl"
WORKFLOW_JSON   = SCRIPTS_DIR.parent / "workflow.json"

def get_storage(storage_arg=None) -> Path:
    p = Path(storage_arg) if storage_arg else STORAGE_DEFAULT
    p.mkdir(parents=True, exist_ok=True)
    return p

def short_id() -> str:
    return hashlib.md5(str(time.time_ns()).encode()).hexdigest()[:8]

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def load_workflow() -> dict:
    if WORKFLOW_JSON.exists():
        return json.loads(WORKFLOW_JSON.read_text(encoding="utf-8"))
    return {"version": "0.1", "in_progress": None, "last_committed": None, "session_log": []}

def save_workflow(state: dict):
    WORKFLOW_JSON.write_text(json.dumps(state, indent=2), encoding="utf-8")

def log_event(event: dict):
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")

def find_wip(memblok_id: str, storage: Path) -> Path | None:
    candidates = list(storage.glob(f"{WIP_PREFIX}{memblok_id}*.mg"))
    return candidates[0] if candidates else None

def cmd_create(args, storage):
    state = load_workflow()
    if state.get("in_progress"):
        return {"ok": False, "error": f"In-progress memblok exists: {state['in_progress']['id']}. Commit or abandon it first."}

    mid  = short_id()
    fname = f"{WIP_PREFIX}{mid}.mg"
    fpath = storage / fname
    title = args.title or "untitled"

    fpath.write_text(
        f"# {title}\n"
        f"# created: {now_iso()}\n"
        f"# id: {mid}\n\n"
        f"[CONTENT FOLLOWS — paste or write content below this line]\n\n",
        encoding="utf-8"
    )

    state["in_progress"] = {"id": mid, "title": title, "file": str(fpath), "created": now_iso()}
    save_workflow(state)
    log_event({"event": "create", "id": mid, "title": title, "ts": now_iso()})

    return {"ok": True, "memblok_id": mid, "file": str(fpath),
            "next": f"Open {fpath} and paste your content, then run annotate commands."}


def cmd_annotate(args, storage):
    from validate import validate

    v = validate(args.type)
    if not v["valid"]:
        return {"ok": False, "error": v["message"]}

    fpath = find_wip(args.id, storage)
    if not fpath:
        return {"ok": False, "error": f"No in-progress memblok '{args.id}'"}

    content = fpath.read_text(encoding="utf-8")
    emoji   = v["emoji"]
    type_id = v["type_id"]

    # Find anchor positions
    start_idx = content.find(args.start)
    end_idx   = content.find(args.end)
    if start_idx == -1:
        return {"ok": False, "error": f"Start anchor not found: '{args.start}'"}
    if end_idx == -1:
        return {"ok": False, "error": f"End anchor not found: '{args.end}'"}
    if end_idx < start_idx:
        return {"ok": False, "error": "End anchor appears before start anchor"}

    # Generate region ID
    existing = re.findall(rf'⟦{re.escape(emoji)}-(\d+)', content)
    nums     = [int(n.rstrip("p")) for n in existing if n.isdigit() or n.rstrip("p").isdigit()]
    next_num = (max(nums) + 1) if nums else 1
    suffix   = "p" if args.paired else ""
    region_id = f"{emoji}-{next_num:03d}{suffix}"

    hint = " ".join(args.hint.split())[:30]  # normalize whitespace, enforce concise

    open_tag  = f"⟦{region_id}:{hint}⟧"
    close_tag = f"⟦{region_id}/⟧"

    # Insert tags around the anchored span
    # Insert close tag after end anchor, open tag before start anchor
    end_insert   = end_idx + len(args.end)
    new_content  = content[:start_idx] + open_tag + content[start_idx:end_insert] + close_tag + content[end_insert:]
    fpath.write_text(new_content, encoding="utf-8")

    log_event({"event": "annotate", "id": args.id, "region": region_id, "hint": hint, "ts": now_iso()})
    return {"ok": True, "region_id": region_id, "open_tag": open_tag, "close_tag": close_tag}


def cmd_landmark(args, storage):
    from validate import LANDMARK_TYPES, load_dictionary
    load_dictionary()

    fpath = find_wip(args.id, storage)
    if not fpath:
        return {"ok": False, "error": f"No in-progress memblok '{args.id}'"}

    lm_type = args.type.replace("LM_", "").upper()
    emoji_map = {"LOCATION": "📍", "CONCLUSION": "🏁", "KEY": "🔑",
                 "QUESTION": "❓", "QUOTE": "💬", "REVISION": "🔄"}
    emoji = emoji_map.get(lm_type)
    if not emoji:
        return {"ok": False, "error": f"Unknown landmark type '{args.type}'. "
                f"Valid: {list(emoji_map.keys())}"}

    content  = fpath.read_text(encoding="utf-8")
    anchor_idx = content.find(args.anchor)
    if anchor_idx == -1:
        return {"ok": False, "error": f"Anchor text not found: '{args.anchor}'"}

    existing = re.findall(rf'⟦{re.escape(emoji)}LM_{lm_type}-(\d+)⟧', content)
    next_num = (max(int(n) for n in existing) + 1) if existing else 1
    lm_id    = f"{emoji}LM_{lm_type}-{next_num:03d}"
    tag      = f"⟦{lm_id}⟧"

    # Insert immediately before the anchor text
    new_content = content[:anchor_idx] + tag + content[anchor_idx:]
    fpath.write_text(new_content, encoding="utf-8")

    log_event({"event": "landmark", "id": args.id, "lm_id": lm_id, "ts": now_iso()})
    return {"ok": True, "landmark_id": lm_id, "tag": tag}

def cmd_preview(args, storage):
    from finalize import finalize
    result = finalize(args.id, storage)
    if not result["ok"]:
        return result

    fpath = Path(result["file"])
    content = fpath.read_text(encoding="utf-8")
    # Show only the header block — the first section up to HEADER_END
    end_marker = "⟦HEADER_END⟧"
    end_idx = content.find(end_marker)
    if end_idx != -1:
        preview = content[:end_idx + len(end_marker)]
    else:
        preview = content[:800]

    return {"ok": True, "preview": preview, "stats": {
        "chunks": result["chunks"], "regions": result["regions"],
        "landmarks": result["landmarks"], "bytes": result["bytes"]
    }}


def cmd_commit(args, storage):
    from finalize import finalize
    result = finalize(args.id, storage)
    if not result["ok"]:
        return result

    wip_path = Path(result["file"])
    final_name = wip_path.name.replace(WIP_PREFIX, "")
    final_path = wip_path.parent / final_name
    wip_path.rename(final_path)

    state = load_workflow()
    state["last_committed"] = {"id": args.id, "file": str(final_path), "ts": now_iso()}
    state["in_progress"] = None
    if "session_log" not in state:
        state["session_log"] = []
    state["session_log"].append({"id": args.id, "committed": now_iso()})
    save_workflow(state)

    log_event({"event": "commit", "id": args.id, "file": str(final_path), "ts": now_iso()})
    return {"ok": True, "memblok_id": args.id, "file": str(final_path),
            "message": "Memblok committed. Ready for ChromaCore ingestion."}


def cmd_abandon(args, storage):
    fpath = find_wip(args.id, storage)
    if not fpath:
        return {"ok": False, "error": f"No in-progress memblok '{args.id}'"}

    fpath.unlink()
    state = load_workflow()
    state["in_progress"] = None
    save_workflow(state)
    log_event({"event": "abandon", "id": args.id, "ts": now_iso()})
    return {"ok": True, "message": f"Abandoned memblok {args.id}"}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd")

    p_create = sub.add_parser("create")
    p_create.add_argument("--title",   default="untitled")
    p_create.add_argument("--storage", default=None)

    p_ann = sub.add_parser("annotate")
    p_ann.add_argument("--id",      required=True)
    p_ann.add_argument("--type",    required=True)
    p_ann.add_argument("--hint",    required=True)
    p_ann.add_argument("--start",   required=True)
    p_ann.add_argument("--end",     required=True)
    p_ann.add_argument("--paired",  action="store_true")
    p_ann.add_argument("--storage", default=None)

    p_lm = sub.add_parser("landmark")
    p_lm.add_argument("--id",      required=True)
    p_lm.add_argument("--type",    required=True)
    p_lm.add_argument("--anchor",  required=True)
    p_lm.add_argument("--storage", default=None)

    p_prev = sub.add_parser("preview")
    p_prev.add_argument("--id",      required=True)
    p_prev.add_argument("--storage", default=None)

    p_commit = sub.add_parser("commit")
    p_commit.add_argument("--id",      required=True)
    p_commit.add_argument("--storage", default=None)

    p_abandon = sub.add_parser("abandon")
    p_abandon.add_argument("--id",      required=True)
    p_abandon.add_argument("--storage", default=None)

    args = ap.parse_args()
    if not args.cmd:
        ap.print_help()
        sys.exit(1)

    storage = get_storage(getattr(args, "storage", None))
    dispatch = {
        "create":   cmd_create,
        "annotate": cmd_annotate,
        "landmark": cmd_landmark,
        "preview":  cmd_preview,
        "commit":   cmd_commit,
        "abandon":  cmd_abandon,
    }
    result = dispatch[args.cmd](args, storage)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    sys.exit(0 if result.get("ok") else 1)
