import { createPrivateKey, createSign } from "node:crypto";

type FetchLike = typeof fetch;

type AppStoreConnectCredentials = {
  issuerId: string;
  keyId: string;
  privateKey: string;
};

type AppStoreConnectResource<TAttributes = Record<string, unknown>> = {
  attributes?: TAttributes;
  id: string;
  relationships?: Record<
    string,
    {
      data?: {
        id: string;
        type: string;
      } | null;
    }
  >;
  type: string;
};

type AppStoreConnectResponse<TAttributes = Record<string, unknown>> = {
  data: AppStoreConnectResource<TAttributes> | AppStoreConnectResource<TAttributes>[];
  links?: {
    next?: string;
    self?: string;
  };
};

type WorkflowAttributes = {
  name?: string;
};

type GitReferenceAttributes = {
  canonicalName?: string;
  kind?: string;
  name?: string;
};

export type XcodeCloudTriggerStatus = "backup_build_eligible" | "hard_fail" | "started";

export type TriggerXcodeCloudBuildResult = {
  buildRunApiUrl: string;
  buildRunId: string;
  gitReferenceId: string;
  gitReferenceKind: string;
  repositoryId: string;
  workflowId: string;
  workflowName: string;
};

export type TriggerXcodeCloudBuildOutcome =
  | (TriggerXcodeCloudBuildResult & {
      backupBuildEligible: false;
      reason: string;
      status: "started";
    })
  | {
      backupBuildEligible: boolean;
      reason: string;
      status: "backup_build_eligible" | "hard_fail";
    };

class AppStoreConnectError extends Error {
  responseBody: string;
  statusCode: number;

  constructor({
    method,
    path,
    responseBody,
    statusCode,
  }: {
    method: string;
    path: string;
    responseBody: string;
    statusCode: number;
  }) {
    super(
      `App Store Connect request failed (${method} ${path}): ${statusCode} ${responseBody || "Unknown response body"}`,
    );
    this.name = "AppStoreConnectError";
    this.responseBody = responseBody;
    this.statusCode = statusCode;
  }
}

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, "\n").trim();
}

