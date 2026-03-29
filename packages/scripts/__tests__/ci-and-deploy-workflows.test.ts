import { readFile } from "node:fs/promises";

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
    }
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

  it("triggers Xcode Cloud instead of using the placeholder iOS build step", async () => {
    const workflow = await readWorkflow("ios-build.yml");

    expect(workflow).toContain("approve-ios-build:");
    expect(workflow).toContain("environment: ${{ format('{0}@ios-build', inputs.environment_prefix) }}");
    expect(workflow).toContain("approve-github-fallback:");
    expect(workflow).toContain("environment: ${{ format('{0}@ios-build-gha', inputs.environment_prefix) }}");
    expect(workflow).toContain("backup_build_eligible");
    expect(workflow).toContain("- name: Validate Xcode Cloud configuration");
    expect(workflow).toContain("- name: Trigger Xcode Cloud build");
    expect(workflow).toContain("fallback-placeholder");
    expect(workflow).not.toContain("-fallback@");
    expect(workflow).toContain("bun run repo-scripts trigger-xcode-cloud-build");
    expect(workflow).not.toContain("This is the placeholder iOS build step.");
  });

  it("documents the Xcode Cloud post-clone script in the iOS project", async () => {
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
    expect(script).not.toContain("pod install");
  });
});
