import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createResearchService,
  extractPageMetadata,
  inspectUrl,
  isPublicAddress,
  MAX_PAGE_BYTES,
  publicUrl,
  requestPinnedPage,
} from "../_lib/research.js";
import type {
  InspectorDependencies,
  PageResponse,
  ResearchPage,
} from "../_lib/research.js";
import handler from "../research.js";

const nativeRequest = vi.hoisted(() => vi.fn());
vi.mock("node:https", () => ({ request: nativeRequest }));
afterEach(() => nativeRequest.mockReset());

const publicDns = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
const response = (
  body = "<title>Example product</title><p>Public product description.</p>",
  patch: Partial<PageResponse> = {},
): PageResponse => ({
  status: 200,
  headers: { "content-type": "text/html; charset=utf-8" },
  body: Buffer.from(body),
  ...patch,
});
const inspection = (request: () => Promise<PageResponse>) =>
  inspectUrl("https://example.com/product", {
    resolve: publicDns,
    request,
    now: () => new Date("2026-10-09T00:00:00Z"),
  });

describe("public website network boundary", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "127.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "192.0.0.8",
    "192.0.2.1",
    "192.88.99.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "fc00::1",
    "fd12::1",
    "fe80::1",
    "ff02::1",
    "64:ff9b::a00:1",
    "2001::1",
    "2001:2::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3fff::1",
    "fe80::1%lo0",
  ])("rejects non-public or transition address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "172.32.0.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "2a00:1450:4001::200e",
  ])("allows public unicast address %s", (address) =>
    expect(isPublicAddress(address)).toBe(true),
  );
  it.each([
    "file:///etc/passwd",
    "ftp://example.com",
    "https://person:secret@example.com",
    "http://localhost",
    "https://localhost.example.local",
    "http://service.internal",
    "http://example.com:8080",
    "http://127.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "http://10.0.0.1",
    "http://169.254.169.254/latest/meta-data",
    "https://example.com\n/private",
    "http://metadata.google.internal",
    "https://single-label",
  ])("rejects unsafe URL %s before requesting it", (url) => {
    expect(() => publicUrl(url)).toThrow();
  });
  it("normalizes public URLs without credentials or fragment forwarding", () => {
    expect(publicUrl("https://EXAMPLE.com.:443/product#fragment").href).toBe(
      "https://example.com/product",
    );
    expect(publicUrl("http://8.8.8.8:80/").href).toBe("http://8.8.8.8/");
  });
  it("rejects domains with even one private DNS answer", async () => {
    const request = vi.fn();
    await expect(
      inspectUrl("https://example.com", {
        resolve: async () => [
          { address: "8.8.8.8", family: 4 },
          { address: "10.0.0.1", family: 4 },
        ],
        request,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(request).not.toHaveBeenCalled();
  });
  it("passes only a validated pinned address to the request provider", async () => {
    const resolve = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 },
    ]);
    const request = vi.fn<InspectorDependencies["request"]>(async () =>
      response(),
    );
    const result = await inspectUrl("https://example.com", {
      resolve,
      request,
    });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]).toEqual({
      address: "93.184.216.34",
      family: 4,
    });
    expect(result.name).toBe("Example product");
  });
  it("preserves Host, TLS SNI and certificate verification without a second DNS lookup", async () => {
    let options: Record<string, unknown> = {};
    nativeRequest.mockImplementation((input, callback) => {
      options = input;
      const incoming = Readable.from([Buffer.from("<title>Product</title>")]);
      Object.assign(incoming, {
        statusCode: 200,
        headers: { "content-type": "text/html" },
      });
      const outgoing = new EventEmitter();
      Object.assign(outgoing, { end: () => callback(incoming) });
      return outgoing;
    });
    await requestPinnedPage(
      new URL("https://example.com/product?q=one"),
      { address: "93.184.216.34", family: 4 },
      new AbortController().signal,
    );
    expect(options).toMatchObject({
      hostname: "93.184.216.34",
      servername: "example.com",
      rejectUnauthorized: true,
      agent: false,
      path: "/product?q=one",
    });
    expect(options.headers).toMatchObject({
      Host: "example.com",
      "Accept-Encoding": "identity",
    });
    expect(options.headers).not.toHaveProperty("Authorization");
    expect(options.headers).not.toHaveProperty("Cookie");
    expect(options).not.toHaveProperty("lookup");
  });
  it("validates every redirect and never connects to a private destination", async () => {
    const request = vi.fn(async () =>
      response("", {
        status: 302,
        headers: { location: "http://169.254.169.254/" },
      }),
    );
    await expect(inspection(request)).rejects.toMatchObject({ status: 400 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("rechecks DNS on same-host redirects to stop rebinding", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const request = vi.fn(async () =>
      response("", { status: 302, headers: { location: "/next" } }),
    );
    await expect(
      inspectUrl("https://example.com", { resolve, request }),
    ).rejects.toMatchObject({ status: 400 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("follows relative public redirects and returns the inspected final URL", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        response("", { status: 302, headers: { location: "/pricing#plans" } }),
      )
      .mockResolvedValueOnce(response());
    const page = await inspection(request);
    expect(page.url).toBe("https://example.com/pricing");
    expect(page.retrievedAt).toBe("2026-10-09T00:00:00.000Z");
  });
  it("stops after three redirects", async () => {
    const request = vi.fn(async () =>
      response("", { status: 302, headers: { location: "/again" } }),
    );
    await expect(inspection(request)).rejects.toMatchObject({ status: 422 });
    expect(request).toHaveBeenCalledTimes(4);
  });
});

describe("bounded webpage inspection", () => {
  it("rejects streamed bodies above 1 MB even without content-length", async () => {
    nativeRequest.mockImplementation((_input, callback) => {
      const incoming = Readable.from([
        Buffer.alloc(MAX_PAGE_BYTES),
        Buffer.alloc(1),
      ]);
      Object.assign(incoming, {
        statusCode: 200,
        headers: { "content-type": "text/html" },
      });
      const outgoing = new EventEmitter();
      Object.assign(outgoing, { end: () => callback(incoming) });
      return outgoing;
    });
    await expect(
      requestPinnedPage(
        new URL("https://example.com"),
        { address: "8.8.8.8", family: 4 },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("enforces body and declared-length limits on injected responses too", async () => {
    await expect(
      inspection(async () =>
        response("", { body: Buffer.alloc(MAX_PAGE_BYTES + 1) }),
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      inspection(async () =>
        response("", {
          headers: {
            "content-type": "text/html",
            "content-length": String(MAX_PAGE_BYTES + 1),
          },
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects compressed responses instead of decompressing bombs", async () => {
    await expect(
      inspection(async () =>
        response("", {
          headers: { "content-type": "text/html", "content-encoding": "gzip" },
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });
  });
  it("reports blocked and unsupported pages without invented summaries", async () => {
    await expect(
      inspection(async () => response("", { status: 403 })),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      inspection(async () => response("<title>Just a moment...</title>")),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      inspection(async () =>
        response("", { headers: { "content-type": "image/png" } }),
      ),
    ).rejects.toMatchObject({ status: 415 });
  });
  it("bounds a stalled DNS resolver and never starts a request after timing out", async () => {
    const request = vi.fn();
    await expect(
      inspectUrl("https://example.com", {
        resolve: () => new Promise(() => {}),
        request,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ status: 504 });
    expect(request).not.toHaveBeenCalled();
  });
  it("aborts a stalled request within the total deadline", async () => {
    let signal: AbortSignal | undefined;
    await expect(
      inspectUrl("https://example.com", {
        resolve: publicDns,
        request: async (_url, _address, abort) => {
          signal = abort;
          return new Promise(() => {});
        },
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ status: 504 });
    expect(signal?.aborted).toBe(true);
  });
});

describe("page evidence extraction", () => {
  it("extracts decoded actual metadata, visible price context and excludes scripts/hidden text", () => {
    const page = extractPageMetadata(
      `<html><head><title>Fallback title</title><meta property="og:site_name" content="Real &amp; Product"><meta name="description" content="Actual product description."><script>const fake = "$99999 secret";</script></head><body><h1>Product features</h1><p>Starter plan $19/month for one user.</p><div hidden>Secret $2 offer</div><div style="display: none">Hidden $3</div><span aria-hidden="true">Hidden $4</span><style>.x{content:"$55"}</style></body></html>`,
      "https://example.com",
    );
    expect(page.name).toBe("Real & Product");
    expect(page.description).toBe("Actual product description.");
    expect(page.pricing).toBe("Starter plan $19/month for one user.");
    expect(page.excerpt).not.toMatch(/99999|Secret|Hidden|\$55/);
  });
  it("extracts actual Offer prices and preserves currencies without inventing a billing period", () => {
    const page = extractPageMetadata(
      `<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Schema Product","description":"From JSON-LD.","offers":[{"@type":"Offer","price":"29.99","priceCurrency":"USD"},{"@type":"Offer","price":"99"},{"@type":"AggregateOffer","lowPrice":20,"highPrice":50,"priceCurrency":"EUR"}]}</script><p>Public page.</p>`,
      "https://example.com",
    );
    expect(page.name).toBe("Schema Product");
    expect(page.pricing).toBe("USD 29.99\nEUR 20–50");
    expect(page.pricing).not.toMatch(/month|year|99$/);
  });
  it("leaves pricing empty when no page evidence gives a price", () => {
    const page = extractPageMetadata(
      "<title>FreeForm</title><p>Contact sales for pricing. Five stars from customers.</p><script>{price:99}</script>",
      "https://example.com",
    );
    expect(page.pricing).toBe("");
    expect(page.excerpt).toBe(
      "Contact sales for pricing. Five stars from customers.",
    );
  });
  it("handles plain text and bounds response fields", () => {
    const page = extractPageMetadata(
      `Public plan GBP 12 / user. ${"Description ".repeat(1000)}`,
      "https://example.com",
      "text/plain",
    );
    expect(page.pricing).toContain("GBP 12");
    expect(page.name).toBe("example.com");
    expect(page.description.length).toBeLessThanOrEqual(600);
    expect(page.excerpt.length).toBeLessThanOrEqual(3000);
    expect(page.pricing.length).toBeLessThanOrEqual(1000);
  });
});

describe("public inspection utility bounds", () => {
  const page: ResearchPage = {
    url: "https://example.com/",
    name: "Product",
    description: "Description",
    pricing: "",
    excerpt: "Description",
    retrievedAt: "2026-10-09T00:00:00Z",
  };
  it("caches public results for five minutes and protects cached objects from mutation", async () => {
    let time = 0;
    const inspect = vi.fn(async () => ({ ...page }));
    const service = createResearchService(inspect, () => time);
    const first = await service(page.url, "one");
    first.name = "Changed";
    expect((await service(page.url, "two")).name).toBe("Product");
    expect(inspect).toHaveBeenCalledTimes(1);
    time = 300_001;
    await service(page.url, "two");
    expect(inspect).toHaveBeenCalledTimes(2);
  });
  it("limits per-client requests including cache hits", async () => {
    const inspect = vi.fn(async () => page);
    const service = createResearchService(inspect);
    for (let count = 0; count < 20; count++) await service(page.url, "one");
    await expect(service(page.url, "one")).rejects.toMatchObject({
      status: 429,
    });
    expect(inspect).toHaveBeenCalledTimes(1);
  });
  it("deduplicates concurrent inspections and caps other in-flight pages", async () => {
    let finish!: (value: ResearchPage) => void;
    const inspect = vi.fn(
      () =>
        new Promise<ResearchPage>((resolve) => {
          finish = resolve;
        }),
    );
    const service = createResearchService(inspect);
    const first = service(page.url, "one");
    const second = service(page.url, "two");
    expect(inspect).toHaveBeenCalledTimes(1);
    finish(page);
    expect(await first).toEqual(page);
    expect(await second).toEqual(page);
    const stalled = createResearchService(() => new Promise(() => {}));
    for (let count = 0; count < 4; count++)
      void stalled(`https://example.com/${count}`, "one");
    await expect(
      stalled("https://example.com/five", "two"),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("reads bounded raw JSON through the public endpoint and rejects methods/private URLs", async () => {
    const call = async (body: string, method = "POST") => {
      const request = Readable.from([Buffer.from(body)]) as ApiRequest;
      request.method = method;
      request.headers = {};
      const result = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as ApiResponse;
      await handler(request, result);
      return result;
    };
    expect(
      (await call('{"url":"http://127.0.0.1"}')).status,
    ).toHaveBeenCalledWith(400);
    expect((await call("{}", "GET")).status).toHaveBeenCalledWith(405);
    expect((await call("x".repeat(4097))).status).toHaveBeenCalledWith(413);
    expect((await call("not JSON")).status).toHaveBeenCalledWith(400);
  });
});
