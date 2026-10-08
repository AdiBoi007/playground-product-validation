import { describe, expect, it } from "vitest";
import {
  evidence,
  findings,
  sessions,
  specialistSession,
  v2Evidence,
  v2Sessions,
} from "../data/demo";
import {
  getCounts,
  getCurrentEvidence,
  getMetrics,
  getSessionStatus,
} from "./selectors";
import { createDemoStore, parseStoredState } from "./store";

describe("canonical demo data", () => {
  it("derives both report scores from the behavioral cohort", () => {
    expect(getMetrics()).toMatchObject({
      score: 74,
      comprehension: 84,
      usability: 79,
      trust: 63,
      purchaseIntent: 59,
      clarity: 52,
      ctaRate: 88,
      completed: 25,
    });
    expect(getMetrics(50, 2)).toMatchObject({
      score: 86,
      comprehension: 93,
      usability: 87,
      trust: 74,
      purchaseIntent: 72,
      clarity: 81,
      ctaRate: 100,
      completed: 25,
    });
    expect(getMetrics(0)).toMatchObject({
      score: 0,
      completed: 0,
      confidence: 0,
    });
    expect(getMetrics(15).comprehension).toBeGreaterThan(0);
    expect(getMetrics(15).completed).toBe(0);
  });

  it("uses coherent Boolean rates and conclusion support", () => {
    const behavior = sessions.filter((session) =>
      ["ai", "human"].includes(session.source),
    );
    expect(behavior.filter((session) => session.ctaFound)).toHaveLength(22);
    expect(
      behavior.filter((session) => session.aiHumanUnderstood),
    ).toHaveLength(13);
    expect(
      behavior.filter((session) => session.findingIds.includes("pricing")),
    ).toHaveLength(8);
    expect(
      sessions.filter(
        (session) =>
          session.source === "ai" && session.findingIds.includes("value"),
      ),
    ).toHaveLength(17);
    expect(
      sessions.filter(
        (session) =>
          session.source === "human" && session.findingIds.includes("value"),
      ),
    ).toHaveLength(4);
    expect(
      sessions.filter(
        (session) =>
          session.source === "expert" && session.findingIds.includes("value"),
      ),
    ).toHaveLength(2);
    expect(findings.filter((finding) => finding.resolvedV2)).toHaveLength(4);
    expect(
      findings
        .filter(
          (finding) =>
            !finding.resolvedV2 &&
            ["critical", "high", "medium"].includes(finding.severity),
        )
        .map((finding) => finding.id),
    ).toEqual(["trust"]);
  });

  it("keeps every V1 and V2 evidence reference resolvable and reciprocal", () => {
    const findingIds = new Set(findings.map((finding) => finding.id));
    for (const [cohort, items] of [
      [sessions.concat(specialistSession), evidence],
      [v2Sessions, v2Evidence],
    ] as const) {
      const sessionMap = new Map(
        cohort.map((session) => [session.id, session]),
      );
      const evidenceMap = new Map(items.map((item) => [item.id, item]));
      expect(evidenceMap.size).toBe(items.length);
      for (const session of cohort) {
        expect(session.evidenceIds.length).toBeGreaterThan(0);
        for (const id of session.evidenceIds)
          expect(evidenceMap.get(id)?.sessionId).toBe(session.id);
      }
      for (const item of items) {
        const session = sessionMap.get(item.sessionId);
        expect(session).toBeDefined();
        expect(session?.evidenceIds).toContain(item.id);
        expect(item.at).toBeGreaterThanOrEqual(session!.startedAt);
        expect(item.at).toBeLessThanOrEqual(
          session!.startedAt + session!.duration,
        );
        for (const id of item.findingIds) {
          expect(findingIds.has(id)).toBe(true);
          expect(session?.findingIds).toContain(id);
        }
      }
    }
    for (const finding of findings) {
      expect(finding.evidenceIds.length).toBeGreaterThan(0);
      for (const id of finding.evidenceIds)
        expect(evidence.find((item) => item.id === id)?.findingIds).toContain(
          finding.id,
        );
    }
  });

  it("finishes cohorts at the intended time and only exposes arrived evidence", () => {
    const behavior = sessions.filter((session) =>
      ["ai", "human"].includes(session.source),
    );
    expect(
      behavior.every(
        (session) => getSessionStatus(session, 42) === "completed",
      ),
    ).toBe(true);
    expect(getCounts(45)).toMatchObject({
      total: 27,
      completed: 27,
      ai: 20,
      human: 5,
      expert: 2,
      specialist: 1,
    });
    expect(getCounts(0).queued).toBeGreaterThan(0);
    expect(getCurrentEvidence(20).every((item) => item.at <= 20)).toBe(true);
    expect(getCurrentEvidence(20).length).toBeLessThan(evidence.length);
    for (const session of sessions) {
      expect(session.events[0].at).toBe(0);
      expect(session.events.at(-1)?.at).toBe(session.duration);
      for (const event of session.events) {
        expect(event.x).toBeGreaterThanOrEqual(0);
        expect(event.x).toBeLessThanOrEqual(100);
        expect(event.y).toBeGreaterThanOrEqual(0);
        expect(event.y).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("demo state machine", () => {
  const makeStore = () =>
    createDemoStore({ storage: null, autoTick: false, now: () => 0 });

  it("runs the whole question → strategy → session → verdict → retest loop", () => {
    const store = makeStore();
    store.startAnalysis();
    store.advanceBy(4999);
    expect(store.getSnapshot().phase).toBe("analysing");
    store.advanceBy(1);
    expect(store.getSnapshot()).toMatchObject({ phase: "plan", clock: 0 });
    store.startRun();
    store.advanceBy(4000);
    expect(store.getSnapshot()).toMatchObject({ phase: "running", clock: 0 });
    store.advanceBy(45000);
    expect(store.getSnapshot()).toMatchObject({
      phase: "analysing-results",
      clock: 45,
    });
    store.advanceBy(5000);
    expect(store.getSnapshot()).toMatchObject({ phase: "complete", clock: 50 });
    store.retest();
    store.advanceBy(8000);
    expect(store.getSnapshot()).toMatchObject({
      phase: "v2-complete",
      clock: 50,
      version: 2,
    });
    store.destroy();
  });

  it("handles repeated clicks, time overshoot, pause, speeds, and instant recovery", () => {
    const store = makeStore();
    store.startRun();
    store.advanceBy(6000);
    expect(store.getSnapshot()).toMatchObject({ phase: "running", clock: 2 });
    store.startRun();
    expect(store.getSnapshot().clock).toBe(2);
    store.pause();
    store.advanceBy(10000);
    expect(store.getSnapshot().clock).toBe(2);
    store.setSpeed(8);
    store.resume();
    store.advanceBy(1000);
    expect(store.getSnapshot().clock).toBe(10);
    store.setSpeed(3);
    expect(store.getSnapshot().speed).toBe(8);
    store.retest();
    store.skipToResults();
    expect(store.getSnapshot()).toMatchObject({
      phase: "v2-complete",
      version: 2,
      paused: false,
    });
    store.reset();
    expect(store.getSnapshot()).toMatchObject({
      phase: "idle",
      clock: 0,
      version: 1,
      speed: 8,
    });
    store.startRun();
    store.advanceBy(100000);
    expect(store.getSnapshot()).toMatchObject({ phase: "complete", clock: 50 });
    store.destroy();
  });

  it("restores a paused run and rejects corrupt or incompatible persisted state", () => {
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
      removeItem: () => {
        raw = null;
      },
    };
    const first = createDemoStore({ storage, autoTick: false, now: () => 0 });
    first.startRun();
    first.advanceBy(14000);
    first.pause();
    const restored = createDemoStore({
      storage,
      autoTick: false,
      now: () => 0,
    });
    expect(restored.getSnapshot()).toMatchObject({
      phase: "running",
      clock: 10,
      paused: true,
    });
    expect(parseStoredState("{broken")).toBeNull();
    expect(
      parseStoredState(
        JSON.stringify({
          schema: 1,
          state: { ...restored.getSnapshot(), speed: 999 },
        }),
      ),
    ).toBeNull();
    expect(
      parseStoredState(
        JSON.stringify({
          schema: 1,
          state: { ...restored.getSnapshot(), clock: -1 },
        }),
      ),
    ).toBeNull();
    expect(
      parseStoredState(
        JSON.stringify({
          schema: 1,
          state: { ...restored.getSnapshot(), phase: "complete", clock: 10 },
        }),
      ),
    ).toBeNull();
    expect(
      parseStoredState(
        JSON.stringify({ schema: 2, state: restored.getSnapshot() }),
      ),
    ).toBeNull();
    for (const url of [
      "not a url",
      "",
      "javascript:alert(1)",
      "file:///tmp/product",
      "https://user:secret@example.com",
    ]) {
      expect(
        parseStoredState(
          JSON.stringify({
            schema: 1,
            state: { ...restored.getSnapshot(), url },
          }),
        ),
      ).toBeNull();
    }
    first.destroy();
    restored.destroy();
  });

  it("keeps the demo usable when storage access fails", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const store = createDemoStore({ storage, autoTick: false });
    expect(() => {
      store.startRun();
      store.skipToResults();
      store.reset();
    }).not.toThrow();
    expect(store.getSnapshot().phase).toBe("idle");
    store.destroy();
  });
});
