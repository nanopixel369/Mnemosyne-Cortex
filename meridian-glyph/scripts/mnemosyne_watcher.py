"""
mnemosyne_watcher.py — Claude Desktop Conversation Watcher
Tails the Claude Desktop IndexedDB LevelDB log file, extracts completed
conversation turns, and triggers Meridian Glyph authoring when thresholds are met.

This is the passive capture layer for Mnemosyne Cortex on Claude Desktop.

Run as a background process:
    python mnemosyne_watcher.py [--dry-run]
"""

import os, re, json, time, hashlib, argparse, sys
from pathlib import Path
from datetime import datetime, timezone
from collections import deque

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)

# ── Paths ──────────────────────────────────────────────────────────────────
LEVELDB_DIR = Path(r"C:\Users\elxnd\AppData\Roaming\Claude\IndexedDB"
                   r"\https_claude.ai_0.indexeddb.leveldb")

SCRIPTS_DIR = Path(r"C:\Users\elxnd\Projects\ChomaCorev3\meridian-glyph\scripts")
STORAGE_DIR = Path(r"C:\Users\elxnd\Projects\ChomaCorev3\meridian-glyph\membloks")
WATCH_LOG   = Path(r"C:\Users\elxnd\Projects\ChomaCorev3\meridian-glyph\scripts\watcher_log.jsonl")

def get_active_log() -> Path | None:
    """Find the current LevelDB write-ahead log (highest numbered .log file)."""
    logs = sorted(LEVELDB_DIR.glob("*.log"), key=lambda p: p.stem)
    return logs[-1] if logs else None

# ── Config ─────────────────────────────────────────────────────────────────
POLL_INTERVAL    = 3.0    # seconds between log polls
MIN_TURNS_COMMIT = 6      # minimum turns before considering a commit
MAX_TURNS_BUFFER = 20     # commit if buffer exceeds this
MIN_CHARS_COMMIT = 2000   # minimum total chars before considering a commit

# ── Patterns ───────────────────────────────────────────────────────────────
# TipTap editor state — captures the user's current input
TIPTAP_RE = re.compile(
    r'"tipTapEditorState":\{"type":"doc","content":\[.*?"text":"(.*?)".*?\]\}',
    re.DOTALL
)

# Message content patterns in IndexedDB storage
MSG_TEXT_RE = re.compile(r'"text":"((?:[^"\\]|\\.){20,})"')
ROLE_RE     = re.compile(r'"role":"(human|assistant)"')

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def log_event(event: dict):
    with open(WATCH_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")

class LogReader:
    """
    Tails the LevelDB write-ahead log file.
    Extracts text segments from binary log entries.
    Tracks file position to only process new data.
    """
    def __init__(self, path: Path):
        self.path     = path
        self.position = 0
        self.seen     = set()   # hashes of already-processed segments

    def read_new(self) -> list[str]:
        """Read any new content appended since last poll. Returns list of text segments."""
        try:
            size = self.path.stat().st_size
        except FileNotFoundError:
            return []

        if size <= self.position:
            # File may have rotated (LevelDB compaction)
            if size < self.position:
                self.position = 0
            return []

        with open(self.path, "rb") as f:
            f.seek(self.position)
            raw = f.read(size - self.position)
            self.position = size

        return self._extract_text(raw)

    def _extract_text(self, raw: bytes) -> list[str]:
        """
        Extract readable text segments from binary LevelDB log data.
        Uses a rolling buffer to catch JSON that spans binary boundaries.
        """
        # Decode to string, replacing non-UTF8 with spaces
        text = raw.decode("utf-8", errors="replace")

        # Find all TipTap text values directly in the raw decoded string
        segments = []
        for m in re.finditer(r'"text"\s*:\s*"((?:[^"\\]|\\.){20,})"', text):
            content = m.group(1).replace('\\"', '"').replace('\\n', '\n').strip()
            h = hashlib.md5(content.encode()).hexdigest()
            if h not in self.seen and len(content) > 20:
                self.seen.add(h)
                segments.append(content)

        return segments


class TurnBuffer:
    """
    Accumulates conversation turns extracted from log segments.
    Decides when enough has accumulated to commit a memblok.
    """
    def __init__(self):
        self.turns     = deque()
        self.total_chars = 0
        self.last_hash = None

    def add_segments(self, segments: list[str]) -> int:
        """Add new text segments as turns. Returns count added."""
        added = 0
        for text in segments:
            if len(text) < 30:
                continue
            h = hashlib.md5(text.encode()).hexdigest()
            if h != self.last_hash:
                self.turns.append({"role": "human", "text": text, "ts": now_iso()})
                self.total_chars += len(text)
                self.last_hash = h
                added += 1
        return added

    def should_commit(self) -> bool:
        return (len(self.turns) >= MIN_TURNS_COMMIT and
                self.total_chars >= MIN_CHARS_COMMIT)

    def should_force_commit(self) -> bool:
        return len(self.turns) >= MAX_TURNS_BUFFER

    def drain(self) -> list[dict]:
        """Remove and return all buffered turns."""
        turns = list(self.turns)
        self.turns.clear()
        self.total_chars = 0
        return turns

def build_content_from_turns(turns: list[dict]) -> str:
    """Format buffered turns into memblok content."""
    lines = [f"== CONVERSATION CAPTURE ==",
             f"captured: {now_iso()}",
             f"turns: {len(turns)}", ""]
    for t in turns:
        role = t.get("role", "unknown").upper()
        lines.append(f"[{role}] {t['ts']}")
        lines.append(t["text"])
        lines.append("")
    return "\n".join(lines)


def run_script(script: str, args: list[str]) -> dict:
    import subprocess
    cmd = ["python", str(SCRIPTS_DIR / script)] + args + ["--storage", str(STORAGE_DIR)]
    r = subprocess.run(cmd, capture_output=True, encoding="utf-8", timeout=15)
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"ok": False, "err": r.stderr[:200]}