export function createAppStoreConnectToken({
  credentials,
  expiresInSeconds = 20 * 60,
  issuedAt = Math.floor(Date.now() / 1000),
}: {
  credentials: AppStoreConnectCredentials;
  expiresInSeconds?: number;
  issuedAt?: number;
}) {
  const header = {
    alg: "ES256",
    kid: credentials.keyId,
    typ: "JWT",
  };
  const payload = {
    aud: "appstoreconnect-v1",
    exp: issuedAt + expiresInSeconds,
    iss: credentials.issuerId,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();

  const signature = signer.sign({
    dsaEncoding: "ieee-p1363",
    key: createPrivateKey(normalizePrivateKey(credentials.privateKey)),
  });

  return `${signingInput}.${toBase64Url(signature)}`;
}

async function appStoreConnectRequest<TAttributes>({
  body,
  fetchImpl = fetch,
  method = "GET",
  path,
  token,
}: {
  body?: unknown;
  fetchImpl?: FetchLike;
  method?: "GET" | "POST";
  path: string;
  token: string;
}): Promise<AppStoreConnectResponse<TAttributes>> {
  const response = await fetchImpl(`https://api.appstoreconnect.apple.com${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new AppStoreConnectError({
      method,
      path,
      responseBody: errorText || response.statusText,
      statusCode: response.status,
    });
  }

  return (await response.json()) as AppStoreConnectResponse<TAttributes>;
}

async function getWorkflow({
  fetchImpl,
  token,
  workflowId,
}: {
  fetchImpl?: FetchLike;
  token: string;
  workflowId: string;
}) {
  const response = await appStoreConnectRequest<WorkflowAttributes>({
    fetchImpl,
    path: `/v1/ciWorkflows/${workflowId}?include=repository`,
    token,
  });
  const workflow = response.data as AppStoreConnectResource<WorkflowAttributes>;
  const repositoryId = workflow.relationships?.repository?.data?.id;

  if (!repositoryId) {
    throw new Error(`Workflow ${workflowId} is missing a repository relationship.`);
  }

  return {
    repositoryId,
    workflowName: workflow.attributes?.name ?? workflowId,
  };
}

function matchesGitReference(refName: string, resource: AppStoreConnectResource<GitReferenceAttributes>) {
  const { canonicalName, name } = resource.attributes ?? {};

  return (
    name === refName ||
    canonicalName === refName ||
    canonicalName === `refs/heads/${refName}` ||
    canonicalName === `refs/tags/${refName}`
  );
}

async function findGitReference({
  fetchImpl,
  refName,
  repositoryId,
  token,
}: {
  fetchImpl?: FetchLike;
  refName: string;
  repositoryId: string;
  token: string;
}) {
  let nextPath = `/v1/scmRepositories/${repositoryId}/gitReferences?limit=200`;

  while (nextPath) {
    const response = await appStoreConnectRequest<GitReferenceAttributes>({
      fetchImpl,
      path: nextPath,
      token,
    });
    const resources = response.data as AppStoreConnectResource<GitReferenceAttributes>[];
    const match = resources.find((resource) => matchesGitReference(refName, resource));

    if (match) {
      return {
        gitReferenceId: match.id,
        gitReferenceKind: match.attributes?.kind ?? "unknown",
      };
    }

    const next = response.links?.next;
    if (!next) {
      break;
    }

    const nextUrl = new URL(next);
    nextPath = `${nextUrl.pathname}${nextUrl.search}`;
  }

  throw new Error(
    `Could not find an App Store Connect git reference for "${refName}" in repository ${repositoryId}.`,
  );
}

export async function triggerXcodeCloudBuild({
  credentials,
  fetchImpl,
  refName,
  workflowId,
}: {
  credentials: AppStoreConnectCredentials;
  fetchImpl?: FetchLike;
  refName: string;
  workflowId: string;
}): Promise<TriggerXcodeCloudBuildResult> {
  const token = createAppStoreConnectToken({ credentials });
  const workflow = await getWorkflow({ fetchImpl, token, workflowId });
  const gitReference = await findGitReference({
    fetchImpl,
    refName,
    repositoryId: workflow.repositoryId,
    token,
  });

  const response = await appStoreConnectRequest({
    body: {
      data: {
        attributes: {},
        relationships: {
          sourceBranchOrTag: {
            data: {
              id: gitReference.gitReferenceId,
              type: "scmGitReferences",
            },
          },
          workflow: {
            data: {
              id: workflowId,
              type: "ciWorkflows",
            },
          },
        },
        type: "ciBuildRuns",
      },
    },
    fetchImpl,
    method: "POST",
    path: "/v1/ciBuildRuns",
    token,
  });

  const buildRun = response.data as AppStoreConnectResource;

  return {
    buildRunApiUrl:
      response.links?.self ?? `https://api.appstoreconnect.apple.com/v1/ciBuildRuns/${buildRun.id}`,
    buildRunId: buildRun.id,
    gitReferenceId: gitReference.gitReferenceId,
    gitReferenceKind: gitReference.gitReferenceKind,
    repositoryId: workflow.repositoryId,
    workflowId,
    workflowName: workflow.workflowName,
  };
}

function classifyAppStoreConnectFailure(error: AppStoreConnectError): TriggerXcodeCloudBuildOutcome {
  const haystack = `${error.message}\n${error.responseBody}`.toLowerCase();
  const quotaLike =
    haystack.includes("compute hour") ||
    haystack.includes("compute-hour") ||
    haystack.includes("quota") ||
    haystack.includes("capacity") ||
    haystack.includes("usage limit") ||
    haystack.includes("build limit") ||
    haystack.includes("too many active") ||
    haystack.includes("too many builds") ||
    haystack.includes("cannot start build") ||
    haystack.includes("can't start build") ||
    haystack.includes("unable to start build");

  if (quotaLike || [409, 429, 503].includes(error.statusCode)) {
    return {
      backupBuildEligible: true,
      reason: `Xcode Cloud trigger failed with a quota/start-build condition: ${error.message}`,
      status: "backup_build_eligible",
    };
  }

  return {
    backupBuildEligible: false,
    reason: error.message,
    status: "hard_fail",
  };
}

export async function triggerXcodeCloudBuildWithFallback({
  credentials,
  fetchImpl,
  refName,
  workflowId,
}: {
  credentials: AppStoreConnectCredentials;
  fetchImpl?: FetchLike;
  refName: string;
  workflowId: string;
}): Promise<TriggerXcodeCloudBuildOutcome> {
  try {
    const result = await triggerXcodeCloudBuild({
      credentials,
      fetchImpl,
      refName,
      workflowId,
    });

    return {
      ...result,
      backupBuildEligible: false,
      reason: "Xcode Cloud build started successfully.",
      status: "started",
    };
  } catch (error) {
    if (error instanceof AppStoreConnectError) {
      return classifyAppStoreConnectFailure(error);
    }

    return {
      backupBuildEligible: false,
      reason:
        error instanceof Error ? error.message : "Unknown error while triggering Xcode Cloud build.",
      status: "hard_fail",
    };
  }
}
