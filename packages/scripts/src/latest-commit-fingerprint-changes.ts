import { readFileAtRef } from "./git.js";

type FingerprintEntry = {
  profile?: "internal" | "preview" | "production";
  ref?: string;
};

type FingerprintHistory = Record<string, FingerprintEntry>;

export type LatestCommitFingerprintChangesResult = {
  androidChanged: boolean;
  androidProductionOnly: boolean;
  androidMainRef: boolean;
  iosChanged: boolean;
  iosProductionOnly: boolean;
  iosMainRef: boolean;
};

function readFingerprintHistoryAtRef(
  readFileAtRefImpl: typeof readFileAtRef,
  repoRoot: string,
  ref: string,
  path: string,
): FingerprintHistory {
  const contents = readFileAtRefImpl(repoRoot, ref, path);
  if (!contents) {
    return {};
  }

  try {
    return JSON.parse(contents) as FingerprintHistory;
  } catch {
    return {};
  }
}

function summarizePlatformChange(
  readFileAtRefImpl: typeof readFileAtRef,
  repoRoot: string,
  headRef: string,
  path: string,
): { changed: boolean; productionOnly: boolean; mainRef: boolean } {
  const previousHistory = readFingerprintHistoryAtRef(
    readFileAtRefImpl,
    repoRoot,
    `${headRef}^`,
    path,
  );
  const currentHistory = readFingerprintHistoryAtRef(
    readFileAtRefImpl,
    repoRoot,
    headRef,
    path,
  );

  const changedEntries = Object.entries(currentHistory).filter(([hash, entry]) => {
    const previousEntry = previousHistory[hash];
    return JSON.stringify(previousEntry) !== JSON.stringify(entry);
  });
  const removedHashes = Object.keys(previousHistory).filter(
    (hash) => !(hash in currentHistory),
  );

  if (changedEntries.length === 0 && removedHashes.length === 0) {
    return { changed: false, productionOnly: false, mainRef: false };
  }

  if (removedHashes.length > 0) {
    return { changed: true, productionOnly: false, mainRef: false };
  }

  return {
    changed: true,
    productionOnly: changedEntries.every(([, entry]) => entry.profile === "production"),
    mainRef: changedEntries.every(([, entry]) => entry.ref === "main"),
  };
}

export async function latestCommitFingerprintChanges({
  androidFingerprintPath,
  headRef,
  iosFingerprintPath,
  readFileAtRefImpl = readFileAtRef,
  repoRoot,
}: {
  androidFingerprintPath: string;
  headRef: string;
  iosFingerprintPath: string;
  readFileAtRefImpl?: typeof readFileAtRef;
  repoRoot: string;
}): Promise<LatestCommitFingerprintChangesResult> {
  const android = summarizePlatformChange(
    readFileAtRefImpl,
    repoRoot,
    headRef,
    androidFingerprintPath,
  );
  const ios = summarizePlatformChange(readFileAtRefImpl, repoRoot, headRef, iosFingerprintPath);

  return {
    androidChanged: android.changed,
    androidProductionOnly: android.productionOnly,
    androidMainRef: android.mainRef,
    iosChanged: ios.changed,
    iosProductionOnly: ios.productionOnly,
    iosMainRef: ios.mainRef,
  };
}
