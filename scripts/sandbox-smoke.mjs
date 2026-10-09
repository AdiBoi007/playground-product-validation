/* global document, window, indexedDB */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.PLAYGROUND_URL ?? "http://localhost:5176";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  reducedMotion: "reduce",
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const idea =
  "An invoicing product for freelance designers: https://example.com/product";
const brief =
  "The initial brief says clients must be able to pay without creating an account.";
const pdfBrief = "The PDF brief targets freelance designers.";
function makePdf(text) {
  const content = `BT /F1 12 Tf 20 180 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
const question =
  "Can a freelance designer create and send an invoice without a walkthrough?";
const source = (title, url) => ({
  id: `src_${createHash("sha256").update(url).digest("hex").slice(0, 16)}`,
  title,
  url,
  retrievedAt: "2026-10-09T00:00:00.000Z",
});
const competitor = source(
  "Pricing source fixture",
  "https://competitor-fixture.example/pricing",
);
const originalNews = source(
  "Original news fixture",
  "https://news-fixture.example/original",
);
const newerNews = source(
  "Updated news fixture",
  "https://news-fixture.example/updated",
);
const customer = source(
  "Customer discussion fixture",
  "https://feedback-fixture.example/thread/101",
);
const analysis = (updated) => ({
  product: {
    name: "QA Invoice Sandbox",
    description: "Invoicing for freelance designers",
    url: "https://example.com/product",
    audience: "Freelance designers",
    valueProposition:
      "Create invoices clients can pay without creating an account",
    sourceIds: [],
    basis: "input",
  },
  summary: updated
    ? "Updated analysis after the founder's follow-up."
    : "An initial analysis of the idea and retrieved evidence.",
  summarySourceIds: [competitor.id, customer.id],
  summaryBasis: "inference",
  competitors: [
    {
      name: "Competitor fixture",
      url: competitor.url,
      offer: "Invoice links and reminders",
      pricing: "$9/month",
      difference: "Account-free payment is a hypothesis to test",
      sourceIds: [competitor.id],
    },
  ],
  news: [
    {
      headline: updated
        ? "Updated market news fixture"
        : "Initial market news fixture",
      summary: "A dated research fixture about changes in freelance invoicing",
      publishedAt: updated ? "2026-10-08" : "2026-10-01",
      url: updated ? newerNews.url : originalNews.url,
      sourceIds: [updated ? newerNews.id : originalNews.id],
    },
  ],
  signals: [
    {
      claim: "A customer discussion asks for account-free payment",
      kind: "request",
      sourceIds: [customer.id],
    },
  ],
  opportunities: [
    {
      title: "Reduce client payment friction",
      detail: "Explore the account-free payment approach",
      sourceIds: [customer.id],
    },
  ],
  risks: [
    {
      title: "Sample coverage",
      detail: "Public discussion evidence does not establish demand",
      sourceIds: [customer.id],
    },
  ],
  assumptions: [
    {
      id: "question-1",
      question,
      why: "Validate the core workflow with the intended audience",
      sourceIds: [customer.id],
    },
  ],
  nextSteps: [
    {
      title: "Test the invoice workflow",
      detail: "Invite freelance designers to complete the core task",
      sourceIds: [customer.id],
      method: "human",
    },
  ],
  sources: [competitor, updated ? newerNews : originalNews, customer],
});
const records = (target = page) =>
  target.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("playground-sandboxes", 1);
        request.onsuccess = () => {
          const db = request.result;
          const query = db
            .transaction("records")
            .objectStore("records")
            .getAll();
          query.onsuccess = () => {
            resolve(query.result.map((record) => record.sandbox));
            db.close();
          };
          query.onerror = () => {
            reject(query.error);
            db.close();
          };
        };
        request.onerror = () => reject(request.error);
      }),
  );
const lastRecord = async () =>
  (await records()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
const section = async (name) =>
  page.getByRole("tab", { name, exact: true }).click();
const noOverflow = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    `Overflow on ${page.url()}`,
  );
let configured = false;
let mode = "initial";
let releaseSlow;
const requests = [];
// Fixtures exist only in this isolated browser context; no production seed data.
await context.route("**/api/sandbox", async (route) => {
  if (route.request().method() === "GET")
    return route.fulfill({ json: { configured } });
  const body = route.request().postDataJSON();
  requests.push(body);
  const saved = await lastRecord();
  assert.equal(
    saved.messages.at(-1).status,
    "pending",
    "User input must be durable before research starts",
  );
  if (mode === "failure")
    return route.fulfill({
      status: 503,
      json: {
        error: "Research provider is temporarily unavailable.",
        code: "PROVIDER_UNAVAILABLE",
      },
    });
  if (mode === "slow")
    await new Promise((resolve) => {
      releaseSlow = resolve;
    });
  const updated = mode !== "initial";
  try {
    await route.fulfill({
      json: {
        reply: updated
          ? `Updated the same sandbox. [${newerNews.id}]`
          : `Constructed the research sandbox. [${originalNews.id}]`,
        analysis: analysis(updated),
        sourceReceipt: updated ? "b".repeat(64) : "a".repeat(64),
      },
    });
  } catch {
    /* The browser may cancel a delayed fixture response. */
  }
});

try {
  mkdirSync("docs/screenshots", { recursive: true });
  await page.goto(`${baseURL}/research`);
  await page.waitForURL("**/sandbox");
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sandbox", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Build sandbox", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Research is not configured/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^(sign in|sign up|log in)$/i }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Competitor URL", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Idea or product URL", { exact: true }).fill(idea);
  configured = true;
  await page
    .getByRole("button", { name: "Retry connection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Build sandbox", exact: true }),
  ).toBeEnabled();
  await page.locator('input[type="file"]').setInputFiles({
    name: "brief.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(brief),
  });
  await expect(
    page.getByRole("button", {
      name: "Remove attachment brief.md",
      exact: true,
    }),
  ).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "brief.pdf",
    mimeType: "application/pdf",
    buffer: makePdf(pdfBrief),
  });
  await expect(
    page.getByRole("button", {
      name: "Remove attachment brief.pdf",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Build sandbox", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Competitors", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sb-pending")).toHaveCount(0);
  assert.equal(requests[0].message, idea);
  assert.equal(requests[0].attachments[0].text, brief);
  assert.ok(requests[0].attachments[1].text.includes(pdfBrief));
  const original = await lastRecord();
  assert.equal(original.messages.length, 2);
  assert.equal(original.messages[0].attachments[0].text, brief);
  assert.equal(original.messages[0].status, "complete");
  assert.equal(original.sourceReceipt, "a".repeat(64));
  await expect(
    page.locator(`.sb-message-assistant a[href="${originalNews.url}"]`),
  ).toHaveCount(1);
  await section("Competitors");
  await expect(
    page.getByText("Competitor fixture", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("$9/month", { exact: true })).toBeVisible();
  await expect(
    page.locator(`a[href="${competitor.url}"]`).first(),
  ).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/sandbox.png" });
  await section("News");
  await expect(
    page.getByText("Initial market news fixture", { exact: true }),
  ).toBeVisible();
  await section("Customer signals");
  await expect(
    page.getByText("A customer discussion asks for account-free payment", {
      exact: true,
    }),
  ).toBeVisible();
  await section("Plan");
  await expect(page.getByText(question, { exact: true })).toBeVisible();
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadReady;
  const markdown = readFileSync(await download.path(), "utf8");
  for (const text of [idea, brief, competitor.url, originalNews.url, question])
    assert.ok(markdown.includes(text), `Export must retain ${text}`);

  mode = "updated";
  await page
    .getByLabel("Message", { exact: true })
    .fill("Update the news and refine the same idea.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".sb-pending")).toHaveCount(0);
  await expect.poll(async () => (await lastRecord()).messages.length).toBe(4);
  assert.equal(requests[1].sourceReceipt, "a".repeat(64));
  assert.ok(
    requests[1].history.some((message) => message.content.includes(brief)),
    "Follow-up must retain original brief context",
  );
  assert.equal(requests[1].priorAnalysis.product.name, "QA Invoice Sandbox");
  assert.equal((await lastRecord()).id, original.id);
  assert.ok(
    (await lastRecord()).sourceArchive.some(
      (source) => source.url === originalNews.url,
    ),
  );
  await section("News");
  await expect(
    page.getByText("Updated market news fixture", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(`.sb-chat a[href="${originalNews.url}"]`).first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
  await expect(page.locator(".sb-message")).toHaveCount(4);

  mode = "failure";
  await page
    .getByLabel("Message", { exact: true })
    .fill("Find one more market signal.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  const failed = (await lastRecord()).messages.at(-1);
  assert.equal(failed.status, "failed");
  assert.equal(
    (await lastRecord()).analysis.news[0].headline,
    "Updated market news fixture",
  );
  mode = "updated";
  const retryDraft = "Keep this separate follow-up draft while retrying.";
  await page.getByLabel("Message", { exact: true }).fill(retryDraft);
  await page.locator('input[type="file"]').setInputFiles({
    name: "unrelated-draft.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Unsubmitted context belongs to the next message."),
  });
  await expect(
    page.getByRole("button", {
      name: "Remove attachment unrelated-draft.md",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect
    .poll(async () => (await lastRecord()).messages.at(-1).role)
    .toBe("assistant");
  assert.equal(
    (await lastRecord()).messages.find((message) => message.id === failed.id)
      .status,
    "complete",
  );
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    retryDraft,
  );
  assert.ok(
    requests
      .at(-1)
      .attachments.every((file) => file.name !== "unrelated-draft.md"),
    "Retry must not submit files from an unrelated composer draft",
  );
  await page
    .getByRole("button", {
      name: "Remove attachment unrelated-draft.md",
      exact: true,
    })
    .click();

  mode = "slow";
  await page
    .getByLabel("Message", { exact: true })
    .fill("Research another audience.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeVisible();
  await expect.poll(() => Boolean(releaseSlow)).toBe(true);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  assert.equal((await lastRecord()).messages.at(-1).status, "cancelled");
  assert.equal(
    (await lastRecord()).analysis.news[0].headline,
    "Updated market news fixture",
  );
  releaseSlow();
  mode = "updated";

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of [
      "Overview",
      "Competitors",
      "News",
      "Customer signals",
      "Plan",
      "Sources",
    ]) {
      await section(name);
      await noOverflow();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await section("Competitors");
  await page.screenshot({
    path: "docs/screenshots/sandbox-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 950 });
  await section("Plan");
  await page
    .getByRole("tabpanel", { name: "Plan", exact: true })
    .getByRole("link", { name: "Create test", exact: true })
    .click();
  await page.waitForURL("**/create?**");
  await expect(page.getByLabel(/^Test name/)).toHaveValue(/QA Invoice Sandbox/);
  await expect(page.getByLabel("Product URL", { exact: false })).toHaveValue(
    "https://example.com/product",
  );
  await expect(
    page.getByLabel("Target audience", { exact: false }),
  ).toHaveValue("Freelance designers");
  await expect(page.getByLabel("Test objective", { exact: false })).toHaveValue(
    question,
  );
  await page
    .getByRole("button", { name: "Generate tasks", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve mission", exact: true }),
  ).toBeVisible();
  await page.goto(`${baseURL}/sandbox`);
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await expect(
    page.getByLabel("Saved sandboxes", { exact: true }),
  ).toBeVisible();

  // Two tabs must retain unsaved founder input when the stored revision changes.
  const staleTab = await context.newPage();
  await staleTab.goto(`${baseURL}/sandbox`);
  await staleTab.getByRole("button", { name: "Research", exact: true }).click();
  await expect(staleTab.getByLabel("Message", { exact: true })).toBeVisible();
  await page.getByLabel("Message", { exact: true }).fill("Update the plan.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(async () => (await lastRecord()).messages.at(-1).role)
    .toBe("assistant");
  await staleTab
    .getByLabel("Message", { exact: true })
    .fill("Keep this unsaved input on a conflict.");
  await staleTab.locator('input[type="file"]').setInputFiles({
    name: "unsaved.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Keep this attached brief through conflict recovery."),
  });
  await expect(
    staleTab.getByRole("button", {
      name: "Remove attachment unsaved.md",
      exact: true,
    }),
  ).toBeVisible();
  await staleTab.getByRole("button", { name: "Send", exact: true }).click();
  await expect(staleTab.getByRole("alert")).toContainText(
    "changed in another tab",
  );
  await expect(staleTab.getByLabel("Message", { exact: true })).toHaveValue(
    "Keep this unsaved input on a conflict.",
  );
  await expect(
    staleTab.getByRole("button", {
      name: "Remove attachment unsaved.md",
      exact: true,
    }),
  ).toBeVisible();
  await staleTab
    .getByRole("button", {
      name: "Reload saved sandbox",
      exact: true,
    })
    .click();
  await expect(staleTab.getByLabel("Message", { exact: true })).toHaveValue(
    "Keep this unsaved input on a conflict.",
  );
  await expect(
    staleTab.getByRole("button", {
      name: "Remove attachment unsaved.md",
      exact: true,
    }),
  ).toBeVisible();
  await staleTab.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(async () => (await lastRecord()).messages.at(-1).role)
    .toBe("assistant");
  assert.equal(
    requests.at(-1).message,
    "Keep this unsaved input on a conflict.",
  );
  assert.ok(
    requests.at(-1).attachments.some((file) => file.name === "unsaved.md"),
  );
  await staleTab.close();

  // A failed first build must preserve its idea for a subsequent new message.
  await page.getByRole("button", { name: "New sandbox", exact: true }).click();
  mode = "failure";
  await page
    .getByLabel("Idea or product URL", { exact: true })
    .fill("Original failed idea: a scheduling app for teachers.");
  await page
    .getByRole("button", { name: "Build sandbox", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  mode = "updated";
  await page
    .getByLabel("Message", { exact: true })
    .fill("Focus on primary school teachers.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(async () => (await lastRecord()).messages.at(-1).role)
    .toBe("assistant");
  assert.ok(
    requests
      .at(-1)
      .history.some((message) =>
        message.content.includes("Original failed idea"),
      ),
  );
  await page
    .getByRole("button", { name: "Delete sandbox", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Delete sandbox?",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete sandbox", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete sandbox", exact: true })
    .click();
  await expect.poll(async () => (await records()).length).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
  assert.equal((await lastRecord()).id, original.id);
  assert.deepEqual(errors, [], "No browser errors");
  console.log(
    "Sandbox flow passed: input/brief, automatic results, follow-up context and source history, export, test handoff, durable retry/cancellation, stale-save recovery and populated mobile layouts.",
  );
} finally {
  releaseSlow?.();
  await browser.close();
}
