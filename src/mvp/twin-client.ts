import type { TwinExperimentSpec, TwinJob } from "./twin";
import { authHeaders, authIdentity } from "./auth-client";

export interface TwinConfiguration {
  configured: boolean;
  behaviouralConfigured: boolean;
  storage?: string;
  artifactStorage?: string;
  model?: string;
  limits?: {
    maxRuns: number;
    maxConcurrency: number;
    maxSteps: number;
    maxDurationSeconds: number;
    maxModelTokens: number;
    maxCostUsd: number;
  };
}

const CAPABILITY_KEY = "playground-twin-workspace-v1";
const pendingWorkspaces = new Map<string, Promise<string>>();

async function responseJson(response: Response) {
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      result && typeof result.error === "string"
        ? result.error
        : result && typeof result.message === "string"
          ? result.message
          : `Browser worker request failed (${response.status}).`;
    throw new Error(detail);
  }
  if (!result || typeof result !== "object")
    throw new Error("The browser worker returned an unreadable response.");
  return result;
}

async function workspaceCapability(
  headers: Record<string, string>,
  identity: string | null,
): Promise<string> {
  const storageKey = identity
    ? `${CAPABILITY_KEY}:${identity}`
    : CAPABILITY_KEY;
  const saved = localStorage.getItem(storageKey);
  if (saved) return saved;
  const create = async () => {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;
    const response = await fetch("/api/twin", {
      method: "POST",
      credentials: "same-origin",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "workspace" }),
      signal: AbortSignal.timeout(20000),
    });
    const value = await responseJson(response);
    if (
      typeof value.capability !== "string" ||
      !/^[a-zA-Z0-9_-]{20,100}\.[a-zA-Z0-9_-]{20,100}$/.test(value.capability)
    )
      throw new Error(
        "The browser worker could not create a private workspace.",
      );
    localStorage.setItem(storageKey, value.capability);
    return value.capability;
  };
  let pending = pendingWorkspaces.get(storageKey);
  if (!pending) {
    pending = (
      typeof navigator !== "undefined" && navigator.locks
        ? navigator.locks.request(
            `playground-twin-workspace:${identity || "local"}`,
            create,
          )
        : create()
    ).finally(() => {
      pendingWorkspaces.delete(storageKey);
    });
    pendingWorkspaces.set(storageKey, pending);
  }
  return pending;
}

async function request(
  path: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const [authorization, identity] = await Promise.all([
    authHeaders(),
    authIdentity(),
  ]);
  const capability = await workspaceCapability(authorization, identity);
  const timeout = AbortSignal.timeout(30000);
  const response = await fetch(`/api/twin${path}`, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: {
      ...authorization,
      "X-Playground-Workspace": capability,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  return responseJson(response);
}

function jobResponse(value: { job?: TwinJob }): TwinJob {
  if (!value.job?.id || !Array.isArray(value.job.runs))
    throw new Error("The browser worker returned an unreadable experiment.");
  return value.job;
}

export async function getTwinConfiguration(signal?: AbortSignal) {
  const response = await fetch("/api/twin", {
    credentials: "same-origin",
    headers: await authHeaders(),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  return (await responseJson(response)) as TwinConfiguration;
}

export async function createTwinJob(
  sandboxId: string,
  spec: TwinExperimentSpec,
  signal?: AbortSignal,
) {
  return jobResponse(
    await request("", { action: "create", sandboxId, spec }, signal),
  );
}

export async function getTwinJob(jobId: string, signal?: AbortSignal) {
  return jobResponse(
    await request(
      `?action=job&jobId=${encodeURIComponent(jobId)}`,
      undefined,
      signal,
    ),
  );
}

export async function cancelTwinJob(jobId: string) {
  return jobResponse(await request("", { action: "cancel", jobId }));
}

export async function retryTwinJob(jobId: string) {
  return jobResponse(await request("", { action: "retry", jobId }));
}

export async function retestTwinJob(jobId: string, spec: TwinExperimentSpec) {
  return jobResponse(await request("", { action: "retest", jobId, spec }));
}

export async function getTwinArtifact(
  jobId: string,
  artifactId: string,
  signal?: AbortSignal,
) {
  const [authorization, identity] = await Promise.all([
    authHeaders(),
    authIdentity(),
  ]);
  const capability = await workspaceCapability(authorization, identity);
  const response = await fetch(
    `/api/twin?action=artifact&jobId=${encodeURIComponent(jobId)}&artifactId=${encodeURIComponent(artifactId)}`,
    {
      credentials: "same-origin",
      headers: { ...authorization, "X-Playground-Workspace": capability },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
    },
  );
  if (!response.ok) await responseJson(response);
  return response.blob();
}

export async function downloadTwinArtifact(
  jobId: string,
  artifactId: string,
  filename: string,
) {
  const blob = await getTwinArtifact(jobId, artifactId);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[\\/:*?"<>|]/g, "_");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
