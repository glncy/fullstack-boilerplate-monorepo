#!/usr/bin/env bun

import { resolve } from "node:path";

import {
  compareFingerprints,
  generateFingerprints,
  getFingerprintPaths,
} from "./fingerprint.js";
import { prepareExpoProductionConfig, restoreExpoChannelFromRef } from "./expo-config.js";
import { getCurrentBranchName } from "./git.js";
import {
  determineMobileProductionAction,
  mobileProductionPackageVersionChanged,
} from "./mobile-production-action.js";
import { verifyMobileRelease } from "./mobile-release-verification.js";
import { classifyReleaseTarget } from "./release-target.js";
import { maybeIncrementExpoNativeBuildNumbers } from "./native-build-number.js";
import {
  cloudflareReleaseVersionChanged,
  discoverCloudflareApps,
} from "./cloudflare-release.js";
import { depsChange } from "./deps-change.js";
import { latestCommitChanged } from "./latest-commit-changed.js";
import { latestCommitDepsChanged } from "./latest-commit-deps-changed.js";
import { latestCommitFingerprintChanges } from "./latest-commit-fingerprint-changes.js";
import { determineProductionVersionLock } from "./production-version-lock.js";
import { resolveComparisonBase } from "./resolve-comparison-base.js";
import { shouldRun } from "./should-run.js";
import { setupWorktree } from "./setup-worktree.js";
import { syncChangedExpoVersions, syncExpoVersion } from "./sync-expo-version.js";
import { triggerXcodeCloudBuildWithFallback } from "./xcode-cloud.js";

type CommandContext = {
  args: string[];
  repoRoot: string;
};

type ParsedArgs = {
  positionals: string[];
  values: Map<string, string[]>;
};

type FingerprintProfile = "internal" | "preview" | "production";

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const values = new Map<string, string[]>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args.at(index);
    if (!arg) {
      break;
    }

    const next = args.at(index + 1);

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    if (!next || next.startsWith("--")) {
      values.set(arg, []);
      continue;
    }

    const existing = values.get(arg) ?? [];
    existing.push(next);
    values.set(arg, existing);
    index += 1;
  }

  return { positionals, values };
}

function getOption(parsedArgs: ParsedArgs, optionName: string): string | undefined {
  return parsedArgs.values.get(optionName)?.[0];
}

function getOptionValues(parsedArgs: ParsedArgs, optionName: string): string[] {
  return parsedArgs.values.get(optionName) ?? [];
}

function hasOption(parsedArgs: ParsedArgs, optionName: string): boolean {
  return parsedArgs.values.has(optionName);
}

function getProfileOption(parsedArgs: ParsedArgs): FingerprintProfile | undefined {
  const profile = getOption(parsedArgs, "--profile");
  return (["internal", "preview", "production"] as const).find(
    (candidate) => candidate === profile,
  );
}

function usage(): never {
  console.error(`Usage:
bun run repo-scripts fingerprint <generate|compare> [--path <projectDir>] [--head-ref <ref>] [--profile <internal|preview|production>] [--ref <ref>] [--created-at <iso>]
bun run repo-scripts deps-changed <appPath> [--base <ref>] [--verbose]
bun run repo-scripts should-run <rule> [--base <ref>] [--verbose]
bun run repo-scripts discover-cloudflare-apps [--json]
bun run repo-scripts cloudflare-release-version-changed --head-ref <ref> [--base-ref <ref>]
bun run repo-scripts classify-release-target --tag-name <tag> --head-ref <ref>
bun run repo-scripts mobile-production-action --app-path <appPath> --head-ref <ref> [--profile <internal|preview|production>] [--ref <ref>]
bun run repo-scripts mobile-production-package-version-changed --app-path <appPath> --head-ref <ref> [--ref <ref>]
bun run repo-scripts verify-mobile-release --app-path <appPath> --head-ref <ref> --release-channel <channel>
bun run repo-scripts production-version-lock --app-path <appPath> --head-ref <ref> [--profile <internal|preview|production>] [--ref <ref>] [--target-version <version>]
bun run repo-scripts prepare-expo-production-config --path <projectDir>
bun run repo-scripts restore-expo-channel --path <projectDir> --head-ref <ref>
bun run repo-scripts sync-expo-version --path <projectDir>
bun run repo-scripts sync-expo-versions
bun run repo-scripts latest-commit-changed --event <pull_request|push> --head-sha <sha> [--owner <owner>] [--repo <repo>] [--pull-number <number>] --include <glob>
bun run repo-scripts latest-commit-deps-changed <appPath> --event <pull_request|push> --head-sha <sha> [--owner <owner>] [--repo <repo>] [--pull-number <number>] [--verbose]
bun run repo-scripts latest-commit-fingerprint-changes --head-ref <ref> --android-fingerprint-path <path> --ios-fingerprint-path <path>
bun run repo-scripts trigger-xcode-cloud-build --workflow-id <id> --ref-name <branch-or-tag>
bun run repo-scripts resolve-comparison-base --event <pull_request|push> [--owner <owner>] [--repo <repo>] [--pull-number <number>]
bun run repo-scripts setup-worktree [worktree-name-or-path] [--verbose]`);
  process.exit(1);
}

