import { evidence, sessions, v2Sessions } from "../data/demo";

export const actionIds = ["orchestration", "model", "pricing"] as const;
export type ActionId = (typeof actionIds)[number];
export type SignalMetric =
  "comprehension" | "usability" | "trust" | "purchaseIntent" | "clarity";

// Effects partition each observed V1→V2 improvement. Every column sums to one;
// applying all changes therefore reproduces the original participant fixtures.
export const actionMetricWeights: Record<
  ActionId,
  Record<SignalMetric, number>
> = {
  orchestration: {
    comprehension: 0.65,
    usability: 0.2,
    trust: 0.15,
    purchaseIntent: 0.3,
    clarity: 0.25,
  },
  model: {
    comprehension: 0.25,
    usability: 0.45,
    trust: 0.3,
    purchaseIntent: 0.3,
    clarity: 0.65,
  },
  pricing: {
    comprehension: 0.1,
    usability: 0.35,
    trust: 0.55,
    purchaseIntent: 0.4,
    clarity: 0.1,
  },
};

export interface RecommendedAction {
  id: ActionId;
  title: string;
  description: string;
  effort: string;
  impact: string;
  changeBefore: string;
  changeAfter: string;
  before: string;
  after: string;
  findingIds: string[];
  changes: string[];
  metricDeltas: Partial<Record<SignalMetric, number>>;
  rationale: string;
  evidenceIds: string[];
}

const definitions: Omit<
  RecommendedAction,
  "before" | "after" | "metricDeltas" | "evidenceIds"
>[] = [
  {
    id: "orchestration",
    title: "Put the engine in the hero.",
    effort: "Small · messaging + one section",
    impact: "Highest impact on comprehension",
    description:
      "Explain how Playground turns a question into the right method, tester and shipping decision.",
    changeBefore:
      "Stop guessing. Start testing. A collection of testing resources.",
    changeAfter:
      "Know what to test. How to test it. Who should test it. Playground builds the strategy, runs the test and connects the evidence to a decision.",
    findingIds: ["orchestration", "value"],
    changes: [
      "Lead with the decision between building and shipping.",
      "Show question → strategy → tester → evidence → verdict.",
      "Make methodology selection visible before listing testers.",
    ],
    rationale:
      "Both experts identified orchestration as the differentiation. Participants value it after understanding how the testing mix is selected.",
  },
  {
    id: "model",
    title: "Make the AI → human handoff visible.",
    effort: "Medium · workflow explanation",
    impact: "Highest impact on AI / human clarity",
    description:
      "Replace an ambiguous tester list with a clear sequence and a purpose for each source of evidence.",
    changeBefore: "AI personas. Real users. Experts. Pick your testers.",
    changeAfter:
      "AI screens it. Real users prove it. Experts explain why. Scout finds patterns; matched founders validate them; specialists review the risks.",
    findingIds: ["model", "orchestration", "cta"],
    changes: [
      "Distinguish synthetic screening from human validation.",
      "Show the handoff as a three-step visual.",
      "State what each tester contributes to the decision.",
    ],
    rationale:
      "The core message works, but 12 of 25 behavioral participants cannot explain who does the testing. This is the primary blocker.",
  },
  {
    id: "pricing",
    title: "Remove the first-test unknowns.",
    effort: "Small · commitment + privacy copy",
    impact: "Highest impact on trust and trial intent",
    description:
      "State the first-test commitment and private product access before asking founders to submit a URL.",
    changeBefore:
      "Start testing. Submit your product to find out what happens next.",
    changeAfter:
      "Start with one focused test. See the scope and commitment first. Choose who can access your product. Retest when it changes.",
    findingIds: ["pricing", "trust", "cta"],
    changes: [
      "Explain the scope and cost before submission.",
      "State who sees a private product and how access is controlled.",
      "Explain the commitment for a first test and a retest.",
    ],
    rationale:
      "Eight behavioral participants looked for pricing or commitment information. Security-sensitive founders also asked who can access private prototypes.",
  },
];

export const recommendedActions: RecommendedAction[] = definitions.map(
  (action) => {
    const behavior = sessions.filter(
      (session) => session.source === "ai" || session.source === "human",
    );
    const metricDeltas = Object.fromEntries(
      Object.entries(actionMetricWeights[action.id]).map(([metric, weight]) => {
        const key = metric as SignalMetric;
        const delta =
          behavior.reduce(
            (sum, session, index) =>
              sum + v2Sessions[index][key] - session[key],
            0,
          ) / behavior.length;
        return [key, +(delta * weight).toFixed(1)];
      }),
    ) as Partial<Record<SignalMetric, number>>;
    return {
      ...action,
      before: action.changeBefore,
      after: action.changeAfter,
      metricDeltas,
      evidenceIds: evidence
        .filter((item) =>
          item.findingIds.some((id) => action.findingIds.includes(id)),
        )
        .map((item) => item.id),
    };
  },
);

export function normalizeActionIds(ids: readonly string[]): ActionId[] {
  return actionIds.filter((id) => ids.includes(id));
}
