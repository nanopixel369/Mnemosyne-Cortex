# Install Workflow: OpenClaw
version: 0.1 | status: placeholder — update after first live OpenClaw install test

You are installing Mnemosyne Cortex as an OpenClaw plugin.

---

## PREREQUISITES CHECK

- OpenClaw is installed and running
- An agent is configured and active
- Bun is installed on the host machine
- Python 3.x is installed on the host machine

---

## STEP 1 — Clone the repository

```
git clone https://github.com/elxnd/mnemosyne-cortex.git ~/.openclaw/plugins/mnemosyne-cortex
```

---

## STEP 2 — Install dependencies

```
cd ~/.openclaw/plugins/mnemosyne-cortex
bun install
```

---

## STEP 3 — Bootstrap ChromaCore database

```
bun run bin/generate_artifacts.ts
bun run src/index.ts bootstrap --preset general
```

---

## STEP 4 — Register the plugin hooks

Add to openclaw.json (placeholder — exact hook registration format TBD):

```json
"plugins": {
  "mnemosyne-cortex": {
    "path": "~/.openclaw/plugins/mnemosyne-cortex",
    "hooks": ["llm_input", "agent_end"],
    "adapter": "openclaw"
  }
}
```

The llm_input hook injects memory artifacts before each inference.
The agent_end hook feeds completed message pairs to the query pipeline.

---

## STEP 5 — Install the Mnemosyne skill

```
openclaw skills install ~/.openclaw/plugins/mnemosyne-cortex/mnemosyne-skill
```

---

## STEP 6 — Verify installation

```
python ~/.openclaw/plugins/mnemosyne-cortex/install-skill/scripts/verify.py --platform openclaw
```

---

## NOTES (placeholder)
- OpenClaw plugin hook registration format needs verification against live instance
- Hook names (llm_input, agent_end) confirmed from OpenClaw docs research June 2026
- Path conventions may differ on Windows vs macOS/Linux OpenClaw installs
- This workflow needs a full live test pass before being marked stable
