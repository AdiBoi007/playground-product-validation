import type {
  Evidence,
  Finding,
  Persona,
  Session,
  SessionEvent,
} from "../types";

export const defaultUrl = "https://tryplayground.net";
export const defaultQuestion =
  "Do startup founders understand what Playground does and would they try it?";

// Scores are participant observations, not screen-specific dashboard numbers.
// Every report and comparison is calculated from these same 25 records.
const scores = {
  comprehension: [
    93, 58, 91, 87, 84, 90, 93, 91, 61, 97, 88, 86, 94, 59, 89, 85, 83, 92, 80,
    90, 82, 95, 87, 85, 60,
  ],
  usability: [
    89, 70, 81, 86, 74, 83, 88, 77, 60, 94, 80, 83, 87, 62, 86, 68, 73, 91, 67,
    86, 78, 89, 77, 81, 65,
  ],
  trust: [
    74, 64, 70, 58, 38, 67, 76, 40, 61, 78, 66, 64, 70, 53, 74, 37, 58, 78, 61,
    67, 71, 82, 56, 58, 54,
  ],
  purchaseIntent: [
    77, 33, 56, 72, 40, 65, 81, 47, 31, 86, 62, 58, 77, 29, 72, 33, 45, 82, 49,
    70, 65, 81, 57, 64, 43,
  ],
  clarity: [
    84, 14, 81, 80, 77, 16, 83, 23, 14, 89, 79, 78, 84, 11, 82, 20, 25, 87, 18,
    21, 27, 86, 79, 23, 19,
  ],
};

const improvedScores = {
  comprehension: [
    96, 83, 94, 95, 92, 93, 96, 94, 87, 98, 93, 92, 96, 84, 94, 92, 91, 98, 91,
    96, 93, 99, 95, 94, 89,
  ],
  usability: [
    93, 81, 88, 92, 86, 89, 93, 87, 76, 96, 86, 89, 92, 75, 90, 79, 83, 94, 79,
    91, 86, 95, 86, 89, 80,
  ],
  trust: [
    86, 75, 81, 71, 50, 77, 86, 52, 72, 88, 77, 74, 81, 65, 84, 51, 69, 87, 72,
    77, 82, 91, 67, 70, 65,
  ],
  purchaseIntent: [
    88, 52, 67, 83, 55, 76, 92, 58, 50, 95, 73, 70, 89, 48, 84, 52, 57, 94, 61,
    83, 78, 92, 70, 77, 56,
  ],
  clarity: [
    94, 58, 92, 91, 90, 63, 94, 70, 61, 97, 91, 90, 95, 55, 94, 68, 74, 97, 73,
    72, 75, 96, 92, 73, 70,
  ],
};

const scoutRoles = [
  "Technical SaaS Founder",
  "First-time Nontechnical Founder",
  "Indie Hacker",
  "Time-poor Founder",
  "Skeptical CTO",
  "Growth-led Founder",
  "Accelerator Founder",
  "Enterprise SaaS Founder",
  "Mobile App Founder",
  "AI-native Founder",
  "Marketplace Founder",
  "Bootstrapped Founder",
  "Design-led Founder",
  "Product Manager",
  "Agency Founder",
  "Deeptech Founder",
  "Pre-seed Founder",
  "Serial Founder",
  "Student Founder",
  "Developer Tool Founder",
];

const scoutBehavior = [
  "Connects the headline to a validation workflow and starts a test.",
  "Assumes this is automated QA. Looks for a test script rather than a research question.",
  "Looks for pricing before committing to another subscription.",
  "Skims the hero, finds the CTA, then checks what a first test involves.",
  "Checks private product data handling before considering a test.",
  "Understands the value but expects every session to be AI-generated.",
  "Looks for an accelerator and team workflow.",
  "Checks enterprise security and pricing before submitting a product.",
  "Looks for native mobile testing and cannot find an obvious answer.",
  "Understands AI screening immediately and explores human validation.",
  "Recognises the validation use case but wants evidence from both sides of a marketplace.",
  "Checks the cost of a first test and how repeat testing works.",
  "Reads the workflow carefully and notices the missing AI-to-human handoff.",
  "Interprets Playground as a user-testing marketplace. Hesitates on the next step.",
  "Looks for a repeatable way to validate client work.",
  "Searches for pricing and private prototype protections.",
  "Wants to know whether early ideas need a finished product.",
  "Connects orchestration to an existing build-and-ship workflow.",
  "Checks the cost before choosing a first experiment.",
  "Recognises validation as a release gate and looks for developer workflow support.",
];

