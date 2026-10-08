import {
  getEvidenceCohort,
  getFindingsForVersion,
  getMetrics,
  getSessionCohort,
  getSpecialistSession,
} from "../simulation/selectors";
import { decisionStore } from "./store";
import {
  recommendedActions,
  type ActionId,
  type RecommendedAction,
  type SignalMetric,
} from "./actions";
import type { Metrics, Source } from "../types";

export { recommendedActions } from "./actions";
export type { ActionId, RecommendedAction, SignalMetric } from "./actions";

export type AssumptionMetric = SignalMetric | "ctaRate";
export interface Hypothesis {
  id: string;
  title: string;
  metric: AssumptionMetric;
  threshold: number;
  rationale: string;
  successSignal: string;
  findingIds: string[];
}

export const hypotheses: Hypothesis[] = [
  {
    id: "h1",
    title: "The core value is understood.",
    metric: "comprehension",
    threshold: 80,
    rationale:
      "The first impression must connect Playground to a decision about what is worth shipping.",
    successSignal:
      "At least 80% correctly explain the core value; the comprehension rating is reported separately.",
    findingIds: ["value", "orchestration"],
  },
  {
    id: "h2",
    title: "The next action is obvious.",
    metric: "ctaRate",
    threshold: 75,
    rationale:
      "Founders should begin a test without needing a tour or a second call to action.",
    successSignal: "At least 75% find the primary CTA without prompting.",
    findingIds: ["cta"],
  },
  {
    id: "h3",
    title: "AI screening and human proof are distinct.",
    metric: "clarity",
    threshold: 70,
    rationale:
      "A tester list is not a methodology. Founders must understand what each source contributes.",
    successSignal: "At least 70% correctly explain the AI-to-human handoff.",
    findingIds: ["model", "orchestration"],
  },
  {
    id: "h4",
    title: "Founders trust the first step.",
    metric: "trust",
    threshold: 60,
    rationale:
      "Submitting a private product requires a clear commitment and a credible access explanation.",
    successSignal:
      "Average trust ≥60/100; private-product concerns remain visible as follow-up risk.",
    findingIds: ["trust", "pricing"],
  },
  {
    id: "h5",
    title: "The value earns meaningful trial intent.",
    metric: "purchaseIntent",
    threshold: 60,
    rationale:
      "Understanding is useful only if founders can name a test they would actually run.",
    successSignal:
      "At least 60% express meaningful trial intent (intent rating ≥60/100).",
    findingIds: ["pricing", "orchestration"],
  },
];

export interface AssumptionStatus {
  hypothesisId: string;
  title: string;
  metric: AssumptionMetric;
  value: number;
  threshold: number;
  status: "supported" | "at-risk" | "not-supported";
  passed: boolean;
  unit: "score" | "percent";
  measurement: string;
  findingIds: string[];
  evidenceIds: string[];
  sessionIds: string[];
  sourceCounts: Record<Source, number>;
}

export interface DecisionContrast {
  metric: AssumptionMetric;
  label: string;
  ai: number;
  human: number;
  delta: number;
  interpretation: string;
  aiSessionIds: string[];
  humanSessionIds: string[];
}

export interface DecisionSignal {
  id: string;
  title: string;
  summary: string;
  polarity: "strength" | "risk" | "opportunity";
  findingIds: string[];
  evidenceIds: string[];
  sessionIds: string[];
  sources: Source[];
  sourceCounts: Record<Source, number>;
}

export interface DecisionBrief {
  version: 1 | 2;
  metrics: Metrics;
  verdict: "ship" | "iterate";
  headline: string;
  summary: string;
  assumptions: AssumptionStatus[];
  signals: DecisionSignal[];
  contrasts: DecisionContrast[];
  coverage: {
    totalSessions: number;
    behaviorSessions: number;
    ai: number;
    human: number;
    experts: number;
    specialists: number;
    evidenceItems: number;
    sourceCounts: Record<Source, number>;
    linkedFindings: number;
    criticalUnresolved: number;
  };
  priorities: (RecommendedAction & {
    actionId: ActionId;
    reason: string;
    priority: number;
  })[];
  confidence: {
    score: number;
    level: "high" | "medium" | "low";
    summary: string;
  };
  limitations: string[];
  appliedActionIds: ActionId[];
  nextQuestion: string;
}

