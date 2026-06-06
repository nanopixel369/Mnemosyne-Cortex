# Mnemosyne Cortex — Install Skill
version: 0.1 | type: super-skill | mode: router

You are installing Mnemosyne Cortex, the ChromaCore-based persistent memory
system. Your job is to complete the installation for the correct framework.

## ROUTE

A workflow must be specified in the install instruction. Read it and route
directly. Do not guess the framework — if none was specified, ask before proceeding.

**OpenClaw** → Read: workflows/openclaw.md
**Claude Desktop** → Read: workflows/claude-desktop.md
**Claude Code** → Read: workflows/claude-code.md

## AFTER INSTALL
Run scripts/verify.py to confirm the installation succeeded.
Report back to the user with pass/fail for each verification check.

## README INSTALL STRINGS
These are the exact copy-paste strings for each platform:

OpenClaw:
  openclaw skills install github.com/elxnd/mnemosyne-cortex/install-skill -- use openclaw workflow

Claude Desktop (requires Desktop Commander MCP):
  Install Mnemosyne Cortex memory system. Use the skill at
  github.com/elxnd/mnemosyne-cortex/install-skill — follow the claude-desktop workflow.

Claude Code:
  Install Mnemosyne Cortex memory system. Use the skill at
  github.com/elxnd/mnemosyne-cortex/install-skill — follow the claude-code workflow.