const scoutQuotes = [
  "A validation layer between building something and deciding to ship it. I would start with our onboarding.",
  "I thought it was AI running test scripts. I cannot tell where the actual users come in.",
  "I can see the use case. I need to know the cost of the first experiment before I try it.",
  "I found the button immediately. Tell me what happens after I submit my URL.",
  "Who gets access to my private product? That is the thing stopping me.",
  "I assumed these were all simulated users. The real-founder step changes the value for me.",
  "This could be useful across our whole accelerator portfolio.",
  "It needs a clearer explanation of enterprise access and data handling.",
  "We build a native app. I cannot tell whether Playground can test it.",
  "Let AI find the rough edges, then have people tell us if they matter. That makes sense.",
  "I would test both buyer and seller journeys with this.",
  "How much does one test cost, and does retesting mean paying again?",
  "The methodology selection is more interesting than the tester list.",
  "It looks like a marketplace where I pick testers. Does it choose the research method too?",
  "I could use this before handing a new feature to a client.",
  "I would need to understand pricing and prototype privacy first.",
  "Can I start with a concept, or does it need a live product?",
  "This fits in the gap between building fast and knowing what is worth shipping.",
  "I would try it if the first test had a clear, small commitment.",
  "I can see us running this every time we change onboarding.",
];

const humanSpecs = [
  {
    name: "Maya Chen",
    role: "B2B SaaS Founder",
    location: "Sydney",
    match: 96,
    experience: "4 years · second-time founder",
    stage: "Pre-seed",
    quote:
      "I get that you test products, but I'm not immediately sure who actually does the testing.",
    comprehensionTime: 14.2,
    behavior:
      "Reads the hero twice and pauses on the AI and human explanation.",
  },
  {
    name: "Marcus Reed",
    role: "Developer Tools Founder",
    location: "London",
    match: 93,
    experience: "7 years · technical founder",
    stage: "Seed",
    quote:
      "It feels like a validation layer between building something and deciding to ship it.",
    comprehensionTime: 7.8,
    behavior:
      "Connects validation to shipping and starts a first test without help.",
  },
  {
    name: "Priya Shah",
    role: "Fintech Founder",
    location: "Singapore",
    match: 91,
    experience: "5 years · regulated products",
    stage: "Seed",
    quote:
      "I understand the workflow. Before uploading a private product, I need to know how my data is handled.",
    comprehensionTime: 6.2,
    behavior:
      "Understands the product quickly, then looks for security and privacy assurances.",
  },
  {
    name: "Leo Martin",
    role: "AI Product Founder",
    location: "San Francisco",
    match: 89,
    experience: "3 years · AI product builder",
    stage: "Pre-seed",
    quote:
      "Selecting the right kind of test is the valuable part. I thought it was only simulated users at first.",
    comprehensionTime: 11.6,
    behavior: "Checks the testing mix and looks for pricing before beginning.",
  },
  {
    name: "Elena Rossi",
    role: "Marketplace Founder",
    location: "Berlin",
    match: 88,
    experience: "6 years · marketplace operator",
    stage: "Seed",
    quote:
      "I found where to begin, but I wanted a clear price and a clearer explanation of who I'd be testing with.",
    comprehensionTime: 18.4,
    behavior:
      "Searches for pricing twice and pauses for 11 seconds on the human validation explanation.",
  },
];

const colors = ["#d8e7cf", "#f0d9be", "#d1e5dd", "#d8e6ee", "#e8e1c9"];
const pricingIndices = new Set([2, 3, 7, 11, 15, 18, 23, 24]);
const understoodIndices = new Set([
  0, 2, 3, 4, 6, 9, 10, 11, 12, 14, 17, 21, 22,
]);
const ctaMissingIndices = new Set([1, 8, 13]);

