---
name: sync-custom-skills
description: Use when creating a new custom skill in .agents/skills/ to ensure it is symlinked into all agent-specific skill directories in the project.
---

# Sync Custom Skills

After creating a new skill at `.agents/skills/<name>/`, you MUST symlink it into every agent-specific skills directory that exists in the project root.

## How npx skills works

- `.agents/skills/` is the **universal source** — agents like antigravity, codex, cursor, and gemini read from here directly.
- Agent-specific dirs (`.claude/skills/`, `.trae/skills/`, `.roo/skills/`, etc.) receive **symlinks** pointing back to `.agents/skills/<name>`.
- Symlink path is always: `../../.agents/skills/<name>` (all agent dirs sit at `.<agent>/skills/` depth).

## Steps after creating a custom skill

1. **Detect** all agent skill directories in the project root:
   ```bash
   find . -mindepth 2 -maxdepth 2 -type d -name "skills" \
     | grep -v node_modules \
     | grep -v "\.agents/skills"
   ```

2. **Symlink** the new skill into each detected directory:
   ```bash
   ln -s "../../.agents/skills/<name>" ".<agent>/skills/<name>"
   ```

3. **Verify** the symlinks resolve correctly:
   ```bash
   ls -la .<agent>/skills/<name>
   ```

## Example

New skill created: `.agents/skills/my-skill/`

Detected agent dirs: `.claude/skills/`, `.trae/skills/`

Run:
```bash
ln -s "../../.agents/skills/my-skill" ".claude/skills/my-skill"
ln -s "../../.agents/skills/my-skill" ".trae/skills/my-skill"
```
