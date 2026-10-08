/* global document, window */
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.PLAYGROUND_URL ?? "http://localhost:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(6000);
page.setDefaultNavigationTimeout(15000);
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
const state = () =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("playground-demo-v1") ?? "null")?.state,
  );
const phase = () => state().then((value) => value?.phase);
const menu = async () => {
  if (
    (await page.locator(".sidebar-demo").getAttribute("aria-expanded")) !==
    "true"
  )
    await page.locator(".sidebar-demo").click();
  await expect(page.locator(".sidebar-demo")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.locator(".demo-menu")).toBeVisible();
};
const waitPhase = async (expected) =>
  expect.poll(phase, { timeout: 7000 }).toBe(expected);
const reset = async () => {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+R");
  await waitPhase("idle");
  await expect(page).toHaveURL(`${baseURL}/dashboard`);
};

try {
  await page.goto(`${baseURL}/dashboard`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Scout", exact: false }).first(),
  ).toBeVisible();

  await reset();
  console.log("CHECK reset complete");
  await menu();
  await page
    .locator(".demo-menu")
    .getByRole("button", { name: "Start run", exact: true })
    .click();
  await waitPhase("matching");
  console.log("CHECK run started");
  await menu();
  const beforeDoubleRun = (await state()).clock;
  await page
    .locator(".demo-menu")
    .getByRole("button", { name: "Start run", exact: true })
    .click();
  await waitPhase("matching");
  assert.ok(
    (await state()).clock >= beforeDoubleRun,
    "Repeated Run must not reset the matching clock.",
  );
  await menu();
  await page
    .locator(".demo-menu")
    .getByRole("button", { name: /^Pause/ })
    .click();
  const paused = await state();
  assert.equal(paused.paused, true);
  await page.waitForTimeout(900);
  assert.equal(
    (await state()).clock,
    paused.clock,
    "Pause must freeze the virtual clock.",
  );
  await page
    .locator(".demo-menu")
    .getByRole("button", { name: "4×", exact: true })
    .click();
  assert.equal((await state()).speed, 4);
  await page
    .locator(".demo-menu")
    .getByRole("button", { name: /^Resume/ })
    .click();
  await page.keyboard.press("Escape");
  await waitPhase("running");
  console.log("CHECK fleet running");
  await page.keyboard.press("Space");
  assert.equal((await state()).paused, true);
  const runningPaused = await state();
  await page.reload();
  await expect(page.locator(".live-header-actions")).toContainText("Paused");
  assert.equal((await state()).paused, true);
  assert.equal((await state()).clock, runningPaused.clock);
  assert.equal((await state()).speed, 4);
  await page.keyboard.press("Space");
  await page.waitForTimeout(750);
  assert.ok(
    (await state()).clock > runningPaused.clock,
    "Resume must advance the restored run.",
  );
  await menu();
  await page
    .locator(".demo-menu")
    .getByRole("button", { name: "Skip to results", exact: true })
    .click();
  await waitPhase("complete");
  await expect(page).toHaveURL(`${baseURL}/tests/playground/report`);
  await expect(page.locator(".report-page")).toContainText("74");
  console.log(
    "PASS reset / start / repeated run / pause / resume / speed / refresh / skip",
  );

  await page.keyboard.press("Meta+k");
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search commands" })
    .fill("Open Scout");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${baseURL}/scout`);
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).not.toBeVisible();
  await expect(page.getByRole("heading", { name: /Your users/ })).toBeVisible();
  await page.keyboard.press("p");
  await expect(page.locator(".app-shell")).toHaveClass(/presentation/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-shell")).not.toHaveClass(/presentation/);
  console.log("PASS command palette / presentation / Escape");

  await reset();
  await page.goto(`${baseURL}/new-test`);
  await menu();
  await page
    .locator(".demo-menu")
    .getByRole("button", { name: "8×", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Build test plan", exact: false })
    .click();
  await expect(page.locator(".engine-wrap")).toBeVisible();
  await waitPhase("plan");
  await expect(page).toHaveURL(`${baseURL}/tests/playground/plan`);
  await page.getByRole("button", { name: "Run test", exact: false }).click();
  await waitPhase("running");
  await waitPhase("complete");
  await page.goto(`${baseURL}/tests/playground/report`);
  await expect(page.locator(".report-page")).toContainText("74");
  await page
    .getByRole("button", {
      name: /Create version 2|Create Version 2|Run version 2|Retest version 2/,
    })
    .first()
    .click();
  await expect(page).toHaveURL(`${baseURL}/tests/playground/changes`);
  await page.getByRole("button", { name: /Apply 3 changes & retest/ }).click();
  await waitPhase("v2-complete");
  assert.equal((await state()).version, 2);
  console.log("PASS full engine / matching / running / analysis / V2 loop");

  for (const path of [
    "/dashboard",
    "/new-test",
    "/tests/playground/overview",
    "/tests/playground/changes",
    "/projects/atlas",
    "/projects/flux",
    "/projects/northstar",
    "/tests/playground/plan",
    "/tests/playground/live",
    "/tests/playground/sessions",
    "/tests/playground/simulations",
    "/tests/playground/participants",
    "/tests/playground/evidence",
    "/tests/playground/findings",
    "/tests/playground/report",
    "/tests/playground/compare",
    "/testers",
    "/scout",
    "/settings",
  ]) {
    await page.goto(`${baseURL}${path}`);
    await expect(page.locator(".route-surface")).toBeVisible();
    await expect(page.locator(".route-surface")).not.toHaveText("");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  }
  console.log("PASS 19 direct routes / desktop overflow");

  await reset();
  await page.goto(`${baseURL}/tests/playground/report`);
  await waitPhase("complete");
  await expect(page.locator(".report-page")).toContainText("74");
  await reset();
  await page.goto(`${baseURL}/new-test`);
  await menu();
  await page
    .locator(".demo-menu")
    .getByRole("button", { name: "1×", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Build test plan", exact: false })
    .click();
  await expect(page.locator(".engine-wrap")).toBeVisible();
  await page.reload();
  await expect(page.locator(".engine-wrap")).toBeVisible();
  await waitPhase("plan");
  await expect(page).toHaveURL(`${baseURL}/tests/playground/plan`);
  await menu();
  await page
    .locator(".demo-menu")
    .getByRole("button", { name: "8×", exact: true })
    .click();
  await page
    .locator(".demo-menu")
    .getByRole("button", { name: "Replay analysis", exact: true })
    .click();
  await expect(page.locator(".engine-wrap")).toBeVisible();
  await waitPhase("plan");
  await expect(page).toHaveURL(`${baseURL}/tests/playground/plan`);
  console.log(
    "PASS direct report recovery / engine refresh / global replay analysis",
  );

  assert.deepEqual(pageErrors, [], "No uncaught browser errors should occur.");
  console.log("PASS no uncaught browser errors");
} finally {
  await browser.close();
}