def commit_turns(turns: list[dict], dry_run: bool = False) -> bool:
    """
    Author and commit a memblok from buffered turns.
    Returns True on success.
    """
    content  = build_content_from_turns(turns)
    title    = f"claude-desktop-{datetime.now().strftime('%Y%m%d-%H%M')}"

    print(f"  [commit] {len(turns)} turns, {len(content)} chars -> '{title}'")

    if dry_run:
        print(f"  [DRY RUN] Would commit:\n{content[:400]}\n...")
        log_event({"event": "dry_run_commit", "turns": len(turns),
                   "chars": len(content), "ts": now_iso()})
        return True

    # 1. Create memblok
    r = run_script("author.py", ["create", "--title", title])
    if not r.get("ok"):
        # May be in-progress session — abandon and retry
        wf_path = SCRIPTS_DIR.parent / "workflow.json"
        if wf_path.exists():
            wf = json.loads(wf_path.read_text())
            if wf.get("in_progress"):
                run_script("author.py", ["abandon", "--id", wf["in_progress"]["id"]])
                r = run_script("author.py", ["create", "--title", title])

    if not r.get("ok"):
        print(f"  [ERROR] create failed: {r}")
        return False

    mid   = r["memblok_id"]
    fpath = Path(r["file"])

    # 2. Write content into the file
    existing = fpath.read_text(encoding="utf-8")
    fpath.write_text(existing + "\n" + content, encoding="utf-8")

    # 3. Commit (finalize is called internally by commit)
    r = run_script("author.py", ["commit", "--id", mid])
    if r.get("ok"):
        print(f"  [ok] committed memblok {mid}")
        log_event({"event": "committed", "id": mid, "turns": len(turns),
                   "chars": len(content), "ts": now_iso()})
        return True
    else:
        print(f"  [ERROR] commit failed: {r}")
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="Print what would be committed without writing")
    ap.add_argument("--log-path", default=None,
                    help="Path to LevelDB log file (auto-detected if omitted)")
    args = ap.parse_args()

    log_path = Path(args.log_path) if args.log_path else get_active_log()
    if not log_path or not log_path.exists():
        print(f"[ERROR] LevelDB log not found in {LEVELDB_DIR}")
        print("Make sure Claude Desktop is running.")
        return

    print(f"[*] Mnemosyne Watcher started")
    print(f"[*] Watching: {log_path}")
    print(f"[*] Storage:  {STORAGE_DIR}")
    print(f"[*] Commit threshold: {MIN_TURNS_COMMIT} turns or {MAX_TURNS_BUFFER} max")
    if args.dry_run:
        print(f"[*] DRY RUN MODE — no files will be written")
    print()

    reader = LogReader(log_path)
    buffer = TurnBuffer()

    # Seed position to end of current file — don't reprocess history
    try:
        reader.position = log_path.stat().st_size
        print(f"[*] Starting from byte {reader.position} (skipping history)")
    except Exception:
        pass

    try:
        while True:
            # Handle log rotation — LevelDB may switch to a new .log file
            current_log = get_active_log()
            if current_log and current_log != log_path:
                print(f"[*] Log rotated: {log_path.name} -> {current_log.name}")
                log_path = current_log
                reader = LogReader(log_path)

            segments = reader.read_new()
            if segments:
                new_turns = buffer.add_segments(segments)
                if new_turns:
                    print(f"  [+] {new_turns} new turn(s) | buffer: "
                          f"{len(buffer.turns)} turns, {buffer.total_chars} chars")

            if buffer.should_force_commit():
                print(f"  [!] Buffer full — forcing commit")
                turns = buffer.drain()
                commit_turns(turns, dry_run=args.dry_run)
            elif buffer.should_commit():
                print(f"  [~] Threshold reached — committing")
                turns = buffer.drain()
                commit_turns(turns, dry_run=args.dry_run)

            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print(f"\n[*] Watcher stopped.")
        if buffer.turns:
            print(f"[*] {len(buffer.turns)} uncommitted turns in buffer.")
            ans = input("Commit before exit? [y/N]: ")
            if ans.lower() == "y":
                commit_turns(list(buffer.turns), dry_run=args.dry_run)


if __name__ == "__main__":
    main()
