import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JobStore, ArtifactStore } from "../src/store.mjs";
import { TwinQueue } from "../src/queue.mjs";
import { fixtureSpec, startFixture } from "./fixtures.mjs";
const poll = async (operation, match) => {
  for (let i = 0; i < 200; i++) {
    const result = await operation();
    if (match(result)) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for queue");
};
async function setup(runner) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "twin-queue-test-")),
    fixture = await startFixture(),
    env = {
      TWIN_DATA_DIR: dir,
      TWIN_TEST_ALLOWED_ORIGINS: fixture.origin,
      TWIN_MAX_JOBS_PER_WORKSPACE_HOUR: "100",
    },
    store = new JobStore(env),
    artifacts = new ArtifactStore(env);
  await store.init();
  await artifacts.init();
  const queue = new TwinQueue(store, artifacts, env, runner);
  await queue.init();
  return {
    store,
    queue,
    env,
    fixture,
    close: async () => {
      await queue.close();
      await store.close();
      await fixture.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
test("atomic persisted jobs survive restart without rerunning completed evidence", async () => {
  const state = await setup(async (_record, run, { persist }) => {
    run.status = "completed";
    run.finishedAt = new Date().toISOString();
    await persist(run);
  });
  try {
    const job = await state.queue.create(
      "workspace",
      "sandbox",
      fixtureSpec(state.fixture.origin),
    );
    await poll(
      () => state.store.get(job.id),
      (x) => x.job.status === "completed",
    );
    await state.queue.close();
    const next = new TwinQueue(
      state.store,
      new ArtifactStore(state.env),
      state.env,
      () => {
        throw new Error("must not replay");
      },
    );
    await next.init();
    assert.equal((await next.get("workspace", job.id)).job.runs.length, 10);
    assert.equal((await next.get("workspace", job.id)).job.status, "completed");
    await next.close();
    await assert.rejects(
      state.queue.get("other-workspace", job.id),
      /not found/,
    );
  } finally {
    await state.close();
  }
});
test("cancellation stops queued sessions and retains completed observations", async () => {
  const state = await setup(async (_record, run, { signal, persist }) => {
    run.status = "running";
    await persist(run);
    await new Promise((resolve) =>
      signal.aborted
        ? resolve()
        : signal.addEventListener("abort", resolve, { once: true }),
    );
    run.status = "cancelled";
    run.finishedAt = new Date().toISOString();
    await persist(run);
  });
  try {
    const job = await state.queue.create(
      "workspace",
      "sandbox",
      fixtureSpec(state.fixture.origin),
    );
    await poll(
      () => state.store.get(job.id),
      (x) => x.job.status === "running",
    );
    await state.queue.cancel("workspace", job.id);
    const ended = await poll(
      () => state.store.get(job.id),
      (x) => x.job.runs.every((r) => r.status === "cancelled"),
    );
    assert.equal(ended.job.status, "cancelled");
    assert.equal(ended.job.runs.length, 10);
  } finally {
    await state.close();
  }
});
test("a crashed worker marks interrupted runs failed and requires explicit retry", async () => {
  const state = await setup(async () => {});
  try {
    await state.queue.close();
    const date = new Date().toISOString(),
      job = {
        id: "interrupted",
        sandboxId: "sandbox",
        status: "running",
        createdAt: date,
        updatedAt: date,
        spec: fixtureSpec(state.fixture.origin),
        runs: [
          {
            id: "run",
            personaId: "profile-0",
            status: "running",
            createdAt: date,
            taskResults: [],
            events: [],
            artifacts: [],
            usage: {
              inputTokens: 100,
              outputTokens: 10,
              costUsd: 0.000015,
              modelCalls: 1,
              model: "gpt-6-luna",
            },
          },
        ],
        issues: [],
      };
    await state.store.save({ workspaceId: "workspace", job });
    const restarted = new TwinQueue(
      state.store,
      new ArtifactStore(state.env),
      state.env,
      () => {
        throw new Error("must not replay");
      },
    );
    await restarted.init();
    const recovered = await restarted.get("workspace", "interrupted");
    assert.equal(recovered.job.status, "failed");
    assert.equal(recovered.job.runs[0].usage.inputTokens, 100);
    await restarted.close();
  } finally {
    await state.close();
  }
});
