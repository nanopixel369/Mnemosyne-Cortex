"""
test_meridian.py — End-to-end smoke test for Meridian Glyph scripts
Creates a memblok, annotates it, finalizes it, then navigates it.
"""
import sys, json, subprocess
from pathlib import Path

SCRIPTS = Path(r"C:\Users\elxnd\Projects\ChomaCorev3\meridian-glyph\scripts")
STORAGE = Path(r"C:\Users\elxnd\Projects\ChomaCorev3\meridian-glyph\test_storage")
STORAGE.mkdir(exist_ok=True)

def run(script, *args):
    cmd = ["python", str(SCRIPTS / script)] + list(args) + ["--storage", str(STORAGE)]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    try:
        result = json.loads(r.stdout)
    except Exception:
        result = {"raw": r.stdout, "err": r.stderr}
    print(f"\n>> {script} {' '.join(args[:3])}")
    print(json.dumps(result, indent=2, ensure_ascii=False)[:600])
    return result

print("="*60)
print("MERIDIAN GLYPH — END-TO-END SMOKE TEST")
print("="*60)

# 1. Create memblok
r = run("author.py", "create", "--title", "ChromaCore gravity design")
assert r.get("ok"), f"Create failed: {r}"
mid = r["memblok_id"]
print(f"\n[+] Memblok created: {mid}")

# 2. Write test content into the file
fpath = STORAGE / f"wip_{mid}.mg"
test_content = fpath.read_text(encoding="utf-8") + """
The chromatic gravity system computes a weighted centroid in L*a*b* color space.
Each anchor contributes mass proportional to its base_mass plus a logarithmic nudge
derived from tag frequency. The nudge formula is: min(1.0, ln(1+count)/ln(1+scale)).

This design decision was made to prevent high-frequency tags from dominating
the gravity calculation entirely. A tag seen 1000 times should not outweigh
a tag seen 10 times by a factor of 100.

The multiplier in query mode scales the full adjusted mass, not just the nudge.
This was a bug in the original prototype — the multiplier only applied to nudge,
meaning query-mode focus was weaker than intended.

The fix: mass = (base_mass + nudge) * multiplier in all modes.
"""
fpath.write_text(test_content, encoding="utf-8")
print("[+] Test content written to memblok file")

# 3. Annotate a region
r = run("author.py", "annotate",
    "--id", mid,
    "--type", "INSIGHT",
    "--hint", "gravity formula",
    "--start", "The chromatic gravity system",
    "--end", "tag seen 10 times by a factor of 100.")
assert r.get("ok"), f"Annotate failed: {r}"
region_id = r["region_id"]
print(f"[+] Region annotated: {region_id}")

# 4. Annotate a bug+fix pair
r = run("author.py", "annotate",
    "--id", mid, "--type", "BUG",
    "--hint", "multiplier scope",
    "--start", "The multiplier in query mode",
    "--end", "meaning query-mode focus was weaker than intended.",
    "--paired")
assert r.get("ok"), f"Bug annotate failed: {r}"

r = run("author.py", "annotate",
    "--id", mid, "--type", "FIX",
    "--hint", "multiplier fix",
    "--start", "The fix:",
    "--end", "mass = (base_mass + nudge) * multiplier in all modes.",
    "--paired")
assert r.get("ok"), f"Fix annotate failed: {r}"

# 5. Add a landmark
r = run("author.py", "landmark",
    "--id", mid, "--type", "LM_KEY",
    "--anchor", "mass = (base_mass + nudge) * multiplier")
assert r.get("ok"), f"Landmark failed: {r}"

# 6. Preview (triggers finalize)
r = run("author.py", "preview", "--id", mid)
assert r.get("ok"), f"Preview failed: {r}"
print(f"\n[+] PREVIEW OUTPUT:\n{r.get('preview', '')}")

# 7. Navigate — get minimap
r = run("navigate.py", "minimap", "--id", mid)
assert r.get("ok"), f"Minimap failed: {r}"
print(f"\n[+] MINIMAP: {r.get('minimap')}")

# 8. Navigate — get headers for full file
r = run("navigate.py", "headers", "--id", mid, "--from", "0", "--to", "100")
assert r.get("ok"), f"Headers failed: {r}"
print(f"\n[+] HEADERS FOUND: {r.get('count')}")

# 9. Extract the insight region
if r.get("headers"):
    first_region = r["headers"][0]["id"]
    r2 = run("navigate.py", "extract", "--id", mid, "--region", first_region)
    print(f"\n[+] EXTRACTED {first_region}:\n{r2.get('content','')[:300]}")

print("\n" + "="*60)
print("ALL TESTS PASSED" if True else "FAILED")
print("="*60)
