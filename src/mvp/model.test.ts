import { describe, expect, it } from "vitest";
import {
  applyCommand,
  campaignCounts,
  campaignStage,
  emptyData,
  evidenceSources,
  publicData,
  reportMetrics,
} from "./model";
import type { Command, Profile, TaskResult, WorkspaceData } from "./types";
const profile = (id: string, role: Profile["role"]): Profile => ({
  id,
  role,
  name: `${role} ${id}`,
  email: `${id}@example.com`,
  expertise: ["Product design"],
  device: "desktop",
  availability: "available",
  bio: "",
  createdAt: "2026-10-09T00:00:00.000Z",
});
const founder = profile("founder", "founder"),
  admin = profile("admin", "admin");
const testers = Array.from({ length: 6 }, (_, i) =>
  profile(`tester-${i}`, "tester"),
);
function fixture() {
  const d = emptyData();
  d.profiles = [founder, admin, ...testers];
  return d;
}
let counter = 0;
function act(data: WorkspaceData, actor: Profile, command: Command) {
  return applyCommand(data, actor, command, {
    id: () => `id-${++counter}`,
    now: "2026-10-09T01:00:00.000Z",
  });
}
function create(data = fixture()) {
  return act(data, founder, {
    type: "create-campaign",
    campaign: {
      title: "Test onboarding",
      url: "https://example.com",
      audience: "Independent product designers",
      objective: "Can people find onboarding?",
      assumption: "The CTA is clear",
      tasks: [
        {
          id: "task-1",
          title: "Find onboarding",
          instructions: "Locate the start button",
          question: "What happened when you clicked?",
        },
      ],
      tasksApproved: true,
    },
  });
}
function paid() {
  const r = create();
  return act(r.data, founder, {
    type: "record-payment",
    campaignId: r.entityId!,
    reference: "payment-1",
  });
}
function feedback(assignmentId: string): Command {
  const results: TaskResult[] = [
    {
      taskId: "task-1",
      outcome: "blocked",
      answer: "I could not find the start button.",
      observation: "The start label was hidden below the fold.",
      severity: "major",
      evidence: [
        {
          id: "link-1",
          name: "Recording",
          kind: "video",
          url: "https://example.com/recording",
        },
      ],
    },
  ];
  return {
    type: "submit-feedback",
    assignmentId,
    results,
    overallFeedback: "Make the starting action easier to find.",
    consentConfirmed: true,
  };
}
function completed() {
  const payment = paid();
  let data = payment.data;
  const campaignId = payment.entityId!;
  for (const tester of testers.slice(0, 5)) {
    const invite = act(data, admin, {
      type: "invite-tester",
      campaignId,
      testerId: tester.id,
    });
    data = act(invite.data, tester, {
      type: "respond-invite",
      assignmentId: invite.entityId!,
      accept: true,
    }).data;
    const submitted = act(data, tester, feedback(invite.entityId!));
    data = act(submitted.data, admin, {
      type: "review-submission",
      submissionId: submitted.entityId!,
      decision: "approved",
      note: "Task and supporting recording checked.",
    }).data;
  }
  return { data, campaignId };
}
describe("human testing domain", () => {
  it("starts without fabricated participants, evidence or reports", () => {
    expect(emptyData()).toEqual({
      schemaVersion: 1,
      profiles: [],
      campaigns: [],
      assignments: [],
      submissions: [],
      reports: [],
      payouts: [],
    });
  });
  it("requires an approved complete mission and locks it after payment", () => {
    const created = create();
    const unapproved = act(created.data, founder, {
      type: "update-campaign",
      campaignId: created.entityId!,
      patch: { tasksApproved: false },
    });
    expect(() =>
      act(unapproved.data, founder, {
        type: "record-payment",
        campaignId: created.entityId!,
        reference: "p",
      }),
    ).toThrow("Approve");
    const p = paid();
    expect(campaignStage(p.data, p.data.campaigns[0])).toBe("recruiting");
    expect(() =>
      act(p.data, founder, {
        type: "update-campaign",
        campaignId: p.entityId!,
        patch: { objective: "Something else" },
      }),
    ).toThrow("launched");
  });
  it("enforces permissions and counts only five unique human slots; declined slots can be replaced", () => {
    const payment = paid();
    let data = payment.data;
    const campaignId = payment.entityId!;
    expect(() =>
      act(data, founder, {
        type: "invite-tester",
        campaignId,
        testerId: testers[0].id,
      }),
    ).toThrow("operations");
    const first = act(data, admin, {
      type: "invite-tester",
      campaignId,
      testerId: testers[0].id,
    });
    data = first.data;
    expect(() =>
      act(data, admin, {
        type: "invite-tester",
        campaignId,
        testerId: testers[0].id,
      }),
    ).toThrow("already");
    expect(() =>
      act(data, testers[1], {
        type: "respond-invite",
        assignmentId: first.entityId!,
        accept: true,
      }),
    ).toThrow("not found");
    data = act(data, testers[0], {
      type: "respond-invite",
      assignmentId: first.entityId!,
      accept: false,
    }).data;
    for (const t of testers.slice(1))
      data = act(data, admin, {
        type: "invite-tester",
        campaignId,
        testerId: t.id,
      }).data;
    expect(campaignCounts(data, campaignId).invited).toBe(5);
    expect(() =>
      act(data, admin, {
        type: "invite-tester",
        campaignId,
        testerId: testers[0].id,
      }),
    ).toThrow("five");
  });
  it("requires task answers and supporting evidence; QA revision can be resubmitted and payout is unique", () => {
    const p = paid();
    const inv = act(p.data, admin, {
      type: "invite-tester",
      campaignId: p.entityId!,
      testerId: testers[0].id,
    });
    const accepted = act(inv.data, testers[0], {
      type: "respond-invite",
      assignmentId: inv.entityId!,
      accept: true,
    });
    const cmd = feedback(inv.entityId!);
    if (cmd.type !== "submit-feedback") throw new Error();
    expect(() =>
      act(accepted.data, testers[0], {
        ...cmd,
        results: cmd.results.map((r) => ({ ...r, evidence: [] })),
      }),
    ).toThrow("screenshot");
    const submitted = act(accepted.data, testers[0], cmd);
    expect(submitted.data.payouts).toHaveLength(0);
    expect(reportMetrics(submitted.data, p.entityId!).tasks).toBe(0);
    expect(() =>
      act(submitted.data, admin, {
        type: "review-submission",
        submissionId: submitted.entityId!,
        decision: "revision",
        note: "",
      }),
    ).toThrow("improve");
    const revision = act(submitted.data, admin, {
      type: "review-submission",
      submissionId: submitted.entityId!,
      decision: "revision",
      note: "Please show the button location in the recording.",
    });
    const resubmitted = act(revision.data, testers[0], cmd);
    expect(resubmitted.entityId).toBe(submitted.entityId);
    const approved = act(resubmitted.data, admin, {
      type: "review-submission",
      submissionId: submitted.entityId!,
      decision: "approved",
      note: "Checked the recording.",
    });
    expect(approved.data.payouts).toHaveLength(1);
    expect(reportMetrics(approved.data, p.entityId!).blocked).toBe(1);
    expect(() => act(approved.data, testers[0], cmd)).toThrow("Accept");
    const payout = approved.data.payouts[0];
    expect(() =>
      act(approved.data, admin, {
        type: "record-payout",
        payoutId: payout.id,
        reference: "",
      }),
    ).toThrow("reference");
    const paidOut = act(approved.data, admin, {
      type: "record-payout",
      payoutId: payout.id,
      reference: "bank-transfer-1",
    });
    expect(() =>
      act(paidOut.data, admin, {
        type: "record-payout",
        payoutId: payout.id,
        reference: "bank-transfer-2",
      }),
    ).toThrow("already");
  });
  it("records real task time and execution details, rejects invalid measurements and requires media consent", () => {
    const payment = paid();
    const invited = act(payment.data, admin, {
      type: "invite-tester",
      campaignId: payment.entityId!,
      testerId: testers[0].id,
    });
    const accepted = act(invited.data, testers[0], {
      type: "respond-invite",
      assignmentId: invited.entityId!,
      accept: true,
    });
    const command = feedback(invited.entityId!);
    if (command.type !== "submit-feedback") throw new Error();
    expect(() =>
      act(accepted.data, testers[0], { ...command, consentConfirmed: false }),
    ).toThrow("consent");
    for (const durationSeconds of [-1, Infinity, NaN, 86401]) {
      expect(() =>
        act(accepted.data, testers[0], {
          ...command,
          results: command.results.map((result) => ({
            ...result,
            durationSeconds,
          })),
        }),
      ).toThrow("Task time");
    }
    expect(() =>
      act(accepted.data, testers[0], {
        ...command,
        results: command.results.map((result) => ({
          ...result,
          outcome: "success",
          executionOutcome: "abandoned",
        })),
      }),
    ).toThrow("cannot also");
    const recorded = act(accepted.data, testers[0], {
      ...command,
      results: command.results.map((result) => ({
        ...result,
        durationSeconds: 0,
        executionOutcome: "failed",
      })),
    });
    expect(recorded.data.submissions[0]).toMatchObject({
      consentConfirmed: true,
      results: [{ durationSeconds: 0, executionOutcome: "failed" }],
    });
    expect(accepted.data.submissions).toHaveLength(0);
  });
  it("never synthesizes empty evidence and cites approved exact task sources", () => {
    const p = paid();
    expect(() =>
      act(p.data, admin, {
        type: "synthesize-report",
        campaignId: p.entityId!,
      }),
    ).toThrow("feedback");
    const { data, campaignId } = completed();
    const r = act(data, admin, { type: "synthesize-report", campaignId });
    const report = r.data.reports[0];
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].sourceIds).toEqual(
      evidenceSources(data, campaignId).map((s) => s.id),
    );
    expect(reportMetrics(data, campaignId)).toEqual({
      testers: 5,
      tasks: 5,
      success: 0,
      partial: 0,
      blocked: 5,
      completionRate: 0,
    });
    expect(() =>
      act(r.data, admin, {
        type: "update-report",
        reportId: report.id,
        summary: report.summary,
        findings: [{ ...report.findings[0], sourceIds: ["fake:task-1"] }],
      }),
    ).toThrow("cite");
  });
  it("publishes only after all five reviewed humans and preserves report on retest", () => {
    const { data, campaignId } = completed();
    const generated = act(data, admin, {
      type: "synthesize-report",
      campaignId,
    });
    const report = generated.data.reports[0];
    const incomplete = structuredClone(generated.data);
    incomplete.submissions.pop();
    expect(() =>
      act(incomplete, admin, { type: "publish-report", reportId: report.id }),
    ).toThrow("five");
    const published = act(generated.data, admin, {
      type: "publish-report",
      reportId: report.id,
    });
    expect(campaignStage(published.data, published.data.campaigns[0])).toBe(
      "complete",
    );
    expect(() =>
      act(published.data, admin, { type: "synthesize-report", campaignId }),
    ).toThrow("immutable");
    const retest = act(published.data, founder, {
      type: "retest",
      campaignId,
      url: "https://example.com/v2",
      changes: "Moved the start action above the fold.",
    });
    expect(retest.data.reports[0]).toEqual(published.data.reports[0]);
    const next = retest.data.campaigns[1];
    expect(next.round).toBe(2);
    expect(next.payment).toBe("unpaid");
    expect(next.tasksApproved).toBe(false);
    expect(campaignCounts(retest.data, next.id).approved).toBe(0);
    expect(() =>
      act(retest.data, founder, {
        type: "retest",
        campaignId,
        url: "https://example.com/v3",
        changes: "Another new change here.",
      }),
    ).toThrow("existing");
  });
  it("filters unreviewed feedback, private profiles and other campaigns for each role", () => {
    const { data, campaignId } = completed();
    const gen = act(data, admin, { type: "synthesize-report", campaignId });
    const founders = publicData(gen.data, founder);
    expect(founders.reports).toHaveLength(0);
    expect(founders.profiles.find((p) => p.role === "tester")?.email).toBe("");
    const own = publicData(gen.data, testers[0]);
    expect(own.assignments).toHaveLength(1);
    expect(own.submissions).toHaveLength(1);
    expect(own.profiles).toHaveLength(1);
    expect(own.payouts).toHaveLength(1);
    expect(own.reports).toHaveLength(0);
    expect(publicData(gen.data, testers[5]).campaigns).toHaveLength(0);
  });
  it("does not mutate the previous state and rejected commands leave it intact", () => {
    const d = fixture();
    const copy = structuredClone(d);
    create(d);
    expect(d).toEqual(copy);
    expect(() =>
      act(d, testers[0], { type: "synthesize-report", campaignId: "missing" }),
    ).toThrow();
    expect(d).toEqual(copy);
  });
});
