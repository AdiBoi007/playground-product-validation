import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { validateTwinExperimentSpec } from "../../../src/mvp/twin.ts";

export class WorkerError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const secretEqual = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function issueWorkspace(secret) {
  const id = randomBytes(24).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`workspace:${id}`)
    .digest("base64url");
  return { workspaceId: id, capability: `${id}.${signature}` };
}
export function workspaceFromCapability(capability, secret) {
  if (typeof capability !== "string" || capability.length > 256)
    throw new WorkerError(401, "A workspace capability is required.");
  const [id, signature, extra] = capability.split(".");
  if (!id || !signature || extra || !/^[\w-]{32}$/.test(id))
    throw new WorkerError(401, "Invalid workspace capability.");
  const expected = createHmac("sha256", secret)
    .update(`workspace:${id}`)
    .digest("base64url");
  if (!secretEqual(signature, expected))
    throw new WorkerError(401, "Invalid workspace capability.");
  return id;
}
export function publicAddress(address) {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(value) === 4) {
    const [a, b] = value.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || b === 2)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (isIP(value) === 6) {
    if (value.startsWith("::ffff:")) return publicAddress(value.slice(7));
    return !/^(::|fc|fd|fe8|fe9|fea|feb|ff|2001:db8|2001:0:|64:ff9b)/.test(
      value,
    );
  }
  return false;
}
export function testOrigins(env = process.env) {
  return env.NODE_ENV === "production"
    ? []
    : (env.TWIN_TEST_ALLOWED_ORIGINS || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
}
export function permittedUrl(raw, origins, env = process.env) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new WorkerError(422, "The target must be an absolute website URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !origins.includes(url.origin)
  )
    throw new WorkerError(422, "The URL is outside the approved origins.");
  if (url.protocol !== "https:" && !testOrigins(env).includes(url.origin))
    throw new WorkerError(422, "Public targets must use HTTPS.");
  return url;
}
export async function resolveTarget(url, env = process.env, resolver = lookup) {
  const addresses = await resolver(url.hostname.replace(/^\[|\]$/g, ""), {
    all: true,
    verbatim: true,
  });
  const testing = testOrigins(env).includes(url.origin);
  if (
    !addresses.length ||
    (!testing && addresses.some((x) => !publicAddress(x.address)))
  )
    throw new WorkerError(
      422,
      "Private, reserved and local network targets are blocked.",
    );
  return addresses[0];
}
const unsafe =
  /\b(buy|purchase|pay|payment|place\s+order|checkout|delete|destroy|remove\s+account|send\s+message|send\s+email|publish|transfer|withdraw|unsubscribe|subscribe\s+now)\b/i;
