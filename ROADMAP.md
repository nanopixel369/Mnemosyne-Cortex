# Mnemosyne Cortex — Project Roadmap
*Last updated: June 2026*

---

## Vision

Persistent semantic memory for AI agents and models. Local-first, deterministic,
hardware-conscious, and framework-agnostic. Built on ChromaCore v3 — a CPU-based
semantic storage engine using L*a*b* color space coordinates instead of vector
embeddings. No GPU required for the memory layer. No cloud dependency for core
function. No embedding model drift.

The goal: every AI agent and model a person uses remembers them across sessions,
without the user managing memory manually, without cloud lock-in, and without
burning their hardware when nothing is happening.

---

## Current State (June 2026)

**What is working today:**
- ChromaCore v3 TypeScript prototype — full pipeline tested, 4/4 tests passing
- Meridian Glyph skill — author and navigator workflows, Python scripts, MCP server
- Passive conversation logger — reads Claude Desktop LevelDB, captures turns to disk
- 13 MCP tools live and tested end-to-end in Claude Desktop
- Install skill and Mnemosyne skill scaffolded in repo
- 12/12 verification checks passing on Claude Desktop platform

**What is not yet built:**
- Query pipeline (boundary detection, ChromaCore recall, memory artifact injection)
- ChromaCore ingestion bridge (committing membloks into ChromaCore gravity database)
- Hardware initialization script (model download, llama.cpp setup)
- Platform adapters (OpenClaw, Claude Code)
- LoRA adapters for author and navigator models (training data being generated now)
- UI / settings interface
- Cloud API fallback (LiteLLM integration)

---

## Phase 1 — Close the Loop (Current Sprint)

**Goal:** End-to-end memory that actually works. Store a conversation. Retrieve
something relevant from it in a later conversation. Inject it into context.

### 1A — Query Pipeline
Build the programmatic boundary detection and recall system.

Components:
- Token counter running against accumulated conversation log (lightweight, RAM only)
- Jaccard distance calculation on autotagger output per message pair
- Color space drift calculation (Euclidean distance from chunk centroid)
- Both signals must confirm simultaneously for a boundary to be placed
- Three-gate recall: Tag Check → Spatial Query → Metadata Relevance
- Memory artifact composition (200-500 tokens, injected before next inference)

Platform adapters:
- Claude Desktop adapter (reads LevelDB, extracts finalized message pairs)
- OpenClaw adapter (uses llm_input / agent_end hooks — post-beta)
- Claude Code adapter (reads JSONL session files — post-beta)

### 1B — ChromaCore Ingestion Bridge
Wire the committed memblok pipeline into ChromaCore's gravity database.

- Read finalized .mg file after boundary confirmation
- Extract clean text content (strip Meridian Glyph sentinels)
- Run through ChromaCore autotagger → gravity → KD-Tree pipeline
- Store resulting ChromaNode in SQLite
- Do NOT chunk — store as one large entry per memblok (patient accumulation model)
- Author model runs on committed content during idle time only (Enhanced Mode)

### 1C — Hardware Initialization Script
First-run setup that downloads and configures all dependencies.

Detection order:
1. CUDA present → identify compute capability → download CUDA binary
2. Apple Silicon → use mlx-lm path (separate from llama.cpp entirely)
3. AMD GPU → Vulkan backend (Linux) or DirectML (Windows)
4. Intel iGPU → SYCL backend or CPU fallback
5. No GPU detected → CPU-only

Model downloads:
- Windows/Linux GGUF: `unsloth/Qwen3.5-2B-GGUF` → `Qwen3.5-2B-Q4_K_M.gguf`
  URL: `https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf`
- Apple Silicon MLX: `mlx-community/Qwen3.5-2B-OptiQ-4bit` via mlx-lm
- LoRA adapters: pulled from this repo under `adapters/author/` and `adapters/navigator/`

