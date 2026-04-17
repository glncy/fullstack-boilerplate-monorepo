import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { basename, join } from "node:path";

type WorktreeEntry = {
  path: string;
  branch?: string; // undefined for detached HEAD worktrees
};

function listWorktrees(repoRoot: string): WorktreeEntry[] {
  const output = execFileSync("git", ["worktree", "list", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  const worktrees: WorktreeEntry[] = [];
  let current: Partial<WorktreeEntry> = {};

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice(9).trim() };
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice(7).trim();
    } else if (line === "" && current.path) {
      worktrees.push({ path: current.path, branch: current.branch });
      current = {};
    }
  }

  if (current.path) {
    worktrees.push({ path: current.path, branch: current.branch });
  }

  return worktrees;
}

function resolveWorktreePath(repoRoot: string, target: string): string | null {
  if (existsSync(target)) {
    return target;
  }

  const worktrees = listWorktrees(repoRoot);
  const match = worktrees.find(
    (wt) =>
      wt.path === target ||
      basename(wt.path) === target ||
      (wt.branch &&
        (wt.branch === target ||
          wt.branch === `refs/heads/${target}` ||
          basename(wt.branch) === target)),
  );

  return match?.path ?? null;
}

function getWorkspaces(repoRoot: string): string[] {
  try {
    const raw = readFileSync(join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { workspaces?: string[] };
    return pkg.workspaces ?? [];
  } catch {
    return ["apps/*", "packages/*"];
  }
}

type LinkResult = "linked" | "skipped" | "missing";

function linkNodeModules(src: string, dst: string): LinkResult {
  if (!existsSync(src)) return "missing";
  // lstatSync (not existsSync) so broken symlinks at dst are detected as
  // "already present" and left in place rather than double-linked.
  try {
    lstatSync(dst);
    return "skipped";
  } catch {
    symlinkSync(src, dst, "dir");
    return "linked";
  }
}

export type SetupWorktreeOptions = {
  repoRoot: string;
  target: string;
  verbose?: boolean;
};

export type SetupWorktreeResult = {
  worktreePath: string;
  linked: string[];
  skipped: string[];
  missing: string[];
};

export function setupWorktree({
  repoRoot,
  target,
  verbose = false,
}: SetupWorktreeOptions): SetupWorktreeResult {
  const worktreePath = resolveWorktreePath(repoRoot, target);
  if (!worktreePath) {
    throw new Error(
      `Could not find worktree for '${target}'. Run 'git worktree list' to see available worktrees.`,
    );
  }

  if (worktreePath === repoRoot) {
    throw new Error("Target resolves to the main repo — nothing to link.");
  }

  const linked: string[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];

  function link(relPath: string) {
    const result = linkNodeModules(join(repoRoot, relPath), join(worktreePath, relPath));
    if (result === "linked") linked.push(relPath);
    if (result === "skipped") skipped.push(relPath);
    if (result === "missing") {
      if (verbose) missing.push(relPath);
    }
  }

  link("node_modules");

  for (const pattern of getWorkspaces(repoRoot)) {
    if (pattern.includes("*")) {
      const parentDir = pattern.replace(/\/\*.*$/, "");
      const fullParent = join(repoRoot, parentDir);
      if (!existsSync(fullParent)) continue;
      for (const entry of readdirSync(fullParent, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        link(`${parentDir}/${entry.name}/node_modules`);
      }
    } else {
      link(`${pattern}/node_modules`);
    }
  }

  return { worktreePath, linked, skipped, missing };
}