export function safeAction(step, element) {
  const description = [
    step.description,
    step.value,
    element?.text,
    element?.label,
    element?.href,
    element?.formAction,
  ]
    .filter(Boolean)
    .join(" ");
  if (unsafe.test(description))
    throw new WorkerError(
      422,
      "A purchase, message or destructive action was blocked.",
    );
  if (
    step.type === "fill" &&
    element &&
    /password|credit|card|cvv|ssn|social.?security|secret|token/i.test(
      `${element.inputType || ""} ${element.label || ""} ${element.name || ""}`,
    )
  )
    throw new WorkerError(422, "Secret and payment fields are blocked.");
  if (
    step.type === "press" &&
    !["Enter", "Tab", "ArrowDown", "ArrowUp", "Escape", "Space"].includes(
      step.key,
    )
  )
    throw new WorkerError(422, "This keyboard action is not allowed.");
}
export function redact(text) {
  return String(text)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/(?:sk-[\w-]{12,}|Bearer\s+[\w.\-+/=]{10,})/gi, "[secret]")
    .replace(
      /([?&](?:token|key|secret|password|code|auth)\s*=)[^&#\s]+/gi,
      "$1[redacted]",
    )
    .slice(0, 12000);
}
export function safeUrl(raw) {
  try {
    const url = new URL(raw);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[unavailable URL]";
  }
}
export function validateSpec(spec, env = process.env) {
  try {
    spec = validateTwinExperimentSpec(spec);
  } catch (error) {
    throw new WorkerError(422, error.message);
  }
  if (
    !spec ||
    typeof spec !== "object" ||
    !["functional", "behavioural"].includes(spec.mode)
  )
    throw new WorkerError(422, "Choose functional or behavioural execution.");
  if (spec.authorizationConfirmed !== true || !spec.approvedAt)
    throw new WorkerError(
      422,
      "Approve the experiment and confirm authority to test the product.",
    );
  if (
    !Array.isArray(spec.allowedOrigins) ||
    !spec.allowedOrigins.length ||
    spec.allowedOrigins.length > 8 ||
    new Set(spec.allowedOrigins).size !== spec.allowedOrigins.length
  )
    throw new WorkerError(422, "Provide an exact origin allowlist.");
  for (const origin of spec.allowedOrigins)
    if (new URL(origin).origin !== origin)
      throw new WorkerError(
        422,
        "Origins must not include paths or wildcard domains.",
      );
  permittedUrl(spec.targetUrl, spec.allowedOrigins, env);
  for (const key of ["objective", "productVersion"])
    if (
      typeof spec[key] !== "string" ||
      !spec[key].trim() ||
      spec[key].length > 4000
    )
      throw new WorkerError(422, `Provide ${key}.`);
  if (
    !Array.isArray(spec.tasks) ||
    !spec.tasks.length ||
    spec.tasks.length > 8 ||
    !Array.isArray(spec.personas) ||
    !spec.personas.length ||
    spec.personas.length > 30
  )
    throw new WorkerError(
      422,
      "Provide one to eight tasks and one to thirty personas.",
    );
  if (
    new Set(spec.tasks.map((x) => x.id)).size !== spec.tasks.length ||
    new Set(spec.personas.map((x) => x.id)).size !== spec.personas.length
  )
    throw new WorkerError(422, "Task and persona IDs must be unique.");
  for (const task of spec.tasks) {
    for (const key of ["id", "title", "instructions", "successCriteria"])
      if (
        typeof task[key] !== "string" ||
        !task[key].trim() ||
        task[key].length > 6000
      )
        throw new WorkerError(422, `Every task needs ${key}.`);
    if (typeof task.question !== "string" || task.question.length > 3000)
      throw new WorkerError(422, "Invalid task question.");
    if (
      !Array.isArray(task.assertions) ||
      !task.assertions.length ||
      task.assertions.length > 8
    )
      throw new WorkerError(
        422,
        "Each executable task needs an observable success assertion.",
      );
    for (const a of task.assertions)
      if (
        ![
          "url-contains",
          "text-visible",
          "selector-visible",
          "selector-hidden",
        ].includes(a.type) ||
        !a.id ||
        !a.value ||
        a.value.length > 500
      )
        throw new WorkerError(422, "Invalid task assertion.");
    if (
      spec.mode === "functional" &&
      (!Array.isArray(task.steps) || !task.steps.length)
    )
      throw new WorkerError(
        422,
        "Functional tasks require explicit browser steps.",
      );
    if ((task.steps?.length || 0) > 40)
      throw new WorkerError(422, "Too many task steps.");
    for (const step of task.steps || []) {
      if (
        ![
          "navigate",
          "click",
          "fill",
          "select",
          "press",
          "scroll",
          "back",
          "wait",
          "assert",
        ].includes(step.type) ||
        !step.id ||
        typeof step.description !== "string"
      )
        throw new WorkerError(422, "Invalid browser step.");
      for (const key of ["selector", "value", "url", "key"])
        if (
          step[key] !== undefined &&
          (typeof step[key] !== "string" || step[key].length > 1000)
        )
          throw new WorkerError(422, "Invalid browser step value.");
      if (step.url)
        permittedUrl(
          new URL(step.url, spec.targetUrl).toString(),
          spec.allowedOrigins,
          env,
        );
    }
  }
  for (const persona of spec.personas) {
    if (
      !persona.id ||
      !persona.name ||
      !persona.goal ||
      !["mobile", "desktop"].includes(persona.device) ||
      !["low", "medium", "high"].includes(persona.technicalProficiency) ||
      !["low", "medium", "high"].includes(persona.privacySensitivity) ||
      !["first-time", "familiar", "expert"].includes(persona.experience) ||
      !["low", "medium", "high"].includes(persona.exploration) ||
      !Number.isFinite(persona.timeBudgetSeconds) ||
      persona.timeBudgetSeconds < 5 ||
      persona.timeBudgetSeconds > 180
    )
      throw new WorkerError(422, "Invalid structured persona.");
  }
  const limits = {
    runCount: [1, 30],
    concurrency: [1, 3],
    maxSteps: [1, 40],
    maxDurationSeconds: [5, 180],
    maxModelTokens: [0, 20000],
    maxCostUsd: [0, 1],
  };
  for (const [key, [min, max]] of Object.entries(limits))
    if (
      !Number.isFinite(spec.settings?.[key]) ||
      spec.settings[key] < min ||
      spec.settings[key] > max ||
      (key !== "maxCostUsd" && !Number.isInteger(spec.settings[key]))
    )
      throw new WorkerError(422, `Invalid ${key} budget.`);
  const allowedModel = env.OPENAI_MODEL || "gpt-6-luna";
  if (spec.settings.model !== allowedModel)
    throw new WorkerError(
      422,
      "The worker only permits its configured budget model.",
    );
  if (
    spec.mode === "behavioural" &&
    (spec.settings.maxModelTokens < 100 || spec.settings.maxCostUsd <= 0)
  )
    throw new WorkerError(
      422,
      "Behavioural execution requires an approved token and cost budget.",
    );
  if (
    spec.mode === "behavioural" &&
    allowedModel !== "gpt-6-luna" &&
    (!Number.isFinite(Number(env.TWIN_MODEL_INPUT_USD_PER_MILLION)) ||
      !Number.isFinite(Number(env.TWIN_MODEL_OUTPUT_USD_PER_MILLION)) ||
      Number(env.TWIN_MODEL_INPUT_USD_PER_MILLION) < 0 ||
      Number(env.TWIN_MODEL_OUTPUT_USD_PER_MILLION) < 0)
  )
    throw new WorkerError(
      422,
      "Configure explicit verified token prices for this model before behavioural execution.",
    );
  if (!Number.isInteger(spec.settings.seed))
    throw new WorkerError(422, "Provide an integer seed.");
  if (
    spec.authorizedWritePaths &&
    (!Array.isArray(spec.authorizedWritePaths) ||
      spec.authorizedWritePaths.length > 10 ||
      spec.authorizedWritePaths.some(
        (x) =>
          typeof x !== "string" ||
          !/^\/[\w./-]*$/.test(x) ||
          /delete|payment|purchase|send|message|checkout/i.test(x),
      ))
  )
    throw new WorkerError(422, "Invalid staging write paths.");
  return structuredClone(spec);
}
export function allowedWrite(url, spec, env = process.env) {
  let configured;
  try {
    configured = JSON.parse(env.TWIN_SAFE_WRITE_PATHS || "{}");
  } catch {
    return false;
  }
  return (
    url.origin === new URL(spec.targetUrl).origin &&
    (spec.authorizedWritePaths || []).includes(url.pathname) &&
    Array.isArray(configured[url.origin]) &&
    configured[url.origin].includes(url.pathname)
  );
}
