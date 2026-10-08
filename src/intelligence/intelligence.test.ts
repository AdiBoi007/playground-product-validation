import { afterEach, describe, expect, it } from "vitest";
import { sessions, v2Sessions } from "../data/demo";
import { createDemoStore } from "../simulation/store";
import {
  getEvidenceCohort,
  getFindingsForVersion,
  getMetrics,
  getProjectedMetrics,
  getSessionCohort,
  getSpecialistSession,
} from "../simulation/selectors";
import { actionIds, actionMetricWeights } from "./actions";
import { buildExperiment } from "./experiments";
import { buildStrategy, getDecisionBrief, hypotheses } from "./model";
import {
  createDecisionStore,
  decisionStore,
  parseDecisionState,
} from "./store";

afterEach(() => {
  decisionStore.resetChanges();
});

describe("selectable change experiments", () => {
  it("preserves the full canonical V1/V2 endpoints and reproduces unchanged participants with no changes", () => {
    expect(getProjectedMetrics([])).toMatchObject({
      score: 74,
      comprehension: 84,
      usability: 79,
      trust: 63,
      purchaseIntent: 59,
      clarity: 52,
      ctaRate: 88,
    });
    expect(getProjectedMetrics(actionIds)).toMatchObject({
      score: 86,
      comprehension: 93,
      usability: 87,
      trust: 74,
      purchaseIntent: 72,
      clarity: 81,
      ctaRate: 100,
    });
    const unchanged = buildExperiment([]);
    const revised = buildExperiment(actionIds);
    for (let index = 0; index < 25; index++) {
      for (const metric of [
        "comprehension",
        "usability",
        "trust",
        "purchaseIntent",
        "clarity",
      ] as const) {
        expect(unchanged.sessions[index][metric]).toBe(sessions[index][metric]);
        expect(revised.sessions[index][metric]).toBe(v2Sessions[index][metric]);
      }
      expect(unchanged.sessions[index].quote).toBe(sessions[index].quote);
      expect(unchanged.sessions[index].events).toEqual(sessions[index].events);
      expect(unchanged.sessions[index].aiHumanUnderstood).toBe(
        sessions[index].aiHumanUnderstood,
      );
      expect(revised.sessions[index].aiHumanUnderstood).toBe(
        v2Sessions[index].aiHumanUnderstood,
      );
    }
  });

  it("partitions effects by change instead of replacing every subset with the full V2", () => {
    for (const metric of [
      "comprehension",
      "usability",
      "trust",
      "purchaseIntent",
      "clarity",
    ] as const) {
      expect(
        actionIds.reduce((sum, id) => sum + actionMetricWeights[id][metric], 0),
      ).toBeCloseTo(1);
    }
    const orchestration = getProjectedMetrics(["orchestration"]);
    const model = getProjectedMetrics(["model"]);
    const pricing = getProjectedMetrics(["pricing"]);
    expect(orchestration.comprehension).toBeGreaterThan(model.comprehension);
    expect(model.clarity).toBeGreaterThan(orchestration.clarity);
    expect(pricing.trust).toBeGreaterThan(model.trust);
    expect(pricing.purchaseIntent).toBeGreaterThan(model.purchaseIntent);
    for (const partial of [orchestration, model, pricing]) {
      expect(partial.score).toBeGreaterThan(74);
      expect(partial.score).toBeLessThan(86);
    }
  });

  it("keeps completed V2 stable while selections are edited, then commits only when retested", () => {
    decisionStore.resetChanges();
    const completed = getSessionCohort(2);
    for (const id of actionIds) decisionStore.toggleAction(id);
    expect(decisionStore.getSnapshot().draftActionIds).toEqual([]);
    expect(decisionStore.getSnapshot().committedActionIds).toEqual([
      ...actionIds,
    ]);
    expect(getSessionCohort(2)).toBe(completed);
    expect(getMetrics(50, 2).score).toBe(86);
    const demo = createDemoStore({
      storage: null,
      autoTick: false,
      decisions: decisionStore,
    });
    demo.retest();
    expect(decisionStore.getSnapshot().committedActionIds).toEqual([]);
    expect(getMetrics(50, 2).score).toBe(74);
    demo.skipToResults();
    expect(getDecisionBrief(2).verdict).toBe("iterate");
    expect(getDecisionBrief(2).summary).toContain("No changes were committed");
    demo.reset();
    expect(decisionStore.getSnapshot()).toEqual({
      draftActionIds: [...actionIds],
      committedActionIds: [...actionIds],
    });
    demo.destroy();
  });

  it("keeps evidence, sessions, findings and replay outcomes coherent for all eight subsets", () => {
    for (let mask = 0; mask < 8; mask++) {
      const selected = actionIds.filter((_, index) => mask & (1 << index));
      const experiment = buildExperiment(selected);
      const cohort = [...experiment.sessions, experiment.specialist];
      const sessionMap = new Map(
        cohort.map((session) => [session.id, session]),
      );
      const evidenceMap = new Map(
        experiment.evidence.map((item) => [item.id, item]),
      );
      expect(evidenceMap.size).toBe(experiment.evidence.length);
      for (const item of experiment.evidence) {
        const session = sessionMap.get(item.sessionId)!;
        expect(session).toBeDefined();
        expect(session.evidenceIds).toContain(item.id);
        expect(item.at).toBeGreaterThanOrEqual(session.startedAt);
        expect(item.at).toBeLessThanOrEqual(
          session.startedAt + session.duration,
        );
        for (const id of item.findingIds)
          expect(session.findingIds).toContain(id);
      }
      for (const session of cohort) {
        for (const id of session.evidenceIds)
          expect(evidenceMap.get(id)?.sessionId).toBe(session.id);
        expect(session.events.at(-1)?.at).toBe(session.duration);
        if (session.source === "ai" || session.source === "human") {
          if (!selected.includes("model"))
            expect(session.aiHumanUnderstood).toBe(
              sessions.find((base) => base.id === session.id)
                ?.aiHumanUnderstood,
            );
          expect(session.taskResult).toBe(
            !session.ctaFound
              ? "failed"
              : session.aiHumanUnderstood
                ? "success"
                : "partial",
          );
          expect(session.events.at(-1)?.type).toBe(
            session.taskResult === "success"
              ? "task_success"
              : session.taskResult === "partial"
                ? "task_partial"
                : "task_failure",
          );
          if (selected.length && !session.aiHumanUnderstood)
            expect(session.quote).toContain("still unsure");
        }
      }
      for (const finding of experiment.findings) {
        expect(finding.evidenceIds.length).toBeGreaterThan(0);
        for (const id of finding.evidenceIds)
          expect(evidenceMap.get(id)?.findingIds).toContain(finding.id);
      }
    }
  });

  it("does not claim revised pricing or model clarity when those changes were excluded", () => {
    const orchestration = buildExperiment(["orchestration"]);
    const priceSearcher = orchestration.sessions.find(
      (session) => session.id === "scout-03",
    )!;
    expect(
      priceSearcher.events.some(
        (event) => event.type === "search" && /pricing/i.test(event.text),
      ),
    ).toBe(true);
    expect(priceSearcher.quote).toContain("cost and commitment");
    expect(
      orchestration.findings.find((finding) => finding.id === "pricing")
        ?.resolvedV2,
    ).toBe(false);
    const all = buildExperiment(actionIds);
    expect(
      all.sessions.every(
        (session) =>
          !session.events.some(
            (event) => event.type === "search" && /pricing/i.test(event.text),
          ),
      ),
    ).toBe(true);
    expect(all.findings.filter((finding) => finding.resolvedV2)).toHaveLength(
      4,
    );
    expect(
      all.findings
        .filter(
          (finding) =>
            ["critical", "high", "medium"].includes(finding.severity) &&
            !finding.resolvedV2,
        )
        .map((finding) => finding.id),
    ).toEqual(["trust"]);
    expect(
      all.sessions.find((session) => session.id === "founder-3")?.quote,
    ).toContain("more assurance");
    expect(
      new Set(all.sessions.slice(0, 25).map((session) => session.quote)).size,
    ).toBeGreaterThan(12);
  });
});

