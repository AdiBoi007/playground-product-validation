import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { startWorker } from "../src/server.mjs";
import { runBrowser } from "../src/browser.mjs";
import { fixtureSpec, startFixture } from "./fixtures.mjs";
import { validateTwinJob, buildTwinAnalytics } from "../../../src/mvp/twin.ts";

const directory = await mkdtemp(
    path.join(os.tmpdir(), "playground-twin-browser-"),
  ),
  fixture = await startFixture();
const env = {
  TWIN_DATA_DIR: directory,
  TWIN_WORKER_SECRET: randomBytes(32).toString("hex"),
  TWIN_PORT: "0",
  TWIN_CHROME_CHANNEL: "chrome",
  TWIN_TEST_ALLOWED_ORIGINS: fixture.origin,
  TWIN_MAX_JOBS_PER_WORKSPACE_HOUR: "100",
  OPENAI_API_KEY: "fixture-key-is-never-sent",
};
// Functional runs and a deterministic injected graph policy exercise Chromium without making a paid model request.
const injectedDecision = async (state, { usage }) => {
  usage.modelCalls++;
  usage.inputTokens += 100;
  usage.outputTokens += 20;
  usage.costUsd += 0.00002;
  const selectors = state.observation.elements;
  const pick = (text) => selectors.find((x) => x.text.includes(text));
  const name = selectors.find((x) => x.tag === "input");
  if (state.observation.text.includes("Test booking saved"))
    return {
      action: "stop",
      elementId: null,
      value: null,
      key: null,
      reason: "The confirmation is visible.",
      memory: "Booking saved",
      stopReason: "completed",
    };
  if (name && state.memory === "Name entered")
    return {
      action: "click",
      elementId: pick("Confirm test booking").id,
      value: null,
      key: null,
      reason: "Confirm the synthetic test booking",
      memory: "Confirmation attempted",
      stopReason: null,
    };
  if (name)
    return {
      action: "fill",
      elementId: name.id,
      value: "Synthetic Participant",
      key: null,
      reason: "Enter fictional participant data",
      memory: "Name entered",
      stopReason: null,
    };
  return {
    action: "click",
    elementId: pick("Start booking").id,
    value: null,
    key: null,
    reason: "Open the booking form",
    memory: "Form opened",
    stopReason: null,
  };
};
const runner = (record, run, environment) =>
  runBrowser(record, run, { ...environment, decide: injectedDecision });
let worker = await startWorker(env, { runner }),
  origin = `http://127.0.0.1:${worker.server.address().port}`,
  workspace;
