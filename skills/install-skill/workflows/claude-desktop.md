# Install Workflow: Claude Desktop
version: 0.1 | status: placeholder — update when beta install process is finalized

You are installing Mnemosyne Cortex on Claude Desktop with Desktop Commander MCP.

---

## PREREQUISITES CHECK

Before starting, verify:
- Desktop Commander MCP is connected and responding
- Bun is installed: `bun --version`
- Python 3.x is installed: `python --version`
- Git is installed: `git --version`

If any are missing, install them before proceeding.

---

## STEP 1 — Clone the repository

```
git clone https://github.com/elxnd/mnemosyne-cortex.git C:\Users\<username>\Projects\mnemosyne-cortex
```

Replace `<username>` with the actual Windows username (check via `echo %USERNAME%`).

---

## STEP 2 — Install dependencies

```
cd C:\Users\<username>\Projects\mnemosyne-cortex
bun install
```

---

## STEP 3 — Bootstrap ChromaCore database

```
bun run bin/generate_artifacts.ts
```

This generates the KD-Tree and Halton artifacts if not already present.
Then bootstrap the database:

```
bun run src/index.ts bootstrap --preset general
```

---

## STEP 4 — Register the MCP server

Add the following to claude_desktop_config.json
(located at C:\Users\<username>\AppData\Roaming\Claude\claude_desktop_config.json):

```json
"meridian-glyph": {
  "command": "bun",
  "args": ["run", "C:\\Users\\<username>\\Projects\\mnemosyne-cortex\\meridian-glyph\\server.ts"]
}
```

---

## STEP 5 — Start the conversation logger

```
python C:\Users\<username>\Projects\mnemosyne-cortex\adapters\claude-desktop.py
```

This starts the passive conversation capture process.

---

## STEP 6 — Verify installation

Run: `python C:\Users\<username>\Projects\mnemosyne-cortex\install-skill\scripts\verify.py`

---

## NOTES (placeholder)
- The exact ChromaCore bootstrap command may change as the CLI is finalized
- The logger adapter path will be confirmed once the adapter layer is built
- MCP server config format verified working as of June 2026