export function getDecisionBrief(version: 1 | 2 = 1): DecisionBrief {
  const cohort = getSessionCohort(version);
  const specialist = getSpecialistSession(version);
  const allSessions = [...cohort, specialist];
  const items = getEvidenceCohort(version);
  const findings = getFindingsForVersion(version);
  const metrics = getMetrics(50, version);
  const behavior = cohort.filter(
    (session) => session.source === "ai" || session.source === "human",
  );
  const sessionMap = new Map(
    allSessions.map((session) => [session.id, session]),
  );
  const sourceCounts = (ids: string[]): Record<Source, number> => {
    const counts = { ai: 0, human: 0, expert: 0, specialist: 0 };
    for (const id of new Set(ids)) {
      const session = sessionMap.get(id);
      if (session) counts[session.source] += 1;
    }
    return counts;
  };
  const assumptions = hypotheses.map((hypothesis): AssumptionStatus => {
    const linked = items.filter((item) =>
      item.findingIds.some((id) => hypothesis.findingIds.includes(id)),
    );
    const sessionIds = [...new Set(linked.map((item) => item.sessionId))];
    const isClarity = hypothesis.metric === "clarity";
    const isComprehension = hypothesis.metric === "comprehension";
    const isIntent = hypothesis.metric === "purchaseIntent";
    const count = isClarity
      ? behavior.filter((session) => session.aiHumanUnderstood).length
      : isComprehension
        ? behavior.filter((session) => session.comprehension >= 80).length
        : isIntent
          ? behavior.filter((session) => session.purchaseIntent >= 60).length
          : hypothesis.metric === "ctaRate"
            ? behavior.filter((session) => session.ctaFound).length
            : 0;
    const percent =
      isClarity ||
      isComprehension ||
      isIntent ||
      hypothesis.metric === "ctaRate";
    const value = percent
      ? Math.round((count / behavior.length) * 100)
      : metrics[hypothesis.metric];
    const passed = value >= hypothesis.threshold;
    return {
      hypothesisId: hypothesis.id,
      title: hypothesis.title,
      metric: hypothesis.metric,
      value,
      threshold: hypothesis.threshold,
      status: passed
        ? "supported"
        : value >= hypothesis.threshold - 5
          ? "at-risk"
          : "not-supported",
      passed,
      unit: percent ? "percent" : "score",
      measurement: isClarity
        ? `${count}/${behavior.length} correctly distinguish AI screening and human validation; mean clarity rating ${metrics.clarity}/100.`
        : isComprehension
          ? `${count}/${behavior.length} correctly explain the core value (comprehension rating ≥80); mean rating ${metrics.comprehension}/100.`
          : isIntent
            ? `${count}/${behavior.length} express meaningful trial intent (intent rating ≥60); mean rating ${metrics.purchaseIntent}/100.`
            : hypothesis.metric === "ctaRate"
              ? `${count}/${behavior.length} identify the primary CTA without prompting.`
              : `${behavior.length} behavioral participants; mean ${hypothesis.metric.replace(/([A-Z])/g, " $1").toLowerCase()} rating ${value}/100.`,
      findingIds: hypothesis.findingIds,
      evidenceIds: linked.map((item) => item.id),
      sessionIds,
      sourceCounts: sourceCounts(sessionIds),
    };
  });
  const labels: Record<AssumptionMetric, string> = {
    comprehension: "Value comprehension",
    usability: "Usability",
    trust: "Trust",
    purchaseIntent: "Trial intent",
    clarity: "AI / human clarity",
    ctaRate: "CTA discovery",
  };
  const contrasts: DecisionContrast[] = (
    ["comprehension", "trust", "purchaseIntent", "clarity"] as const
  ).map((metric) => {
    const aiSessions = behavior.filter((session) => session.source === "ai");
    const humanSessions = behavior.filter(
      (session) => session.source === "human",
    );
    const average = (sample: typeof behavior) =>
      Math.round(
        sample.reduce((sum, session) => sum + session[metric], 0) /
          sample.length,
      );
    const ai = average(aiSessions);
    const human = average(humanSessions);
    const delta = human - ai;
    return {
      metric,
      label: labels[metric],
      ai,
      human,
      delta,
      interpretation:
        Math.abs(delta) < 4
          ? "AI screening and founder ratings point in the same direction."
          : delta < 0
            ? `Founder ratings are ${Math.abs(delta)} points lower. Use human evidence to temper the AI signal.`
            : `Founder ratings are ${delta} points higher. The human cohort adds context the simulation misses.`,
      aiSessionIds: aiSessions.map((session) => session.id),
      humanSessionIds: humanSessions.map((session) => session.id),
    };
  });
  const signals: DecisionSignal[] = findings.map((finding) => {
    const linked = items.filter((item) => item.findingIds.includes(finding.id));
    const sessionIds = [...new Set(linked.map((item) => item.sessionId))];
    return {
      id: finding.id,
      title: finding.title,
      summary: finding.summary,
      polarity:
        finding.severity === "opportunity"
          ? "opportunity"
          : ["critical", "high", "medium"].includes(finding.severity) &&
              !(version === 2 && finding.resolvedV2)
            ? "risk"
            : "strength",
      findingIds: [finding.id],
      evidenceIds: linked.map((item) => item.id),
      sessionIds,
      sources: [...new Set(linked.map((item) => item.source))],
      sourceCounts: sourceCounts(sessionIds),
    };
  });
  const unresolved = findings.filter(
    (finding) =>
      ["critical", "high", "medium", "opportunity"].includes(
        finding.severity,
      ) &&
      (version === 1 || !finding.resolvedV2),
  );
  const criticalUnresolved = unresolved.filter(
    (finding) => finding.severity === "critical",
  ).length;
  const pass = assumptions.every((assumption) => assumption.passed);
  const verdict =
    pass && criticalUnresolved === 0 && metrics.usability >= 75
      ? "ship"
      : "iterate";
  const appliedActionIds =
    version === 2 ? decisionStore.getSnapshot().committedActionIds : [];
  const priorities = recommendedActions
    .flatMap((action) => {
      const primaryFindingIds =
        action.id === "model"
          ? ["model"]
          : action.id === "orchestration"
            ? ["orchestration", "value"]
            : ["pricing", "trust"];
      const outstanding = unresolved.filter((finding) =>
        primaryFindingIds.includes(finding.id),
      );
      if (!outstanding.length) return [];
      const onlyTrust =
        outstanding.length === 1 && outstanding[0].id === "trust";
      const linked = items.filter((item) =>
        item.findingIds.some((id) =>
          outstanding.some((finding) => finding.id === id),
        ),
      );
      const followUp = onlyTrust
        ? {
            title: "Validate private-product assurances.",
            description:
              "Run a focused follow-up with privacy-sensitive founders before widening acquisition.",
            rationale: outstanding[0].summary,
            findingIds: ["trust"],
            changes: [
              "Recruit privacy-sensitive founder profiles.",
              "Walk through private-product access and record willingness to submit.",
              "Have a specialist assess data handling and reviewer permissions.",
            ],
            effort: "Focused follow-up study",
            impact: "Close the remaining trust risk",
            metricDeltas: {},
          }
        : {};
      return [
        {
          ...action,
          ...followUp,
          actionId: action.id,
          reason: onlyTrust
            ? "First-test pricing is clearer. A separate study must prove founders will trust private prototype access."
            : outstanding.map((finding) => finding.summary).join(" "),
          priority:
            action.id === "model" ? 1 : action.id === "orchestration" ? 2 : 3,
          evidenceIds: linked.map((item) => item.id),
        },
      ];
    })
    .sort((a, b) => a.priority - b.priority);
  const coverageCounts = sourceCounts(allSessions.map((session) => session.id));
  return {
    version,
    metrics,
    verdict,
    headline:
      verdict === "ship"
        ? "Ready for a controlled launch."
        : version === 2 && !appliedActionIds.length
          ? "Same product. Same unanswered questions."
          : "The value lands. The explanation needs work.",
    summary:
      verdict === "ship"
        ? "The revised explanation clears the comprehension, testing-model and trial thresholds. Ship the messaging update, then validate private-product trust with a focused follow-up."
        : version === 2 && !appliedActionIds.length
          ? "No changes were committed to this retest. The original evidence and outcomes remain unchanged."
          : `${assumptions.filter((assumption) => assumption.passed).length} of ${assumptions.length} assumptions are supported. ${assumptions
              .filter((assumption) => !assumption.passed)
              .map((assumption) => assumption.title.replace(/\.$/, ""))
              .join("; ")} still need evidence or a product change.`,
    assumptions,
    signals,
    contrasts,
    coverage: {
      totalSessions: cohort.length,
      behaviorSessions: behavior.length,
      ai: coverageCounts.ai,
      human: coverageCounts.human,
      experts: coverageCounts.expert,
      specialists: coverageCounts.specialist,
      evidenceItems: items.length,
      sourceCounts: coverageCounts,
      linkedFindings: findings.filter(
        (finding) => finding.evidenceIds.length > 0,
      ).length,
      criticalUnresolved,
    },
    priorities,
    confidence: {
      score: metrics.confidence,
      level:
        metrics.confidence >= 85
          ? "high"
          : metrics.confidence >= 65
            ? "medium"
            : "low",
      summary:
        "Strong agreement within this synthetic cohort. Evidence coverage describes the demo study; it does not establish population certainty.",
    },
    limitations: [
      "All sessions, quotes and reviews are synthetic. No real users were recruited in this demo.",
      `${coverageCounts.human} founder profiles provide directional triangulation; they are not a representative or statistically powered sample.`,
      "AI ratings are behavioral screening signals. Human agreement is shown separately rather than treated as extra AI certainty.",
      version === 2
        ? "Retest effects are deterministic scenario projections from the original fixtures, not a measured causal experiment on a live website."
        : "The study tests first-time comprehension and trial intent, not willingness to pay, retention or revenue.",
      "Security-sensitive prototypes and unsupported native mobile workflows require dedicated follow-up studies.",
    ],
    appliedActionIds,
    nextQuestion:
      verdict === "ship"
        ? "Would privacy-sensitive founders submit a private prototype after reviewing product access and data handling?"
        : "Can first-time founders explain how Playground chooses AI, humans and experts after the revised workflow?",
  };
}