async function runFingerprint(command: string, context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const projectPath = getOption(parsedArgs, "--path");
  const profile = getProfileOption(parsedArgs);
  const ref = getOption(parsedArgs, "--ref") ?? getCurrentBranchName(context.repoRoot) ?? undefined;
  const resolvedProjectRoot = projectPath
    ? resolve(context.repoRoot, projectPath)
    : context.repoRoot;
  const { outputDir, projectRoot, relativeOutputDir } = getFingerprintPaths(
    resolvedProjectRoot,
    context.repoRoot,
  );

  if (command === "generate") {
    const buildNumberResult = await maybeIncrementExpoNativeBuildNumbers({
      headRef: getOption(parsedArgs, "--head-ref") ?? "HEAD",
      projectRoot: resolvedProjectRoot,
      repoRoot: context.repoRoot,
    });
    const fingerprints = await generateFingerprints({
      now: hasOption(parsedArgs, "--created-at")
        ? new Date(getOption(parsedArgs, "--created-at") ?? "")
        : undefined,
      profile,
      outputDir,
      projectRoot,
      ref,
    });

    console.log("Generated fingerprints:");
    console.log(`- config: ${buildNumberResult.configPath}`);
    console.log(`- ios buildNumber incremented: ${buildNumberResult.iosBuildNumberIncremented}`);
    console.log(`- ios buildNumber status: ${buildNumberResult.iosBuildNumberStatus}`);
    console.log(`- android versionCode incremented: ${buildNumberResult.androidVersionCodeIncremented}`);
    console.log(`- android versionCode status: ${buildNumberResult.androidVersionCodeStatus}`);
    console.log(`- ios: ${fingerprints.current.ios}`);
    console.log(`- android: ${fingerprints.current.android}`);
    console.log(`- ios added: ${fingerprints.added.ios}`);
    console.log(`- android added: ${fingerprints.added.android}`);
    console.log(`- files: ${relativeOutputDir}/ios.json, ${relativeOutputDir}/android.json`);
    return;
  }

  const fingerprints = await compareFingerprints({
    outputDir,
    profile,
    projectRoot,
    ref,
    repoRoot: context.repoRoot,
  });

  const matchedIos = fingerprints.history.ios[fingerprints.current.ios];
  const matchedAndroid = fingerprints.history.android[fingerprints.current.android];

  console.log("Fingerprint check passed:");
  console.log(`- ios: ${fingerprints.current.ios}`);
  console.log(`- android: ${fingerprints.current.android}`);
  console.log(`ios_ref=${matchedIos?.ref ?? ""}`);
  console.log(`android_ref=${matchedAndroid?.ref ?? ""}`);
}

async function runDepsChange(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const target = parsedArgs.positionals[0];
  if (!target) {
    usage();
  }

  const result = await depsChange(target, {
    base: getOption(parsedArgs, "--base"),
    repoRoot: context.repoRoot,
    verbose: hasOption(parsedArgs, "--verbose"),
  });

  console.log(result ? "true" : "false");
}

async function runShouldRun(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const rule = parsedArgs.positionals[0];
  if (!rule) {
    usage();
  }

  const result = await shouldRun(rule, {
    base: getOption(parsedArgs, "--base"),
    repoRoot: context.repoRoot,
    verbose: hasOption(parsedArgs, "--verbose"),
  });

  console.log(result ? "true" : "false");
}

