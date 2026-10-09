import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Parser } from "htmlparser2";
import { HttpError } from "./http.js";

export const MAX_PAGE_BYTES = 1_048_576;
const INSPECTION_TIMEOUT = 10_000;
const MAX_REDIRECTS = 3;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const CONTENT_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "application/ld+json",
]);

export interface ResearchPage {
  url: string;
  name: string;
  description: string;
  pricing: string;
  excerpt: string;
  retrievedAt: string;
}
export interface ResolvedAddress {
  address: string;
  family: number;
}
export interface PageResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}
export interface InspectorDependencies {
  resolve(hostname: string): Promise<ResolvedAddress[]>;
  request(
    url: URL,
    address: ResolvedAddress,
    signal: AbortSignal,
  ): Promise<PageResponse>;
  now(): Date;
  timeoutMs: number;
}

/** Conservative public-unicast allowlist; transition/tunnel ranges are excluded. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (family !== 6 || address.includes("%")) return false;
  const [first, second = "0"] = address.split(":");
  const a = parseInt(first, 16);
  const b = parseInt(second || "0", 16);
  // Only global unicast 2000::/3. This also rejects mapped IPv4, NAT64,
  // loopback, unspecified, unique-local, link-local and multicast addresses.
  if (!(a >= 0x2000 && a <= 0x3fff)) return false;
  if (a === 0x2001 && (b < 0x200 || b === 0xdb8)) return false;
  if (a === 0x2002 || (a === 0x3fff && b < 0x1000)) return false;
  return true;
}

export function publicUrl(input: string): URL {
  // eslint-disable-next-line no-control-regex -- URL control characters are deliberately rejected.
  if (input.length > 2000 || /[\u0000-\u0020\u007f]/.test(input))
    throw new HttpError(400, "Provide a valid public website URL.");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, "Provide a complete http:// or https:// URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new HttpError(
      400,
      "Only public HTTP or HTTPS websites are supported.",
    );
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname))
      throw new HttpError(
        400,
        "Private or reserved network addresses are blocked.",
      );
  } else if (
    hostname.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
      hostname,
    ) ||
    /(?:^|\.)(?:localhost|local|internal|home|lan|onion|invalid|test)$/i.test(
      hostname,
    )
  ) {
    throw new HttpError(400, "Provide a public website hostname.");
  }
  if (!isIP(hostname)) url.hostname = hostname;
  url.hash = "";
  return url;
}

function header(response: PageResponse, name: string): string {
  const value = response.headers[name];
  return Array.isArray(value) ? value.join(", ") : value || "";
}

function boundedResponse(response: PageResponse) {
  const length = header(response, "content-length");
  if (
    response.body.length > MAX_PAGE_BYTES ||
    (length && (!/^\d+$/.test(length) || Number(length) > MAX_PAGE_BYTES))
  )
    throw new HttpError(413, "The page exceeds the 1 MB inspection limit.");
  const encoding = header(response, "content-encoding").toLowerCase().trim();
  // Never decompress untrusted bodies. Identity was requested explicitly;
  // rejecting compressed responses prevents both memory and CPU bombs.
  if (encoding && encoding !== "identity")
    throw new HttpError(
      415,
      "This website requires a compressed response. Add its details manually.",
    );
  const contentType = header(response, "content-type")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!CONTENT_TYPES.has(contentType))
    throw new HttpError(415, "This URL did not return an HTML or text page.");
  return contentType;
}

/** Connect directly to the validated IP; Host/SNI/certificate identity remain the URL host. */
export async function requestPinnedPage(
  url: URL,
  address: ResolvedAddress,
  signal: AbortSignal,
): Promise<PageResponse> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: address.address,
        family: address.family,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: "GET",
        agent: false,
        signal,
        maxHeaderSize: 16_384,
        servername: isIP(hostname) ? "" : hostname,
        rejectUnauthorized: true,
        headers: {
          Host: url.host,
          Accept:
            "text/html, application/xhtml+xml, text/plain, application/ld+json",
          "Accept-Encoding": "identity",
          "User-Agent": "PlaygroundPublicPageInspector/1.0",
        },
      },
      (incoming) => {
        const response: PageResponse = {
          status: incoming.statusCode || 0,
          headers: incoming.headers,
          body: Buffer.alloc(0),
        };
        // A redirect body is never needed; validate the destination separately.
        if (REDIRECTS.has(response.status)) {
          resolve(response);
          incoming.destroy();
          return;
        }
        if (response.status < 200 || response.status >= 300) {
          reject(
            new HttpError(
              422,
              "This website blocked inspection or is unavailable.",
            ),
          );
          incoming.destroy();
          return;
        }
        try {
          boundedResponse(response);
        } catch (error) {
          reject(error);
          incoming.destroy();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        incoming.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_PAGE_BYTES) {
            reject(
              new HttpError(413, "The page exceeds the 1 MB inspection limit."),
            );
            incoming.destroy();
          } else chunks.push(chunk);
        });
        incoming.on("end", () => {
          response.body = Buffer.concat(chunks);
          resolve(response);
        });
        incoming.on("error", reject);
        incoming.on("aborted", () =>
          reject(new HttpError(422, "The website response was interrupted.")),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () =>
      reject(
        new HttpError(504, "The website did not respond within 10 seconds."),
      );
    if (signal.aborted) return aborted();
    signal.addEventListener("abort", aborted, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", aborted));
  });
}