describe("decision store and evidence-backed brief", () => {
  it("persists draft and committed choices independently and validates corrupted state", () => {
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    const first = createDecisionStore(storage);
    first.toggleAction("pricing");
    const second = createDecisionStore(storage);
    expect(second.getSnapshot().draftActionIds).toEqual([
      "orchestration",
      "model",
    ]);
    expect(second.getSnapshot().committedActionIds).toEqual([...actionIds]);
    second.commitChanges();
    const restored = createDecisionStore(storage);
    expect(restored.getSnapshot().committedActionIds).toEqual([
      "orchestration",
      "model",
    ]);
    expect(parseDecisionState("{broken")).toBeNull();
    expect(
      parseDecisionState(
        JSON.stringify({
          schema: 1,
          state: { draftActionIds: ["unknown"], committedActionIds: [] },
        }),
      ),
    ).toBeNull();
    expect(
      parseDecisionState(
        JSON.stringify({
          schema: 1,
          state: { draftActionIds: ["model", "model"], committedActionIds: [] },
        }),
      ),
    ).toBeNull();
    expect(
      parseDecisionState(
        JSON.stringify({ schema: 9, state: restored.getSnapshot() }),
      ),
    ).toBeNull();
    expect(
      parseDecisionState(
        JSON.stringify({
          schema: 1,
          state: { draftActionIds: [], committedActionIds: [] },
        }),
      ),
    ).toEqual({ draftActionIds: [], committedActionIds: [] });
  });

  it("handles blocked persistence and invalid toggle ids", () => {
    const store = createDecisionStore({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const before = store.getSnapshot();
    store.toggleAction("not-an-action");
    expect(store.getSnapshot()).toBe(before);
    expect(() => {
      store.toggleAction("model");
      store.commitChanges();
      store.resetChanges();
    }).not.toThrow();
  });

  it("derives the shipping decision from assumptions, with source differences and limitations", () => {
    decisionStore.resetChanges();
    const baseline = getDecisionBrief();
    const revised = getDecisionBrief(2);
    expect(baseline.verdict).toBe("iterate");
    expect(
      baseline.assumptions.filter((assumption) => assumption.passed),
    ).toHaveLength(3);
    expect(
      baseline.assumptions.find(
        (assumption) => assumption.hypothesisId === "h3",
      ),
    ).toMatchObject({ value: 52, unit: "percent", passed: false });
    expect(
      baseline.assumptions.find(
        (assumption) => assumption.hypothesisId === "h1",
      ),
    ).toMatchObject({ value: 84, unit: "percent", passed: true });
    expect(
      baseline.assumptions.find(
        (assumption) => assumption.hypothesisId === "h5",
      ),
    ).toMatchObject({ value: 52, unit: "percent", passed: false });
    expect(revised.verdict).toBe("ship");
    expect(revised.assumptions.every((assumption) => assumption.passed)).toBe(
      true,
    );
    expect(
      revised.assumptions.find(
        (assumption) => assumption.hypothesisId === "h3",
      ),
    ).toMatchObject({ value: 80, passed: true });
    expect(
      revised.assumptions.find(
        (assumption) => assumption.hypothesisId === "h1",
      ),
    ).toMatchObject({ value: 100, passed: true });
    expect(
      revised.assumptions.find(
        (assumption) => assumption.hypothesisId === "h5",
      ),
    ).toMatchObject({ value: 68, passed: true });
    expect(baseline.coverage).toMatchObject({
      totalSessions: 27,
      behaviorSessions: 25,
      ai: 20,
      human: 5,
      experts: 2,
      specialists: 1,
      criticalUnresolved: 1,
    });
    expect(revised.priorities[0].title).toContain("private-product");
    expect(revised.limitations.some((item) => /synthetic/.test(item))).toBe(
      true,
    );
    expect(
      revised.limitations.some((item) => /causal experiment/.test(item)),
    ).toBe(true);
    for (const brief of [baseline, revised]) {
      const sample = getSessionCohort(brief.version);
      const items = getEvidenceCohort(brief.version);
      for (const contrast of brief.contrasts) {
        const metric = contrast.metric as "comprehension";
        const ai = sample.filter((session) => session.source === "ai");
        const human = sample.filter((session) => session.source === "human");
        expect(contrast.ai).toBe(
          Math.round(
            ai.reduce((sum, session) => sum + session[metric], 0) / ai.length,
          ),
        );
        expect(contrast.human).toBe(
          Math.round(
            human.reduce((sum, session) => sum + session[metric], 0) /
              human.length,
          ),
        );
        expect(contrast.delta).toBe(contrast.human - contrast.ai);
      }
      for (const assumption of brief.assumptions) {
        expect(assumption.evidenceIds.length).toBeGreaterThan(0);
        expect(assumption.passed).toBe(
          assumption.value >= assumption.threshold,
        );
        for (const id of assumption.evidenceIds)
          expect(items.some((item) => item.id === id)).toBe(true);
      }
      const specialist = getSpecialistSession(brief.version);
      expect(
        items
          .filter((item) => item.source === "specialist")
          .every((item) => specialist.evidenceIds.includes(item.id)),
      ).toBe(true);
      expect(getFindingsForVersion(brief.version)).toHaveLength(6);
    }
  });
});

describe("question-aware strategy", () => {
  it("changes methodology and success criteria according to the question and settings", () => {
    const questions = {
      comprehension: "Do founders understand what Playground does?",
      pricing: "Will founders pay for a first test?",
      onboarding: "Where do users abandon onboarding?",
      security: "Can we safely ship this authentication flow?",
      feature: "Is this feature useful to product teams?",
    } as const;
    for (const [category, question] of Object.entries(questions)) {
      const strategy = buildStrategy(question, {
        audience: "Product teams",
        stage: "Prototype",
        risk: "High",
        depth: "Deep validation",
      });
      expect(strategy.category).toBe(category);
      expect(strategy.rationale).toContain("expert review");
      expect(strategy.rationale).toContain("Product teams");
      expect(strategy.rationale).toContain("fixed synthetic Playground cohort");
      expect(strategy.successSignals.length).toBeGreaterThan(0);
      expect(strategy.methodology.length).toBeGreaterThan(0);
    }
    expect(buildStrategy(questions.security).methodology.join(" ")).toContain(
      "Cybersecurity",
    );
    expect(buildStrategy(questions.onboarding).journeys).toContain(
      "Question input",
    );
    expect(buildStrategy(questions.pricing).successSignals.join(" ")).toContain(
      "payment",
    );
    expect(buildStrategy(questions.comprehension).assumptions).toEqual(
      hypotheses.map((hypothesis) => hypothesis.title),
    );
  });
});
