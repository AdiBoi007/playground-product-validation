import {
  evidence,
  findings,
  sessions,
  specialistSession,
  v2Sessions,
} from "../data/demo";
import type { Evidence, Finding, Session } from "../types";
import {
  actionMetricWeights,
  normalizeActionIds,
  type ActionId,
  type SignalMetric,
} from "./actions";

export interface Experiment {
  actionIds: ActionId[];
  sessions: Session[];
  specialist: Session;
  evidence: Evidence[];
  findings: Finding[];
}
const cache = new Map<string, Experiment>();
const metricKeys: SignalMetric[] = [
  "comprehension",
  "usability",
  "trust",
  "purchaseIntent",
  "clarity",
];

export function buildExperiment(ids: readonly string[]): Experiment {
  const selected = normalizeActionIds(ids);
  const key = selected.join("-") || "none";
  const cached = cache.get(key);
  if (cached) return cached;
  const has = (id: ActionId) => selected.includes(id);
  const mean = (cohort: Session[], metric: SignalMetric) =>
    cohort.reduce((sum, session) => sum + session[metric], 0) / cohort.length;
  const clone = (session: Session): Session => ({
    ...session,
    persona: { ...session.persona },
    observations: [...session.observations],
    findingIds: [...session.findingIds],
    evidenceIds: [],
    events: session.events.map((event) => ({ ...event })),
  });
  const cohort = sessions.map((base, index) => {
    const session = clone(base);
    if (!selected.length) return session;
    if (base.source === "expert") {
      session.quote = [
        has("orchestration")
          ? "The orchestration engine is visible in the hero."
          : "The methodology selection is still not sufficiently visible.",
        has("model")
          ? "The AI-to-human handoff is explained."
          : "The AI and human roles still need a clearer explanation.",
        has("pricing")
          ? "First-test commitment and private access are explained."
          : "Pricing and first-test commitment remain unanswered.",
      ].join(" ");
      session.observations = [
        session.quote,
        "Reviewed the revised explanation against participant behavior.",
        "No critical interaction blocker was introduced.",
      ];
      return session;
    }
    for (const metric of metricKeys) {
      const portion = selected.reduce(
        (sum, id) => sum + actionMetricWeights[id][metric],
        0,
      );
      session[metric] =
        Math.round(
          (base[metric] +
            (v2Sessions[index][metric] - base[metric]) * portion) *
            10,
        ) / 10;
    }
    const handoffEffect = selected.reduce(
      (sum, id) => sum + actionMetricWeights[id].clarity,
      0,
    );
    const adoptionThreshold =
      base.persona.literacy === "Developing"
        ? 0.9
        : base.persona.reading === "Skims"
          ? 0.85
          : 0.6;
    session.aiHumanUnderstood =
      base.aiHumanUnderstood ||
      (v2Sessions[index].aiHumanUnderstood &&
        has("model") &&
        handoffEffect >= adoptionThreshold);
    session.ctaFound =
      base.ctaFound || (session.usability >= 75 && session.comprehension >= 75);
    session.taskResult = !session.ctaFound
      ? "failed"
      : session.aiHumanUnderstood
        ? "success"
        : "partial";
    const searchedPricing = base.findingIds.includes("pricing");
    const value =
      session.comprehension >= 80
        ? [
            "I can place this between building something and deciding to ship it.",
            "The validation use case makes sense for the next product change.",
            "I understand the product; it helps check an assumption before release.",
            "I get the decision this helps me make.",
            "The core idea is clear: test the assumption before shipping.",
          ][index % 5]
        : "I still need a clearer explanation of what Playground does.";
    const model = session.aiHumanUnderstood
      ? [
          "Scout finds patterns; actual users check whether they matter.",
          "I can explain where AI screening ends and human validation begins.",
          "AI screening and matched-founder sessions have different jobs.",
        ][index % 3]
      : "I am still unsure how AI screening and human validation differ.";
    const commitment = has("pricing")
      ? [
          "The first-test commitment is clearer before I submit anything.",
          "A first test now feels like a bounded experiment.",
          "Showing the scope first answers my commitment question.",
        ][index % 3]
      : searchedPricing
        ? "I need to know the cost and commitment before starting."
        : "";
    const privacy =
      session.trust < (base.persona.trustThreshold === "High" ? 80 : 65)
        ? "I still want more assurance before sharing a private product."
        : "";
    session.quote = [value, model, commitment, privacy]
      .filter(Boolean)
      .join(" ");
    session.observations = [
      has("orchestration")
        ? "Sees how Playground chooses the methodology and tester."
        : "Orchestration explanation has not changed.",
      session.aiHumanUnderstood
        ? "Correctly distinguishes AI screening from human validation."
        : "Cannot clearly explain the AI-to-human handoff.",
      session.ctaFound
        ? "Finds the primary call to action independently."
        : "Needs help identifying the next action.",
      has("pricing")
        ? "Reads the first-test commitment without searching for pricing."
        : searchedPricing
          ? "Still searches for pricing before trial."
          : "No pricing search observed.",
      privacy
        ? "Private-product assurances remain a concern."
        : "Trust clears the basic trial threshold.",
    ];
    session.events = base.events.map((event) => {
      if (event.at === session.duration)
        return {
          ...event,
          type:
            session.taskResult === "success"
              ? "task_success"
              : session.taskResult === "partial"
                ? "task_partial"
                : "task_failure",
          text:
            session.taskResult === "success"
              ? "Task complete · product and testing mix understood"
              : session.taskResult === "partial"
                ? "Partial success · testing mix still unclear"
                : "Task ended · next step still unclear",
        };
      if (
        event.type === "search" &&
        /pricing/i.test(event.text) &&
        has("pricing")
      )
        return {
          ...event,
          type: "focus",
          text: "Reads the visible first-test commitment",
          scroll: 420,
        };
      if (
        event.type === "focus" &&
        /privacy/i.test(event.text) &&
        has("pricing")
      )
        return {
          ...event,
          text:
            session.trust < 65
              ? "Reads access controls; still wants more private-product assurance"
              : "Checks the revised private-product access explanation",
        };
      if (
        /testing model|screening to human|AI and human|full validation/i.test(
          event.text,
        )
      )
        return {
          ...event,
          at: session.duration * 0.62,
          type: session.aiHumanUnderstood ? "scroll" : "hesitation",
          text: session.aiHumanUnderstood
            ? "Connects AI screening to human validation"
            : "Still unsure how the testing mix works",
        };
      if (
        /Start testing|next step|task complete|Task complete|Task ended|Partial success/i.test(
          event.text,
        )
      ) {
        return {
          ...event,
          type: session.ctaFound ? "click" : "hesitation",
          text: session.ctaFound
            ? "Finds Start testing without prompting"
            : "Cannot confidently identify the next action",
          x: session.ctaFound ? 52 : 68,
          y: session.ctaFound ? 65 : 44,
          route: session.ctaFound ? "/new-test" : "/",
        };
      }
      if (event.type === "hover" && /value proposition/i.test(event.text))
        return {
          ...event,
          text: has("orchestration")
            ? "Reads what to test, how to test it and who should test it"
            : "Scans the original value proposition",
        };
      return { ...event };
    });
    session.events.push({
      at: session.duration * 0.4,
      type: "comprehension_check",
      text:
        session.comprehension >= 80
          ? "Correctly explains the validation use case"
          : "Needs more explanation of the core value",
      x: 47,
      y: 43,
      scroll: 235,
    });
    session.events.sort((a, b) => a.at - b.at);
    return session;
  });
  const specialist = clone(specialistSession);
  if (selected.length) {
    specialist.quote = has("model")
      ? "The handoff labels improve the reading order. Primary controls remain accessible."
      : "Primary controls remain accessible. The testing-model explanation still needs clearer labels.";
    specialist.observations = [
      specialist.quote,
      "Regression review checks the revised content hierarchy.",
      "No new critical interaction blocker observed.",
    ];
  }

  let items: Evidence[];
  if (!selected.length) {
    items = evidence.map((item) => ({
      ...item,
      id: `v2-none-${item.id}`,
      findingIds: [...item.findingIds],
    }));
  } else {
    items = [...cohort, specialist].flatMap((session) => {
      const definitions =
        session.source === "expert" || session.source === "specialist"
          ? [
              {
                title: `${session.role} · change review`,
                detail: session.quote,
                ids:
                  session.source === "expert"
                    ? ["value", "orchestration", "model", "pricing"]
                    : ["model", "cta"],
                fraction: 0.4,
                type: "Regression review",
                positive: has("orchestration") && has("model"),
              },
              {
                title: `${session.role} · outstanding questions`,
                detail:
                  session.source === "expert"
                    ? [
                        has("model")
                          ? "AI and human responsibilities are explained."
                          : "AI and human responsibilities remain unclear.",
                        has("pricing")
                          ? "First-test commitment is stated."
                          : "First-test commitment remains unclear.",
                      ].join(" ")
                    : specialist.quote,
                ids:
                  session.source === "expert"
                    ? ["model", "pricing", "trust"]
                    : ["model", "cta"],
                fraction: 0.72,
                type: "Expert observation",
                positive: has("model") && has("pricing"),
              },
              {
                title: `${session.role} · review complete`,
                detail: session.quote,
                ids:
                  session.source === "expert"
                    ? ["value", "orchestration", "model", "pricing", "trust"]
                    : ["model", "cta"],
                fraction: 1,
                type: "Review",
                positive:
                  has("orchestration") && has("model") && has("pricing"),
              },
            ]
          : [
              {
                title: `${session.name} · value proposition retest`,
                detail: `Product comprehension: ${session.comprehension}/100. ${has("orchestration") ? "The methodology selection is visible in the hero." : "The original orchestration explanation is unchanged."}`,
                ids: ["value", "orchestration"],
                fraction: 0.4,
                type: "Retest comprehension",
                positive: session.comprehension >= 80,
              },
              {
                title: `${session.name} · AI / human model retest`,
                detail: session.aiHumanUnderstood
                  ? "Correctly explains AI screening followed by human validation."
                  : "Still cannot clearly distinguish AI screening from human validation.",
                ids: ["model"],
                fraction: 0.62,
                type: "Retest clarity",
                positive: session.aiHumanUnderstood,
              },
              {
                title: `${session.name} · next action and commitment`,
                detail: [
                  session.ctaFound
                    ? "Found the primary CTA without prompting."
                    : "Did not identify the primary CTA confidently.",
                  has("pricing")
                    ? "First-test commitment and product access are visible."
                    : session.observations[3],
                ].join(" "),
                ids: ["cta", "pricing"],
                fraction: 0.85,
                type: "Retest usability",
                positive: session.ctaFound && has("pricing"),
              },
              {
                title: `${session.name} · ${session.taskResult === "success" ? "task complete" : session.taskResult === "partial" ? "partial success" : "task incomplete"}`,
                detail: session.quote,
                ids: ["trust", "orchestration", "model"],
                fraction: 1,
                type:
                  session.source === "human"
                    ? "Founder retest quote"
                    : "Retest result",
                positive:
                  session.taskResult === "success" && session.trust >= 65,
              },
            ];
      return definitions.map((entry, index): Evidence => ({
        id: `v2-${key}-${session.id}-e${index + 1}`,
        sessionId: session.id,
        findingIds: entry.ids,
        source: session.source,
        title: entry.title,
        detail: entry.detail,
        type: entry.type,
        at: +(session.startedAt + session.duration * entry.fraction).toFixed(2),
        sentiment: entry.positive ? "positive" : "negative",
        critical:
          entry.ids.includes("model") &&
          session.source !== "expert" &&
          session.source !== "specialist" &&
          !session.aiHumanUnderstood,
      }));
    });
  }
  items.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  for (const session of [...cohort, specialist]) {
    const linked = items.filter((item) => item.sessionId === session.id);
    session.evidenceIds = selected.length
      ? linked.map((item) => item.id)
      : (
          sessions.find((base) => base.id === session.id) ?? specialistSession
        ).evidenceIds.map((id) => `v2-none-${id}`);
    session.findingIds = [
      ...new Set(linked.flatMap((item) => item.findingIds)),
    ];
  }
  const behavior = cohort.filter(
    (session) => session.source === "ai" || session.source === "human",
  );
  const ctaCount = behavior.filter((session) => session.ctaFound).length;
  const modelCount = behavior.filter(
    (session) => session.aiHumanUnderstood,
  ).length;
  const understoodCount = behavior.filter(
    (session) => session.comprehension >= 80,
  ).length;
  const pricingCount = behavior.filter(
    (session) =>
      session.events.some(
        (event) => event.type === "search" && /pricing/i.test(event.text),
      ) ||
      (!has("pricing") &&
        sessions
          .find((base) => base.id === session.id)
          ?.findingIds.includes("pricing")),
  ).length;
  const lowTrustCount = behavior.filter((session) => session.trust < 65).length;
  const privateConcernCount = behavior.filter(
    (session) =>
      session.persona.trustThreshold === "High" && session.trust < 80,
  ).length;
  const summaries: Record<string, string> = {
    value: `${understoodCount} of ${behavior.length} participants correctly explain the value. Average comprehension is ${Math.round(mean(behavior, "comprehension"))}/100.`,
    model: `${modelCount} of ${behavior.length} participants (${Math.round((modelCount / behavior.length) * 100)}%) distinguish AI screening from human validation. Average clarity is ${Math.round(mean(behavior, "clarity"))}/100.`,
    cta: `${ctaCount} of ${behavior.length} participants (${Math.round((ctaCount / behavior.length) * 100)}%) identify the next action without prompting.`,
    pricing: pricingCount
      ? `${pricingCount} of ${behavior.length} participants still search for pricing or first-test commitment. That explanation was ${has("pricing") ? "revised but did not resolve every question" : "not changed in this experiment"}.`
      : "The revised first-test commitment removes the observed pricing searches. Private-product trust still needs follow-up.",
    orchestration: has("orchestration")
      ? `Methodology selection is visible in the hero. ${understoodCount} participants explain the validation use case and reviewers can inspect the question-to-decision sequence.`
      : "The orchestration explanation was not changed. Experts still want methodology selection made visible before the tester list.",
    trust: `${lowTrustCount} of ${behavior.length} participants remain below 65/100 on trust. ${privateConcernCount} security-sensitive profiles still need stronger private-product assurances. Access and data handling need a dedicated follow-up before broader acquisition.`,
  };
  const resolved: Record<string, boolean> = {
    value: Math.round(mean(behavior, "comprehension")) >= 90,
    model:
      mean(behavior, "clarity") >= 70 && modelCount / behavior.length >= 0.7,
    cta: false,
    pricing: has("pricing") && pricingCount === 0,
    orchestration:
      has("orchestration") && mean(behavior, "comprehension") >= 88,
    trust: lowTrustCount === 0 && privateConcernCount === 0,
  };
  const experimentFindings = findings.map((finding): Finding => {
    const linked = items.filter((item) => item.findingIds.includes(finding.id));
    const isResolved = resolved[finding.id] ?? false;
    return {
      ...finding,
      summary: selected.length ? summaries[finding.id] : finding.summary,
      resolvedV2: isResolved,
      evidenceIds: linked.map((item) => item.id),
      severity: isResolved ? "low" : finding.severity,
      confidence: Math.min(
        97,
        76 +
          Math.round(
            (new Set(linked.map((item) => item.sessionId)).size /
              sessions.length) *
              14,
          ) +
          new Set(
            linked
              .filter((item) => item.source === "expert")
              .map((item) => item.sessionId),
          ).size *
            4,
      ),
    };
  });
  const result = {
    actionIds: selected,
    sessions: cohort,
    specialist,
    evidence: items,
    findings: experimentFindings,
  };
  cache.set(key, result);
  return result;
}
