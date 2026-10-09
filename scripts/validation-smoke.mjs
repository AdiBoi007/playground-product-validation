/* global document, window, indexedDB */
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const baseURL = process.env.PLAYGROUND_URL ?? "http://localhost:5176";
const directory = mkdtempSync(join(tmpdir(), "playground-validation-"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  acceptDownloads: true,
  serviceWorkers: "block",
});
const page = await context.newPage();
page.setDefaultTimeout(12_000);
let lastStep = "opening isolated browser";
const step = (message) => {
  lastStep = message;
  console.log(`STEP: ${message}`);
};
const deadline = setTimeout(() => {
  console.error(`Validation smoke exceeded120seconds at: ${lastStep}`);
  void browser.close();
}, 120_000);
const pageErrors = [];
context.on("page", (target) =>
  target.on("pageerror", (error) => pageErrors.push(error.message)),
);
page.on("pageerror", (error) => pageErrors.push(error.message));
let designCalls = 0;
let recommendationCalls = 0;
const concreteFix =
  "Wire the Continue button to advance to the saved-project confirmation after creation, and show a visible error if saving fails. Retest the same creation task without assistance and verify every click produces either confirmation or an actionable error.";
const missionTasks = [
  {
    id: "qa-onboarding-open",
    title: "Find the starting action",
    instructions:
      "Open the authorised prototype and locate the action for creating your first project without assistance.",
    question: "What helped you find the first action?",
    successCriteria:
      "Success means locating the create-project action without help within a proposed 60 seconds.",
  },
  {
    id: "qa-onboarding-create",
    title: "Create a first project",
    instructions:
      "Create a project using fictional test data, without assistance, and stop before purchases or irreversible actions.",
    question: "Where did you get stuck creating the project?",
    successCriteria:
      "Success means a saved project confirmation without help; record errors, abandonment or assistance separately.",
  },
  {
    id: "qa-onboarding-confirm",
    title: "Confirm the saved result",
    instructions:
      "Return to the project list and open your saved test project without requesting assistance.",
    question: "How did you know your project was saved?",
    successCriteria:
      "Success means opening the saved test project from the list without assistance.",
  },
];
await context.route("**/api/experiments", async (route) => {
  if (route.request().method() === "GET")
    return route.fulfill({ json: { configured: true } });
  designCalls++;
  const value = route.request().postDataJSON();
  const questions = ["audience", "decision", "desiredOutcome"]
    .filter((field) => !value.brief[field])
    .map((field) => ({
      field,
      question: `Provide the ${field} needed for this specific experiment.`,
    }));
  if (questions.length)
    return route.fulfill({ json: { clarifications: questions } });
  assert.equal(value.brief.focus, "Onboarding");
  assert.equal(value.brief.successThreshold, 80);
  return route.fulfill({
    json: {
      tasks: missionTasks,
      method: "ai",
      createdAt: new Date().toISOString(),
    },
  });
});
await context.route("**/api/sandbox", async (route) => {
  assert.equal(
    route.request().method(),
    "GET",
    "Smoke test must not invoke paid research",
  );
  return route.fulfill({ json: { configured: true } });
});
await context.route("**/api/validation-findings", async (route) => {
  assert.equal(route.request().method(), "POST");
  recommendationCalls++;
  const input = route.request().postDataJSON();
  assert.equal(input.observations.length, 15);
  assert.equal(
    JSON.stringify(input).includes("Validation QA"),
    false,
    "Provider input exposes participant names",
  );
  const adverse = input.observations.filter(
    (observation) =>
      observation.outcome !== "success" || observation.severity !== "none",
  );
  assert.ok(adverse.length <= 1);
  return route.fulfill({
    json: {
      findings: adverse.length
        ? [
            {
              id: "qa-continue-fix",
              title: "Continue does not advance after project creation",
              severity: "major",
              description: adverse[0].observation,
              recommendation: concreteFix,
              sourceIds: [adverse[0].id],
              taskIds: [adverse[0].taskId],
            },
          ]
        : [],
      method: adverse.length ? "ai" : "structured",
      generatedAt: new Date().toISOString(),
    },
  });
});
const readDatabase = (database, store, key) =>
  page.evaluate(
    ({ database, store, key }) =>
      new Promise((resolve, reject) => {
        let connection;
        const finish = (error, value) => {
          clearTimeout(timer);
          connection?.close();
          if (error) reject(error);
          else resolve(value);
        };
        const timer = setTimeout(
          () => finish(new Error(`Reading ${database}/${store} timed out.`)),
          12_000,
        );
        const request = indexedDB.open(database, 1);
        request.onblocked = () =>
          finish(new Error(`${database} is blocked by another connection.`));
        request.onerror = () => finish(request.error);
        request.onsuccess = () => {
          connection = request.result;
          try {
            const transaction = connection.transaction(store);
            const collection = transaction.objectStore(store);
            const query =
              key === null ? collection.getAll() : collection.get(key);
            query.onsuccess = () => finish(null, query.result);
            query.onerror = () => finish(query.error);
            transaction.onabort = () =>
              finish(
                transaction.error || new Error("Read transaction aborted."),
              );
          } catch (error) {
            finish(error);
          }
        };
      }),
    { database, store, key },
  );
