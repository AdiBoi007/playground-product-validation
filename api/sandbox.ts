import { isIP } from "node:net";
import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import { HttpError, json, objectBody, rawBody } from "./_lib/http.js";
import { reserveAiAccess } from "./_lib/ai-access.js";
import {
  sandboxRequestBudget,
  runSandboxAgent,
  sandboxConfigured,
  SandboxError,
  SANDBOX_BODY_LIMIT,
} from "./_lib/sandbox-agent.js";

export function assertSandboxOrigin(req: ApiRequest) {
  const originHeader = req.headers.origin;
  const origin = typeof originHeader === "string" ? originHeader : "";
  const host = req.headers.host || "";
  const site = req.headers["sec-fetch-site"];
  let allowed = false;
  try {
    const parsed = new URL(origin);
    const current = new URL(`https://${host}`);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(
      current.hostname,
    );
    allowed =
      parsed.origin === origin &&
      !parsed.username &&
      !parsed.password &&
      ((parsed.host === current.host &&
        (parsed.protocol === "https:" ||
          (local && parsed.protocol === "http:"))) ||
        Boolean(
          process.env.APP_URL &&
          parsed.origin === new URL(process.env.APP_URL).origin,
        ));
  } catch {
    /* Missing or invalid origin is rejected before any paid request. */
  }
  if (!allowed || site === "cross-site")
    throw new SandboxError(
      403,
      "ORIGIN_BLOCKED",
      "Research requests must originate from this Playground workspace.",
    );
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  let release: (() => void) | undefined;
  const controller = new AbortController();
  const disconnected = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.on("aborted", disconnected);
  res.on("close", disconnected);
  try {
    if (req.method === "GET")
      return json(res, { configured: sandboxConfigured() });
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      throw new SandboxError(405, "METHOD_INVALID", "Use GET or POST.");
    }
    assertSandboxOrigin(req);
    if (!sandboxConfigured())
      throw new SandboxError(
        503,
        "SETUP_REQUIRED",
        "AI research is not configured. Add OPENAI_API_KEY to the server environment to build a sandbox.",
      );
    const contentType = req.headers["content-type"];
    if (
      typeof contentType !== "string" ||
      !contentType.toLowerCase().startsWith("application/json")
    )
      throw new SandboxError(
        415,
        "INPUT_INVALID",
        "Send the chat request as JSON.",
      );
    if (req.body === undefined)
      req.body = (await rawBody(req, SANDBOX_BODY_LIMIT)).toString("utf8");
    if (
      Buffer.byteLength(JSON.stringify(req.body), "utf8") > SANDBOX_BODY_LIMIT
    )
      throw new SandboxError(
        413,
        "INPUT_INVALID",
        "The chat and attachments exceed the request limit.",
      );
    const body = objectBody(req);
    await reserveAiAccess(req);
    const forwarded =
      req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"];
    const candidate = (
      Array.isArray(forwarded) ? forwarded[0] : forwarded || ""
    )
      .split(",", 1)[0]
      .trim();
    const client = isIP(candidate)
      ? candidate
      : req.socket?.remoteAddress || "unknown";
    release = sandboxRequestBudget(client);
    return json(res, await runSandboxAgent(body, {}, controller.signal));
  } catch (error) {
    if (res.destroyed || controller.signal.aborted) return;
    if (error instanceof SandboxError) {
      if (error.status === 429) res.setHeader("Retry-After", "60");
      return json(
        res,
        { error: error.message, code: error.code },
        error.status,
      );
    }
    if (error instanceof HttpError)
      return json(
        res,
        { error: error.message, code: "INPUT_INVALID" },
        error.status,
      );
    console.error("Sandbox request failed unexpectedly.");
    return json(
      res,
      {
        error: "The research request could not be completed. Please retry.",
        code: "INTERNAL_ERROR",
      },
      500,
    );
  } finally {
    release?.();
    req.removeListener("aborted", disconnected);
    res.removeListener("close", disconnected);
  }
}
