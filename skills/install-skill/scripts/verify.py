"""
verify.py — Mnemosyne Cortex Install Verifier
Checks that all components of a Mnemosyne installation are working.

Usage:
    python verify.py [--platform claude-desktop|claude-code|openclaw]
"""

import sys, os, json, subprocess, argparse
from pathlib import Path

# Try to auto-detect repo root — verify.py lives at install-skill/scripts/verify.py
# so repo root is two levels up
REPO_ROOT = Path(__file__).parent.parent.parent

def check(label: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    print(f"  [{status}] {label}")
    if detail and not passed:
        print(f"         {detail}")
    return passed

def run_silent(cmd: list) -> bool:
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=10)
        return r.returncode == 0
    except Exception:
        return False

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--platform", default="claude-desktop",
                    choices=["claude-desktop", "claude-code", "openclaw"])
    args = ap.parse_args()

    print(f"\n{'='*50}")
    print(f"MNEMOSYNE CORTEX — INSTALL VERIFICATION")
    print(f"Platform: {args.platform}")
    print(f"{'='*50}\n")

    results = []

    # Core dependencies
    print("Core dependencies:")
    results.append(check("Bun installed", run_silent(["bun", "--version"])))
    results.append(check("Python installed", run_silent(["python", "--version"])))

    # Repo structure
    print("\nRepository structure:")
    results.append(check("meridian-glyph/SKILL.md exists",
        (REPO_ROOT / "meridian-glyph" / "SKILL.md").exists()))
    results.append(check("mnemosyne-skill/SKILL.md exists",
        (REPO_ROOT / "mnemosyne-skill" / "SKILL.md").exists()))
    results.append(check("meridian-glyph/scripts/author.py exists",
        (REPO_ROOT / "meridian-glyph" / "scripts" / "author.py").exists()))
    results.append(check("meridian-glyph/scripts/navigate.py exists",
        (REPO_ROOT / "meridian-glyph" / "scripts" / "navigate.py").exists()))
    results.append(check("membloks directory exists",
        (REPO_ROOT / "meridian-glyph" / "membloks").exists()))

    # ChromaCore artifacts
    print("\nChromaCore artifacts:")
    results.append(check("halton_10k.json exists",
        (REPO_ROOT / "halton_10k.json").exists()))
    results.append(check("kdtree_cielab.bin exists",
        (REPO_ROOT / "kdtree_cielab.bin").exists()))

    # Validate script
    print("\nMeridian Glyph scripts:")
    r = subprocess.run(
        ["python", str(REPO_ROOT / "meridian-glyph" / "scripts" / "validate.py"),
         "--type", "INSIGHT"],
        capture_output=True, encoding="utf-8", timeout=10
    )
    try:
        data = json.loads(r.stdout)
        results.append(check("validate.py responds correctly", data.get("valid") is True))
    except Exception:
        results.append(check("validate.py responds correctly", False, r.stderr[:100]))

    # Platform-specific checks
    print(f"\nPlatform checks ({args.platform}):")
    if args.platform == "claude-desktop":
        config_path = Path(os.environ.get("APPDATA", "")) / "Claude" / "claude_desktop_config.json"
        if config_path.exists():
            try:
                config = json.loads(config_path.read_text())
                has_mg = "meridian-glyph" in config.get("mcpServers", {})
                results.append(check("MCP server registered in claude_desktop_config.json", has_mg,
                    "Add meridian-glyph entry to mcpServers in claude_desktop_config.json"))
            except Exception:
                results.append(check("claude_desktop_config.json readable", False))
        else:
            results.append(check("claude_desktop_config.json exists", False,
                f"Not found at {config_path}"))

        leveldb = Path(os.environ.get("APPDATA", "")) / "Claude" / "IndexedDB" / \
                  "https_claude.ai_0.indexeddb.leveldb"
        results.append(check("Claude Desktop LevelDB exists", leveldb.exists(),
            "Claude Desktop must be installed and have been opened at least once"))

    elif args.platform == "claude-code":
        claude_dir = Path.home() / ".claude"
        results.append(check("~/.claude directory exists", claude_dir.exists()))
        projects = claude_dir / "projects"
        results.append(check("~/.claude/projects exists", projects.exists()))

    elif args.platform == "openclaw":
        openclaw_dir = Path.home() / ".openclaw"
        results.append(check("~/.openclaw directory exists", openclaw_dir.exists(),
            "OpenClaw must be installed first"))

    # Summary
    passed = sum(results)
    total  = len(results)
    print(f"\n{'='*50}")
    print(f"RESULT: {passed}/{total} checks passed")
    if passed == total:
        print("Installation verified successfully.")
    else:
        print(f"{total - passed} check(s) failed. Review the FAIL items above.")
    print(f"{'='*50}\n")

    sys.exit(0 if passed == total else 1)

if __name__ == "__main__":
    main()