export interface StrategyOptions {
  audience?: string;
  stage?: string;
  risk?: string;
  depth?: string;
}
export interface Strategy {
  category: "comprehension" | "pricing" | "onboarding" | "security" | "feature";
  title: string;
  objective: string;
  journeys: string[];
  assumptions: string[];
  methodology: string[];
  rationale: string;
  successSignals: string[];
}

export function buildStrategy(
  question: string,
  options: StrategyOptions = {},
): Strategy {
  const text = question.toLowerCase();
  const category: Strategy["category"] =
    /security|authentication|cyber|safe|private|privacy|vulnerab|attack/.test(
      text,
    )
      ? "security"
      : /pay|price|pricing|cost|subscription|commitment/.test(text)
        ? "pricing"
        : /onboard|complete|signup|sign.up|kyc|abandon|activation/.test(text)
          ? "onboarding"
          : /useful|feature|missing|need|worth|adopt/.test(text)
            ? "feature"
            : "comprehension";
  const audience = options.audience ?? "Startup founders";
  const stage = options.stage ?? "Pre-launch";
  const depth = options.depth ?? "Balanced";
  const risk = options.risk ?? "Medium";
  const plans: Record<
    Strategy["category"],
    Omit<Strategy, "category" | "rationale">
  > = {
    comprehension: {
      title: "First impression → informed trial",
      objective: `Determine whether ${audience.toLowerCase()} understand the value and can begin a test without assistance.`,
      journeys: [
        "Landing page",
        "Value proposition",
        "Testing workflow",
        "AI / human handoff",
        "Trust",
        "Primary CTA",
      ],
      assumptions: hypotheses.map((hypothesis) => hypothesis.title),
      methodology: [
        "20 Scout personas · broad behavioral screening",
        "5 matched founder profiles · comprehension and task validation",
        "2 product / growth expert reviews",
        "1 UX / accessibility review",
      ],
      successSignals: hypotheses.map((hypothesis) => hypothesis.successSignal),
    },
    pricing: {
      title: "Value → commitment → willingness to try",
      objective: `Find what ${audience.toLowerCase()} need to know before making a first-test commitment.`,
      journeys: [
        "Value proposition",
        "First-test scope",
        "Pricing and commitment",
        "Product access",
        "Trial decision",
      ],
      assumptions: [
        "The value is clear before pricing appears.",
        "The first-test commitment is understood.",
        "Price questions do not block beginning a test.",
        "Retest value is credible.",
      ],
      methodology: [
        "Scout pricing-search and hesitation screening",
        "Matched founder willingness-to-try interviews",
        "Growth expert review of commitment framing",
        "UX review of the price-to-CTA path",
      ],
      successSignals: [
        "At least 75% explain the first-test commitment.",
        "Pricing searches and hesitation decrease.",
        "Trial intent improves without reducing trust.",
        "Observed intent is reported separately from actual payment.",
      ],
    },
    onboarding: {
      title: "First step → task completion",
      objective: `Identify where ${audience.toLowerCase()} hesitate, lose context or fail to complete the first task.`,
      journeys: [
        "Primary CTA",
        "Product URL entry",
        "Question input",
        "Test strategy",
        "Run confirmation",
        "First result",
      ],
      assumptions: [
        "The next action is visible.",
        "Required inputs are understood.",
        "The test plan earns confidence.",
        "Users complete the flow without assistance.",
      ],
      methodology: [
        "Scout scripted task and abandonment screening",
        "Matched founder task walkthroughs",
        "Product expert journey review",
        "UX / accessibility interaction audit",
      ],
      successSignals: [
        "At least 80% complete the primary task.",
        "No critical interaction blockers.",
        "Failure and hesitation events trace to a specific step.",
        "Completion time and assistance are reported separately.",
      ],
    },
    security: {
      title: "Risk screening → specialist review",
      objective: `Review the shipping assumptions in “${question.trim() || "Can we safely ship this flow?"}” and identify what needs a qualified security review.`,
      journeys: [
        "Authentication entry",
        "Error and recovery paths",
        "Permissions",
        "Sensitive data access",
        "Session boundaries",
      ],
      assumptions: [
        "Identity and permission boundaries are explicit.",
        "Sensitive data is not exposed in normal journeys.",
        "Recovery paths do not bypass intended controls.",
        "A specialist can reproduce and assess flagged risks.",
      ],
      methodology: [
        "AI adversarial scenario screening",
        "Authentication and access-control checklist",
        "Cybersecurity researcher review pathway",
        "UX / accessibility review of recovery flows",
      ],
      successSignals: [
        "No known critical blocker in the reviewed scope.",
        "Every flagged risk has a reproduction path.",
        "A qualified reviewer assesses security findings.",
        "Demo screening is clearly distinguished from a security audit.",
      ],
    },
    feature: {
      title: "Use case → usefulness → repeat behavior",
      objective: `Determine whether ${audience.toLowerCase()} recognize a concrete use case and would adopt the proposed feature.`,
      journeys: [
        "Problem context",
        "Feature explanation",
        "First-use task",
        "Outcome",
        "Repeat-use trigger",
      ],
      assumptions: [
        "The problem is recognized.",
        "The feature has a specific use case.",
        "Users can reach the promised outcome.",
        "Users identify when they would return.",
      ],
      methodology: [
        "Scout audience and expectation screening",
        "Matched founder usefulness interviews",
        "Product strategy review",
        "UX review of the first-use journey",
      ],
      successSignals: [
        "At least 80% name the intended use case.",
        "At least 60% express meaningful adoption intent.",
        "Task outcomes distinguish success from partial success.",
        "Repeat-use intent is treated as a hypothesis, not retention evidence.",
      ],
    },
  };
  const plan = plans[category];
  return {
    ...plan,
    category,
    rationale: `This ${stage.toLowerCase()} question needs ${category === "security" ? "specialist risk assessment alongside scenario screening" : category === "pricing" ? "commitment evidence alongside comprehension" : category === "onboarding" ? "observable task completion, not opinion alone" : category === "feature" ? "a concrete use case and a repeat-use reason" : "comprehension, usability, trust and trial evidence"}. ${depth} depth with ${risk.toLowerCase()} risk prioritizes ${risk.toLowerCase() === "high" ? "expert review before a shipping decision" : depth.toLowerCase().includes("quick") ? "fast screening and the highest-risk assumption" : "broad Scout screening followed by founder and expert triangulation"}. Audience: ${audience}. This local demo illustrates the selected strategy with its fixed synthetic Playground cohort; it does not recruit a new audience or test a live product.`,
  };
}