const workspace = () => readDatabase("playground-mvp", "workspace", "data");
const sandboxes = async () =>
  (await readDatabase("playground-sandboxes", "records", null)).map(
    (record) => record.sandbox,
  );
const view = async (name) => {
  await page.getByLabel("Workspace view", { exact: true }).selectOption(name);
  await page.waitForURL(name === "admin" ? "**/admin" : "**/dashboard");
};
const openSandbox = async (section) => {
  if (
    (await page.getByLabel("Workspace view", { exact: true }).inputValue()) !==
    "founder"
  )
    await view("founder");
  await page.goto(`${baseURL}/sandbox`);
  await expect(
    page.getByRole("heading", { name: "Sandbox", exact: true }),
  ).toBeVisible();
  if (section) await stage(section);
};
const stage = (name) =>
  page
    .getByRole("navigation", { name: "Validation workflow" })
    .getByRole("button", { name, exact: false })
    .click();
const operations = async (campaignId, tab = "matching") => {
  if (
    (await page.getByLabel("Workspace view", { exact: true }).inputValue()) !==
    "admin"
  )
    await view("admin");
  await page.goto(`${baseURL}/admin?campaign=${campaignId}&tab=${tab}`);
  await expect(
    page.getByRole("heading", { name: "Operations", exact: true }),
  ).toBeVisible();
};
const noOverflow = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    `Horizontal overflow: ${page.url()}`,
  );
