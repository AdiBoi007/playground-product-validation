import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const baseURL = process.env.PLAYGROUND_PREVIEW_URL ?? "http://localhost:4173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 15000 },
  );
  await context.setOffline(true);
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: /Make your next move count/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New test", exact: true }).click();
  await page
    .getByRole("button", { name: "Build test plan", exact: true })
    .click();
  await page.waitForURL("**/plan");
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await expect(page.locator(".live-browser-card")).toHaveCount(4, {
    timeout: 8000,
  });
  await page.goto(`${baseURL}/tests/playground/report`, {
    waitUntil: "networkidle",
  });
  await expect(page.locator(".giant-score")).toHaveText("74/100");
  assert.deepEqual(errors, []);
  console.log(
    "PASS production offline reload / engine / matching / four browsers / direct report",
  );
} finally {
  await browser.close();
}