async function runResolveComparisonBase(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const base = await resolveComparisonBase({
    cwd: context.repoRoot,
    event: getOption(parsedArgs, "--event") ?? "",
    githubToken: process.env.GITHUB_TOKEN,
    owner: getOption(parsedArgs, "--owner"),
    pullNumber: getOption(parsedArgs, "--pull-number"),
    repo: getOption(parsedArgs, "--repo"),
  });

  console.log(base);
}

async function runLatestCommitChanged(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const includes = getOptionValues(parsedArgs, "--include");

  const result = await latestCommitChanged({
    event: getOption(parsedArgs, "--event") ?? "",
    githubToken: process.env.GITHUB_TOKEN,
    headSha: getOption(parsedArgs, "--head-sha"),
    include: includes,
    owner: getOption(parsedArgs, "--owner"),
    pullNumber: getOption(parsedArgs, "--pull-number"),
    repo: getOption(parsedArgs, "--repo"),
  });

  console.log(result ? "true" : "false");
}

async function runLatestCommitDepsChanged(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const target = parsedArgs.positionals[0];
  if (!target) {
    usage();
  }

  const result = await latestCommitDepsChanged(target, {
    event: getOption(parsedArgs, "--event") ?? "",
    githubToken: process.env.GITHUB_TOKEN,
    headSha: getOption(parsedArgs, "--head-sha"),
    owner: getOption(parsedArgs, "--owner"),
    pullNumber: getOption(parsedArgs, "--pull-number"),
    repo: getOption(parsedArgs, "--repo"),
    repoRoot: context.repoRoot,
    verbose: hasOption(parsedArgs, "--verbose"),
  });

  console.log(result ? "true" : "false");
}

async function runLatestCommitFingerprintChanges(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const headRef = getOption(parsedArgs, "--head-ref");
  const androidFingerprintPath = getOption(parsedArgs, "--android-fingerprint-path");
  const iosFingerprintPath = getOption(parsedArgs, "--ios-fingerprint-path");
  if (!headRef || !androidFingerprintPath || !iosFingerprintPath) {
    usage();
  }

  const result = await latestCommitFingerprintChanges({
    androidFingerprintPath,
    headRef,
    iosFingerprintPath,
    repoRoot: context.repoRoot,
  });

  console.log(`android_changed=${result.androidChanged}`);
  console.log(`android_production_only=${result.androidProductionOnly}`);
  console.log(`android_main_ref=${result.androidMainRef}`);
  console.log(`ios_changed=${result.iosChanged}`);
  console.log(`ios_production_only=${result.iosProductionOnly}`);
  console.log(`ios_main_ref=${result.iosMainRef}`);
}

async function runDiscoverCloudflareApps(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const apps = await discoverCloudflareApps(context.repoRoot);

  if (hasOption(parsedArgs, "--json")) {
    console.log(JSON.stringify(apps, null, 2));
    return;
  }

  for (const app of apps) {
    console.log(`${app.appPath} ${app.packageName} ${app.workerName}`);
  }
}

async function runCloudflareReleaseVersionChanged(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const result = await cloudflareReleaseVersionChanged({
    baseRef: getOption(parsedArgs, "--base-ref") ?? "",
    headRef: getOption(parsedArgs, "--head-ref") ?? "",
    repoRoot: context.repoRoot,
  });

  console.log(result ? "true" : "false");
}

async function runClassifyReleaseTarget(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const tagName = getOption(parsedArgs, "--tag-name");
  const headRef = getOption(parsedArgs, "--head-ref");
  if (!tagName || !headRef) {
    usage();
  }

  const result = await classifyReleaseTarget({
    headRef,
    repoRoot: context.repoRoot,
    tagName,
  });

  console.log(`valid=${result.valid}`);
  console.log(`tag_kind=${result.tagKind}`);
  console.log(`target_name=${result.targetName}`);
  console.log(`target_path=${result.targetPath}`);
  console.log(`target_type=${result.targetType}`);
  console.log(`reason=${result.reason}`);
}

async function runMobileProductionAction(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const appPath = getOption(parsedArgs, "--app-path");
  const headRef = getOption(parsedArgs, "--head-ref");
  if (!appPath || !headRef) {
    usage();
  }
  const profile = getProfileOption(parsedArgs);

  const result = await determineMobileProductionAction({
    appPath,
    headRef,
    profile,
    ref: getOption(parsedArgs, "--ref"),
    repoRoot: context.repoRoot,
  });

  console.log(`action=${result.action}`);
  console.log(`package_version_changed=${result.packageVersionChanged}`);
  console.log(`android_fingerprint_changed=${result.androidFingerprintChanged}`);
  console.log(`ios_fingerprint_changed=${result.iosFingerprintChanged}`);
  console.log(`run_android_build=${result.runAndroidBuild}`);
  console.log(`run_ios_build=${result.runIosBuild}`);
  console.log(`run_release_update=${result.runReleaseUpdate}`);
  console.log(`reason=${result.reason}`);
}

