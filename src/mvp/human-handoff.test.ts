import { describe, expect, it } from "vitest";
import { Script } from "node:vm";
import {
  buildParticipantMissionHtml,
  parseParticipantFeedback,
  participantMissionSnapshot,
} from "./human-handoff";
import { applyCommand, emptyData, reportMetrics } from "./model";
import { parseCommand } from "../../api/_lib/commands";
import type {
  Assignment,
  Campaign,
  ParticipantFeedback,
  Profile,
} from "./types";

const date = "2026-10-09T02:00:00.000Z";
const person = (id: string, role: Profile["role"]): Profile => ({
  id,
  role,
  name: `Private ${id}`,
  email: `${id}@example.com`,
  expertise: ["Product design"],
  device: "desktop",
  availability: "available",
  bio: "",
  createdAt: date,
});
function fixture() {
  const data = emptyData(),
    admin = person("admin", "admin"),
    founder = person("founder", "founder"),
    tester = person("tester", "tester");
  data.profiles = [admin, founder, tester];
  const campaign: Campaign = {
    id: "campaign",
    founderId: founder.id,
    title: "Onboarding",
    url: "https://example.com",
    audience: "Independent designers",
    objective: "Complete onboarding without help",
    assumption: "The first action is clear",
    tasks: [
      {
        id: "task",
        title: "Complete first action",
        instructions: "Attempt the first action without help.",
        question: "What happened?",
        successCriteria: "Reach the first completed action without assistance.",
      },
    ],
    tasksApproved: true,
    payment: "paid",
    priceCents: 14900,
    currency: "usd",
    round: 1,
    changes: "",
    createdAt: date,
    updatedAt: date,
  };
  const assignment: Assignment = {
    id: "assignment",
    campaignId: campaign.id,
    testerId: tester.id,
    status: "invited",
    invitedAt: date,
  };
  data.campaigns.push(campaign);
  data.assignments.push(assignment);
  const feedback: ParticipantFeedback = {
    kind: "playground-participant-feedback",
    schemaVersion: 1,
    assignmentId: assignment.id,
    campaignId: campaign.id,
    testerId: tester.id,
    mission: participantMissionSnapshot(campaign),
    results: [
      {
        taskId: "task",
        outcome: "success",
        executionOutcome: "assisted",
        durationSeconds: 0,
        answer: "I needed a hint from the coordinator.",
        observation: "The first action was difficult to find.",
        severity: "minor",
        evidence: [
          {
            id: "recording",
            name: "Private recording",
            kind: "video",
            url: "https://example.com/recording",
          },
        ],
      },
    ],
    overallFeedback: "Clarify the first action in onboarding.",
    consentConfirmed: true,
    submittedAt: date,
  };
  return { data, admin, founder, tester, campaign, assignment, feedback };
}
let index = 0;
describe("portable participant mission", () => {
  it("exports an assigned runnable HTML mission with real outcomes, timing, evidence and consent", () => {
    const { campaign, assignment } = fixture();
    const html = buildParticipantMissionHtml(
      campaign,
      assignment,
      "Participant",
    );
    expect(html).toContain("Download feedback JSON");
    expect(html).toContain("Completed with help");
    expect(html).toContain("Start timer");
    expect(html).toContain("Nothing is sent automatically");
    expect(html).toContain(
      "does not instrument the product or authenticate your identity",
    );
    const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Script(script!)).not.toThrow();
  });
  it("escapes product and participant text so uploaded or founder text cannot inject executable code", () => {
    const { campaign, assignment } = fixture();
    campaign.tasks[0].instructions =
      "</script><script>alert('secret')</script>";
    const html = buildParticipantMissionHtml(
      campaign,
      assignment,
      "<img src=x onerror=alert(1)>",
    );
    expect(html).not.toContain("</script><script>alert('secret')");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html.match(/<script>/g)).toHaveLength(1);
  });
  it("only exports approved paid missions for active assignments", () => {
    const { campaign, assignment } = fixture();
    expect(() =>
      buildParticipantMissionHtml(
        { ...campaign, tasksApproved: false },
        assignment,
      ),
    ).toThrow("approved campaign");
    expect(() =>
      buildParticipantMissionHtml(
        { ...campaign, payment: "unpaid" },
        assignment,
      ),
    ).toThrow("paid");
    expect(() =>
      buildParticipantMissionHtml(campaign, {
        ...assignment,
        status: "declined",
      }),
    ).toThrow("invited");
  });
  it("round trips feedback with participant timings and rejects stale mission changes or another assignment", () => {
    const { campaign, assignment, feedback } = fixture();
    expect(
      parseParticipantFeedback(JSON.stringify(feedback), campaign, assignment),
    ).toEqual(feedback);
    const changed = structuredClone(campaign);
    changed.tasks[0].successCriteria = "A different measured criterion.";
    expect(() =>
      parseParticipantFeedback(JSON.stringify(feedback), changed, assignment),
    ).toThrow("differs from the approved campaign");
    expect(() =>
      parseParticipantFeedback(
        JSON.stringify({ ...feedback, testerId: "someone-else" }),
        campaign,
        assignment,
      ),
    ).toThrow("another participant");
    expect(() =>
      parseParticipantFeedback(
        JSON.stringify({ ...feedback, assignmentId: "someone-else" }),
        campaign,
        assignment,
      ),
    ).toThrow("another participant");
  });
  it("rejects missing consent, invalid times, unsupported files, duplicate tasks and unsafe evidence URLs", () => {
    const { campaign, assignment, feedback } = fixture();
    expect(() =>
      parseParticipantFeedback(
        JSON.stringify({ ...feedback, consentConfirmed: false }),
        campaign,
        assignment,
      ),
    ).toThrow("consent");
    expect(() =>
      parseParticipantFeedback("not a JSON file", campaign, assignment),
    ).toThrow("JSON could not");
    for (const durationSeconds of [-1, 86401, null])
      expect(() =>
        parseParticipantFeedback(
          JSON.stringify({
            ...feedback,
            results: [{ ...feedback.results[0], durationSeconds }],
          }),
          campaign,
          assignment,
        ),
      ).toThrow("measured seconds");
    expect(() =>
      parseParticipantFeedback(
        JSON.stringify({
          ...feedback,
          results: [
            {
              ...feedback.results[0],
              evidence: [
                {
                  id: "bad",
                  name: "Evidence",
                  kind: "link",
                  url: "javascript:alert(1)",
                },
              ],
            },
          ],
        }),
        campaign,
        assignment,
      ),
    ).toThrow("HTTP(S)");
    expect(() =>
      parseParticipantFeedback(
        JSON.stringify({
          ...feedback,
          results: [{ ...feedback.results[0], taskId: "other" }],
        }),
        campaign,
        assignment,
      ),
    ).toThrow("unknown task");
  });
  it("requires operations confirmation and imports actual feedback as pending QA with no payout or approved metrics", () => {
    const { data, admin, founder, tester, feedback } = fixture();
    const command = {
      type: "import-participant-feedback" as const,
      feedback,
      identityConfirmed: true,
    };
    expect(() => applyCommand(data, founder, command)).toThrow(
      "Only operations",
    );
    expect(() => applyCommand(data, tester, command)).toThrow(
      "Only operations",
    );
    expect(() =>
      applyCommand(data, admin, { ...command, identityConfirmed: false }),
    ).toThrow("identity and consent");
    const imported = applyCommand(data, admin, command, {
      id: () => `id-${++index}`,
      now: date,
    });
    expect(imported.data.submissions[0]).toMatchObject({
      status: "submitted",
      submittedVia: "portable",
      participantSubmittedAt: date,
      consentConfirmed: true,
      results: [{ durationSeconds: 0, executionOutcome: "assisted" }],
    });
    expect(imported.data.assignments[0].status).toBe("submitted");
    expect(imported.data.payouts).toHaveLength(0);
    expect(reportMetrics(imported.data, "campaign").tasks).toBe(0);
    expect(data.submissions).toHaveLength(0);
    expect(() => applyCommand(imported.data, admin, command)).toThrow(
      "already submitted",
    );
  });
  it("supports coordinator-requested revisions and counts evidence only after separate QA approval", () => {
    const { data, admin, feedback } = fixture();
    const command = {
      type: "import-participant-feedback" as const,
      feedback,
      identityConfirmed: true,
    };
    const imported = applyCommand(data, admin, command, {
      id: () => `id-${++index}`,
      now: date,
    });
    const revision = applyCommand(imported.data, admin, {
      type: "review-submission",
      submissionId: imported.entityId!,
      decision: "revision",
      note: "Explain exactly where you needed assistance.",
    });
    const resubmitted = applyCommand(revision.data, admin, {
      ...command,
      feedback: {
        ...feedback,
        overallFeedback: "Updated detailed feedback about the first action.",
      },
    });
    expect(resubmitted.entityId).toBe(imported.entityId);
    expect(resubmitted.data.submissions[0].status).toBe("submitted");
    const approved = applyCommand(resubmitted.data, admin, {
      type: "review-submission",
      submissionId: imported.entityId!,
      decision: "approved",
      note: "Checked the recording and the observation.",
    });
    expect(reportMetrics(approved.data, "campaign").tasks).toBe(1);
    expect(reportMetrics(approved.data, "campaign").success).toBe(0);
    expect(approved.data.payouts).toHaveLength(1);
    expect(() => applyCommand(approved.data, admin, command)).toThrow(
      "approved",
    );
  });
  it("whitelists the portable API command and retains approved task success criteria", () => {
    const { feedback } = fixture();
    const parsed = parseCommand({
      type: "import-participant-feedback",
      feedback: { ...feedback, status: "approved", founderId: "intruder" },
      identityConfirmed: true,
      actor: { role: "admin" },
    });
    expect(parsed).toEqual({
      type: "import-participant-feedback",
      feedback,
      identityConfirmed: true,
    });
    expect(parsed).not.toHaveProperty("actor");
    expect(parsed).not.toHaveProperty("feedback.status");
  });
});
