import { randomUUID } from "node:crypto";
import { runBrowser } from "./browser.mjs";
import { POLICY_VERSION, EVALUATOR_VERSION } from "./evaluators.mjs";
import {
  permittedUrl,
  resolveTarget,
  validateSpec,
  WorkerError,
} from "./security.mjs";

const timestamp = () => new Date().toISOString();
const terminal = new Set(["completed", "failed", "cancelled", "timed-out"]);
export class TwinQueue {
  constructor(store, artifacts, env = process.env, runner = runBrowser) {
    this.store = store;
    this.artifacts = artifacts;
    this.env = env;
    this.runner = runner;
    this.pending = [];
    this.active = new Map();
    this.closed = false;
    this.starting = false;
    this.creationLock = Promise.resolve();
  }
  async init() {
    for (const record of await this.store.list()) {
      if (record.job.status === "running") {
        record.job.status = "failed";
        record.job.error =
          "The browser worker restarted. Completed evidence was preserved; retry explicitly to run a new attempt.";
        for (const run of record.job.runs)
          if (run.status === "running" || run.status === "queued") {
            run.status = "failed";
            run.error = "Worker restarted before this session completed.";
            run.finishedAt = timestamp();
          }
        record.job.updatedAt = timestamp();
        await this.store.save(record);
      } else if (record.job.status === "queued")
        this.pending.push(record.job.id);
    }
    this.kick();
  }
  async create(workspaceId, sandboxId, raw, parentJobId) {
    const operation = this.creationLock
      .catch(() => {})
      .then(() =>
        this.store.withCreateLock(() =>
          this.createLocked(workspaceId, sandboxId, raw, parentJobId),
        ),
      );
    this.creationLock = operation;
    return operation;
  }
  async createLocked(workspaceId, sandboxId, raw, parentJobId) {
    const spec = validateSpec(raw, this.env);
    spec.policyVersion = POLICY_VERSION;
    spec.evaluatorVersion = EVALUATOR_VERSION;
    if (!/^[\w-]{1,100}$/.test(sandboxId || ""))
      throw new WorkerError(422, "Provide a valid sandbox ID.");
    if (spec.mode === "behavioural" && !this.env.OPENAI_API_KEY)
      throw new WorkerError(
        503,
        "Configure the decision model on the browser worker.",
      );
    for (const origin of spec.allowedOrigins)
      await resolveTarget(
        permittedUrl(origin, spec.allowedOrigins, this.env),
        this.env,
      );
    const existing = await this.store.list(),
      recent = existing.filter(
        (x) =>
          x.workspaceId === workspaceId &&
          Date.now() - Date.parse(x.job.createdAt) < 3600000,
      );
    if (recent.length >= Number(this.env.TWIN_MAX_JOBS_PER_WORKSPACE_HOUR || 6))
      throw new WorkerError(
        429,
        "The hourly workspace campaign limit has been reached.",
      );
    if (existing.filter((x) => !terminal.has(x.job.status)).length >= 8)
      throw new WorkerError(
        429,
        "The worker queue is full. Try after a campaign finishes.",
      );
    const dailyReserved = existing
      .filter(
        (x) =>
          x.job.spec.mode === "behavioural" &&
          Date.now() - Date.parse(x.job.createdAt) < 86400000,
      )
      .reduce((sum, x) => sum + x.job.spec.settings.maxCostUsd, 0);
    const dailyLimit = Number(this.env.TWIN_DAILY_MODEL_BUDGET_USD || 2);
    if (!Number.isFinite(dailyLimit) || dailyLimit < 0)
      throw new WorkerError(503, "The daily model budget is invalid.");
    if (
      spec.mode === "behavioural" &&
      dailyReserved + spec.settings.maxCostUsd > dailyLimit
    )
      throw new WorkerError(
        429,
        "The daily behavioural model budget is reserved. Try after the budget window resets.",
      );
    if (parentJobId) await this.get(workspaceId, parentJobId);
    const createdAt = timestamp(),
      job = {
        id: `twin-${randomUUID()}`,
        sandboxId,
        status: "queued",
        createdAt,
        updatedAt: createdAt,
        spec,
        runs: [],
        issues: [],
        ...(parentJobId ? { parentJobId } : {}),
      };
    for (let index = 0; index < spec.settings.runCount; index++) {
      const persona =
        spec.personas[
          (index + Math.abs(spec.settings.seed)) % spec.personas.length
        ];
      job.runs.push({
        id: `run-${randomUUID()}`,
        personaId: persona.id,
        status: "queued",
        createdAt,
        taskResults: [],
        events: [],
        artifacts: [],
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          modelCalls: 0,
          model: spec.settings.model,
        },
      });
    }
    await this.store.save({ workspaceId, job });
    this.pending.push(job.id);
    this.kick();
    return job;
  }
  async get(workspaceId, id) {
    const record = await this.store.get(id);
    if (!record || record.workspaceId !== workspaceId)
      throw new WorkerError(404, "Run not found in this workspace.");
    return record;
  }
  async cancel(workspaceId, id) {
    await this.get(workspaceId, id);
    const record = await this.store.mutate(id, (current) => {
      if (terminal.has(current.job.status)) return;
      current.job.status = "cancelled";
      for (const run of current.job.runs)
        if (run.status === "queued") {
          run.status = "cancelled";
          run.finishedAt = timestamp();
        }
    });
    this.active.get(id)?.abort();
    this.pending = this.pending.filter((x) => x !== id);
    return record.job;
  }
  async retry(workspaceId, id) {
    const record = await this.get(workspaceId, id);
    if (!["failed", "cancelled", "timed-out"].includes(record.job.status))
      throw new WorkerError(
        409,
        "Retry is available for failed, timed out or cancelled campaigns.",
      );
    return this.create(workspaceId, record.job.sandboxId, record.job.spec, id);
  }
  async retest(workspaceId, id, spec) {
    const record = await this.get(workspaceId, id);
    if (!terminal.has(record.job.status))
      throw new WorkerError(409, "Wait for the original campaign to finish.");
    return this.create(workspaceId, record.job.sandboxId, spec, id);
  }
  kick() {
    if (
      this.closed ||
      this.starting ||
      this.active.size ||
      !this.pending.length
    )
      return;
    this.starting = true;
    queueMicrotask(async () => {
      try {
        if (this.active.size || !this.pending.length) return;
        const id = this.pending.shift();
        const controller = new AbortController();
        this.active.set(id, controller);
        await this.execute(id, controller.signal);
      } finally {
        this.starting = false;
        this.kick();
      }
    });
  }
  async execute(id, signal) {
    try {
      let record = await this.store.get(id);
      if (!record || record.job.status !== "queued") return;
      record = await this.store.mutate(id, (current) => {
        current.job.status = "running";
      });
      const ledger = record.job.runs.reduce(
        (total, run) => ({
          inputTokens: total.inputTokens + (run.usage.inputTokens || 0),
          outputTokens: total.outputTokens + (run.usage.outputTokens || 0),
          costUsd: total.costUsd + (run.usage.costUsd || 0),
          modelCalls: total.modelCalls + run.usage.modelCalls,
        }),
        { inputTokens: 0, outputTokens: 0, costUsd: 0, modelCalls: 0 },
      );
      let modelLock = Promise.resolve();
      const withModelLock = (operation) => {
        const next = modelLock.catch(() => {}).then(operation);
        modelLock = next;
        return next;
      };
      const persist = (run) =>
        this.store.mutate(id, (current) => {
          const index = current.job.runs.findIndex((x) => x.id === run.id);
          current.job.runs[index] = structuredClone(run);
        });
      const addIssue = (value) =>
        this.store.mutate(id, (current) => {
          const prior = current.job.issues.find(
            (x) =>
              x.category === value.category &&
              x.ruleId === value.ruleId &&
              x.title === value.title &&
              x.affectedUrl === value.affectedUrl,
          );
          if (prior)
            for (const key of [
              "taskIds",
              "sourceRunIds",
              "sourceEventIds",
              "artifactIds",
            ])
              prior[key] = [...new Set([...prior[key], ...value[key]])];
          else current.job.issues.push(value);
        });
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < record.job.runs.length && !signal.aborted) {
          const run = record.job.runs[nextIndex++];
          await this.runner(record, run, {
            env: this.env,
            signal,
            artifacts: this.artifacts,
            persist,
            addIssue,
            ledger,
            withModelLock,
          });
        }
      };
      await Promise.all(
        Array.from(
          {
            length: Math.min(
              record.job.spec.settings.concurrency,
              Number(this.env.TWIN_MAX_CONCURRENCY || 2),
            ),
          },
          worker,
        ),
      );
      await this.store.mutate(id, (current) => {
        if (signal.aborted || current.job.status === "cancelled") {
          current.job.status = "cancelled";
          for (const run of current.job.runs)
            if (!terminal.has(run.status)) {
              run.status = "cancelled";
              run.finishedAt = timestamp();
            }
        } else if (current.job.runs.some((x) => x.status === "timed-out"))
          current.job.status = "timed-out";
        else if (current.job.runs.some((x) => x.status === "failed"))
          current.job.status = "failed";
        else current.job.status = "completed";
      });
    } catch (error) {
      await this.store
        .mutate(id, (current) => {
          current.job.status = signal.aborted ? "cancelled" : "failed";
          current.job.error =
            error instanceof WorkerError
              ? error.message
              : "The browser worker could not finish this campaign.";
        })
        .catch(() => {});
    } finally {
      this.active.delete(id);
    }
  }
  async close() {
    this.closed = true;
    for (const controller of this.active.values()) controller.abort();
    while (this.active.size)
      await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