function makeEvents(
  index: number,
  duration: number,
  ctaFound: boolean,
  understood: boolean,
): SessionEvent[] {
  const pricing = pricingIndices.has(index);
  const security = [4, 7, 15, 22].includes(index);
  const detour = pricing
    ? "Looks for pricing and first-test commitment"
    : security
      ? "Checks privacy and private-product access"
      : !understood
        ? "Pauses on the AI and human explanation"
        : "Reads how Playground selects the right test";
  return [
    {
      at: 0,
      type: "page_view",
      text: "Opens tryplayground.net",
      x: 47,
      y: 21,
      scroll: 0,
      route: "/",
    },
    {
      at: 2.2,
      type: "hover",
      text: "Scans the value proposition",
      x: 44 + (index % 8),
      y: 42,
      scroll: 0,
    },
    {
      at: 4.4,
      type: "scroll",
      text: "Explores the testing workflow",
      x: 72,
      y: 63,
      scroll: 235 + (index % 3) * 35,
    },
    {
      at: 7.1,
      type: pricing
        ? "search"
        : security
          ? "focus"
          : understood
            ? "hover"
            : "hesitation",
      text: detour,
      x: pricing ? 87 : 37,
      y: pricing ? 15 : 62,
      scroll: pricing ? 610 : 330,
    },
    {
      at: duration * 0.44,
      type: "click",
      text: pricing ? "Checks first-test details" : "Opens How it works",
      x: pricing ? 62 : 56,
      y: 41,
      scroll: 420,
      route: pricing ? "/first-test" : "/how-it-works",
    },
    {
      at: duration * 0.58,
      type: understood ? "scroll" : "hesitation",
      text: understood
        ? "Connects AI screening to human validation"
        : "Re-reads the testing model",
      x: 46,
      y: 54,
      scroll: 335,
    },
    {
      at: duration * 0.7,
      type: "back",
      text: "Returns to the main call to action",
      x: 29,
      y: 14,
      scroll: 0,
      route: "/",
    },
    {
      at: duration * 0.85,
      type: ctaFound ? "click" : "hesitation",
      text: ctaFound
        ? "Finds Start testing without prompting"
        : "Cannot confidently identify the next step",
      x: ctaFound ? 52 : 68,
      y: ctaFound ? 65 : 44,
      scroll: 0,
      route: ctaFound ? "/new-test" : "/",
    },
    {
      at: duration,
      type:
        ctaFound && understood
          ? "task_success"
          : ctaFound
            ? "task_partial"
            : "task_failure",
      text:
        ctaFound && understood
          ? "Task complete · product and next step understood"
          : ctaFound
            ? "Partial success · testing model unclear"
            : "Task ended · next step unclear",
      x: 51,
      y: 64,
      scroll: 0,
    },
  ];
}

function makeBehaviorSession(index: number): Session {
  const isHuman = index >= 20;
  const human = isHuman ? humanSpecs[index - 20] : undefined;
  const name = human?.name ?? `Scout ${String(index + 1).padStart(2, "0")}`;
  const role = human?.role ?? scoutRoles[index];
  const behavior = human?.behavior ?? scoutBehavior[index];
  const ctaFound = !ctaMissingIndices.has(index);
  const aiHumanUnderstood = understoodIndices.has(index);
  const duration = isHuman
    ? [25, 27, 24, 24, 20][index - 20]
    : 25 + (index % 4) * 2;
  const persona: Persona = {
    patience: [3, 8, 18].includes(index)
      ? "Low"
      : index % 3 === 0
        ? "High"
        : "Medium",
    literacy: [1, 18].includes(index) ? "Developing" : "High",
    trustThreshold: [4, 7, 15, 22].includes(index) ? "High" : "Medium",
    reading: [3, 9, 18].includes(index)
      ? "Skims"
      : index % 2
        ? "Scans, then reads"
        : "Reads deliberately",
    device: index === 8 || index === 18 ? "Mobile" : "Desktop",
    behavior,
  };
  const findingIds = [
    ...(scores.comprehension[index] >= 80 ? ["value"] : []),
    ...(!aiHumanUnderstood ? ["model"] : ["orchestration"]),
    "cta",
    ...(pricingIndices.has(index) ? ["pricing"] : []),
    ...(scores.trust[index] < 65 ? ["trust"] : []),
  ];
  return {
    id: isHuman
      ? `founder-${index - 19}`
      : `scout-${String(index + 1).padStart(2, "0")}`,
    name,
    role,
    source: isHuman ? "human" : "ai",
    initials: isHuman
      ? name
          .split(" ")
          .map((part) => part[0])
          .join("")
      : `S${index + 1}`,
    location: human?.location ?? "Simulated cohort",
    color: colors[index % colors.length],
    match: human?.match ?? 88 + (index % 10),
    experience:
      human?.experience ??
      (index % 3 === 0
        ? "Experienced founder"
        : index % 3 === 1
          ? "First-time builder"
          : "Product operator"),
    stage: human?.stage ?? (index % 2 ? "Pre-seed" : "Seed"),
    tags: [
      isHuman ? "Matched founder" : "AI simulation",
      role.includes("Technical") || role.includes("Developer")
        ? "Technical"
        : "Product-led",
      pricingIndices.has(index) ? "Cost conscious" : "Validation curious",
    ],
    persona,
    goal: "Explain what Playground does and begin a validation test without assistance.",
    startedAt: isHuman
      ? [9, 12, 15, 18, 21][index - 20]
      : Math.round(index * 0.55 * 100) / 100,
    duration,
    taskResult: !ctaFound
      ? "failed"
      : aiHumanUnderstood
        ? "success"
        : "partial",
    comprehension: scores.comprehension[index],
    usability: scores.usability[index],
    trust: scores.trust[index],
    purchaseIntent: scores.purchaseIntent[index],
    clarity: scores.clarity[index],
    ctaFound,
    aiHumanUnderstood,
    comprehensionTime:
      human?.comprehensionTime ??
      +(5.4 + (index % 7) * 1.9 + (!aiHumanUnderstood ? 5 : 0)).toFixed(1),
    quote: human?.quote ?? scoutQuotes[index],
    observations: [
      behavior,
      aiHumanUnderstood
        ? "Understands AI screening followed by human validation."
        : "Cannot clearly distinguish AI screening from human validation.",
      ctaFound
        ? "Finds the primary call to action independently."
        : "Needs help identifying the next action.",
    ],
    findingIds,
    evidenceIds: [],
    events: makeEvents(index, duration, ctaFound, aiHumanUnderstood),
  };
}