llama.cpp binary targets (TurboQuant fork: TheTom/llama-cpp-turboquant):
- Windows x64 CUDA 12.4 → GitHub releases
- Mac ARM64 Metal → GitHub releases
- Linux x64 CUDA → GitHub releases
*(ARM64 Linux CUDA for DGX Spark — roadmap item, not beta)*

Initialization installs to: `~/.mnemosyne/`
Structure:
```
~/.mnemosyne/
  bin/          ← llama.cpp binary for detected platform
  models/       ← GGUF or MLX model weights
  adapters/     ← author.gguf and navigator.gguf LoRA adapters
  db/           ← ChromaCore SQLite database
  membloks/     ← committed memory files
  logs/         ← watcher and query pipeline logs
  config.json   ← user configuration (context window limit, platform, etc.)
```

config.json configurable parameters:
- `author_context_window`: token limit for author model (default 128000)
- `context_budget_pct`: percentage of window to fill before forcing boundary (default 0.75)
- `platform`: detected hardware platform (set at init, can be overridden)
- `inference_backend`: cuda | metal | vulkan | sycl | cpu
- `model_path`: path to GGUF or MLX model
- `adapter_author`: path to author LoRA adapter
- `adapter_navigator`: path to navigator LoRA adapter

---

## Phase 2 — Beta Release

**Goal:** Something people can install and actually use. Manual memory control
via MCP tools. Passive capture working for Claude Desktop.

Deliverables:
- Phase 1 complete and tested on at least 3 hardware targets
- Install skill working end-to-end for Claude Desktop and OpenClaw
- README with clear install instructions per platform
- Verification script passing on all supported platforms
- GitHub repo public with ClawHub submission for OpenClaw skill registry
- Basic settings via config.json (no UI yet)

**Beta is NOT:**
- A polished UI
- Cloud API support
- Trained LoRA adapters (manual author/navigator workflows during beta)
- Raspberry Pi support
- Windows ARM / RTX Spark support (hardware not shipped yet)

---

## Phase 3 — Enhanced Mode

**Goal:** Small local model handles authoring and navigation automatically.

- Train author LoRA adapter on examples generated during beta manual use
- Train navigator LoRA adapter on navigation session examples
- Both adapters target Qwen3.5-2B base GGUF
- One model loaded at a time, adapter hot-swapped between author and navigator roles
- Author model wakes during idle time only — never during active inference
- Navigator model activates only when all three recall gates pass
- Both models unloaded from RAM when not in use

Training pipeline:
- Raw memblok (pre-annotation) + annotated memblok = one author training pair
- Query context + memory artifact = one navigator training pair
- Dataset accumulates automatically from manual beta usage
- Fine-tune via QLoRA on RunPod or Colab when dataset reaches ~500 examples per role

---

## Phase 4 — Cloud API Fallback

**Goal:** Users who don't want local inference can use a cloud model instead.

- Integrate LiteLLM as optional inference backend
- User provides API key and model preference in settings
- Same author/navigator prompts and skills, sent to cloud model instead of local
- Local model remains the default — cloud is opt-in
- Supports: Anthropic, OpenAI, Groq, Together, any OpenAI-compatible endpoint
- Good for: power users with API budgets, testing without local hardware

---

## Phase 5 — UI and Distribution

**Goal:** Non-technical users can install and configure Mnemosyne.

- Settings interface (Bun-compiled desktop app or web UI served locally)
- Hardware auto-detection with user-friendly display
- Model download progress indicator
- Memory browser — view committed membloks, search by topic
- Per-platform packaged installers (NSIS for Windows, .pkg for Mac, AppImage for Linux)
- Bun registry publication: `bun install -g mnemosyne-cortex`

---

## Hardware Target Matrix

