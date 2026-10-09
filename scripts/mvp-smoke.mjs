/* global document, window, indexedDB */
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
const baseURL = process.env.PLAYGROUND_URL ?? "http://localhost:5176";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const workspace = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("playground-mvp", 1);
        r.onsuccess = () => {
          const q = r.result
            .transaction("workspace")
            .objectStore("workspace")
            .get("data");
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
        };
      }),
  );
const switchView = async (view) => {
  await page.getByLabel("Workspace view", { exact: true }).selectOption(view);
  await page.waitForURL(
    view === "founder"
      ? "**/dashboard"
      : view === "admin"
        ? "**/admin"
        : "**/tester",
  );
  await expect(
    page.getByRole("heading", {
      name:
        view === "founder"
          ? "Tests"
          : view === "admin"
            ? "Operations"
            : "Assignments",
      exact: true,
    }),
  ).toBeVisible();
  await assertNoSlogans();
};
const switchTester = async (name) => {
  await switchView("tester");
  await page
    .getByLabel("Tester profile", { exact: true })
    .selectOption({ label: name });
  await expect(
    page.getByRole("button", { name: "Edit profile", exact: true }),
  ).toBeVisible();
};
const addTester = async (name) => {
  await page.getByRole("button", { name: "Add tester", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Add a tester",
    exact: true,
  });
  await dialog.getByLabel("Tester name", { exact: true }).fill(name);
  await dialog
    .getByLabel("Expertise", { exact: true })
    .fill("Product design, onboarding");
  await dialog
    .getByRole("button", { name: "Save tester", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
};
const assertNoAuthentication = async () => {
  await expect(
    page.getByRole("link", {
      name: /^(sign in|sign up|log in|login|create account)$/i,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /^(sign in|sign up|log in|login|create account|sign out)$/i,
    }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Email address", { exact: true })).toHaveCount(
    0,
  );
};
const assertNoSlogans = async () => {
  const text = (await page.locator("body").innerText())
    .replace(/\s+/g, " ")
    .toLowerCase();
  for (const phrase of [
    "stop guessing",
    "start testing.",
    "the loop is the product",
    "one question. five humans",
    "a better next version",
    "real tasks. useful answers",
    "open it. try it. tell us",
    "give us the question",
    "let humans try it",
    "fix. retest. repeat",
    "small enough to start",
    "useful enough to act on",
    "one test. five humans",
    "zero guessing",
  ])
    assert.equal(
      text.includes(phrase),
      false,
      `Removed slogan '${phrase}' remains on ${page.url()}`,
    );
};
const checkNoOverflow = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    `Overflow on ${page.url()}`,
  );
try {
  mkdirSync("docs/screenshots", { recursive: true });
  await page.goto(baseURL);
  await page.waitForURL("**/dashboard");
  await expect(
    page.getByRole("heading", { name: "Tests", exact: true }),
  ).toBeVisible();
  await assertNoSlogans();
  await assertNoAuthentication();
  await page.screenshot({ path: "docs/screenshots/dashboard.png" });
  await page.goto(`${baseURL}/sign-in`);
  await page.waitForURL("**/dashboard");
  await expect(page.getByLabel("Workspace view", { exact: true })).toHaveValue(
    "founder",
  );
  await assertNoAuthentication();
  await expect(page.locator(".fp-dashboard-list")).toHaveCount(0);
  await page.locator('a[href="/create"]').first().click();
  await expect(
    page.getByRole("heading", { name: "Create test", exact: true }),
  ).toBeVisible();
  await assertNoSlogans();
  await page.getByLabel("Test name").fill("QA — Onboarding mission");
  await page
    .getByLabel("Product URL", { exact: false })
    .fill("https://example.com");
  await page
    .getByLabel("Target audience", { exact: false })
    .fill("Product designers testing first-time onboarding on desktop");
  await page
    .getByLabel("Test objective", { exact: false })
    .fill("Can a first-time visitor start and complete onboarding?");
  await page
    .getByRole("button", { name: "Generate tasks", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve mission", exact: true }),
  ).toBeVisible();
  await assertNoSlogans();
  await page
    .getByRole("button", { name: "Approve mission", exact: true })
    .click();
  await page.getByRole("button", { name: "Simulate checkout" }).click();
  await page.getByRole("button", { name: "Confirm simulated payment" }).click();
  await page.waitForURL(/\/campaigns\/[^/]+$/);
  const campaignId = page.url().split("/").pop();
  await expect(page.locator(".fp-slot-empty")).toHaveCount(5);
  await assertNoSlogans();
  await page.screenshot({ path: "docs/screenshots/campaign.png" });
  await switchView("admin");
  for (let i = 1; i <= 5; i++) await addTester(`QA Tester ${i}`);
  for (let i = 1; i <= 5; i++) {
    const card = page
      .locator(".mvp-op-tester-match")
      .filter({ hasText: `QA Tester ${i}` });
    await card.getByRole("button", { name: "Invite tester" }).click();
    await expect(card.getByText("New invitation")).toBeVisible();
  }
  await expect(page.getByText("5/5 slots reserved")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/operations.png" });
  for (let i = 1; i <= 5; i++) {
    await switchTester(`QA Tester ${i}`);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page
      .getByRole("link", {
        name: /Open workspace|Start test|Continue test|Open mission/,
      })
      .first()
      .click();
    await page
      .getByRole("link", { name: "Start feedback", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Submit feedback", exact: true }),
    ).toBeVisible();
    await assertNoSlogans();
    await page
      .getByRole("checkbox", { name: /I agree to share my screenshots/ })
      .check();
    const sections = page.locator(".mvp-op-feedback-task");
    await expect(sections).toHaveCount(3);
    const n = await sections.count();
    for (let t = 0; t < n; t++) {
      const section = sections.nth(t);
      await section
        .getByLabel("Time on task (seconds)")
        .fill(String(60 + t * 15 + i));
      await section
        .locator(`input[value="${i === 1 && t === 1 ? "blocked" : "success"}"]`)
        .check();
      await section
        .locator("textarea")
        .nth(0)
        .fill(
          i === 1 && t === 1
            ? "The continue button did not respond after clicking."
            : "I understood the task and completed the expected flow.",
        );
      await section
        .getByLabel("What did you notice?", { exact: false })
        .fill(
          i === 1 && t === 1
            ? "I clicked continue twice and the page never progressed."
            : "The next step was clearly labelled and easy to complete.",
        );
      if (t === 0) {
        await page
          .getByLabel(`Evidence link for task ${t + 1}`, { exact: true })
          .fill(`https://example.com/qa-recording-${i}`);
        await page
          .getByRole("button", {
            name: `Add evidence link to task ${t + 1}`,
            exact: true,
          })
          .click();
      }
    }
    await page
      .locator(".mvp-op-overall textarea")
      .fill(
        "The product was understandable; I have documented each task outcome.",
      );
    if (i === 1) {
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              new Promise((resolve, reject) => {
                const request = indexedDB.open("playground-mvp-drafts", 1);
                request.onsuccess = () => {
                  const values = request.result
                    .transaction("drafts")
                    .objectStore("drafts")
                    .getAll();
                  values.onsuccess = () =>
                    resolve(
                      values.result.some(
                        (value) =>
                          value.overallFeedback ===
                          "The product was understandable; I have documented each task outcome.",
                      ),
                    );
                  values.onerror = () => reject(values.error);
                };
              }),
          ),
        )
        .toBe(true);
      await expect(
        page.getByText("Saved on this device", { exact: false }).first(),
      ).toBeVisible();
      await page.reload();
      await expect(sections.nth(0).locator("textarea").nth(0)).toHaveValue(
        "I understood the task and completed the expected flow.",
      );
      await expect(
        page.getByText("1 attached", { exact: false }),
      ).toBeVisible();
      await expect(page.locator(".mvp-op-overall textarea")).toHaveValue(
        "The product was understandable; I have documented each task outcome.",
      );
      await page.screenshot({ path: "docs/screenshots/feedback.png" });
    }
    await page
      .getByRole("button", { name: "Submit feedback", exact: true })
      .click();
    await expect(page.getByText("Under review").first()).toBeVisible();
  }
  await switchView("admin");
  await page
    .getByRole("button", { name: "Review evidence", exact: false })
    .click();
  // Exercise a revision handoff before approving the final cohort.
  await page
    .getByLabel("Review note", { exact: true })
    .fill(
      "Please clarify which continue action failed and add the expected result.",
    );
  await page.getByRole("button", { name: "Request revision" }).click();
  await switchTester("QA Tester 1");
  await page
    .getByRole("link", {
      name: /Update.*resubmit|Revise feedback|Open workspace|Continue test|Open mission/,
    })
    .first()
    .click();
  if (!page.url().endsWith("/feedback"))
    await page.getByRole("link", { name: "Update & resubmit" }).click();
  await expect(page.locator(".mvp-op-feedback-task")).toHaveCount(3);
  await page
    .locator(".mvp-op-feedback-task")
    .nth(1)
    .getByLabel("What did you notice?", { exact: false })
    .fill(
      "I clicked the main Continue button on the onboarding page twice. I expected the account setup page; nothing changed.",
    );
  await page
    .getByRole("button", { name: /Resubmit feedback|Update.*submit/ })
    .click();
  await expect(page.getByText("Under review").first()).toBeVisible();
  await switchView("admin");
  await page
    .getByRole("button", { name: "Review evidence", exact: false })
    .click();
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "Approve submission" }).click();
  }
  await expect(
    page.getByRole("button", { name: "Approve submission" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Payout ledger", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Completed payment reference")
    .fill("QA-BANK-TRANSFER-001");
  await page
    .getByRole("button", { name: "Mark manually paid", exact: true })
    .click();
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await page
    .getByRole("button", { name: "Synthesize approved feedback", exact: true })
    .click();
  await expect(page.getByLabel("Founder summary")).toBeVisible();
  await page.getByRole("button", { name: "Publish to founder" }).click();
  await expect
    .poll(async () =>
      (await workspace()).reports.some(
        (report) => report.status === "published",
      ),
    )
    .toBe(true);
  await switchView("founder");
  await page.goto(`${baseURL}/campaigns/${campaignId}/results`);
  await expect(
    page.getByRole("heading", { name: "Test report", exact: true }),
  ).toBeVisible();
  await assertNoSlogans();
  await expect(
    page.getByText("Friction in: Try the first-use flow"),
  ).toBeVisible();
  await page.locator(".fp-finding-sources summary").click();
  await expect(
    page
      .locator(".fp-source-quote blockquote")
      .filter({ hasText: "I clicked the main Continue button" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export report" }).click();
  const download = await downloadPromise;
  assert.match(readFileSync(await download.path(), "utf8"), /QA Tester 1/);
  await page.screenshot({ path: "docs/screenshots/report.png" });
  await page
    .getByRole("button", { name: "Create retest", exact: true })
    .click();
  await page
    .getByLabel(/Updated product URL|Product URL/)
    .fill("https://example.com/v2");
  await page
    .getByLabel(/What did you change/)
    .fill("Fixed the unresponsive Continue action in onboarding.");
  await page
    .getByRole("button", {
      name: "Create retest draft",
      exact: true,
    })
    .click();
  await page.waitForURL(/\/create\?draft=/);
  const retestPath = page.url().replace(baseURL, "");
  const data = await workspace();
  assert.equal(data.campaigns.length, 2);
  assert.equal(data.campaigns[1].round, 2);
  assert.equal(data.campaigns[1].payment, "unpaid");
  assert.equal(data.reports.length, 1);
  assert.equal(data.reports[0].status, "published");
  assert.equal(
    data.submissions.filter((s) => s.status === "approved").length,
    5,
  );
  assert.equal(data.payouts.length, 5);
  assert.equal(data.payouts.filter((p) => p.status === "paid").length, 1);
  assert.equal(
    data.profiles.filter((profile) => profile.role === "tester").length,
    5,
  );
  await assertNoAuthentication();
  await assertNoSlogans();
  for (const legacyRoute of ["/login", "/signup", "/auth/callback"]) {
    await page.goto(baseURL + legacyRoute);
    await page.waitForURL("**/dashboard");
    await assertNoAuthentication();
    await assertNoSlogans();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/",
    "/dashboard",
    `/campaigns/${campaignId}`,
    `/campaigns/${campaignId}/results`,
    retestPath,
  ]) {
    await page.goto(baseURL + route);
    await page.waitForTimeout(150);
    await checkNoOverflow();
    await assertNoSlogans();
  }
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".mvp-sidebar.open")).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS direct dashboard → approved mission → simulated checkout → 5 manually entered testers → matching → task evidence → revision → QA → manual payout → published cited report → export → unpaid round2; removed slogans absent + no login/signup + legacy redirects + mobile navigation + persistence",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/mvp-smoke-failure.png", fullPage: true });
  console.log(
    "FAILED URL",
    page.url(),
    "BODY",
    (await page.locator("body").innerText()).slice(-3500),
  );
  throw error;
} finally {
  await browser.close();
}
