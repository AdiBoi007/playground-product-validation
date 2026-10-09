import { isIP } from "node:net";
import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import {
  expectMethod,
  failure,
  HttpError,
  json,
  objectBody,
  rawBody,
  stringField,
} from "./_lib/http.js";
import { createResearchService } from "./_lib/research.js";

const inspect = createResearchService();

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    expectMethod(req, "POST");
    if (req.body === undefined)
      req.body = (await rawBody(req, 4096)).toString("utf8");
    if (JSON.stringify(req.body).length > 4096)
      throw new HttpError(413, "Request is too large.");
    const body = objectBody(req);
    const input = stringField(body, "url", 2000);
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
    return json(res, await inspect(input, client));
  } catch (error) {
    if (error instanceof HttpError && error.status === 429)
      res.setHeader("Retry-After", "60");
    return failure(res, error);
  }
}
