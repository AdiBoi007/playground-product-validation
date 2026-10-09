import { createHash, createHmac } from "node:crypto";
import { HttpError } from "./http.js";

export function ownerWorkspace(userId: string, secret: string) {
  const workspaceId = createHash("sha256")
    .update(`supabase:${userId}`)
    .digest()
    .subarray(0, 24)
    .toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`workspace:${workspaceId}`)
    .digest("base64url");
  return { workspaceId, capability: `${workspaceId}.${signature}`, userId };
}
export function twinAuthConfigured() {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function workerConfiguration() {
  const raw = process.env.TWIN_WORKER_URL;
  const secret = process.env.TWIN_WORKER_SECRET;
  if (!raw || !secret || secret.length < 32) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    return null;
  if (
    url.protocol === "http:" &&
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    return null;
  return { origin: url.origin, secret };
}

export function twinId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[\w-]{1,100}$/.test(value))
    throw new HttpError(400, `Provide a valid ${label}.`);
  return value;
}

export async function callWorker(
  path: string,
  method: "GET" | "POST",
  capability: string | undefined,
  body?: unknown,
  signal?: AbortSignal,
  clientKey?: string,
) {
  const config = workerConfiguration();
  if (!config)
    throw new HttpError(
      503,
      "Connect the Market Twin worker to run browser experiments.",
    );
  const controller = new AbortController();
  const aborted = () => controller.abort();
  signal?.addEventListener("abort", aborted, { once: true });
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    if (signal?.aborted) controller.abort();
    return await fetch(`${config.origin}${path}`, {
      method,
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.secret}`,
        ...(capability ? { "X-Playground-Workspace": capability } : {}),
        ...(clientKey ? { "X-Client-Key": clientKey } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    if (signal?.aborted) throw new HttpError(499, "The request was cancelled.");
    throw new HttpError(
      503,
      "The Market Twin worker is unavailable. Check the worker service.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", aborted);
  }
}
