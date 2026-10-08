import type { Session } from "../types";

export interface SampleProject {
  id: string;
  name: string;
  category: string;
  url: string;
  question: string;
  mission: string;
  stage: string;
  status: string;
  color: string;
  verdict: string;
  summary: string;
  sessions: Session[];
  changes: { title: string; reason: string; sessionIds: string[] }[];
}

const people = [
  {
    name: "Alex Park",
    role: "Product Lead",
    location: "Melbourne",
    initials: "AP",
  },
  {
    name: "Jordan Ellis",
    role: "Operations Founder",
    location: "London",
    initials: "JE",
  },
  {
    name: "Samira Khan",
    role: "Startup Operator",
    location: "Singapore",
    initials: "SK",
  },
  {
    name: "Theo Davis",
    role: "Engineering Lead",
    location: "Austin",
    initials: "TD",
  },
  {
    name: "Nina Costa",
    role: "Growth Lead",
    location: "Lisbon",
    initials: "NC",
  },
];

const specs = [
  {
    id: "atlas",
    name: "Atlas",
    category: "AI meeting assistant",
    scene: "meetings" as const,
    url: "atlas.example",
    question: "Do teams trust generated action items?",
    mission: "Review a meeting summary and assign the next actions.",
    stage: "Private beta",
    status: "Complete",
    color: "#d9eaf3",
    verdict: "SHIP WITH GUARDRAILS",
    summary:
      "The summary earns trust when people can see where it came from. Keep the transcript close and let teams approve owners before sharing.",
    scores: [86, 80, 82, 76, 86],
    quotes: [
      "Seeing the original sentence makes the action item feel trustworthy.",
      "I want to approve who owns an action before it goes to the whole team.",
      "This would save me fifteen minutes after every customer meeting.",
      "I followed the transcript link first. Now I know where the summary came from.",
      "I’d use this if people can fix the owners before the summary is shared.",
    ],
    observations: [
      "Verified the action against its transcript citation.",
      "Paused before sharing an auto-assigned owner.",
      "Completed the review and assigned the next action.",
      "Opened the source transcript before accepting the summary.",
      "Changed an owner, then shared the reviewed summary.",
    ],
    success: [true, true, true, false, true],
    changes: [
      {
        title: "Keep the source beside every action",
        reason:
          "Two participants used the original transcript to judge whether an action was correct.",
        indices: [0, 3],
      },
      {
        title: "Require approval before sharing owners",
        reason:
          "Two participants wanted control over assignments before the team was notified.",
        indices: [1, 4],
      },
    ],
  },
  {
    id: "flux",
    name: "Flux",
    category: "Fintech onboarding",
    scene: "fintech" as const,
    url: "flux.example",
    question: "Where do users abandon KYC?",
    mission: "Create an account and verify your identity.",
    stage: "Beta",
    status: "Needs iteration",
    color: "#f7e2ce",
    verdict: "ITERATE",
    summary:
      "People reach identity verification, then hesitate. Document requirements and data retention need an explanation before the upload step.",
    scores: [72, 60, 65, 70, 58],
    quotes: [
      "Tell me why you need my passport before asking me to upload it.",
      "I don’t have that document on this device. Can I finish later?",
      "The steps are clear. I just want to know how long you keep my ID.",
      "I completed it, but a progress indicator would make the process less uncertain.",
      "I stopped at the upload. I couldn’t tell whether a photo of my licence was enough.",
    ],
    observations: [
      "Looked for document requirements before uploading.",
      "Abandoned at the document upload on a work laptop.",
      "Opened the data retention explanation before proceeding.",
      "Finished verification after reading the three-step checklist.",
      "Could not establish whether a licence photo met the requirements.",
    ],
    success: [true, false, true, true, false],
    changes: [
      {
        title: "Explain ID handling before upload",
        reason:
          "Three participants searched for document or retention details.",
        indices: [0, 2, 4],
      },
      {
        title: "Support a save-and-resume path",
        reason:
          "Participants without the right document needed a way to continue later.",
        indices: [1, 4],
      },
    ],
  },
  {
    id: "northstar",
    name: "Northstar",
    category: "Hiring platform",
    scene: "hiring" as const,
    url: "northstar.example",
    question: "Do recruiters understand candidate ranking?",
    mission: "Review the candidate shortlist and explain the top-ranked match.",
    stage: "Pre-launch",
    status: "Needs review",
    color: "#e5ebcf",
    verdict: "ITERATE",
    summary:
      "The shortlist is useful. The ranking feels opaque. Show the criteria beside each candidate before asking recruiters to act on a recommendation.",
    scores: [74, 60, 70, 66, 70],
    quotes: [
      "The shortlist is useful, but what made this person the best match?",
      "I’m looking for the weighting. Is experience more important than the skills match?",
      "I could explain the ranking once I opened the criteria.",
      "The top candidate looks right. I still want to inspect the reasoning.",
      "I’d share this if each score came with a short explanation.",
    ],
    observations: [
      "Opened the match criteria before choosing a candidate.",
      "Could not explain how the ranking was weighted.",
      "Identified the strongest match using the criteria panel.",
      "Cross-checked experience against the role requirements.",
      "Requested an explanation beside the ranking score.",
    ],
    success: [true, false, true, false, true],
    changes: [
      {
        title: "Show why each candidate ranks here",
        reason:
          "All five participants looked for reasoning behind the shortlist.",
        indices: [0, 1, 2, 3, 4],
      },
      {
        title: "Let recruiters inspect the weights",
        reason: "Two participants could not confidently explain the ordering.",
        indices: [1, 3],
      },
    ],
  },
];

