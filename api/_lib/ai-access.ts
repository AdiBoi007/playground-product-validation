import type { ApiRequest } from "./http.js";
import { HttpError } from "./http.js";
import { authenticate, database } from "./server.js";

/** Public deployments never spend the provider key for an unverified visitor. */
export async function reserveAiAccess(req: ApiRequest) {
  const configured = Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!configured) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL)
      throw new HttpError(
        503,
        "Connect authentication before enabling AI requests on the public app.",
      );
    return;
  }
  const user = await authenticate(req);
  const bounded = (
    value: string | undefined,
    fallback: number,
    max: number,
  ) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= max
      ? parsed
      : fallback;
  };
  const { data: allowed, error } = await database().rpc(
    "playground_reserve_ai_request",
    {
      requested_actor: user.id,
      user_limit: bounded(process.env.AI_DAILY_USER_REQUEST_LIMIT, 10, 100),
      global_limit: bounded(process.env.AI_DAILY_REQUEST_LIMIT, 50, 1000),
    },
  );
  if (error)
    throw new HttpError(
      503,
      "The AI spending limit could not be checked. Apply the rollout migration.",
    );
  if (allowed !== true)
    throw new HttpError(
      429,
      "The daily AI request limit has been reached. Try tomorrow or use a manual experiment.",
    );
}