function makeReview(
  id: string,
  name: string,
  role: string,
  source: "expert" | "specialist",
  startedAt: number,
  duration: number,
  quote: string,
  findingIds: string[],
): Session {
  return {
    id,
    name,
    role,
    source,
    initials: name
      .split(" ")
      .map((part) => part[0])
      .join(""),
    location: "Demo reviewer",
    color: source === "specialist" ? "#52766c" : "#b47645",
    match: 98,
    experience: "10+ years · specialist practice",
    stage: "Independent review",
    tags: [role, "Synthetic review"],
    persona: {
      patience: "High",
      literacy: "Expert",
      trustThreshold: "High",
      reading: "Systematic review",
      device: "Desktop",
      behavior: "Reviews the evidence alongside the product journey.",
    },
    goal:
      source === "specialist"
        ? "Review keyboard access, contrast and clarity of primary actions."
        : "Assess positioning, orchestration clarity and the path to trial.",
    startedAt,
    duration,
    taskResult: "success",
    comprehension: 95,
    usability: 85,
    trust: 70,
    purchaseIntent: 75,
    ctaFound: true,
    aiHumanUnderstood: true,
    clarity: 90,
    comprehensionTime: 6,
    quote,
    observations: [
      quote,
      "Core value is clear. The methodology selection needs a more visible explanation.",
      "Review is linked to observed participant behaviour.",
    ],
    findingIds,
    evidenceIds: [],
    events: makeEvents(0, duration, true, true),
  };
}

export const sessions: Session[] = [
  ...Array.from({ length: 25 }, (_, index) => makeBehaviorSession(index)),
  makeReview(
    "expert-1",
    "Alex Morgan",
    "Product Strategy Expert",
    "expert",
    22,
    22,
    "The orchestration engine is the differentiation, but the hero makes it look like a collection of testers.",
    ["value", "model", "orchestration"],
  ),
  makeReview(
    "expert-2",
    "Jamie Park",
    "Growth Expert",
    "expert",
    25,
    20,
    "The CTA is strong. Explain the first-test commitment and show AI screening flowing into human proof.",
    ["value", "model", "cta", "pricing", "orchestration"],
  ),
];

export const specialistSession = makeReview(
  "specialist-1",
  "Sam Taylor",
  "UX & Accessibility Specialist",
  "specialist",
  18,
  24,
  "Primary controls are accessible. The testing-model explanation needs a clearer reading order and stronger labels.",
  ["cta", "model"],
);

