import { isIP } from "node:net";
import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import { HttpError, json, objectBody, rawBody } from "./_lib/http.js";
import {
  designExperiment,
  experimentClarifications,
  EXPERIMENT_BODY_LIMIT,
  validateExperimentRequest,
} from "./_lib/experiments.js";
import {
  sandboxConfigured,
  sandboxRequestBudget,
  SandboxError,
} from "./_lib/sandbox-agent.js";
import { assertSandboxOrigin } from "./sandbox.js";
import { reserveAiAccess } from "./_lib/ai-access.js";

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
    if (
      typeof req.headers["content-type"] !== "string" ||
      !req.headers["content-type"].toLowerCase().startsWith("application/json")
    )
      throw new SandboxError(
        415,
        "INPUT_INVALID",
        "Send the validation brief as JSON.",
      );
    if (req.body === undefined)
      req.body = (await rawBody(req, EXPERIMENT_BODY_LIMIT)).toString("utf8");
    if (
      Buffer.byteLength(
        typeof req.body === "string" ? req.body : JSON.stringify(req.body),
        "utf8",
      ) > EXPERIMENT_BODY_LIMIT
    )
      throw new SandboxError(
        413,
        "INPUT_INVALID",
        "The brief and screenshots exceed 4 MB. Resize the images.",
      );
    const input = validateExperimentRequest(objectBody(req));
    const questions = experimentClarifications(input);
    if (questions) return json(res, questions);
    if (!sandboxConfigured())
      throw new SandboxError(
        503,
        "SETUP_REQUIRED",
        "AI experiment design is not configured. Add OPENAI_API_KEY to the server environment.",
      );
    await reserveAiAccess(req);
    const forwarded =
      req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"];
    const candidate = (
      Array.isArray(forwarded) ? forwarded[0] : forwarded || ""
    )
      .split(",", 1)[0]
      .trim();
    release = sandboxRequestBudget(
      isIP(candidate) ? candidate : req.socket?.remoteAddress || "unknown",
    );
    return json(res, await designExperiment(input, {}, controller.signal));
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
    console.error("Experiment design request failed unexpectedly.");
    return json(
      res,
      {
        error: "The experiment could not be designed. Please retry.",
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
