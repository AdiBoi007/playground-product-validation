import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTwinArtifact,
  getTwinJob,
  getTwinConfiguration,
  createTwinJob,
} from "./twin-client";
import type { TwinExperimentSpec } from "./twin";
import { authHeaders, authIdentity } from "./auth-client";

vi.mock("./auth-client", () => ({
  authHeaders: vi.fn(),
  authIdentity: vi.fn(),
}));

const capability = `${"a".repeat(32)}.${"b".repeat(43)}`;
const minimalJob = { id: "job-1", runs: [] };
let saved: Map<string, string>;

beforeEach(() => {
  vi.mocked(authHeaders).mockResolvedValue({});
  vi.mocked(authIdentity).mockResolvedValue(null);
  saved = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("private browser worker client", () => {
  it("accepts the worker's signed workspace capability and reuses it", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ workspaceId: "a".repeat(32), capability }),
      )
      .mockImplementation(() =>
        Promise.resolve(Response.json({ job: minimalJob })),
      );
    vi.stubGlobal("fetch", fetcher);
    await getTwinJob("job-1");
    await getTwinJob("job-2");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      action: "workspace",
    });
    expect(fetcher.mock.calls[1][1].headers["X-Playground-Workspace"]).toBe(
      capability,
    );
    expect(fetcher.mock.calls[2][1].headers["X-Playground-Workspace"]).toBe(
      capability,
    );
    expect(
      fetcher.mock.calls.every(([url]) => !String(url).includes(capability)),
    ).toBe(true);
  });

  it("coalesces concurrent initial requests into one workspace", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ capability }))
      .mockImplementation(() =>
        Promise.resolve(Response.json({ job: minimalJob })),
      );
    vi.stubGlobal("fetch", fetcher);
    await Promise.all([getTwinJob("job-1"), getTwinJob("job-2")]);
    expect(
      fetcher.mock.calls.filter(
        ([, init]) => init?.body === JSON.stringify({ action: "workspace" }),
      ),
    ).toHaveLength(1);
  });

  it("keeps scoped access in request headers when fetching artifacts", async () => {
    saved.set("playground-twin-workspace-v1", capability);
    const fetcher = vi.fn().mockResolvedValue(
      new Response("image-bytes", {
        headers: { "content-type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const blob = await getTwinArtifact("job with spaces", "screenshot/1");
    expect(blob.type).toBe("image/png");
    expect(fetcher.mock.calls[0][0]).toBe(
      "/api/twin?action=artifact&jobId=job%20with%20spaces&artifactId=screenshot%2F1",
    );
    expect(fetcher.mock.calls[0][1].headers["X-Playground-Workspace"]).toBe(
      capability,
    );
  });

  it("does not create a workspace just to check configuration", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ configured: false, behaviouralConfigured: false }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect((await getTwinConfiguration()).configured).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(saved.size).toBe(0);
  });

  it("reports worker rejection without retrying a paid job creation", async () => {
    saved.set("playground-twin-workspace-v1", capability);
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: "Configured model spend cap exceeded." },
          { status: 422 },
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      createTwinJob("sandbox-1", {} as TwinExperimentSpec),
    ).rejects.toThrow("Configured model spend cap exceeded.");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed capabilities before sending an unscoped job request", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ capability: "not-a-signed-token" }));
    vi.stubGlobal("fetch", fetcher);
    await expect(getTwinJob("job-1")).rejects.toThrow("private workspace");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(saved.size).toBe(0);
  });

  it("binds capabilities to the signed-in account and authorizes configuration and artifacts", async () => {
    vi.mocked(authIdentity).mockResolvedValue("founder-a");
    vi.mocked(authHeaders).mockResolvedValue({
      Authorization: "Bearer account-a-session",
    });
    const otherCapability = `${"c".repeat(32)}.${"d".repeat(43)}`;
    saved.set("playground-twin-workspace-v1:founder-b", otherCapability);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ configured: true }))
      .mockResolvedValueOnce(Response.json({ capability }))
      .mockResolvedValueOnce(
        new Response("image-bytes", {
          headers: { "content-type": "image/png" },
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    await getTwinConfiguration();
    await getTwinArtifact("job-a", "screenshot-a");
    expect(
      fetcher.mock.calls.every(
        ([, init]) => init.headers.Authorization === "Bearer account-a-session",
      ),
    ).toBe(true);
    expect(fetcher.mock.calls[2][1].headers["X-Playground-Workspace"]).toBe(
      capability,
    );
    expect(saved.get("playground-twin-workspace-v1:founder-a")).toBe(
      capability,
    );
    expect(saved.get("playground-twin-workspace-v1:founder-b")).toBe(
      otherCapability,
    );
  });
});