| Platform | OS | Backend | Priority | Status |
|---|---|---|---|---|
| Intel CPU (no dGPU) | Windows | CPU-only | P1 — Test hardware | Not built |
| Apple Silicon M1-M4+ | macOS | MLX (mlx-lm) | P1 — Largest OpenClaw base | Not built |
| NVIDIA dGPU (CUDA) | Windows | CUDA + TurboQuant | P1 — Large PC user base | Not built |
| NVIDIA dGPU (CUDA) | Linux | CUDA + TurboQuant | P2 | Not built |
| AMD Strix Halo | Linux | Vulkan (RADV) | P2 | Not built |
| AMD Strix Halo | Windows | DirectML | P3 | Not built |
| Intel iGPU | Windows | SYCL | P3 | Not built |
| Intel iGPU | Linux | SYCL | P3 | Not built |
| GB10 DGX Spark | Linux ARM64 | CUDA 13 + TurboQuant | P3 — Post-beta | Not built |
| RTX Spark N1X | Windows ARM64 | CUDA + TurboQuant | P3 — Ships fall 2026 | Not built |
| Raspberry Pi 5 | Linux ARM64 | CPU-only | P4 — Future | Not built |

---

## Framework Integration Priority

| Framework | Integration Method | Priority | Notes |
|---|---|---|---|
| Claude Desktop | LevelDB watcher + MCP server | P1 — Live today | Basic capture working |
| OpenClaw | llm_input / agent_end hooks + skill | P1 — Post-beta | Hook API confirmed |
| Claude Code | JSONL session watcher | P2 | Path confirmed |
| NanoClaw | TBD — similar to OpenClaw | P3 | Research needed |
| Hermes | Plugin system | P3 | Also useful for training data gen |
| Odysseus | TBD — no plugin API yet | P4 | Watch for stability |

---

## Distribution Strategy

**OpenClaw (primary launch target):**
```
openclaw skills install github.com/elxnd/mnemosyne-cortex/install-skill -- use openclaw workflow
```
One command. Agent installs everything autonomously. Submit to ClawHub for discovery.

**Claude Desktop:**
```
Install Mnemosyne Cortex. Use the skill at github.com/elxnd/mnemosyne-cortex/install-skill
— follow the claude-desktop workflow.
```
Requires Desktop Commander MCP.

**Claude Code:**
```
Install Mnemosyne Cortex. Use the skill at github.com/elxnd/mnemosyne-cortex/install-skill
— follow the claude-code workflow.
```

**Long-term:**
- Bun registry: `bun install -g mnemosyne-cortex`
- ClawHub listing with security scan badge
- Single-binary installer per platform (post-Phase 5)

---

## Key Architectural Decisions (Locked)

1. **No chunking.** ChromaCore entries are large coherent conversation blocks,
   not fragments. Default minimum ~200K characters before splitting is considered.
   Topic boundaries detected via dual-signal (Jaccard + color space drift).

2. **Patient accumulation.** Memory is never written about the current conversation.
   Always past content. Author model runs during idle time only.

3. **Adapter not fine-tune.** One Qwen3.5-2B base model on disk.
   Two LoRA adapters hot-swapped for author vs navigator roles.

4. **Hardware-conscious by default.** Models unloaded when not in use.
   Token budget configurable to hardware limits. CPU fallback always available.

5. **Programmatic boundary detection.** No model intelligence involved in deciding
   when to commit. Pure math — Jaccard distance + color space drift.
   Model only activates for authoring and navigation, never for bookkeeping.

6. **MCP + script dual interface.** Every operation available via MCP server
   (for Claude Desktop) and Python script (for any terminal / OpenClaw agent).
   No permanent MCP dependency.

7. **Local data ownership.** ChromaCore database lives on user device.
   No cloud required for core function. Cloud API inference is opt-in post-beta.

---

## Training Data Strategy

Manual beta usage generates training pairs automatically:
- Pre-annotation content → annotated memblok = author training example
- Query context → memory artifact = navigator training example

Target: ~500 examples per role before first LoRA training run.
Training: QLoRA on RunPod or Google Colab (T4/A100).
Estimated timeline: 4-8 weeks of beta usage to hit dataset threshold.

---

*ChromaCore v3 · Mnemosyne Cortex · Meridian Glyph*
*MIT License · Local-first · No embeddings · No GPU required for memory*