const download = async (button, destination) => {
  const pending = page.waitForEvent("download");
  await button.click();
  const item = await pending;
  await item.saveAs(destination);
  return readFileSync(destination);
};
const currentCampaign = async () => {
  const records = await sandboxes();
  const data = await workspace();
  return data.campaigns.find(
    (campaign) => campaign.id === records[0].validation.campaignId,
  );
};
const invite = async (campaignId) => {
  await operations(campaignId);
  for (let index = 1; index <= 5; index++) {
    const card = page
      .locator(".mvp-op-tester-match")
      .filter({ hasText: `Validation QA ${index}` });
    await card
      .getByRole("button", { name: "Invite tester", exact: true })
      .click();
    await expect(card.getByText("New invitation")).toBeVisible();
  }
  await expect(
    page.getByText("5/5 slots reserved", { exact: true }),
  ).toBeVisible();
};
const missionSnapshot = (campaign) => ({
  campaignId: campaign.id,
  title: campaign.title.trim(),
  url: campaign.url.trim(),
  audience: campaign.audience.trim(),
  objective: campaign.objective.trim(),
  tasks: campaign.tasks.map((task) => ({
    id: task.id,
    title: task.title.trim(),
    instructions: task.instructions.trim(),
    question: task.question.trim(),
    ...(task.successCriteria === undefined
      ? {}
      : { successCriteria: task.successCriteria.trim() }),
  })),
});
const returnedFeedback = (campaign, assignment, participant, round) => ({
  kind: "playground-participant-feedback",
  schemaVersion: 1,
  assignmentId: assignment.id,
  campaignId: campaign.id,
  testerId: assignment.testerId,
  mission: missionSnapshot(campaign),
  consentConfirmed: true,
  submittedAt: new Date().toISOString(),
  overallFeedback:
    round === 1
      ? "The starting flow was clear, but I recorded friction where it occurred."
      : "The updated first-use flow completed smoothly without assistance.",
  results: campaign.tasks.map((task, taskIndex) => ({
    taskId: task.id,
    outcome:
      round === 1 && participant === 1 && taskIndex === 1
        ? "blocked"
        : "success",
    answer:
      round === 1 && participant === 1 && taskIndex === 1
        ? "The Continue button did not advance to the project confirmation."
        : "I completed the expected action without help using fictional test data.",
    observation:
      round === 1 && participant === 1 && taskIndex === 1
        ? "I clicked Continue twice and the page did not change; I expected a saved-project confirmation."
        : "The labelled next step responded and showed the expected project result.",
    severity:
      round === 1 && participant === 1 && taskIndex === 1 ? "major" : "none",
    durationSeconds:
      (round === 1 ? 40 + taskIndex * 20 : 20 + taskIndex * 10) + participant,
    evidence:
      taskIndex === 0
        ? [
            {
              id: `qa-evidence-${round}-${participant}`,
              name: "QA supporting recording",
              kind: "link",
              url: `https://example.org/validation-recording/round-${round}/participant-${participant}`,
            },
          ]
        : [],
  })),
});
const importFeedback = async (campaign, participant, value) => {
  const roster = page
    .locator(".mvp-op-roster-participant")
    .filter({ hasText: `Validation QA ${participant}` });
  await roster
    .getByRole("checkbox", { name: /I confirmed this response/ })
    .check();
  const file = Buffer.isBuffer(value)
    ? value
    : Buffer.from(JSON.stringify(value));
  await roster.locator('input[type="file"]').setInputFiles({
    name: `participant-${participant}.json`,
    mimeType: "application/json",
    buffer: file,
  });
  await expect
    .poll(async () => {
      const data = await workspace();
      const tester = data.profiles.find(
        (profile) => profile.name === `Validation QA ${participant}`,
      );
      return data.submissions.some(
        (submission) =>
          submission.campaignId === campaign.id &&
          submission.testerId === tester.id,
      );
    })
    .toBe(true);
};
const runPortableParticipant = async (campaign, assignment) => {
  const card = page
    .locator(".mvp-op-roster-participant")
    .filter({ hasText: "Validation QA 1" });
  const htmlPath = join(directory, `mission-round-${campaign.round}.html`);
  await download(
    card.getByRole("button", {
      name: "Download participant mission",
      exact: true,
    }),
    htmlPath,
  );
  const participantPage = await context.newPage();
  await participantPage.goto(pathToFileURL(htmlPath).href);
  await participantPage.locator("#consent").check();
  for (let taskIndex = 0; taskIndex < campaign.tasks.length; taskIndex++) {
    const fixture = returnedFeedback(campaign, assignment, 1, campaign.round)
      .results[taskIndex];
    await participantPage
      .locator(`[name="outcome-${taskIndex}"]`)
      .selectOption(fixture.outcome);
    await participantPage
      .locator(`[name="seconds-${taskIndex}"]`)
      .fill(String(fixture.durationSeconds));
    await participantPage
      .locator(`[name="severity-${taskIndex}"]`)
      .selectOption(fixture.severity);
    await participantPage
      .locator(`[name="answer-${taskIndex}"]`)
      .fill(fixture.answer);
    await participantPage
      .locator(`[name="observation-${taskIndex}"]`)
      .fill(fixture.observation);
    if (taskIndex === 0)
      await participantPage
        .locator(`[name="link-${taskIndex}"]`)
        .fill(fixture.evidence[0].url);
  }
  await participantPage
    .locator('[name="overall"]')
    .fill(
      "I attempted every task with fictional data and documented the observed result without assistance.",
    );
  const pending = participantPage.waitForEvent("download");
  await participantPage
    .getByRole("button", { name: "Download feedback JSON", exact: true })
    .click();
  const result = await pending;
  const returned = readFileSync(await result.path());
  const decoded = JSON.parse(returned.toString());
  assert.equal(decoded.assignmentId, assignment.id);
  assert.equal(decoded.consentConfirmed, true);
  assert.equal(decoded.results.length, 3);
  await participantPage.close();
  return returned;
};
const collect = async (campaign) => {
  step(`Round ${campaign.round}: portable participant missions and imports`);
  await operations(campaign.id, "review");
  await page
    .getByText("Import returned participant files", { exact: true })
    .click();
  const data = await workspace();
  for (let participant = 1; participant <= 5; participant++) {
    const tester = data.profiles.find(
      (profile) => profile.name === `Validation QA ${participant}`,
    );
    const assignment = data.assignments.find(
      (item) => item.campaignId === campaign.id && item.testerId === tester.id,
    );
    const returned =
      participant === 1
        ? await runPortableParticipant(campaign, assignment)
        : returnedFeedback(campaign, assignment, participant, campaign.round);
    await importFeedback(campaign, participant, returned);
  }
  assert.equal(
    (await workspace()).submissions.filter(
      (item) => item.campaignId === campaign.id && item.status === "approved",
    ).length,
    0,
  );
  await openSandbox("Evidence & analytics");
  await expect(
    page
      .locator(".sv-metrics")
      .getByText("Not yet tested", { exact: true })
      .first(),
  ).toBeVisible();
  await operations(campaign.id, "review");
  for (let index = 0; index < 5; index++) {
    await page
      .getByRole("button", { name: "Approve submission", exact: false })
      .click();
    await expect
      .poll(
        async () =>
          (await workspace()).submissions.filter(
            (item) =>
              item.campaignId === campaign.id && item.status === "approved",
          ).length,
      )
      .toBe(index + 1);
  }
  step(`Round ${campaign.round}: QA complete, reviewed report and fixes`);
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await page
    .getByRole("button", { name: "Synthesize approved feedback", exact: true })
    .click();
  await expect(page.getByLabel("Founder summary")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Generate evidence-backed fixes",
      exact: true,
    })
    .click();
  await expect
    .poll(
      async () =>
        (await workspace()).reports.find(
          (report) => report.campaignId === campaign.id,
        )?.method,
    )
    .toBe(campaign.round === 1 ? "ai" : "structured");
  await expect
    .poll(
      async () =>
        (await workspace()).reports.find(
          (report) => report.campaignId === campaign.id,
        )?.findings.length,
    )
    .toBe(campaign.round === 1 ? 1 : 0);
  const proposed = (await workspace()).reports.find(
    (report) => report.campaignId === campaign.id,
  );
  assert.equal(
    proposed.status,
    "draft",
    "AI recommendations must remain unpublished until reviewed",
  );
  if (campaign.round === 1)
    assert.equal(proposed.findings[0].recommendation, concreteFix);
  await page
    .getByRole("button", { name: "Publish to founder", exact: false })
    .click();
  await expect
    .poll(async () =>
      (await workspace()).reports.some(
        (report) =>
          report.campaignId === campaign.id && report.status === "published",
      ),
    )
    .toBe(true);
};
const startCheckout = async () => {
  await stage("Run test");
  await page
    .getByRole("button", { name: "Start simulated checkout", exact: false })
    .click();
  await expect.poll(async () => (await currentCampaign()).payment).toBe("paid");
};

