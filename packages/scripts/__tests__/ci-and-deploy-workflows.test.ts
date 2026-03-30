import { readFile } from "node:fs/promises";
import { parse } from "yaml";

async function readWorkflow(fileName: string) {
  return readFile(new URL(`../../../.github/workflows/${fileName}`, import.meta.url), "utf8");
}

describe("ci and deploy workflows", () => {
  it("runs ci checks in a single reusable workflow with build before lint, type-check, and test", async () => {
    const workflow = await readWorkflow("ci-checks.yml");

    const buildStepIndex = workflow.indexOf("- name: Build");
    const lintStepIndex = workflow.indexOf("- name: Lint");
    const typeCheckStepIndex = workflow.indexOf("- name: Type Check");
    const testStepIndex = workflow.indexOf("- name: Test");
    const summarizeStepIndex = workflow.indexOf("- name: Summarize CI results");

    expect(buildStepIndex).toBeGreaterThan(-1);
    expect(lintStepIndex).toBeGreaterThan(buildStepIndex);
    expect(typeCheckStepIndex).toBeGreaterThan(lintStepIndex);
    expect(testStepIndex).toBeGreaterThan(typeCheckStepIndex);
    expect(summarizeStepIndex).toBeGreaterThan(testStepIndex);
    expect(workflow).toContain("if: always()");
  });

  it("routes PR and main workflows through the single ci checks workflow", async () => {
    const prWorkflow = await readWorkflow("pr-workflow.yml");
    const mainWorkflow = await readWorkflow("main-branch.yml");

    expect(prWorkflow).toContain("uses: ./.github/workflows/ci-checks.yml");
    expect(mainWorkflow).toContain("uses: ./.github/workflows/ci-checks.yml");

    expect(prWorkflow).not.toContain("uses: ./.github/workflows/run-command.yml");
    expect(mainWorkflow).not.toContain("uses: ./.github/workflows/run-command.yml");
  });

  it("forwards inherited secrets to reusable ios build workflows", async () => {
    for (const fileName of ["pr-workflow.yml", "main-branch.yml", "mobile-production-app.yml"]) {
      const workflow = await readWorkflow(fileName);
      const jobMatch = workflow.match(/(^  ios-build:\n[\s\S]*?)(?=^  [a-z0-9-]+:|\Z)/m);

      expect(jobMatch).not.toBeNull();
      expect(jobMatch?.[1]).toContain("uses: ./.github/workflows/ios-build.yml");
      expect(jobMatch?.[1]).toContain("secrets: inherit");
      expect(jobMatch?.[1]).toContain("build_profile:");
    }
  });

  it("passes the production build profile to the iOS build workflow", async () => {
    const workflow = await readWorkflow("mobile-production-app.yml");
    const jobMatch = workflow.match(/(^  ios-build:\n[\s\S]*?)(?=^  [a-z0-9-]+:|\Z)/m);

    expect(jobMatch).not.toBeNull();
    expect(jobMatch?.[1]).toContain("build_profile: production");
  });

  it("adds non-canceling concurrency to release workflows", async () => {
    for (const fileName of [
      "release-router.yml",
      "mobile-production-app.yml",
      "promote-cloudflare-production.yml",
      "mobile-release-update.yml",
    ]) {
      const workflow = await readWorkflow(fileName);
      expect(workflow).toContain("concurrency:");
      expect(workflow).toContain("cancel-in-progress: false");
    }
  });

  it("verifies production/cloudflare points to the pushed release sha after promotion", async () => {
    const workflow = await readWorkflow("promote-cloudflare-production.yml");

    expect(workflow).toContain("- name: Verify promoted branch ref");
    expect(workflow).toContain('PROMOTED_SHA="$(git rev-parse origin/production/cloudflare)"');
    expect(workflow).toContain('[ "$PROMOTED_SHA" != "${{ steps.release.outputs.release_sha }}" ]');
  });

  it("verifies the mobile release metadata after publishing the update", async () => {
    const workflow = await readWorkflow("mobile-release-update.yml");

    const releaseStepIndex = workflow.indexOf("- name: Release update");
    const verifyStepIndex = workflow.indexOf("- name: Verify release metadata");

    expect(releaseStepIndex).toBeGreaterThan(-1);
    expect(verifyStepIndex).toBeGreaterThan(releaseStepIndex);
    expect(workflow).toContain("bun run repo-scripts verify-mobile-release");
  });

  it("routes iOS builds through GitHub Actions and Xcode Cloud with one-way fallback", async () => {
    const workflow = await readWorkflow("ios-build.yml");
    const parsedWorkflow = parse(workflow) as {
      jobs: Record<
        string,
        {
          environment?: string;
          "runs-on"?: string;
          steps?: Array<{ name?: string; uses?: string }>;
        }
      >;
    };

    expect(workflow).toContain("resolve-build-strategy:");
    expect(workflow).toContain("build_profile:");
    expect(workflow).toContain("ios_primary_builder:");
    expect(workflow).toContain("repository_visibility_override:");
    expect(workflow).toContain('Accepted values: github_actions, xcode_cloud');
    expect(workflow).toContain("approve-primary-xcode-build:");
    expect(workflow).toContain("approve-fallback-xcode-build:");
    expect(parsedWorkflow.jobs["approve-primary-xcode-build"]?.environment).toBe(
      "${{ format('{0}@ios-build-xcode', inputs.environment_prefix) }}",
    );
    expect(parsedWorkflow.jobs["approve-fallback-xcode-build"]?.environment).toBe(
      "${{ format('{0}@ios-build-xcode', inputs.environment_prefix) }}",
    );
    expect(workflow).toContain("approve-primary-github-actions-build:");
    expect(workflow).toContain("approve-fallback-github-actions-build:");
    expect(parsedWorkflow.jobs["approve-primary-github-actions-build"]?.environment).toBe(
      "${{ format('{0}@ios-build-gha', inputs.environment_prefix) }}",
    );
    expect(parsedWorkflow.jobs["approve-fallback-github-actions-build"]?.environment).toBe(
      "${{ format('{0}@ios-build-gha', inputs.environment_prefix) }}",
    );
    expect(workflow).toContain("primary_build_path");
    expect(workflow).toContain("repo_visibility");
    expect(workflow).toContain("effective_repo_visibility");
    expect(workflow).toContain("backup_build_eligible");
    expect(workflow).toContain('if [ "$FALLBACK_USED" = "true" ]; then');
    expect(parsedWorkflow.jobs["primary-github-actions-build"]?.["runs-on"]).toBe("macos-26");
    expect(parsedWorkflow.jobs["primary-github-actions-build"]?.environment).toBe(
      "${{ format('{0}@{1}', inputs.environment_prefix, startsWith(inputs.head_branch, format('{0}@', inputs.environment_prefix)) && 'production' || 'main') }}",
    );
    expect(
      parsedWorkflow.jobs["primary-github-actions-build"]?.steps?.some(
        (step) => step.name === "Build and upload iOS app on GitHub Actions" && step.uses === "./.github/actions/ios-build-gha",
      ),
    ).toBe(true);
    expect(parsedWorkflow.jobs["fallback-github-actions-build"]?.environment).toBe(
      "${{ format('{0}@{1}', inputs.environment_prefix, startsWith(inputs.head_branch, format('{0}@', inputs.environment_prefix)) && 'production' || 'main') }}",
    );
    expect(
      parsedWorkflow.jobs["fallback-github-actions-build"]?.steps?.some(
        (step) => step.name === "Build and upload iOS app on GitHub Actions" && step.uses === "./.github/actions/ios-build-gha",
      ),
    ).toBe(true);
    expect(workflow).toContain("IOS_MATCH_GIT_URL");
    expect(workflow).toContain("IOS_MATCH_GIT_BRANCH");
    expect(workflow).toContain("MATCH_PASSWORD");
    expect(workflow).toContain("MATCH_GIT_HTTP_CREDENTIAL");
    expect(workflow).toContain("uses: ./.github/actions/setup-env");
    expect(workflow).toContain("- name: Validate Xcode Cloud configuration");
    expect(workflow).toContain("- name: Trigger Xcode Cloud build");
    expect(workflow).toContain("primary-github-actions-build");
    expect(workflow).toContain("primary-or-fallback-xcode-cloud");
    expect(workflow).toContain("fallback-github-actions-build");
    expect(workflow).toContain("the workflow will not ask for another backup path in this run");
    expect(workflow).not.toContain("-fallback@");
    expect(workflow).toContain("bun run repo-scripts trigger-xcode-cloud-build");
    expect(workflow).not.toContain("placeholder-only");
    expect(workflow).not.toContain('PREP_SCRIPT="$APP_PATH/ios/ci_scripts/ci_post_clone.sh"');
  });

  it("extracts the GitHub Actions iOS implementation into a composite action", async () => {
    const action = await readFile(new URL("../../../.github/actions/ios-build-gha/action.yml", import.meta.url), "utf8");

    expect(action).toContain("actions/setup-node@v4");
    expect(action).toContain("uses: ./.github/actions/setup-env");
    expect(action).toContain("uses: ./.github/actions/write-env-file");
    expect(action).toContain("Cache CocoaPods");
    expect(action).toContain("Build workspace packages");
    expect(action).toContain("Verify Expo iOS autolinking");
    expect(action).toContain("Prepare Expo config for build profile");
    expect(action).toContain("prepare-expo-production-config");
    expect(action).toContain("Generate iOS native project");
    expect(action).toContain("ruby/setup-ruby@v1");
    expect(action).toContain("Cache Fastlane gems");
    expect(action).toContain("bundle exec fastlane ios ci_build");
    expect(action).toContain("MATCH_GIT_URL");
    expect(action).toContain("MATCH_PASSWORD");
    expect(action).toContain("MATCH_GIT_HTTP_CREDENTIAL");
    expect(action).toContain('MATCH_GIT_BASIC_AUTHORIZATION="$(printf \'%s\' "$MATCH_GIT_HTTP_CREDENTIAL" | base64)"');
    expect(action).not.toContain("apple-actions/import-codesign-certs@v5");
  });

  it("stores the shared iOS fastlane lane under packages/scripts", async () => {
    const fastfile = await readFile(new URL("../../../packages/scripts/fastlane/Fastfile", import.meta.url), "utf8");
    const gemfile = await readFile(new URL("../../../packages/scripts/fastlane/Gemfile", import.meta.url), "utf8");
    const matchfile = await readFile(new URL("../../../packages/scripts/fastlane/Matchfile", import.meta.url), "utf8");

    expect(gemfile).toContain('gem "fastlane"');
    expect(matchfile).toContain('storage_mode("git")');
    expect(matchfile).toContain('type("appstore")');
    expect(matchfile).toContain('git_branch(ENV["MATCH_GIT_BRANCH"])');
    expect(fastfile).toContain("lane :ci_build");
    expect(fastfile).toContain('ios_path = File.join(app_root, "ios")');
    expect(fastfile).toContain('workspaces = Dir[File.join(ios_path, "*.xcworkspace")]');
    expect(fastfile).toContain('scheme = File.basename(workspaces.first, ".xcworkspace")');
    expect(fastfile).toContain('setup_ci if ENV["CI"] == "true"');
    expect(fastfile).toContain("match(");
    expect(fastfile).toContain("app_identifier: app_identifier");
    expect(fastfile).toContain("build_app(");
    expect(fastfile).toContain('export_method: "app-store"');
    expect(fastfile).toContain('signingStyle: "manual"');
    expect(fastfile).toContain("upload_to_testflight(");
    expect(fastfile).not.toContain("appleTeamId");
  });

  it("documents the iOS CI prep script in the native project", async () => {
    const script = await readFile(
      new URL("../../../apps/mobile/ios/ci_scripts/ci_post_clone.sh", import.meta.url),
      "utf8",
    );

    expect(script).toContain("export CI");
    expect(script).toContain("command -v node");
    expect(script).toContain("node --no-warnings --eval");
    expect(script).toContain("bun run build");
    expect(script).toContain("expo-modules-autolinking react-native-config --json --platform ios");
    expect(script).toContain("bun x expo prebuild -p ios --clean");
    expect(script).toContain("BUILD_PROFILE");
    expect(script).toContain("prepare-expo-production-config");
    expect(script).not.toContain("pod install");
  });
});