function sessionEvidence(session: Session): Evidence[] {
  const count =
    session.source === "ai" ? 6 : session.source === "human" ? 4 : 3;
  const behaviorFinding = session.findingIds.includes("pricing")
    ? "pricing"
    : session.findingIds.includes("trust")
      ? "trust"
      : session.findingIds.includes("model")
        ? "model"
        : "orchestration";
  const entries =
    session.source === "expert" || session.source === "specialist"
      ? [
          {
            title: `${session.name} began a ${session.role.toLowerCase()} review`,
            detail: session.goal,
            ids: session.findingIds,
            type: "Review started",
            fraction: 0.2,
            sentiment: "neutral" as const,
          },
          {
            title:
              session.source === "expert"
                ? "Orchestration clarity flagged in expert review"
                : "Testing-model reading order needs clearer labels",
            detail: session.observations[1],
            ids: session.findingIds.filter((id) =>
              ["model", "orchestration"].includes(id),
            ),
            type: "Expert observation",
            fraction: 0.7,
            sentiment: "negative" as const,
          },
          {
            title: `${session.role} review complete`,
            detail: session.quote,
            ids: session.findingIds,
            type: "Review",
            fraction: 1,
            sentiment: "neutral" as const,
          },
        ]
      : session.source === "human"
        ? [
            {
              title: `${session.name} ${session.comprehension >= 80 ? "understood the product" : "needed more explanation"} in ${session.comprehensionTime}s`,
              detail: session.observations[0],
              ids: session.findingIds.filter((id) =>
                ["value", "pricing", "trust", "model"].includes(id),
              ),
              type: "Observed behaviour",
              fraction: session.comprehensionTime / session.duration,
              sentiment:
                session.comprehension >= 80
                  ? ("positive" as const)
                  : ("negative" as const),
            },
            {
              title: session.aiHumanUnderstood
                ? `${session.name} understands AI screening and human validation`
                : `${session.name} is unsure who does the testing`,
              detail: session.observations[1],
              ids: [session.aiHumanUnderstood ? "orchestration" : "model"],
              type: "Comprehension check",
              fraction: 0.58,
              sentiment: session.aiHumanUnderstood
                ? ("positive" as const)
                : ("negative" as const),
            },
            {
              title: `${session.name} ${session.ctaFound ? "found the primary CTA" : "missed the primary CTA"}`,
              detail:
                session.trust < 65
                  ? "The next action is visible, but trust or commitment questions remain before trial."
                  : session.observations[2],
              ids: [
                "cta",
                ...session.findingIds.filter((id) =>
                  ["trust", "pricing"].includes(id),
                ),
              ],
              type: "Task observation",
              fraction: 0.85,
              sentiment:
                session.trust < 65
                  ? ("neutral" as const)
                  : ("positive" as const),
            },
            {
              title: `${session.name} · founder quote`,
              detail: session.quote,
              ids: session.findingIds,
              type: "Founder quote",
              fraction: 1,
              sentiment:
                session.taskResult === "success"
                  ? ("positive" as const)
                  : ("negative" as const),
            },
          ]
        : [
            {
              title: `${session.name} began the product journey`,
              detail: session.goal,
              ids: [],
              type: "Page view",
              fraction: 0.04,
              sentiment: "neutral" as const,
            },
            {
              title: `${session.name} · ${session.persona.behavior}`,
              detail: session.observations[0],
              ids: [behaviorFinding],
              type:
                behaviorFinding === "pricing" ? "Pricing search" : "Behaviour",
              fraction: 0.27,
              sentiment:
                behaviorFinding === "orchestration"
                  ? ("positive" as const)
                  : ("negative" as const),
            },
            {
              title: session.aiHumanUnderstood
                ? `${session.name} connects the full validation workflow`
                : `${session.name} misunderstood the AI / human workflow`,
              detail: session.observations[1],
              ids: [
                session.aiHumanUnderstood ? "orchestration" : "model",
                ...(session.findingIds.includes("value") ? ["value"] : []),
              ],
              type: "Interpretation",
              fraction: 0.58,
              sentiment: session.aiHumanUnderstood
                ? ("positive" as const)
                : ("negative" as const),
            },
            {
              title: `${session.name} ${session.ctaFound ? "identified Start testing" : "hesitated on the next action"}`,
              detail: session.observations[2],
              ids: ["cta"],
              type: session.ctaFound ? "CTA found" : "Hesitation",
              fraction: 0.85,
              sentiment: session.ctaFound
                ? ("positive" as const)
                : ("negative" as const),
            },
            {
              title:
                session.trust < 65
                  ? `${session.name} wants clearer trust and commitment signals`
                  : `${session.name} sees a repeat validation use case`,
              detail:
                session.trust < 65
                  ? session.quote
                  : "Would use Playground to test the next product change, once the testing mix is clear.",
              ids: [
                session.trust < 65
                  ? "trust"
                  : session.aiHumanUnderstood
                    ? "orchestration"
                    : "model",
              ],
              type: "Trust check",
              fraction: 0.84,
              sentiment:
                session.trust < 65
                  ? ("negative" as const)
                  : ("positive" as const),
            },
            {
              title: `${session.name} · ${session.taskResult === "success" ? "task complete" : session.taskResult === "partial" ? "partial success" : "task incomplete"}`,
              detail: session.quote,
              ids: session.findingIds,
              type: "Session result",
              fraction: 1,
              sentiment:
                session.taskResult === "success"
                  ? ("positive" as const)
                  : ("negative" as const),
            },
          ];
  const items: Evidence[] = entries.slice(0, count).map((entry, index) => ({
    id: `${session.id}-e${index + 1}`,
    sessionId: session.id,
    findingIds: entry.ids,
    source: session.source,
    type: entry.type,
    title: entry.title,
    detail: entry.detail,
    at: +(session.startedAt + session.duration * entry.fraction).toFixed(2),
    sentiment: entry.sentiment,
    critical: entry.ids.includes("model") && entry.sentiment === "negative",
  }));
  session.evidenceIds = items.map((item) => item.id);
  return items;
}