export const sampleProjects: SampleProject[] = specs.map((spec) => {
  const cohort: Session[] = people.map((person, index) => {
    const id = `${spec.id}-participant-${index + 1}`;
    const duration = 32 + index * 3;
    return {
      id,
      ...person,
      source: "human",
      color: ["#dce8d2", "#f1dfc7", "#d9e8e8", "#e4e4d1", "#dbe6ef"][index],
      match: 96 - index * 2,
      experience: "4–7 years in the target role",
      stage: spec.stage,
      tags: ["Matched participant", spec.category, "Demo research"],
      persona: {
        patience: index === 1 ? "Low" : "Medium",
        literacy: "High",
        trustThreshold: "High",
        reading: "Scans, then verifies",
        device: "Desktop",
        behavior: spec.observations[index],
      },
      goal: spec.mission,
      startedAt: 0,
      duration,
      taskResult: spec.success[index] ? "success" : "partial",
      comprehension: spec.scores[index],
      usability: spec.scores[index],
      trust: spec.scores[index],
      purchaseIntent: spec.scores[index],
      clarity: spec.scores[index],
      ctaFound: true,
      aiHumanUnderstood: spec.success[index],
      comprehensionTime: 8.2 + index * 2.1,
      quote: spec.quotes[index],
      observations: [spec.observations[index]],
      findingIds: spec.changes.flatMap((change, i) =>
        change.indices.includes(index) ? [`${spec.id}-finding-${i}`] : [],
      ),
      evidenceIds: [`${id}-observation`, `${id}-quote`],
      events: [
        {
          at: 0,
          type: "page_view",
          text: `Opens ${spec.name}`,
          x: 38,
          y: 23,
          scroll: 0,
          route: "/",
        },
        {
          at: 4,
          type: "hover",
          text: "Scans the task and first action",
          x: 62,
          y: 40,
          scroll: 0,
        },
        {
          at: 9,
          type: "click",
          text: "Opens the workflow",
          x: 52,
          y: 59,
          scroll: 0,
          route: "/workflow",
        },
        {
          at: 15,
          type: index === 1 ? "hesitation" : "focus",
          text: spec.observations[index],
          x: 68,
          y: 48,
          scroll: 60,
        },
        {
          at: 24,
          type: "click",
          text: spec.success[index]
            ? "Confirms the next action"
            : "Checks the supporting explanation",
          x: 71,
          y: 71,
          scroll: 80,
        },
        {
          at: duration,
          type: spec.success[index] ? "task_success" : "task_partial",
          text: spec.success[index]
            ? "Task completed independently"
            : "Task completed with uncertainty",
          x: 66,
          y: 71,
          scroll: 80,
        },
      ],
      product: { name: spec.name, url: spec.url, category: spec.scene },
    };
  });
  return {
    ...spec,
    sessions: cohort,
    changes: spec.changes.map((change) => ({
      title: change.title,
      reason: change.reason,
      sessionIds: change.indices.map((index) => cohort[index].id),
    })),
  };
});
export function sampleScore(project: SampleProject) {
  return Math.round(
    project.sessions.reduce((sum, session) => sum + session.comprehension, 0) /
      project.sessions.length,
  );
}