async function runMobileProductionPackageVersionChanged(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const appPath = getOption(parsedArgs, "--app-path");
  const headRef = getOption(parsedArgs, "--head-ref");
  if (!appPath || !headRef) {
    usage();
  }

  const result = mobileProductionPackageVersionChanged({
    appPath,
    headRef,
    ref: getOption(parsedArgs, "--ref"),
    repoRoot: context.repoRoot,
  });

  console.log(result ? "true" : "false");
}

async function runVerifyMobileRelease(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const appPath = getOption(parsedArgs, "--app-path");
  const headRef = getOption(parsedArgs, "--head-ref");
  const releaseChannel = getOption(parsedArgs, "--release-channel");
  if (!appPath || !headRef || !releaseChannel) {
    usage();
  }

  const result = await verifyMobileRelease({
    appPath,
    headRef,
    releaseChannel,
    repoRoot: context.repoRoot,
  });

  console.log(`valid=${result.valid}`);
  console.log(`release_channel=${result.releaseChannel}`);
  console.log(`head_ref=${result.headRef}`);
  console.log(`package_version=${result.packageVersion}`);
  console.log(`expo_version=${result.expoVersion}`);
  console.log(`version_matches=${result.versionMatches}`);

  if (!result.valid) {
    process.exit(1);
  }
}

async function runProductionVersionLock(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const appPath = getOption(parsedArgs, "--app-path");
  const headRef = getOption(parsedArgs, "--head-ref");
  if (!appPath || !headRef) {
    usage();
  }

  const result = await determineProductionVersionLock({
    appPath,
    headRef,
    ref: getOption(parsedArgs, "--ref"),
    repoRoot: context.repoRoot,
    targetVersion: getOption(parsedArgs, "--target-version"),
  });

  console.log(`state=${result.state}`);
  console.log(`version=${result.version}`);
  console.log(`package_version=${result.packageVersion}`);
  console.log(`expo_version=${result.expoVersion}`);
  console.log(`version_matches=${result.versionMatches}`);
  console.log(`production_version_exists=${result.productionVersionExists}`);
  console.log(`reason=${result.reason}`);
}

async function runPrepareExpoProductionConfig(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const projectPath = getOption(parsedArgs, "--path");
  if (!projectPath) {
    usage();
  }

  const result = await prepareExpoProductionConfig({
    projectRoot: resolve(context.repoRoot, projectPath),
  });

  console.log(`config_path=${result.configPath}`);
  console.log(`config_type=${result.configType}`);
  console.log(`prepared=${result.prepared}`);
  console.log(`status=${result.status}`);
}

async function runRestoreExpoChannel(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const projectPath = getOption(parsedArgs, "--path");
  const headRef = getOption(parsedArgs, "--head-ref");
  if (!projectPath || !headRef) {
    usage();
  }

  const result = await restoreExpoChannelFromRef({
    headRef,
    projectRoot: resolve(context.repoRoot, projectPath),
    repoRoot: context.repoRoot,
  });

  console.log(`config_path=${result.configPath}`);
  console.log(`config_type=${result.configType}`);
  console.log(`restored=${result.restored}`);
  console.log(`status=${result.status}`);
}

async function runSyncExpoVersion(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const projectPath = getOption(parsedArgs, "--path");
  if (!projectPath) {
    usage();
  }

  const result = await syncExpoVersion({
    projectRoot: resolve(context.repoRoot, projectPath),
  });

  console.log("Synced Expo version:");
  console.log(`- package: ${result.packageJsonPath}`);
  console.log(`- config: ${result.configPath}`);
  console.log(`- version: ${result.version}`);
  console.log(`- updated: ${result.updated}`);
  console.log(`- version status: ${result.versionStatus}`);
  console.log(`- ios buildNumber status: ${result.iosBuildNumberStatus}`);
  console.log(`- android versionCode status: ${result.androidVersionCodeStatus}`);
}