const clean = (value: string, limit: number) =>
  value
    // eslint-disable-next-line no-control-regex -- Strip non-display controls from fetched text.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);

function structuredMetadata(values: unknown[]) {
  const prices: string[] = [];
  let name = "";
  let description = "";
  let nodes = 0;
  const walk = (value: unknown, depth: number) => {
    if (++nodes > 5000 || depth > 32 || !value || typeof value !== "object")
      return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    const entry = value as Record<string, unknown>;
    const types = (
      Array.isArray(entry["@type"]) ? entry["@type"] : [entry["@type"]]
    )
      .filter((type): type is string => typeof type === "string")
      .map((type) => type.split(/[/#]/).at(-1));
    if (
      types.some((type) =>
        ["Organization", "SoftwareApplication", "Product", "WebSite"].includes(
          type || "",
        ),
      )
    ) {
      if (!name && typeof entry.name === "string")
        name = clean(entry.name, 180);
      if (!description && typeof entry.description === "string")
        description = clean(entry.description, 600);
    }
    if (types.includes("Offer") || types.includes("AggregateOffer")) {
      const specifications = entry.priceSpecification;
      const price =
        specifications &&
        typeof specifications === "object" &&
        !Array.isArray(specifications)
          ? { ...entry, ...specifications }
          : entry;
      const currency =
        typeof price.priceCurrency === "string" ? price.priceCurrency : "";
      const validPrice = (raw: unknown) =>
        (typeof raw === "string" || typeof raw === "number") &&
        /^\d{1,12}(?:\.\d{1,4})?$/.test(String(raw));
      if (/^[A-Z]{3}$/.test(currency)) {
        if (validPrice(price.price))
          prices.push(`${currency} ${String(price.price)}`);
        else if (validPrice(price.lowPrice)) {
          prices.push(
            `${currency} ${String(price.lowPrice)}${validPrice(price.highPrice) ? `–${String(price.highPrice)}` : ""}`,
          );
        }
      }
    }
    Object.values(entry).forEach((item) => walk(item, depth + 1));
  };
  values.forEach((value) => walk(value, 0));
  return { name, description, prices: [...new Set(prices)].slice(0, 4) };
}

function visiblePricing(text: string): string[] {
  const result: string[] = [];
  const pattern =
    /(?:[$€£¥₹]\s*\d[\d,.]*(?:\s*\/\s*(?:month|mo|year|yr|user))?|\b(?:USD|EUR|GBP|CAD|AUD|NZD|JPY|INR)\s*\d[\d,.]*)/g;
  for (const match of text.matchAll(pattern)) {
    const start = Math.max(
      text.lastIndexOf("\n", match.index),
      match.index - 80,
      0,
    );
    const newline = text.indexOf("\n", match.index + match[0].length);
    const end = Math.min(
      newline === -1 ? text.length : newline,
      match.index + match[0].length + 100,
    );
    const context = clean(text.slice(start, end), 240);
    if (context && !result.includes(context)) result.push(context);
    if (result.length === 4) break;
  }
  return result;
}

/** Parse page metadata and plain visible text without executing page code. */
export function extractPageMetadata(
  source: string,
  url: string,
  contentType = "text/html",
): Omit<ResearchPage, "retrievedAt"> {
  let title = "";
  let siteName = "";
  let ogTitle = "";
  let description = "";
  const visible: string[] = [];
  const structured: unknown[] = [];
  if (contentType === "application/ld+json") {
    try {
      structured.push(JSON.parse(source));
    } catch {
      throw new HttpError(422, "The page metadata could not be read.");
    }
  } else if (contentType === "text/plain") {
    visible.push(source);
  } else {
    const stack: Array<{ tag: string; hidden: boolean; json?: string }> = [];
    const hiddenTags = new Set([
      "head",
      "title",
      "script",
      "style",
      "noscript",
      "template",
      "svg",
      "canvas",
      "iframe",
    ]);
    const blockTags = new Set([
      "p",
      "div",
      "section",
      "article",
      "li",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "tr",
      "td",
    ]);
    const parser = new Parser(
      {
        onopentag(tag, attributes) {
          if (tag === "meta") {
            const key = (
              attributes.property ||
              attributes.name ||
              ""
            ).toLowerCase();
            const content = attributes.content || "";
            if (key === "og:site_name" && !siteName) siteName = content;
            if (key === "og:title" && !ogTitle) ogTitle = content;
            if (
              (key === "description" || key === "og:description") &&
              !description
            )
              description = content;
          }
          const inherited = stack.at(-1)?.hidden || false;
          const hidden =
            inherited ||
            hiddenTags.has(tag) ||
            "hidden" in attributes ||
            attributes["aria-hidden"] === "true" ||
            /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(
              attributes.style || "",
            );
          stack.push({
            tag,
            hidden,
            ...(tag === "script" &&
            attributes.type?.toLowerCase() === "application/ld+json"
              ? { json: "" }
              : {}),
          });
          if (blockTags.has(tag) && !hidden) visible.push("\n");
        },
        ontext(text) {
          const frame = stack.at(-1);
          if (frame?.tag === "title") title += text;
          if (frame?.json !== undefined) frame.json += text;
          else if (!frame?.hidden) visible.push(text);
        },
        onclosetag(tag) {
          const frame = stack.pop();
          if (frame?.json !== undefined) {
            try {
              structured.push(JSON.parse(frame.json));
            } catch {
              /* Invalid page metadata is ignored. */
            }
          }
          if (blockTags.has(tag) && !frame?.hidden) visible.push("\n");
        },
      },
      { decodeEntities: true },
    );
    parser.end(source);
  }
  if (
    /^(?:access denied|just a moment\.*|attention required!?|checking your browser|verify you are human)$/i.test(
      clean(title, 180),
    )
  )
    throw new HttpError(
      422,
      "This website blocked automated inspection. Add its details manually.",
    );
  const text = visible.join("").replace(/[^\S\n]+/g, " ");
  const metadata = structuredMetadata(structured);
  return {
    url,
    name: clean(
      siteName || title || ogTitle || metadata.name || new URL(url).hostname,
      180,
    ),
    description: clean(description || metadata.description || text, 600),
    pricing: [...metadata.prices, ...visiblePricing(text)]
      .slice(0, 4)
      .join("\n")
      .slice(0, 1000),
    excerpt: clean(text, 3000),
  };
}

export async function inspectUrl(
  input: string,
  overrides: Partial<InspectorDependencies> = {},
): Promise<ResearchPage> {
  const dependencies: InspectorDependencies = {
    resolve: (hostname) => lookup(hostname, { all: true, verbatim: true }),
    request: requestPinnedPage,
    now: () => new Date(),
    timeoutMs: INSPECTION_TIMEOUT,
    ...overrides,
  };
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(INSPECTION_TIMEOUT, dependencies.timeoutMs),
  );
  try {
    let url = publicUrl(input);
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(hostname)
        ? [{ address: hostname, family: isIP(hostname) }]
        : await abortable(dependencies.resolve(hostname), controller.signal);
      if (
        !addresses.length ||
        addresses.length > 32 ||
        addresses.some(
          (address) =>
            !isPublicAddress(address.address) ||
            isIP(address.address) !== address.family,
        )
      )
        throw new HttpError(
          400,
          "This hostname does not resolve exclusively to public addresses.",
        );
      const address =
        addresses.find((item) => item.family === 4) || addresses[0];
      const response = await abortable(
        dependencies.request(url, address, controller.signal),
        controller.signal,
      );
      if (REDIRECTS.has(response.status)) {
        const location = header(response, "location");
        if (!location || redirects === MAX_REDIRECTS)
          throw new HttpError(
            422,
            "The website redirected too many times or has no destination.",
          );
        let destination: URL;
        try {
          destination = new URL(location, url);
        } catch {
          throw new HttpError(422, "The website returned an invalid redirect.");
        }
        url = publicUrl(destination.href);
        continue;
      }
      if (
        response.status < 200 ||
        response.status >= 300 ||
        header(response, "cf-mitigated") === "challenge"
      )
        throw new HttpError(
          422,
          "This website blocked inspection or is unavailable.",
        );
      const contentType = boundedResponse(response);
      const charset =
        /charset\s*=\s*["']?([\w-]+)/i.exec(
          header(response, "content-type"),
        )?.[1] || "utf-8";
      let text: string;
      try {
        text = new TextDecoder(charset).decode(response.body);
      } catch {
        throw new HttpError(
          415,
          "This page uses an unsupported text encoding.",
        );
      }
      return {
        ...extractPageMetadata(text, url.href, contentType),
        retrievedAt: dependencies.now().toISOString(),
      };
    }
    throw new HttpError(422, "The website redirected too many times.");
  } catch (error) {
    if (controller.signal.aborted)
      throw new HttpError(
        504,
        "The website did not respond within 10 seconds.",
      );
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      422,
      "This website could not be inspected. Add its details manually.",
    );
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

/** Per-instance bounds also cap abuse when client IP headers are unavailable or spoofed. */
export function createResearchService(
  inspect: (url: string) => Promise<ResearchPage> = inspectUrl,
  now: () => number = Date.now,
) {
  const clients = new Map<string, { count: number; expires: number }>();
  const cache = new Map<string, { page: ResearchPage; expires: number }>();
  const pending = new Map<string, Promise<ResearchPage>>();
  let global = { count: 0, expires: 0 };
  let active = 0;
  return async (input: string, client: string): Promise<ResearchPage> => {
    const url = publicUrl(input).href;
    const time = now();
    if (global.expires <= time) global = { count: 0, expires: time + 60_000 };
    const budget = clients.get(client) || { count: 0, expires: time + 60_000 };
    if (budget.expires <= time) {
      budget.count = 0;
      budget.expires = time + 60_000;
    }
    clients.set(client, budget);
    if (clients.size > 500) clients.delete(clients.keys().next().value!);
    if (++budget.count > 20 || ++global.count > 120)
      throw new HttpError(429, "Too many inspections. Try again in a minute.");
    const cached = cache.get(url);
    if (cached && cached.expires > time) return { ...cached.page };
    const inFlight = pending.get(url);
    if (inFlight) return { ...(await inFlight) };
    if (active >= 4)
      throw new HttpError(429, "Inspections are busy. Try again shortly.");
    active++;
    const task = inspect(url);
    pending.set(url, task);
    try {
      const page = await task;
      cache.set(url, { page: { ...page }, expires: now() + 300_000 });
      if (cache.size > 100) cache.delete(cache.keys().next().value!);
      return { ...page };
    } finally {
      pending.delete(url);
      active--;
    }
  };
}