export const evidence: Evidence[] = [...sessions, specialistSession]
  .flatMap(sessionEvidence)
  .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

const behaviorSessions = sessions.filter(
  (session) => session.source === "ai" || session.source === "human",
);
const pricingCount = behaviorSessions.filter((session) =>
  session.findingIds.includes("pricing"),
).length;
const unclearCount = behaviorSessions.filter(
  (session) => !session.aiHumanUnderstood,
).length;
const ctaCount = behaviorSessions.filter((session) => session.ctaFound).length;

const findingDefinitions: Omit<Finding, "evidenceIds" | "confidence">[] = [
  {
    id: "value",
    title: "Core value proposition works",
    summary: `${behaviorSessions.filter((session) => session.comprehension >= 80).length} of ${behaviorSessions.length} participants understood validation before shipping. Both experts confirmed the value proposition.`,
    severity: "low",
    recommendation:
      "Keep the validation-before-shipping message. Lead with the decision founders need to make.",
    resolvedV2: true,
  },
  {
    id: "model",
    title: "AI + human model is unclear",
    summary: `${unclearCount} of ${behaviorSessions.length} participants (${Math.round((unclearCount / behaviorSessions.length) * 100)}%) could not clearly explain the difference between AI screening and human validation.`,
    severity: "critical",
    recommendation:
      "Show AI screening → real-user validation → expert review as a clear visual sequence in the hero.",
    resolvedV2: true,
  },
  {
    id: "cta",
    title: "Primary CTA works",
    summary: `${ctaCount} of ${behaviorSessions.length} participants (${Math.round((ctaCount / behaviorSessions.length) * 100)}%) identified the next action without prompting.`,
    severity: "low",
    recommendation:
      "Keep one clear Start testing action and explain the first step immediately beside it.",
    resolvedV2: false,
  },
  {
    id: "pricing",
    title: "Pricing uncertainty creates friction",
    summary: `${pricingCount} of ${behaviorSessions.length} participants (${Math.round((pricingCount / behaviorSessions.length) * 100)}%) looked for pricing or first-test commitment before beginning.`,
    severity: "medium",
    recommendation:
      "State the cost and commitment of a first test before asking founders to submit a product.",
    resolvedV2: true,
  },
  {
    id: "orchestration",
    title: "Orchestration is the differentiator",
    summary:
      "Participants who understood how Playground selects the method and tester described a repeatable layer between building and shipping. Both experts flagged this as the positioning opportunity.",
    severity: "opportunity",
    recommendation:
      "Explain: What needs testing? How should it be tested? Who should test it? Make the engine visible.",
    resolvedV2: true,
  },
  {
    id: "trust",
    title: "Trust needs clearer proof",
    summary:
      "Security-sensitive founders wanted a clearer explanation of private product access, reviewer permissions and data handling before trial.",
    severity: "medium",
    recommendation:
      "Add plain-language data handling and access controls beside the first-test action.",
    resolvedV2: false,
  },
];

