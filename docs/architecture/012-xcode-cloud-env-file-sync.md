# 012: Xcode Cloud Environment File Sync

## Status

Proposed

## Context

The mobile app reads runtime configuration from a `.env` file at build time. On GitHub Actions, the `.env` file is written from the `ENV_FILE` GitHub Environment variable using the `write-env-file` composite action.

Xcode Cloud runs in Apple's infrastructure and does not have access to GitHub Environment variables. When the Xcode Cloud path is used for iOS builds, the `.env` file must be provided through a different mechanism.

The `ENV_FILE` value may differ between environments (e.g., `app-mobile@main` vs `app-mobile@production`), so the solution must support per-environment configuration without race conditions.

## Decision

### Separate Xcode Cloud Workflows Per Environment

Each GitHub Environment that triggers Xcode Cloud has its own `XCODE_CLOUD_WORKFLOW_ID` pointing to a dedicated Xcode Cloud workflow in App Store Connect. Each Xcode Cloud workflow has its own `ENV_FILE` environment variable configured directly in App Store Connect.

The mapping is:

| GitHub Environment | `XCODE_CLOUD_WORKFLOW_ID` | Xcode Cloud `ENV_FILE` |
|---|---|---|
| `app-mobile@main` | workflow for main builds | main config values |
| `app-mobile@production` | workflow for production builds | production config values |

### Post-Clone Script

The `ci_post_clone.sh` script writes the Xcode Cloud `ENV_FILE` environment variable to disk before the build:

```sh
[ -n "${ENV_FILE:-}" ] && printf '%s\n' "$ENV_FILE" > "$MOBILE_ROOT/.env"
```

This mirrors what the `write-env-file` composite action does on GitHub Actions.

### Why Not Other Approaches

**API sync (PATCH workflow env vars before each trigger):**

Xcode Cloud environment variables are set on the workflow, not per-build. If two concurrent builds from different environments trigger the same workflow, the last sync wins and both builds use that value. Separate workflows per environment avoid this race condition.

**Commit `.env` to the branch:**

Works but places config values in git history. While the current `ENV_FILE` contains no secrets, this approach introduces unnecessary coupling between git history and build configuration.

## Required Configuration

### In App Store Connect

For each Xcode Cloud workflow:

1. Open the workflow settings
2. Add an environment variable named `ENV_FILE`
3. Set the value to match the corresponding GitHub Environment's `ENV_FILE` variable
4. Set `isSecret` to `false` (these are config values, not secrets)

### Build Profile

The same pattern applies to the `BUILD_PROFILE` environment variable, which controls the Expo channel name used in the build.

On GitHub Actions, `build_profile` is passed as a workflow input through `ios-build.yml`. The composite action runs `prepare-expo-production-config` before `expo prebuild` when the profile is `production`, rewriting `expo-channel-name` from `"main"` to `"production"`.

On Xcode Cloud, `BUILD_PROFILE` must be set as an environment variable on each workflow:

| Xcode Cloud Workflow | `BUILD_PROFILE` |
|---|---|
| main builds | (not set or `internal`) |
| production builds | `production` |

The `ci_post_clone.sh` script checks `BUILD_PROFILE` and runs `prepare-expo-production-config` before `expo prebuild` when the value is `production`.

### Keeping Values In Sync

GitHub Environment variables are the single source of truth. When `ENV_FILE` is updated in a GitHub Environment, the corresponding Xcode Cloud workflow must be updated manually in App Store Connect to match. The same applies to `BUILD_PROFILE`.

## TODO

- [ ] Add `ENV_FILE` support to `ci_post_clone.sh` so Xcode Cloud writes the `.env` file from its environment variable

## Consequences

### Benefits

- No race conditions between concurrent builds from different environments
- GitHub Environment variables remain the single source of truth for what the values should be
- `ci_post_clone.sh` changes are minimal
- No API complexity or additional build steps

### Tradeoffs

- `ENV_FILE` and `BUILD_PROFILE` must be maintained in two places (GitHub Environment + App Store Connect) and kept in sync manually
- Adding a new environment requires creating a new Xcode Cloud workflow in App Store Connect
