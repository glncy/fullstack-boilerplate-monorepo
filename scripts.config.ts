import type { ProjectConfig } from "./packages/scripts/src/project-config.ts";

const config: ProjectConfig = {
  "setup-worktree": {
    symlinks: ["*/**/codesigning-keys"],
  },
  "deps-change": {
    "apps/mobile": {
      exclude: ["packages/scripts/**"],
    },
  },
  "should-run": {
    build: {
      exclude: ["docs/**", "**/*.md", "**/*.mdx", "README*", "LICENSE*", ".changeset/**/*.md"],
    },
    lint: {
      exclude: ["docs/**", "**/*.md", "**/*.mdx", "README*", "LICENSE*", ".changeset/**/*.md"],
    },
    "type-check": {
      exclude: ["docs/**", "**/*.md", "**/*.mdx", "README*", "LICENSE*", ".changeset/**/*.md"],
    },
    test: {
      exclude: ["docs/**", "**/*.md", "**/*.mdx", "README*", "LICENSE*", ".changeset/**/*.md"],
    },
  },
};

export default config;