async function runSyncExpoVersions(context: CommandContext) {
  const results = await syncChangedExpoVersions({
    repoRoot: context.repoRoot,
  });

  console.log(`Synced Expo versions for ${results.length} app(s):`);
  for (const result of results) {
    console.log(`- package: ${result.packageJsonPath}`);
    console.log(`  config: ${result.configPath}`);
    console.log(`  version: ${result.version}`);
    console.log(`  updated: ${result.updated}`);
    console.log(`  version status: ${result.versionStatus}`);
    console.log(`  ios buildNumber status: ${result.iosBuildNumberStatus}`);
    console.log(`  android versionCode status: ${result.androidVersionCodeStatus}`);
  }
}

function runSetupWorktree(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const target = parsedArgs.positionals[0]; // optional — defaults to cwd
  const verbose = hasOption(parsedArgs, "--verbose");
  const result = setupWorktree({ cwd: context.repoRoot, target, verbose });

  console.log(`Worktree: ${result.worktreePath}`);
  for (const path of result.linked) {
    console.log(`  linked:  ${path}`);
  }
  for (const path of result.skipped) {
    console.log(`  skipped: ${path} (already exists)`);
  }
  if (verbose) {
    for (const path of result.missing) {
      console.log(`  missing: ${path} (no node_modules in main repo)`);
    }
  }
  console.log(`\nDone — ${result.linked.length} linked, ${result.skipped.length} skipped.`);
}

async function runTriggerXcodeCloudBuild(context: CommandContext) {
  const parsedArgs = parseArgs(context.args);
  const workflowId = getOption(parsedArgs, "--workflow-id");
  const refName = getOption(parsedArgs, "--ref-name");
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
  const privateKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY;

  if (!workflowId || !refName || !issuerId || !keyId || !privateKey) {
    usage();
  }

  const result = await triggerXcodeCloudBuildWithFallback({
    credentials: {
      issuerId,
      keyId,
      privateKey,
    },
    refName,
    workflowId,
  });

  console.log(`status=${result.status}`);
  console.log(`backup_build_eligible=${result.backupBuildEligible}`);
  console.log(`reason=${result.reason}`);

  if (result.status === "started") {
    console.log(`workflow_id=${result.workflowId}`);
    console.log(`workflow_name=${result.workflowName}`);
    console.log(`repository_id=${result.repositoryId}`);
    console.log(`git_reference_id=${result.gitReferenceId}`);
    console.log(`git_reference_kind=${result.gitReferenceKind}`);
    console.log(`build_run_id=${result.buildRunId}`);
    console.log(`build_run_api_url=${result.buildRunApiUrl}`);
  }
}

async function main() {
  const repoRoot = resolve(process.cwd());
  const namespace = process.argv[2];
  const command = process.argv[3];
  const args = process.argv.slice(4);

  if (namespace === "fingerprint" && (command === "generate" || command === "compare")) {
    await runFingerprint(command, { args, repoRoot });
    return;
  }

  if (namespace === "deps-changed") {
    await runDepsChange({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "should-run") {
    await runShouldRun({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "resolve-comparison-base") {
    await runResolveComparisonBase({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "latest-commit-changed") {
    await runLatestCommitChanged({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "latest-commit-deps-changed") {
    await runLatestCommitDepsChanged({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "latest-commit-fingerprint-changes") {
    await runLatestCommitFingerprintChanges({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "trigger-xcode-cloud-build") {
    await runTriggerXcodeCloudBuild({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "discover-cloudflare-apps") {
    await runDiscoverCloudflareApps({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "cloudflare-release-version-changed") {
    await runCloudflareReleaseVersionChanged({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "classify-release-target") {
    await runClassifyReleaseTarget({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "mobile-production-action") {
    await runMobileProductionAction({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "mobile-production-package-version-changed") {
    await runMobileProductionPackageVersionChanged({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "verify-mobile-release") {
    await runVerifyMobileRelease({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "production-version-lock") {
    await runProductionVersionLock({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "prepare-expo-production-config") {
    await runPrepareExpoProductionConfig({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "restore-expo-channel") {
    await runRestoreExpoChannel({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "sync-expo-version") {
    await runSyncExpoVersion({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "sync-expo-versions") {
    await runSyncExpoVersions({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "setup-worktree") {
    runSetupWorktree({ args: process.argv.slice(3), repoRoot });
    return;
  }

  if (namespace === "fingerprint" && command) {
    usage();
  }
  usage();
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "repo-scripts command failed.",
  );
  process.exit(1);
});