try {
  step(`Opening ${baseURL}/sandbox`);
  mkdirSync("docs/screenshots", { recursive: true });
  await page.goto(`${baseURL}/sandbox`);
  await expect(
    page.getByRole("heading", {
      name: "What do you need to validate?",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Design experiment", exact: false })
    .click();
  await expect(
    page.getByText("Complete the brief", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: /^Product input/ })
    .selectOption("web-app");
  await page
    .getByLabel("Product or prototype URL", { exact: true })
    .fill("https://example.org/onboarding");
  await page
    .getByLabel("Product description", { exact: true })
    .fill(
      "A prototype where freelance designers create and revisit their first project.",
    );
  await page
    .getByLabel("Target users", { exact: true })
    .fill("Freelance designers using a desktop browser for the first time.");
  await page
    .getByLabel("Biggest assumption", { exact: true })
    .fill("New users can create their first project without assistance.");
  await page
    .getByLabel("Decision to make", { exact: true })
    .fill("Ship onboarding or fix the first-use flow before launch.");
  await page
    .getByLabel("Desired outcome", { exact: true })
    .fill("Create and reopen a first project without assistance.");
  await page
    .getByRole("button", { name: "Design experiment", exact: false })
    .click();
  await expect(page.locator(".sv-task-editor")).toHaveCount(3);
  await page
    .locator(".sv-task-editor")
    .first()
    .getByLabel("Task title", { exact: true })
    .fill("Locate the project starting action");
  await page
    .getByRole("button", { name: "Approve & create test", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Run the experiment", exact: true }),
  ).toBeVisible();
  const firstCampaign = await currentCampaign();
  step("Round1: approved mission, checkout and recruitment");
  assert.equal(
    firstCampaign.tasks[0].title,
    "Locate the project starting action",
  );
  assert.equal(firstCampaign.tasksApproved, true);
  await startCheckout();
  await operations(firstCampaign.id);
  for (let participant = 1; participant <= 5; participant++) {
    await page.getByRole("button", { name: "Add tester", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Add a tester",
      exact: true,
    });
    await dialog
      .getByLabel("Tester name", { exact: true })
      .fill(`Validation QA ${participant}`);
    await dialog
      .getByLabel("Expertise", { exact: true })
      .fill("Product design, onboarding");
    await dialog
      .getByRole("button", { name: "Save tester", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
  }
  await invite(firstCampaign.id);
  await collect(firstCampaign);
  step("Round1: evidence analytics and interactive filters");
  await openSandbox("Evidence & analytics");
  await expect(
    page.locator(".sv-metrics").getByText("93.3%", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".sv-metrics").getByText("63s", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sv-verdict")).toHaveText("Modify");
  await expect(page.locator(".sv-issue")).toHaveCount(1);
  await page
    .locator(".sv-issue")
    .getByRole("button", { name: /inspect/ })
    .click();
  await expect(page.locator(".sv-evidence-item")).toHaveCount(1);
  await expect(page.locator(".sv-evidence-item")).toContainText(
    "Continue twice",
  );
  await page
    .getByRole("button", { name: "Show all evidence", exact: true })
    .click();
  await expect(page.locator(".sv-evidence-item")).toHaveCount(15);
  const histogram = page.locator(".sv-histogram");
  await expect(histogram.getByRole("button")).toHaveCount(5);
  await expect(histogram.getByRole("button").nth(2)).toHaveAttribute(
    "aria-label",
    "5 task attempts, 36 to under 54 seconds. View evidence.",
  );
  await histogram.getByRole("button").nth(2).click();
  await expect(page.locator(".sv-evidence-item")).toHaveCount(5);
  for (const evidence of await page.locator(".sv-evidence-item").all()) {
    await expect(evidence).toBeVisible();
    await expect(evidence).toContainText("starting action");
  }
  await histogram.getByRole("button").first().click();
  await expect(page.locator(".sv-evidence-item")).toHaveCount(0);
  await expect(
    page.getByText("No observations match this filter.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show all evidence", exact: true })
    .click();
  const participantData = await workspace();
  const failedTesterId = participantData.profiles.find(
    (profile) => profile.name === "Validation QA 1",
  ).id;
  const anonymousParticipant = `Participant ${
    participantData.profiles
      .filter((profile) => profile.role === "tester")
      .map((profile) => profile.id)
      .sort()
      .indexOf(failedTesterId) + 1
  }`;
  await page
    .getByRole("combobox", { name: /^Participant/ })
    .selectOption(anonymousParticipant);
  await expect(page.locator(".sv-evidence-item")).toHaveCount(3);
  await expect(page.locator(".sv-task-bar").nth(1)).toContainText("0/1");
  await expect(histogram.getByRole("button").nth(2)).toHaveAttribute(
    "aria-label",
    "1 task attempts, 34 to under 51 seconds. View evidence.",
  );
  await page
    .getByRole("combobox", { name: /^Participant/ })
    .selectOption("all");
  await page
    .getByRole("combobox", { name: /^Outcome/ })
    .selectOption("blocked");
  await expect(page.locator(".sv-evidence-item")).toHaveCount(1);
  await page.getByRole("combobox", { name: /^Outcome/ }).selectOption("all");
  await page.screenshot({
    path: "docs/screenshots/validation.png",
    fullPage: true,
  });
  await stage("Report & retest");
  const artifacts = new Map();
  for (const format of [
    "PDF",
    "DOCX",
    "PPTX",
    "XLSX",
    "CSV",
    "JSON",
    "JSONL",
    "Web report",
    "MARKDOWN",
  ]) {
    step(`Round1: ${format} export`);
    const bytes = await download(
      page.getByRole("button", { name: format, exact: true }),
      join(directory, `report-${format.replaceAll(" ", "-")}`),
    );
    assert.ok(bytes.length > 100, `${format} export is empty`);
    if (["DOCX", "PPTX", "XLSX"].includes(format))
      assert.equal(bytes.subarray(0, 2).toString(), "PK");
    if (format === "PDF")
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    artifacts.set(format, bytes);
  }
  const exported = JSON.parse(artifacts.get("JSON").toString());
  assert.equal(exported.metrics.successRate, 93.3);
  assert.equal(exported.metrics.success, 14);
  assert.equal(exported.metrics.attempts, 15);
  assert.equal(exported.metrics.medianSeconds, 63);
  assert.equal(exported.observations.length, 15);
  assert.equal(exported.verdict.status, "Modify");
  assert.equal(exported.issues[0].recommendation, concreteFix);
  assert.equal(exported.report.method, "ai");
  assert.equal(
    JSON.stringify(exported).includes("Validation QA"),
    false,
    "Shared export exposes participant names",
  );
  assert.match(artifacts.get("Web report").toString(), /93\.3%/);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  step("Round1: verifying PDF content and sections");
  const pdfLoading = pdfjs.getDocument({
    data: new Uint8Array(artifacts.get("PDF")),
    disableFontFace: true,
    useSystemFonts: true,
  });
  const pdf = await pdfLoading.promise;
  const pdfText = [];
  for (let index = 1; index <= pdf.numPages; index++)
    pdfText.push(
      (await (await pdf.getPage(index)).getTextContent()).items
        .map((item) => item.str || "")
        .join(" "),
    );
  assert.ok(pdf.numPages >= 10, "PDF misses dossier sections");
  assert.match(pdfText.join("\n"), /93\.3%/);
  assert.match(pdfText.join("\n"), /Evidence Appendix/);
  await pdfLoading.destroy();
  step("Round2: creating and approving retest");
  await page
    .getByLabel("Changed product URL", { exact: true })
    .fill("https://example.org/onboarding/v2");
  await page
    .getByLabel("Changes to test", { exact: true })
    .fill(
      "Fixed the Continue control so it advances and confirms the saved project.",
    );
  await page
    .getByRole("button", { name: "Create next round", exact: false })
    .click();
  await expect.poll(async () => (await currentCampaign()).round).toBe(2);
  const secondCampaign = await currentCampaign();
  assert.equal(secondCampaign.round, 2);
  assert.equal(secondCampaign.parentCampaignId, firstCampaign.id);
  await stage("Experiment");
  await page
    .getByRole("button", { name: "Approve & create test", exact: false })
    .click();
  await startCheckout();
  await invite(secondCampaign.id);
  await collect(secondCampaign);
  step("Round2: before/after comparison, saved history and mobile");
  await openSandbox("Evidence & analytics");
  await expect(
    page.locator(".sv-metrics").getByText("100%", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".sv-metrics").getByText("33s", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sv-verdict")).toHaveText("Ship");
  await stage("Report & retest");
  await expect(page.locator(".sv-comparison")).toContainText("93.3% → 100%");
  const data = await workspace();
  assert.equal(
    data.reports.filter((item) => item.status === "published").length,
    2,
  );
  assert.equal(
    data.submissions.filter((item) => item.status === "approved").length,
    10,
  );
  assert.equal(data.campaigns.length, 2);
  assert.equal(
    data.profiles.filter((item) => item.role === "tester").length,
    5,
  );
  assert.equal(
    data.submissions.filter(
      (item) =>
        item.campaignId === firstCampaign.id && item.status === "approved",
    ).length,
    5,
  );
  await page.reload();
  await stage("Evidence & analytics");
  await expect(page.locator(".sv-verdict")).toHaveText("Ship");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const section of [
    "Brief",
    "Experiment",
    "Run test",
    "Evidence & analytics",
    "Report & retest",
  ]) {
    await stage(section);
    await noOverflow();
  }
  await stage("Evidence & analytics");
  await page.screenshot({
    path: "docs/screenshots/validation-mobile.png",
    fullPage: true,
  });
  assert.equal(designCalls, 2);
  assert.equal(recommendationCalls, 2);
  assert.deepEqual(pageErrors, []);
  console.log(
    "PASS: Sandbox brief/clarification → AI draft approval → portable participant missions → identity-confirmed imports → QA-only analytics and evidence →9 exports → published retest improves14/15 to15/15; baseline preserved, mobile fits. All participant results are isolated smoke fixtures; no paid calls.",
  );
} finally {
  clearTimeout(deadline);
  await browser.close();
  rmSync(directory, { recursive: true, force: true });
}
