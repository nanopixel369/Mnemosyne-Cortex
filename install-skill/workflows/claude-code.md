# Install Workflow: Claude Code
version: 0.1 | status: placeholder — update when beta install process is finalized

You are installing Mnemosyne Cortex for use with Claude Code.

---

## PREREQUISITES CHECK

- Claude Code is installed and authenticated
- Bun is installed: `bun --version`
- Python 3.x is installed: `python --version`
- Git is installed: `git --version`

---

## STEP 1 — Clone the repository into skills directory

```
git clone https://github.com/elxnd/mnemosyne-cortex.git ~/.claude/skills/mnemosyne-cortex
```

---

## STEP 2 — Install dependencies

```
cd ~/.claude/skills/mnemosyne-cortex
bun install
```

---

## STEP 3 — Bootstrap ChromaCore database

```
bun run bin/generate_artifacts.ts
bun run src/index.ts bootstrap --preset general
```

---

## STEP 4 — Register MCP server

Add to your Claude Code MCP config:

```json
"meridian-glyph": {
  "command": "bun",
  "args": ["run", "~/.claude/skills/mnemosyne-cortex/meridian-glyph/server.ts"]
}
```

---

## STEP 5 — Configure the logger adapter

Claude Code stores session transcripts at:
~/.claude/projects/<project-id>/<session-id>.jsonl

Start the Claude Code adapter:
```
python ~/.claude/skills/mnemosyne-cortex/adapters/claude-code.py
```

---

## STEP 6 — Verify installation

```
python ~/.claude/skills/mnemosyne-cortex/install-skill/scripts/verify.py --platform claude-code
```

---

## NOTES (placeholder)
- Claude Code JSONL session path format confirmed from community research June 2026
- Adapter watches the active project session file for new message pairs
- MCP server config location may differ between Claude Code versions
