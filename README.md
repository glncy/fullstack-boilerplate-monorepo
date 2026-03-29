# Fullstack Boilerplate Monorepo

Reusable starter monorepo for full-stack product development. The repo keeps shared infrastructure, monorepo tooling, CI workflows, and a lightweight app structure that can be adapted into a new product without inheriting old product branding or deployment targets.

## Included Apps
- `apps/mobile`: Expo Router starter app with a minimal native tabs shell.
- `apps/updates-worker`: Cloudflare Worker starter for Expo OTA/update manifests.
- `apps/web`: Next.js app for web surfaces and shared UI experiments.

## Shared Packages
- `packages/eslint-config`: Shared lint configuration.
- `packages/jest-config`: Shared Jest presets and setup.
- `packages/scripts`: Repo automation and workflow helper scripts.
- `packages/tailwind-config`: Shared Tailwind/Uniwind configuration.
- `packages/typescript-config`: Shared TypeScript base configs.
- `packages/ui`: Shared UI primitives for web surfaces.

## Getting Started
```bash
bun install
bun run dev
```

Useful commands:

```bash
bun run test
bun run check-types
bun run build
```

## How To Use This Boilerplate

1. Clone the boilerplate repository.

   ```bash
   git clone https://github.com/glncy/fullstack-boilerplate-monorepo.git your-app-name
   cd your-app-name
   ```

2. Point the local checkout at your own repository.
   Create a new GitHub repository for your product, then replace `origin` so future pushes go to your app repo instead of the boilerplate source repo.

   ```bash
   git remote rename origin upstream
   git remote add origin https://github.com/<your-org>/<your-repo>.git
   ```

3. Install dependencies and verify the starter boots.

   ```bash
   bun install
   bun run dev
   ```


## Deployment Environment Variables

Set these before deploying or enabling the reusable workflows in this repo.

### Mobile
- `apps/mobile/app.json` currently points OTA updates at `https://example.com/api/ota/fullstack-boilerplate/manifest`.
- Replace that URL with your real updates worker domain and project slug before shipping OTA updates.
- GitHub mobile workflows write an app `.env` file from the GitHub Environment variable `ENV_FILE`.

### Web
- `apps/web/.dev.vars` currently defines `NEXTJS_ENV=development` for local Cloudflare/OpenNext work.
- Add any real production runtime values through your Cloudflare environment configuration before deployment.

### Updates Worker
- `GITHUB_AUTH_TOKEN`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `CODESIGNING_APP_PRIVATE_KEY` optional
- `CODESIGNING_APP_KEY_ID` optional

The updates worker also needs its project mapping in `apps/updates-worker/src/index.ts` updated to your real GitHub owner, OTA repo, and app slug.

### GitHub Actions
- `ENV_FILE` GitHub Environment variable on `app-mobile@main` and `app-mobile@production`
- `XCODE_CLOUD_WORKFLOW_ID` GitHub Environment variable on `app-mobile@main` and `app-mobile@production`
- `EXPO_UP_GITHUB_TOKEN` GitHub secret for `expo-up` release, history, and rollback workflows
- `APP_STORE_CONNECT_ISSUER_ID` repository GitHub secret for App Store Connect API access
- `APP_STORE_CONNECT_KEY_ID` repository GitHub secret for App Store Connect API access
- `APP_STORE_CONNECT_PRIVATE_KEY` repository GitHub secret for App Store Connect API access
- `app-mobile@ios-build` GitHub Environment with required reviewers for iOS build approval

## Upstream Sync

### Boilerplate Upstream Sync

This repo can track the separate boilerplate repo as an upstream source:

- `https://github.com/glncy/fullstack-boilerplate-monorepo`

### Add the upstream remote

```bash
git remote add upstream https://github.com/glncy/fullstack-boilerplate-monorepo.git
```

### Upstream Syncs

After the upstream relationship is set up, create a branch and open a PR for each upstream sync:

```bash
git checkout -b chore/upstream-sync
git fetch upstream
git merge upstream/main
```

Use a branch and PR for each sync so upstream changes are reviewed before landing on `main`.

## Contributing Back From A Project

If a downstream project discovers an improvement that should live in the boilerplate, open a PR against the boilerplate repo from a branch created in this repo.

Example: `sample-project` has a reusable workflow improvement that should be promoted back into the boilerplate.

### Add the project as a remote

```bash
git remote add sample-project https://github.com/<your-org>/sample-project.git
git fetch sample-project
```

### Create a boilerplate branch for the upstreamable change

```bash
git checkout -b feat/promote-workflow-improvement
```

### Bring the change into the boilerplate repo

If the change is already isolated in a clean commit, cherry-pick it:

```bash
git cherry-pick <sample-project-commit-sha>
```

If only part of the project change belongs in the boilerplate, copy the relevant files or hunks instead:

```bash
git checkout sample-project/main -- .github/workflows/some-workflow.yml
```

### Generalize before opening the PR

Before pushing, remove any downstream-only details such as:

- project-specific app names
- repo-specific secrets or variables
- project URLs and endpoints
- product-only branches, environments, or deploy targets

### Open the boilerplate PR

```bash
git push -u origin feat/promote-workflow-improvement
```

Then open a PR into `glncy/fullstack-boilerplate-monorepo`.

After the PR is merged, downstream projects can sync the new boilerplate change back through the normal upstream sync flow.

### If the project is a fork

If `sample-project` is a fork of the boilerplate repo, you can open a PR from the fork into `glncy/fullstack-boilerplate-monorepo`, but do not open the PR from the fork's `main` branch.

Always create a dedicated branch for the reusable change first:

```bash
git checkout -b feat/promote-workflow-improvement
```

Recommended fork workflow:

1. Start from the forked project repo.
   Make sure your local checkout is up to date and that the reusable change is already identified.
2. Create a clean contribution branch.

   ```bash
   git checkout -b feat/promote-workflow-improvement
   ```

3. Isolate only the reusable boilerplate change on that branch.
   If needed, cherry-pick the relevant commit(s) or manually remove unrelated product-specific edits.
4. Review the diff before pushing.
   Confirm the branch does not include:
   - product branding
   - project-only environment variables
   - project URLs or endpoints
   - unrelated product UI or business logic
   - downstream-only secrets, branches, or deploy targets
5. Push the branch to the fork.

   ```bash
   git push -u origin feat/promote-workflow-improvement
   ```

6. Open a PR into the boilerplate repo.
   Use:
   - base repo: `glncy/fullstack-boilerplate-monorepo`
   - base branch: `main`
   - compare repo: your forked project repo
   - compare branch: `feat/promote-workflow-improvement`

7. Do not use `main` as the PR branch.
   Keeping upstream contributions on a dedicated branch makes the PR reviewable and avoids mixing boilerplate improvements with the project's normal development history.

If the fork has diverged heavily, prefer creating a fresh branch from the latest boilerplate `main`, then cherry-pick or rework only the reusable commits before opening the PR.

## Notes
- This repository is a boilerplate, not a live product repository.
- Review app identifiers, environment variables, release targets, and deployment settings before using it for a new project.
- `.github/` and `packages/scripts/` are intentionally preserved as reusable infrastructure.
