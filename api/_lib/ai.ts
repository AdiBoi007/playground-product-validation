import { HttpError } from "./http.js";
import { database, requiredEnv } from "./server.js";

export async function consumeAiBudget(
  userId: string,
  operation: "mission" | "synthesis",
) {
  const { data, error } = await database().rpc("playground_consume_ai_budget", {
    requested_user: userId,
    requested_operation: operation,
  });
  if (error)
    throw new HttpError(503, "AI request limits could not be checked.");
  if (data !== true)
    throw new HttpError(
      429,
      "Too many AI requests. Please try again in a minute.",
    );
}

export async function structuredResponse(
  name: string,
  schema: Record<string, unknown>,
  instructions: string,
  input: unknown,
): Promise<unknown> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      model: requiredEnv("OPENAI_MODEL"),
      store: false,
      max_output_tokens: 6000,
      instructions,
      input: JSON.stringify(input),
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  if (!response.ok)
    throw new HttpError(
      503,
      "The AI provider is unavailable. You can still edit the mission or use structured synthesis.",
    );
  const body = (await response.json()) as {
    status?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  if (body.status !== "completed")
    throw new HttpError(
      503,
      "The AI response was incomplete. Please try again.",
    );
  const text = body.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("");
  if (!text) throw new HttpError(503, "The AI did not produce a usable draft.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(503, "The AI draft could not be read.");
  }
}
