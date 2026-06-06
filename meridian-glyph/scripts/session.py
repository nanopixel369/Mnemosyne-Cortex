import subprocess, json
from pathlib import Path

SCRIPTS = Path(r"C:\Users\elxnd\Projects\ChomaCorev3\meridian-glyph\scripts")
STORAGE = Path(r"C:\Users\elxnd\Projects\ChomaCorev3\meridian-glyph\membloks")
MID = "57749572"

def run(script, args):
    cmd = ["python", str(SCRIPTS / script)] + args + ["--storage", str(STORAGE)]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    try: return json.loads(r.stdout)
    except: return {"ok": False, "raw": r.stdout[:400], "err": r.stderr[:200]}

# Re-finalize with fixed index format
print("--- RE-FINALIZE ---")
r = run("finalize.py", ["--id", MID])
print(f"ok={r.get('ok')} regions={r.get('regions')} landmarks={r.get('landmarks')}")

# Minimap
print("\n--- MINIMAP ---")
r = run("navigate.py", ["minimap", "--id", MID])
print(f"minimap: {r.get('minimap')}")

# Headers full range
print("\n--- ALL HEADERS ---")
r = run("navigate.py", ["headers", "--from", "0", "--to", "100", "--id", MID])
for h in r.get("headers", []):
    print(f"  {h['id']:20s} | {h['hint']:30s} | c{h['chunk']} byte={h['byte']}")

# Paired extraction — bug+fix pair 001p
print("\n--- PAIRED 001p ---")
r = run("navigate.py", ["paired", "--pair-suffix", "001p", "--id", MID])
if r.get("ok"):
    for key, part in r.get("parts", {}).items():
        print(f"\n  [{key}] hint='{part['hint']}' bytes={part['bytes']}")
        print(f"  {part['content'][:250]}")

# Landmark context
print("\n--- LANDMARK 🔑LM_KEY-001 ---")
r = run("navigate.py", ["landmark", "--landmark", "🔑LM_KEY-001", "--words", "30", "--id", MID])
print(r.get("context", "")[:400])
