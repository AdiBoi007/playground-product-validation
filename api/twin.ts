import { createHash } from "node:crypto";
import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import { HttpError, json, objectBody, rawBody } from "./_lib/http.js";
import { assertSandboxOrigin } from "./sandbox.js";
import {
  callWorker,
  ownerWorkspace,
  twinAuthConfigured,
  twinId,
  workerConfiguration,
} from "./_lib/twin-worker.js";
import { authenticate } from "./_lib/server.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const controller = new AbortController();
  const disconnected = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.on("aborted", disconnected);
  res.on("close", disconnected);
  try {
    if (!["GET", "POST"].includes(req.method || ""))
      throw new HttpError(405, "Use GET or POST.");
    const query = new URL(req.url || "/api/twin", "http://workspace")
      .searchParams;
    const capabilityHeader = req.headers["x-playground-workspace"];
    let capability =
      typeof capabilityHeader === "string" && capabilityHeader.length <= 256
        ? capabilityHeader
        : undefined;
    const publicConfiguration = req.method === "GET" && !query.get("action");
    const config = workerConfiguration();
    const authRequired = twinAuthConfigured();
    let owner: ReturnType<typeof ownerWorkspace> | undefined;
    if (!publicConfiguration && authRequired) {
      const user = await authenticate(req);
      if (!config)
        throw new HttpError(
          503,
          "Connect the Market Twin worker to run browser experiments.",
        );
      owner = ownerWorkspace(user.id, config.secret);
      capability = owner.capability;
    } else if (
      !publicConfiguration &&
      (process.env.VERCEL === "1" || process.env.NODE_ENV === "production")
    ) {
      throw new HttpError(
        503,
        "Configure verified Supabase authentication before enabling browser campaigns in production.",
      );
    }
    let path = "/health",
      method: "GET" | "POST" = "GET",
      input: unknown;
    if (req.method === "GET") {
      const action = query.get("action");
      if (!action) {
        if (!config)
          return json(res, {
            configured: false,
            behaviouralConfigured: false,
            authRequired,
            storage: "local",
            artifactStorage: "local",
            model: process.env.OPENAI_MODEL || "gpt-6-luna",
          });
      } else {
        if (!capability)
          throw new HttpError(401, "A workspace capability is required.");
        const jobId = twinId(query.get("jobId"), "run ID");
        if (action === "job") path = `/jobs/${jobId}`;
        else if (action === "artifact")
          path = `/artifacts/${jobId}/${twinId(query.get("artifactId"), "evidence ID")}`;
        else throw new HttpError(400, "Unknown Market Twin action.");
      }
    } else {
      assertSandboxOrigin(req);
      if (
        !String(req.headers["content-type"] || "")
          .toLowerCase()
          .startsWith("application/json")
      )
        throw new HttpError(415, "Send the experiment as JSON.");
      if (req.body === undefined)
        req.body = (await rawBody(req, 500_000)).toString("utf8");
      if (
        Buffer.byteLength(
          typeof req.body === "string" ? req.body : JSON.stringify(req.body),
        ) > 500_000
      )
        throw new HttpError(413, "The experiment is too large.");
      const body = objectBody(req);
      method = "POST";
      if (body.action === "workspace") {
        if (owner) return json(res, owner);
        path = "/workspaces";
      } else {
        if (!capability)
          throw new HttpError(401, "A workspace capability is required.");
        if (body.action === "create") {
          path = "/jobs";
          input = {
            sandboxId: twinId(body.sandboxId, "sandbox ID"),
            spec: body.spec,
          };
        } else if (
          ["cancel", "retry", "retest"].includes(String(body.action))
        ) {
          path = `/jobs/${twinId(body.jobId, "run ID")}/${body.action}`;
          input = body.action === "retest" ? { spec: body.spec } : {};
        } else throw new HttpError(400, "Unknown Market Twin action.");
      }
    }
    const clientKey = createHash("sha256")
      .update(req.socket?.remoteAddress || "unknown")
      .digest("hex");
    const response = await callWorker(
      path,
      method,
      capability,
      input,
      controller.signal,
      clientKey,
    );
    if (path.startsWith("/artifacts/") && response.ok) {
      const length = Number(response.headers.get("content-length") || 0);
      if (length > 30_000_000)
        throw new HttpError(
          413,
          "Download this large artifact through the worker deployment.",
        );
      const bytes = Buffer.from(await response.arrayBuffer());
      res.statusCode = 200;
      res.setHeader(
        "Content-Type",
        response.headers.get("content-type") || "application/octet-stream",
      );
      res.setHeader(
        "Content-Disposition",
        response.headers.get("content-disposition") || "attachment",
      );
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(bytes);
      return;
    }
    let value: unknown = await response.json();
    if (
      publicConfiguration &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const raw = value as Record<string, unknown>;
      delete raw.authorizedWritePaths;
      value = {
        ...raw,
        authRequired,
        configured:
          raw.configured === true &&
          (!(
            process.env.VERCEL === "1" || process.env.NODE_ENV === "production"
          ) ||
            authRequired),
      };
    }
    return json(res, value, response.status);
  } catch (error) {
    if (res.destroyed || controller.signal.aborted) return;
    return json(
      res,
      {
        error:
          error instanceof HttpError
            ? error.message
            : "The browser experiment request could not be completed.",
      },
      error instanceof HttpError ? error.status : 500,
    );
  } finally {
    req.removeListener("aborted", disconnected);
    res.removeListener("close", disconnected);
  }
}