export const findings: Finding[] = findingDefinitions.map((finding) => {
  const linked = evidence.filter((item) =>
    item.findingIds.includes(finding.id),
  );
  const supportingSessions = new Set(linked.map((item) => item.sessionId)).size;
  const expertReviews = new Set(
    linked
      .filter((item) => item.source === "expert")
      .map((item) => item.sessionId),
  ).size;
  return {
    ...finding,
    evidenceIds: linked.map((item) => item.id),
    confidence: Math.min(
      97,
      76 +
        Math.round((supportingSessions / sessions.length) * 14) +
        expertReviews * 4,
    ),
  };
});

export const v2Sessions: Session[] = sessions.map((session, index) =>
  index >= 25
    ? {
        ...session,
        quote:
          "The new hero explains orchestration clearly. AI screening flows into human proof, with the first-test commitment visible.",
        observations: [
          "Orchestration is visible in the hero.",
          "AI screening and human validation are clearly distinguished.",
          "No new critical blockers.",
        ],
      }
    : {
        ...session,
        comprehension: improvedScores.comprehension[index],
        usability: improvedScores.usability[index],
        trust: improvedScores.trust[index],
        purchaseIntent: improvedScores.purchaseIntent[index],
        clarity: improvedScores.clarity[index],
        ctaFound: true,
        aiHumanUnderstood: improvedScores.clarity[index] >= 70,
        taskResult: improvedScores.clarity[index] >= 70 ? "success" : "partial",
        quote:
          improvedScores.clarity[index] >= 70
            ? "Now I understand the sequence: AI screens it, real users prove it. I know what happens when I start a test."
            : "The new workflow is clearer. I still want more detail before sharing a private product.",
        observations: [
          "The orchestration explanation is understood.",
          "First-test pricing and commitment are visible.",
          improvedScores.trust[index] < 65
            ? "Still asks for additional private-product assurances."
            : "No new usability blockers observed.",
        ],
        findingIds: improvedScores.trust[index] < 65 ? ["trust"] : [],
        events: makeEvents(
          index,
          session.duration,
          true,
          improvedScores.clarity[index] >= 70,
        ),
      },
);

export const v2Evidence: Evidence[] = v2Sessions
  .flatMap((session) => {
    const definitions =
      session.source === "expert"
        ? [
            {
              title: `${session.role} · regression review`,
              detail: session.observations.join(" "),
              ids: ["model", "orchestration", "cta"],
              fraction: 1,
            },
          ]
        : [
            {
              title: `${session.name} · value proposition retest`,
              detail: `Product comprehension: ${session.comprehension}/100. The orchestration explanation is visible in the hero.`,
              ids: ["value", "orchestration"],
              fraction: 0.4,
            },
            {
              title: `${session.name} · AI / human model retest`,
              detail: session.aiHumanUnderstood
                ? "Correctly explains AI screening followed by real-user validation."
                : "Needs more detail about the testing mix before committing.",
              ids: ["model"],
              fraction: 0.62,
            },
            {
              title: `${session.name} · CTA and first-test commitment`,
              detail:
                "Found the primary CTA. First-test pricing and commitment are visible.",
              ids: ["cta", "pricing"],
              fraction: 0.84,
            },
            {
              title: `${session.name} · version 2 result`,
              detail: session.quote,
              ids: ["trust", "orchestration"],
              fraction: 1,
            },
          ];
    const items: Evidence[] = definitions.map((entry, index) => ({
      id: `v2-${session.id}-e${index + 1}`,
      sessionId: session.id,
      findingIds: entry.ids,
      source: session.source,
      type:
        session.source === "expert"
          ? "Regression review"
          : "Retest observation",
      title: entry.title,
      detail: entry.detail,
      at: +(session.startedAt + session.duration * entry.fraction).toFixed(2),
      sentiment: session.aiHumanUnderstood ? "positive" : "neutral",
      critical: false,
    }));
    session.evidenceIds = items.map((item) => item.id);
    session.findingIds = [...new Set(items.flatMap((item) => item.findingIds))];
    return items;
  })
  .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