const request = async (pathname, body, capability = workspace?.capability) => {
  const response = await fetch(origin + pathname, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${env.TWIN_WORKER_SECRET}`,
      ...(capability ? { "X-Playground-Workspace": capability } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(`${response.status}: ${JSON.stringify(data)}`);
  return data;
};
const wait = async (id) => {
  for (let i = 0; i < 1500; i++) {
    const { job } = await request(`/jobs/${id}`);
    if (!["queued", "running"].includes(job.status))
      return validateTwinJob(job);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Browser campaign timed out");
};
try {
  workspace = await request("/workspaces", {});
  const { job: first } = await request("/jobs", {
    sandboxId: "acceptance",
    spec: fixtureSpec(fixture.origin),
  });
  const completed = await wait(first.id);
  assert.equal(completed.status, "completed", completed.error);
  assert.equal(completed.runs.length, 10);
  assert.ok(
    completed.runs.every((run) => run.taskResults[0]?.outcome === "success"),
  );
  assert.ok(
    completed.runs.every(
      (run) =>
        run.artifacts.some((x) => x.type === "trace") &&
        run.artifacts.some((x) => x.type === "screenshot"),
    ),
  );
  assert.equal(buildTwinAnalytics(completed).successRate, 100);
  assert.equal(buildTwinAnalytics(completed).costUsd, 0);
  const firstArtifact = completed.runs[0].artifacts.find(
    (x) => x.type === "screenshot",
  );
  const owned = await fetch(
    `${origin}/artifacts/${completed.id}/${firstArtifact.id}`,
    {
      headers: {
        Authorization: `Bearer ${env.TWIN_WORKER_SECRET}`,
        "X-Playground-Workspace": workspace.capability,
      },
    },
  );
  assert.equal(owned.status, 200);
  assert.equal(owned.headers.get("content-type"), "image/png");
  const other = await request("/workspaces", {}, undefined);
  const forbidden = await fetch(`${origin}/jobs/${completed.id}`, {
    headers: {
      Authorization: `Bearer ${env.TWIN_WORKER_SECRET}`,
      "X-Playground-Workspace": other.capability,
    },
  });
  assert.equal(forbidden.status, 404);
  const blockedSpec = fixtureSpec(fixture.origin);
  blockedSpec.settings.runCount = 1;
  blockedSpec.tasks[0].steps = [
    {
      id: "unsafe",
      type: "click",
      selector: "#unsafe",
      description: "Click the account control",
    },
  ];
  const { job: unsafe } = await request("/jobs", {
    sandboxId: "acceptance",
    spec: blockedSpec,
  });
  const blocked = await wait(unsafe.id);
  assert.equal(blocked.runs[0].taskResults[0].outcome, "blocked");
  assert.ok(blocked.runs[0].events.some((x) => x.type === "policy-block"));
  assert.equal(fixture.observations.destructiveRequests, 0);
  const writeSpec = fixtureSpec(fixture.origin);
  writeSpec.settings.runCount = 1;
  writeSpec.tasks[0].steps = [
    {
      id: "write",
      type: "click",
      selector: "#write",
      description: "Save a test staging record",
    },
  ];
  const { job: write } = await request("/jobs", {
    sandboxId: "acceptance",
    spec: writeSpec,
  });
  const noWrites = await wait(write.id);
  assert.ok(noWrites.runs[0].events.some((x) => x.type === "policy-block"));
  assert.equal(fixture.observations.writes, 0);
  const behaviourSpec = fixtureSpec(fixture.origin, { mode: "behavioural" });
  behaviourSpec.settings = {
    ...behaviourSpec.settings,
    runCount: 2,
    maxModelTokens: 20000,
    maxCostUsd: 0.25,
  };
  const { job: behaviour } = await request("/jobs", {
    sandboxId: "acceptance",
    spec: behaviourSpec,
  });
  const graphCompleted = await wait(behaviour.id);
  assert.ok(
    graphCompleted.runs.every((x) => x.taskResults[0].outcome === "success"),
  );
  assert.ok(graphCompleted.runs.every((x) => x.usage.modelCalls >= 4));
  // This graph policy is a test injection; never present its fixture usage as real OpenAI billing.
  const cancellationSpec = fixtureSpec(fixture.origin);
  cancellationSpec.tasks[0].steps = Array.from({ length: 30 }, (_, i) => ({
    id: `wait-${i}`,
    type: "wait",
    milliseconds: 1500,
    description: "Wait in the bounded test workflow",
  }));
  const { job: pending } = await request("/jobs", {
    sandboxId: "acceptance",
    spec: cancellationSpec,
  });
  for (let i = 0; i < 100; i++) {
    const { job } = await request(`/jobs/${pending.id}`);
    if (job.runs.some((x) => x.status === "running")) break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  await request(`/jobs/${pending.id}/cancel`, {});
  const cancelled = await wait(pending.id);
  assert.equal(cancelled.status, "cancelled");
  const retry = await request(`/jobs/${pending.id}/retry`, {});
  assert.equal(retry.job.parentJobId, pending.id);
  await request(`/jobs/${retry.job.id}/cancel`, {});
  await worker.close();
  worker = await startWorker(env, { runner });
  origin = `http://127.0.0.1:${worker.server.address().port}`;
  const persisted = validateTwinJob(
    (await request(`/jobs/${completed.id}`)).job,
  );
  assert.equal(persisted.runs.length, 10);
  assert.equal(buildTwinAnalytics(persisted).successRate, 100);
  const output = path.resolve("test-output");
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, "actual-functional-job.json"),
    JSON.stringify(completed, null, 2),
  );
  console.log(
    JSON.stringify({
      independentBrowserSessions: 10,
      successfulTasks: 10,
      storedArtifacts: completed.runs.reduce(
        (n, r) => n + r.artifacts.length,
        0,
      ),
      unsafeActionsBlocked: true,
      unapprovedWritesBlocked: true,
      behaviourGraphBrowserSessions: 2,
      capabilityIsolation: true,
      cancellation: true,
      retry: true,
      restartPreservation: true,
      paidModelCalls: 0,
    }),
  );
} finally {
  await worker.close();
  await fixture.close();
  await rm(directory, { recursive: true, force: true });
}
