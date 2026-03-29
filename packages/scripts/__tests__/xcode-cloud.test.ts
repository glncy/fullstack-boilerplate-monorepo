import { generateKeyPairSync } from "node:crypto";

import {
  createAppStoreConnectToken,
  triggerXcodeCloudBuild,
  triggerXcodeCloudBuildWithFallback,
} from "../src/xcode-cloud.js";

function createPrivateKeyPem() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

describe("xcode cloud scripts", () => {
  it("creates a signed App Store Connect token", () => {
    const token = createAppStoreConnectToken({
      credentials: {
        issuerId: "issuer-id",
        keyId: "ABC1234567",
        privateKey: createPrivateKeyPem(),
      },
      issuedAt: 1_700_000_000,
    });

    const parts = token.split(".");

    expect(parts).toHaveLength(3);
    expect(parts[0]).not.toBe("");
    expect(parts[1]).not.toBe("");
    expect(parts[2]).not.toBe("");
  });

  it("starts an Xcode Cloud build from the matching git reference", async () => {
    const requests: Array<{ body?: unknown; method?: string; url: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ body: init?.body, method: init?.method, url });

      if (url.endsWith("/v1/ciWorkflows/workflow-123?include=repository")) {
        return new Response(
          JSON.stringify({
            data: {
              attributes: { name: "iOS Release" },
              id: "workflow-123",
              relationships: {
                repository: {
                  data: {
                    id: "repo-123",
                    type: "scmRepositories",
                  },
                },
              },
              type: "ciWorkflows",
            },
          }),
        );
      }

      if (url.endsWith("/v1/scmRepositories/repo-123/gitReferences?limit=200")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                attributes: {
                  canonicalName: "refs/heads/main",
                  kind: "branch",
                  name: "origin/main",
                },
                id: "git-ref-main",
                type: "scmGitReferences",
              },
              {
                attributes: {
                  canonicalName: "refs/tags/app-mobile@1.0.0",
                  kind: "tag",
                  name: "app-mobile@1.0.0",
                },
                id: "git-ref-tag",
                type: "scmGitReferences",
              },
            ],
          }),
        );
      }

      if (url.endsWith("/v1/ciBuildRuns")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "build-run-123",
              type: "ciBuildRuns",
            },
            links: {
              self: "https://api.appstoreconnect.apple.com/v1/ciBuildRuns/build-run-123",
            },
          }),
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    const result = await triggerXcodeCloudBuild({
      credentials: {
        issuerId: "issuer-id",
        keyId: "ABC1234567",
        privateKey: createPrivateKeyPem(),
      },
      fetchImpl,
      refName: "app-mobile@1.0.0",
      workflowId: "workflow-123",
    });

    expect(result).toEqual({
      buildRunApiUrl: "https://api.appstoreconnect.apple.com/v1/ciBuildRuns/build-run-123",
      buildRunId: "build-run-123",
      gitReferenceId: "git-ref-tag",
      gitReferenceKind: "tag",
      repositoryId: "repo-123",
      workflowId: "workflow-123",
      workflowName: "iOS Release",
    });

    expect(requests.at(-1)?.method).toBe("POST");
    expect(JSON.parse(String(requests.at(-1)?.body))).toMatchObject({
      data: {
        relationships: {
          sourceBranchOrTag: {
            data: {
              id: "git-ref-tag",
              type: "scmGitReferences",
            },
          },
          workflow: {
            data: {
              id: "workflow-123",
              type: "ciWorkflows",
            },
          },
        },
      },
    });
  });

  it("follows absolute pagination links when looking up git references", async () => {
    const requests: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push(url);

      if (url.endsWith("/v1/ciWorkflows/workflow-123?include=repository")) {
        return new Response(
          JSON.stringify({
            data: {
              attributes: { name: "iOS Release" },
              id: "workflow-123",
              relationships: {
                repository: {
                  data: {
                    id: "repo-123",
                    type: "scmRepositories",
                  },
                },
              },
              type: "ciWorkflows",
            },
          }),
        );
      }

      if (url.endsWith("/v1/scmRepositories/repo-123/gitReferences?limit=200")) {
        return new Response(
          JSON.stringify({
            data: [],
            links: {
              next: "https://api.appstoreconnect.apple.com/v1/scmRepositories/repo-123/gitReferences?cursor=page-2",
            },
          }),
        );
      }

      if (url.endsWith("/v1/scmRepositories/repo-123/gitReferences?cursor=page-2")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                attributes: {
                  canonicalName: "refs/heads/main",
                  kind: "branch",
                  name: "origin/main",
                },
                id: "git-ref-main",
                type: "scmGitReferences",
              },
            ],
          }),
        );
      }

      if (url.endsWith("/v1/ciBuildRuns")) {
        expect(init?.method).toBe("POST");

        return new Response(
          JSON.stringify({
            data: {
              id: "build-run-123",
              type: "ciBuildRuns",
            },
            links: {
              self: "https://api.appstoreconnect.apple.com/v1/ciBuildRuns/build-run-123",
            },
          }),
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    const result = await triggerXcodeCloudBuild({
      credentials: {
        issuerId: "issuer-id",
        keyId: "ABC1234567",
        privateKey: createPrivateKeyPem(),
      },
      fetchImpl,
      refName: "main",
      workflowId: "workflow-123",
    });

    expect(result.gitReferenceId).toBe("git-ref-main");
    expect(requests).toContain(
      "https://api.appstoreconnect.apple.com/v1/scmRepositories/repo-123/gitReferences?cursor=page-2",
    );
  });

  it("fails clearly when the git reference is missing", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);

      if (url.endsWith("/v1/ciWorkflows/workflow-123?include=repository")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "workflow-123",
              relationships: {
                repository: {
                  data: {
                    id: "repo-123",
                    type: "scmRepositories",
                  },
                },
              },
              type: "ciWorkflows",
            },
          }),
        );
      }

      if (url.endsWith("/v1/scmRepositories/repo-123/gitReferences?limit=200")) {
        return new Response(
          JSON.stringify({
            data: [],
          }),
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    await expect(
      triggerXcodeCloudBuild({
        credentials: {
          issuerId: "issuer-id",
          keyId: "ABC1234567",
          privateKey: createPrivateKeyPem(),
        },
        fetchImpl,
        refName: "missing-tag",
        workflowId: "workflow-123",
      }),
    ).rejects.toThrow('Could not find an App Store Connect git reference for "missing-tag"');
  });

  it("marks quota/start failures as backup-build eligible", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);

      if (url.endsWith("/v1/ciWorkflows/workflow-123?include=repository")) {
        return new Response(
          JSON.stringify({
            data: {
              attributes: { name: "iOS Release" },
              id: "workflow-123",
              relationships: {
                repository: {
                  data: {
                    id: "repo-123",
                    type: "scmRepositories",
                  },
                },
              },
              type: "ciWorkflows",
            },
          }),
        );
      }

      if (url.endsWith("/v1/scmRepositories/repo-123/gitReferences?limit=200")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                attributes: {
                  canonicalName: "refs/heads/main",
                  kind: "branch",
                  name: "main",
                },
                id: "git-ref-main",
                type: "scmGitReferences",
              },
            ],
          }),
        );
      }

      if (url.endsWith("/v1/ciBuildRuns")) {
        return new Response(
          JSON.stringify({
            errors: [
              {
                code: "ENTITY_ERROR.ATTRIBUTE.INVALID",
                detail: "No more compute hours are available for this month.",
              },
            ],
          }),
          { status: 429, statusText: "Too Many Requests" },
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    await expect(
      triggerXcodeCloudBuildWithFallback({
        credentials: {
          issuerId: "issuer-id",
          keyId: "ABC1234567",
          privateKey: createPrivateKeyPem(),
        },
        fetchImpl,
        refName: "main",
        workflowId: "workflow-123",
      }),
    ).resolves.toMatchObject({
      backupBuildEligible: true,
      status: "backup_build_eligible",
    });
  });

  it("marks invalid references as hard failures", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);

      if (url.endsWith("/v1/ciWorkflows/workflow-123?include=repository")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "workflow-123",
              relationships: {
                repository: {
                  data: {
                    id: "repo-123",
                    type: "scmRepositories",
                  },
                },
              },
              type: "ciWorkflows",
            },
          }),
        );
      }

      if (url.endsWith("/v1/scmRepositories/repo-123/gitReferences?limit=200")) {
        return new Response(
          JSON.stringify({
            data: [],
          }),
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    await expect(
      triggerXcodeCloudBuildWithFallback({
        credentials: {
          issuerId: "issuer-id",
          keyId: "ABC1234567",
          privateKey: createPrivateKeyPem(),
        },
        fetchImpl,
        refName: "missing-tag",
        workflowId: "workflow-123",
      }),
    ).resolves.toMatchObject({
      backupBuildEligible: false,
      status: "hard_fail",
    });
  });
});
