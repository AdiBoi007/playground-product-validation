import type { IncomingMessage, ServerResponse } from "node:http";

/** Structural types for Vercel's Node request/response helpers; no runtime framework dependency. */
export interface ApiRequest extends IncomingMessage {
  body?: unknown;
}
export interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(value: unknown): ApiResponse;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function expectMethod(req: ApiRequest, method: string) {
  if (req.method !== method) throw new HttpError(405, `Use ${method}.`);
}

export function objectBody(req: ApiRequest): Record<string, unknown> {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      throw new HttpError(400, "Invalid JSON.");
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "A JSON object is required.");
  }
  return body as Record<string, unknown>;
}

export function stringField(
  body: Record<string, unknown>,
  key: string,
  limit = 4000,
): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > limit) {
    throw new HttpError(400, `Provide a valid ${key}.`);
  }
  return value.trim();
}

export function json(res: ApiResponse, value: unknown, status = 200) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(value);
}

export function failure(res: ApiResponse, error: unknown) {
  if (error instanceof HttpError)
    return json(res, { error: error.message }, error.status);
  if (error instanceof Error && error.name === "DomainError")
    return json(res, { error: error.message }, 422);
  // Never return database / provider messages that may include connection details.
  console.error(
    "Playground API request failed",
    error instanceof Error ? error.message : "unknown error",
  );
  return json(
    res,
    { error: "The request could not be completed. Please try again." },
    500,
  );
}

export async function rawBody(
  req: ApiRequest,
  maxBytes = 1_000_000,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > maxBytes) throw new HttpError(413, "Request is too large.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
