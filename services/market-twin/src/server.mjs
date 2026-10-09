import http from "node:http";
import { pathToFileURL } from "node:url";
import { JobStore, ArtifactStore } from "./store.mjs";
import { TwinQueue } from "./queue.mjs";
import {
  issueWorkspace,
  secretEqual,
  workspaceFromCapability,
  WorkerError,
} from "./security.mjs";

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 500000)
      throw new WorkerError(413, "The experiment is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    throw new WorkerError(400, "Invalid JSON.");
  }
}
function json(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}
export async function startWorker(env = process.env, options = {}) {
  if (!env.TWIN_WORKER_SECRET || env.TWIN_WORKER_SECRET.length < 32)
    throw new Error(
      "Set TWIN_WORKER_SECRET to a random secret of at least 32 characters.",
    );
  const store = options.store || new JobStore(env),
    artifacts = options.artifacts || new ArtifactStore(env);
  await store.init();
  await artifacts.init();
  const queue = new TwinQueue(store, artifacts, env, options.runner);
  await queue.init();
  const issued = new Map();
  const server = http.createServer(async (request, response) => {
    try {
      if (
        !secretEqual(
          request.headers.authorization,
          `Bearer ${env.TWIN_WORKER_SECRET}`,
        )
      )
        throw new WorkerError(401, "Worker access denied.");
      const url = new URL(request.url, "http://worker");
      if (request.method === "GET" && url.pathname === "/health")
        return json(response, 200, {
          configured: true,
          behaviouralConfigured: Boolean(env.OPENAI_API_KEY),
          storage: store.pool ? "postgres" : "local",
          artifactStorage: artifacts.s3
            ? "s3"
            : artifacts.supabase
              ? "supabase"
              : "local",
          model: env.OPENAI_MODEL || "gpt-6-luna",
          limits: {
            maxRuns: 30,
            maxConcurrency: Math.min(3, Number(env.TWIN_MAX_CONCURRENCY || 2)),
            maxSteps: 40,
            maxDurationSeconds: 180,
            maxModelTokens: 20000,
            maxCostUsd: 1,
          },
          authorizedWritePaths: JSON.parse(env.TWIN_SAFE_WRITE_PATHS || "{}"),
        });
      if (request.method === "POST" && url.pathname === "/workspaces") {
        const key = request.headers["x-client-key"] || "shared";
        const times = (issued.get(key) || []).filter(
          (x) => Date.now() - x < 3600000,
        );
        if (times.length >= 20)
          throw new WorkerError(429, "Too many new workspaces.");
        times.push(Date.now());
        issued.set(key, times);
        return json(response, 201, issueWorkspace(env.TWIN_WORKER_SECRET));
      }
      const workspaceId = workspaceFromCapability(
        request.headers["x-playground-workspace"],
        env.TWIN_WORKER_SECRET,
      );
      if (request.method === "POST" && url.pathname === "/jobs") {
        const input = await body(request);
        return json(response, 202, {
          job: await queue.create(
            workspaceId,
            input.sandboxId,
            input.spec,
            input.parentJobId,
          ),
        });
      }
      const match = url.pathname.match(
        /^\/jobs\/([\w-]+)(?:\/(cancel|retry|retest))?$/,
      );
      if (match) {
        const [, jobId, action] = match;
        if (request.method === "GET" && !action)
          return json(response, 200, {
            job: (await queue.get(workspaceId, jobId)).job,
          });
        if (request.method === "POST" && action) {
          const input = await body(request);
          const job =
            action === "cancel"
              ? await queue.cancel(workspaceId, jobId)
              : action === "retry"
                ? await queue.retry(workspaceId, jobId)
                : await queue.retest(workspaceId, jobId, input.spec);
          return json(response, action === "cancel" ? 200 : 202, { job });
        }
      }
      const asset = url.pathname.match(/^\/artifacts\/([\w-]+)\/([\w-]+)$/);
      if (request.method === "GET" && asset) {
        const record = await queue.get(workspaceId, asset[1]),
          artifact = record.job.runs
            .flatMap((x) => x.artifacts)
            .find((x) => x.id === asset[2]);
        if (!artifact) throw new WorkerError(404, "Evidence not found.");
        const bytes = await artifacts.get(asset[1], asset[2]);
        response.writeHead(200, {
          "Content-Type": artifact.mimeType,
          "Content-Length": bytes.length,
          "Content-Disposition": `attachment; filename="${artifact.name.replace(/[^\w .-]/g, "")}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(bytes);
        return;
      }
      throw new WorkerError(404, "Worker route not found.");
    } catch (error) {
      json(response, error instanceof WorkerError ? error.status : 500, {
        error:
          error instanceof WorkerError
            ? error.message
            : "The browser worker could not complete the request.",
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(
      Number(env.TWIN_PORT || env.PORT || 8787),
      env.TWIN_HOST || "127.0.0.1",
      () => {
        server.removeListener("error", reject);
        resolve();
      },
    );
  });
  return {
    server,
    queue,
    store,
    artifacts,
    close: async () => {
      await queue.close();
      await new Promise((resolve) => server.close(resolve));
      await store.close();
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const worker = await startWorker();
  console.log(
    `Market Twin worker listening on ${process.env.TWIN_HOST || "127.0.0.1"}:${process.env.PORT || process.env.TWIN_PORT || 8787}`,
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      void worker.close().then(() => process.exit(0));
    });
}
