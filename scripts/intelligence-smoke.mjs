import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.PLAYGROUND_URL ?? "http://localhost:5175";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(6000);
page.setDefaultNavigationTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const demo = () =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("playground-demo-v1") ?? "null")?.state,
  );
const choices = () =>
  page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("playground-decision-experiments-v1") ?? "null",
      )?.state,
  );
const waitForRetest = async () =>
  expect
    .poll(async () => (await demo())?.phase, { timeout: 8000 })
    .toBe("v2-complete");
const projection = async () =>
  Number(await page.locator(".change-projection-score strong").innerText());
const reportScore = async (score) => {
  await page.goto(`${baseURL}/tests/playground/report`);
  await expect(page.locator(".giant-score")).toHaveText(`${score}/100`);
};
const runRetest = async () => {
  await page.locator(".changes-run-bar").getByRole("button").click();
  await waitForRetest();
};

try {
  await page.goto(`${baseURL}/dashboard`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.keyboard.press("Shift+R");
  await reportScore(74);
  await expect(page.locator(".decision-verdict")).toHaveClass(/iterate/);

  await page.locator(".sidebar-demo").click();
  await expect(page.locator(".sidebar-demo")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page
    .locator(".demo-menu")
    .getByRole("button", { name: "8×", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page.goto(`${baseURL}/tests/playground/changes`);
  await expect(
    page.locator('.change-checkbox[aria-pressed="true"]'),
  ).toHaveCount(3);
  assert.equal(await projection(), 86);
  await page
    .getByRole("button", {
      name: "Remove Make the AI → human handoff visible.",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Remove Remove the first-test unknowns.",
      exact: true,
    })
    .click();
  await expect(
    page.locator('.change-checkbox[aria-pressed="true"]'),
  ).toHaveCount(1);
  const partial = await projection();
  assert.ok(
    partial > 74 && partial < 86,
    `One selected change must have its own projection, received ${partial}.`,
  );
  await runRetest();
  assert.deepEqual((await choices()).committedActionIds, ["orchestration"]);
  await reportScore(partial);
  console.log(
    `PASS V1 74 → one-change projection and observed retest ${partial}`,
  );

  await page.goto(`${baseURL}/tests/playground/changes`);
  await page
    .getByRole("button", {
      name: "Remove Put the engine in the hero.",
      exact: true,
    })
    .click();
  assert.equal(await projection(), 74);
  assert.deepEqual((await choices()).draftActionIds, []);
  assert.deepEqual((await choices()).committedActionIds, ["orchestration"]);
  await reportScore(partial);
  console.log(
    "PASS draft selections do not mutate an existing completed V2 report",
  );

  await page.goto(`${baseURL}/tests/playground/changes`);
  await runRetest();
  await reportScore(74);
  await expect(page.locator(".decision-verdict")).toHaveClass(/iterate/);
  await expect(page.locator(".decision-verdict-story")).toContainText(
    "No changes were committed",
  );
  console.log("PASS unchanged control remains 74 / ITERATE");

  await page.goto(`${baseURL}/tests/playground/changes`);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  assert.equal(await projection(), 86);
  await runRetest();
  await reportScore(86);
  await expect(page.locator(".decision-verdict")).toHaveClass(/ship/);
  await page
    .getByRole("group", { name: "Report version" })
    .getByRole("button", { name: /V1/ })
    .click();
  await expect(page.locator(".giant-score")).toHaveText("74/100");
  await page
    .locator(".decision-criteria-table button")
    .filter({ hasText: "AI screening and human proof are distinct." })
    .click();
  await expect(page.locator(".finding-drawer")).toContainText("12 of 25");
  await expect(page.locator(".finding-drawer")).toContainText("VERSION 1");
  await expect(
    page
      .getByRole("group", { name: "Finding evidence version" })
      .getByRole("button", { name: "V1", exact: true }),
  ).toHaveClass("active");
  await page.locator(".finding-close").click();
  await expect(page.locator(".finding-drawer")).not.toBeVisible();
  console.log(
    "PASS full retest reaches 86 / SHIP; V1 report and drawer retain baseline evidence",
  );

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloading;
  assert.equal(download.suggestedFilename(), "playground-decision-brief-v1.md");
  const exported = await readFile(await download.path(), "utf8");
  assert.ok(exported.includes("Validation score: 74/100"));
  assert.ok(exported.includes("Synthetic demo research"));
  assert.ok(exported.includes("## Success criteria"));
  assert.ok(exported.includes("## Research limitations"));
  assert.ok(!exported.includes("undefined"));
  console.log(
    "PASS report export contains the selected version, evidence and limitations",
  );

  await page.goto(`${baseURL}/tests/playground/evidence`);
  await expect(
    page.getByRole("tab", { name: "Evidence graph", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const supportCount = async () =>
    Number(
      (await page.locator(".graph-inspector-heading p").innerText()).match(
        /^\d+/,
      )?.[0],
    );
  const all = await supportCount();
  const sources = page.getByRole("group", { name: "Graph evidence source" });
  await sources.getByRole("button", { name: "AI", exact: true }).click();
  const ai = await supportCount();
  assert.ok(ai > 0 && ai < all);
  await expect(page.locator(".graph-support-grid article small")).toHaveText([
    "AI persona",
    "AI persona",
    "AI persona",
    "AI persona",
  ]);
  await sources.getByRole("button", { name: "Founders", exact: true }).click();
  const founders = await supportCount();
  assert.ok(founders > 0 && founders < all);
  await expect(page.locator(".graph-support-grid article small")).toHaveText([
    "Founder",
    "Founder",
    "Founder",
    "Founder",
  ]);
  await sources.getByRole("button", { name: "Experts", exact: true }).click();
  const experts = await supportCount();
  assert.ok(experts > 0 && experts < all);
  assert.equal(ai + founders + experts, all);
  await page
    .locator(".graph-finding-node")
    .filter({ hasText: "Primary CTA works" })
    .click();
  await expect(page.locator(".graph-inspector-heading h3")).toHaveText(
    "Primary CTA works",
  );
  await expect(page.locator(".graph-finding-node.selected")).toContainText(
    "Primary CTA works",
  );
  await sources
    .getByRole("button", { name: "All sources", exact: true })
    .click();
  assert.ok((await supportCount()) > 0);
  console.log(
    "PASS evidence graph source counts, source filtering and finding selection",
  );

  assert.deepEqual(
    errors,
    [],
    "No uncaught browser errors should occur in the intelligence loop.",
  );
  console.log("PASS no uncaught browser errors");
} finally {
  await browser.close();
}
