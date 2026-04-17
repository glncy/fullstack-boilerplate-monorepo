import { access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { AppConfigPath } from "./generated/app-config-paths.d.ts";
export type { AppConfigPath } from "./generated/app-config-paths.d.ts";

type DepsChangeRule = {
  exclude?: string[];
  include?: string[];
};

type ShouldRunRule = {
  exclude?: string[];
  include?: string[];
};

export type ProjectConfig = {
  "deps-change"?: Partial<Record<AppConfigPath, DepsChangeRule>>;
  "should-run"?: Record<string, ShouldRunRule>;
  "setup-worktree"?: {
    symlinks?: string[];
  };
};

const SCRIPTS_CONFIG_FILE = "scripts.config.ts";

export async function loadProjectConfig(repoRoot: string): Promise<ProjectConfig> {
  const configPath = join(repoRoot, SCRIPTS_CONFIG_FILE);

  try {
    await access(configPath);
  } catch (error) {
    throw new Error(`Could not read scripts config at ${configPath}`, {
      cause: error,
    });
  }

  try {
    const configModule = (await import(
      `${pathToFileURL(configPath).href}?t=${Date.now()}`
    )) as { default?: ProjectConfig };

    return configModule.default ?? {};
  } catch (error) {
    throw new Error(`Could not load scripts config at ${configPath}`, {
      cause: error,
    });
  }
}
