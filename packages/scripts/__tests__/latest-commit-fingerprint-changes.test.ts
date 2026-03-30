import { latestCommitFingerprintChanges } from "../src/latest-commit-fingerprint-changes.js";

function createReadFileAtRefStub(files: Record<string, string | null>) {
  return (_repoRoot: string, ref: string, path: string) => files[`${ref}:${path}`] ?? null;
}

describe("latestCommitFingerprintChanges", () => {
  it("marks an internal android fingerprint refresh as buildable", async () => {
    const readFileAtRefImpl = createReadFileAtRefStub({
      "HEAD^:apps/mobile/fingerprints/android.json": JSON.stringify({
        "android-initial": { profile: "internal", ref: "main" },
      }),
      "HEAD:apps/mobile/fingerprints/android.json": JSON.stringify({
        "android-initial": { profile: "internal", ref: "main" },
        "android-next": { profile: "internal", ref: "main" },
      }),
      "HEAD^:apps/mobile/fingerprints/ios.json": JSON.stringify({
        "ios-initial": { profile: "internal", ref: "main" },
      }),
      "HEAD:apps/mobile/fingerprints/ios.json": JSON.stringify({
        "ios-initial": { profile: "internal", ref: "main" },
      }),
    });

    await expect(
      latestCommitFingerprintChanges({
        androidFingerprintPath: "apps/mobile/fingerprints/android.json",
        headRef: "HEAD",
        iosFingerprintPath: "apps/mobile/fingerprints/ios.json",
        readFileAtRefImpl,
        repoRoot: "/repo",
      }),
    ).resolves.toEqual({
      androidChanged: true,
      androidProductionOnly: false,
      androidMainRef: true,
      iosChanged: false,
      iosProductionOnly: false,
      iosMainRef: false,
    });
  });

  it("marks an internal ios fingerprint refresh as buildable", async () => {
    const readFileAtRefImpl = createReadFileAtRefStub({
      "HEAD^:apps/mobile/fingerprints/android.json": JSON.stringify({
        "android-initial": { profile: "internal", ref: "main" },
      }),
      "HEAD:apps/mobile/fingerprints/android.json": JSON.stringify({
        "android-initial": { profile: "internal", ref: "main" },
      }),
      "HEAD^:apps/mobile/fingerprints/ios.json": JSON.stringify({
        "ios-initial": { profile: "internal", ref: "main" },
      }),
      "HEAD:apps/mobile/fingerprints/ios.json": JSON.stringify({
        "ios-initial": { profile: "internal", ref: "main" },
        "ios-next": { profile: "internal", ref: "main" },
      }),
    });

    await expect(
      latestCommitFingerprintChanges({
        androidFingerprintPath: "apps/mobile/fingerprints/android.json",
        headRef: "HEAD",
        iosFingerprintPath: "apps/mobile/fingerprints/ios.json",
        readFileAtRefImpl,
        repoRoot: "/repo",
      }),
    ).resolves.toEqual({
      androidChanged: false,
      androidProductionOnly: false,
      androidMainRef: false,
      iosChanged: true,
      iosProductionOnly: false,
      iosMainRef: true,
    });
  });

  it("marks internal refreshes on both platforms as buildable", async () => {
    const readFileAtRefImpl = createReadFileAtRefStub({
      "HEAD^:apps/mobile/fingerprints/android.json": JSON.stringify({
        "android-initial": { profile: "internal", ref: "main" },
      }),
      "HEAD:apps/mobile/fingerprints/android.json": JSON.stringify({
        "android-initial": { profile: "internal", ref: "main" },
        "android-next": { profile: "internal", ref: "main" },
      }),
      "HEAD^:apps/mobile/fingerprints/ios.json": JSON.stringify({
        "ios-initial": { profile: "internal", ref: "main" },
      }),
      "HEAD:apps/mobile/fingerprints/ios.json": JSON.stringify({
        "ios-initial": { profile: "internal", ref: "main" },
        "ios-next": { profile: "internal", ref: "main" },
      }),
    });

    await expect(
      latestCommitFingerprintChanges({
        androidFingerprintPath: "apps/mobile/fingerprints/android.json",
        headRef: "HEAD",
        iosFingerprintPath: "apps/mobile/fingerprints/ios.json",
        readFileAtRefImpl,
        repoRoot: "/repo",
      }),
    ).resolves.toEqual({
      androidChanged: true,
      androidProductionOnly: false,
      androidMainRef: true,
      iosChanged: true,
      iosProductionOnly: false,
      iosMainRef: true,
    });
  });

  it("marks production refreshes on both platforms as non-buildable", async () => {
    const readFileAtRefImpl = createReadFileAtRefStub({
      "HEAD^:apps/mobile/fingerprints/android.json": JSON.stringify({
        "android-initial": { profile: "internal", ref: "main" },
      }),
      "HEAD:apps/mobile/fingerprints/android.json": JSON.stringify({
        "android-initial": { profile: "internal", ref: "main" },
        "android-production": { profile: "production", ref: "app-mobile@0.0.1" },
      }),
      "HEAD^:apps/mobile/fingerprints/ios.json": JSON.stringify({
        "ios-initial": { profile: "internal", ref: "main" },
      }),
      "HEAD:apps/mobile/fingerprints/ios.json": JSON.stringify({
        "ios-initial": { profile: "internal", ref: "main" },
        "ios-production": { profile: "production", ref: "app-mobile@0.0.1" },
      }),
    });

    await expect(
      latestCommitFingerprintChanges({
        androidFingerprintPath: "apps/mobile/fingerprints/android.json",
        headRef: "HEAD",
        iosFingerprintPath: "apps/mobile/fingerprints/ios.json",
        readFileAtRefImpl,
        repoRoot: "/repo",
      }),
    ).resolves.toEqual({
      androidChanged: true,
      androidProductionOnly: true,
      androidMainRef: false,
      iosChanged: true,
      iosProductionOnly: true,
      iosMainRef: false,
    });
  });

  it("treats deleted fingerprint entries as non-production-only changes", async () => {
    const readFileAtRefImpl = createReadFileAtRefStub({
      "HEAD^:apps/mobile/fingerprints/android.json": JSON.stringify({
        "android-initial": { profile: "production", ref: "main" },
        "android-old": { profile: "production", ref: "main" },
      }),
      "HEAD:apps/mobile/fingerprints/android.json": JSON.stringify({
        "android-initial": { profile: "production", ref: "main" },
      }),
      "HEAD^:apps/mobile/fingerprints/ios.json": JSON.stringify({
        "ios-initial": { profile: "internal", ref: "main" },
      }),
      "HEAD:apps/mobile/fingerprints/ios.json": JSON.stringify({
        "ios-initial": { profile: "internal", ref: "main" },
      }),
    });

    await expect(
      latestCommitFingerprintChanges({
        androidFingerprintPath: "apps/mobile/fingerprints/android.json",
        headRef: "HEAD",
        iosFingerprintPath: "apps/mobile/fingerprints/ios.json",
        readFileAtRefImpl,
        repoRoot: "/repo",
      }),
    ).resolves.toEqual({
      androidChanged: true,
      androidProductionOnly: false,
      androidMainRef: false,
      iosChanged: false,
      iosProductionOnly: false,
      iosMainRef: false,
    });
  });

  it("skips builds for fingerprint entries with non-main ref from squash merges", async () => {
    const readFileAtRefImpl = createReadFileAtRefStub({
      "HEAD^:apps/mobile/fingerprints/android.json": JSON.stringify({}),
      "HEAD:apps/mobile/fingerprints/android.json": JSON.stringify({
        "android-branch": { profile: "preview", ref: "feat/some-branch" },
      }),
      "HEAD^:apps/mobile/fingerprints/ios.json": JSON.stringify({}),
      "HEAD:apps/mobile/fingerprints/ios.json": JSON.stringify({
        "ios-branch": { profile: "preview", ref: "feat/some-branch" },
      }),
    });

    await expect(
      latestCommitFingerprintChanges({
        androidFingerprintPath: "apps/mobile/fingerprints/android.json",
        headRef: "HEAD",
        iosFingerprintPath: "apps/mobile/fingerprints/ios.json",
        readFileAtRefImpl,
        repoRoot: "/repo",
      }),
    ).resolves.toEqual({
      androidChanged: true,
      androidProductionOnly: false,
      androidMainRef: false,
      iosChanged: true,
      iosProductionOnly: false,
      iosMainRef: false,
    });
  });
});
