import type {
  Campaign,
  CampaignStage,
  Command,
  CommandResult,
  Finding,
  Profile,
  Task,
  WorkspaceData,
} from "./types.js";
import { validateParticipantFeedback } from "./human-handoff.js";

export const TESTER_SLOTS = 5;
export const CAMPAIGN_PRICE = 14900;
export const TESTER_REWARD = 1500;
export function emptyData(): WorkspaceData {
  return {
    schemaVersion: 1,
    profiles: [],
    campaigns: [],
    assignments: [],
    submissions: [],
    reports: [],
    payouts: [],
  };
}
export function money(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}
export function campaignCounts(data: WorkspaceData, campaignId: string) {
  const assignments = data.assignments.filter(
    (a) => a.campaignId === campaignId && a.status !== "declined",
  );
  return {
    invited: assignments.length,
    accepted: assignments.filter((a) => a.status !== "invited").length,
    submitted: assignments.filter((a) =>
      ["submitted", "approved"].includes(a.status),
    ).length,
    approved: data.submissions.filter(
      (s) => s.campaignId === campaignId && s.status === "approved",
    ).length,
    paid: data.payouts.filter(
      (p) => p.campaignId === campaignId && p.status === "paid",
    ).length,
  };
}
export function campaignStage(
  data: WorkspaceData,
  campaign: Campaign,
): CampaignStage {
  if (campaign.payment !== "paid") return "draft";
  if (
    data.reports.some(
      (r) => r.campaignId === campaign.id && r.status === "published",
    )
  )
    return "complete";
  const counts = campaignCounts(data, campaign.id);
  if (counts.approved === TESTER_SLOTS) return "analysis";
  if (
    data.assignments.some(
      (a) => a.campaignId === campaign.id && a.status === "submitted",
    )
  )
    return "review";
  if (counts.accepted > 0) return "testing";
  return "recruiting";
}
export function evidenceSources(data: WorkspaceData, campaignId: string) {
  const campaign = data.campaigns.find((c) => c.id === campaignId);
  return data.submissions
    .filter((s) => s.campaignId === campaignId && s.status === "approved")
    .flatMap((s) =>
      s.results.map((result) => ({
        id: `${s.id}:${result.taskId}`,
        submissionId: s.id,
        testerId: s.testerId,
        testerName:
          data.profiles.find((p) => p.id === s.testerId)?.name ?? "Tester",
        taskId: result.taskId,
        taskTitle:
          campaign?.tasks.find((t) => t.id === result.taskId)?.title ?? "Task",
        result,
      })),
    );
}
export function reportMetrics(data: WorkspaceData, campaignId: string) {
  const sources = evidenceSources(data, campaignId);
  const success = sources.filter(
    (s) => s.result.outcome === "success" && !s.result.executionOutcome,
  ).length;
  return {
    testers: new Set(sources.map((s) => s.testerId)).size,
    tasks: sources.length,
    success,
    partial: sources.filter((s) => s.result.outcome === "partial").length,
    blocked: sources.filter((s) => s.result.outcome === "blocked").length,
    completionRate: sources.length
      ? Math.round((success / sources.length) * 100)
      : 0,
  };
}
export function validProductUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}
export function suggestMission(input: {
  objective: string;
  audience: string;
  assumption: string;
  url?: string;
}): Task[] {
  const goal = input.objective.trim();
  const pricing = /pric|pay|cost|plan|subscription/i.test(goal);
  const onboarding = /onboard|signup|sign.up|account|first/i.test(goal);
  return [
    {
      id: crypto.randomUUID(),
      title: "Understand the product",
      instructions: `Open the product as ${input.audience || "a first-time visitor"}. Explore the first page without reading outside material.`,
      question:
        "In your own words, what does this product do, who is it for, and what would you expect to happen next?",
      successCriteria:
        "Describe the product's purpose and intended users without help from the moderator.",
    },
    {
      id: crypto.randomUUID(),
      title: pricing
        ? "Evaluate the price"
        : onboarding
          ? "Try the first-use flow"
          : "Try the core task",
      instructions: pricing
        ? "Find the pricing. Choose the plan you would use and explain your choice. Do not make a purchase."
        : `Attempt the flow most relevant to this goal: ${goal}. Stop before submitting sensitive information or making a purchase.`,
      question:
        "What did you try, what happened, and where did you hesitate or get stuck?",
      successCriteria: pricing
        ? "Locate current pricing, select a relevant plan and explain the choice without help or making a purchase."
        : `Complete the flow relevant to “${goal}” without help, before any purchase or sensitive information is submitted.`,
    },
    {
      id: crypto.randomUUID(),
      title: "Evaluate the next step",
      instructions: `Review whether the product met the goal${input.assumption ? ` and consider this assumption: ${input.assumption}` : ""}. Capture a screenshot or recording of any issue.`,
      question:
        "What would you do next, and what specific change would make that decision easier?",
      successCriteria:
        "Identify the next available product action and explain whether the tested flow met the objective without help.",
    },
  ];
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function validateCampaign(campaign: Campaign) {
  assert(campaign.title.trim().length >= 2, "Give your product a name.");
  assert(
    validProductUrl(campaign.url),
    "Enter a valid HTTP or HTTPS product URL.",
  );
  assert(
    campaign.audience.trim().length >= 5,
    "Describe the people you want to test with.",
  );
  assert(
    campaign.objective.trim().length >= 5,
    "Describe your testing objective.",
  );
  assert(
    campaign.tasks.length <= 8,
    "Keep the mission to eight tasks or fewer.",
  );
  assert(
    new Set(campaign.tasks.map((t) => t.id)).size === campaign.tasks.length,
    "Each task needs a unique ID.",
  );
  assert(
    campaign.tasks.every(
      (task) =>
        task.successCriteria === undefined ||
        (typeof task.successCriteria === "string" &&
          task.successCriteria.length <= 3000),
    ),
    "Task success criteria must be text of 3000 characters or fewer.",
  );
  if (campaign.tasksApproved) {
    assert(
      campaign.tasks.length >= 1,
      "Add at least one task before approval.",
    );
    assert(
      campaign.tasks.every(
        (t) => t.title.trim() && t.instructions.trim() && t.question.trim(),
      ),
      "Every task needs a title, instructions and a question.",
    );
  }
}
export function validateFindings(
  data: WorkspaceData,
  campaignId: string,
  findings: Finding[],
) {
  const sources = evidenceSources(data, campaignId);
  assert(
    new Set(findings.map((f) => f.id)).size === findings.length,
    "Finding IDs must be unique.",
  );
  for (const finding of findings) {
    assert(
      finding.title.trim() &&
        finding.description.trim() &&
        finding.recommendation.trim(),
      "Every finding needs a title, description and recommended fix.",
    );
    assert(
      ["blocker", "major", "minor"].includes(finding.severity),
      "Choose a valid issue severity.",
    );
    assert(
      finding.sourceIds.length > 0 &&
        finding.sourceIds.every((id) => sources.some((s) => s.id === id)),
      "Every finding must cite approved feedback from this campaign.",
    );
    assert(
      finding.taskIds.length > 0 &&
        finding.taskIds.every((id) =>
          finding.sourceIds.some(
            (sid) => sources.find((s) => s.id === sid)?.taskId === id,
          ),
        ),
      "Each finding task must have a cited source.",
    );
  }
}
export function applyCommand(
  original: WorkspaceData,
  actor: Profile,
  command: Command,
  options: { id?: () => string; now?: string } = {},
): CommandResult {
  const data = structuredClone(original);
  const id = options.id ?? (() => crypto.randomUUID());
  const now = options.now ?? new Date().toISOString();
  assert(
    data.profiles.some((p) => p.id === actor.id && p.role === actor.role),
    "Open a workspace view to continue.",
  );
  const admin = () =>
    assert(actor.role === "admin", "Only operations can perform this action.");
  const campaignById = (campaignId: string) => {
    const c = data.campaigns.find((c) => c.id === campaignId);
    assert(c, "Campaign not found.");
    return c;
  };
  const owner = (c: Campaign) =>
    assert(
      c.founderId === actor.id && actor.role === "founder",
      "Only the campaign founder can change this campaign.",
    );
  let entityId: string | undefined;
  switch (command.type) {
    case "import-participant-feedback": {
      admin();
      assert(
        command.identityConfirmed === true,
        "Confirm the participant's identity and consent before importing feedback.",
      );
      const assignment = data.assignments.find(
        (entry) => entry.id === command.feedback.assignmentId,
      );
      assert(assignment, "Participant assignment not found.");
      const campaign = campaignById(assignment.campaignId);
      assert(
        campaign.payment === "paid" && campaign.tasksApproved,
        "Launch the approved campaign before collecting participant feedback.",
      );
      assert(
        ["invited", "accepted", "revision"].includes(assignment.status),
        "This assignment is already submitted, declined or approved. Request a revision before importing another response.",
      );
      const feedback = validateParticipantFeedback(
        command.feedback,
        campaign,
        assignment,
      );
      const tester = data.profiles.find(
        (profile) =>
          profile.id === assignment.testerId && profile.role === "tester",
      );
      assert(tester, "Assigned participant profile not found.");
      if (assignment.status === "invited") {
        assignment.status = "accepted";
        assignment.acceptedAt = now;
      }
      const result = applyCommand(
        data,
        tester,
        {
          type: "submit-feedback",
          assignmentId: assignment.id,
          results: feedback.results,
          overallFeedback: feedback.overallFeedback,
          consentConfirmed: feedback.consentConfirmed,
        },
        { id, now },
      );
      const submission = result.data.submissions.find(
        (entry) => entry.id === result.entityId,
      )!;
      submission.submittedVia = "portable";
      submission.participantSubmittedAt = feedback.submittedAt;
      return result;
    }
    case "update-profile": {
      assert(command.profile.name.trim().length >= 2, "Enter your name.");
      assert(
        ["desktop", "mobile", "both"].includes(command.profile.device),
        "Choose a valid device.",
      );
      assert(
        ["available", "busy"].includes(command.profile.availability),
        "Choose your availability.",
      );
      assert(
        command.profile.expertise.every((e) => typeof e === "string") &&
          command.profile.expertise.length <= 20,
        "Enter up to 20 expertise tags.",
      );
      Object.assign(
        data.profiles.find((p) => p.id === actor.id)!,
        command.profile,
      );
      break;
    }
    case "create-campaign": {
      assert(actor.role === "founder", "Only founders can create a campaign.");
      const campaign: Campaign = {
        ...command.campaign,
        id: id(),
        founderId: actor.id,
        payment: "unpaid",
        priceCents: CAMPAIGN_PRICE,
        currency: "usd",
        round: 1,
        changes: "",
        createdAt: now,
        updatedAt: now,
      };
      validateCampaign(campaign);
      data.campaigns.push(campaign);
      entityId = campaign.id;
      break;
    }
    case "update-campaign": {
      const c = campaignById(command.campaignId);
      owner(c);
      assert(
        c.payment === "unpaid",
        "A launched mission cannot be changed. Create a retest instead.",
      );
      assert(
        !c.checkoutExpiresAt ||
          Date.parse(c.checkoutExpiresAt) <= Date.parse(now),
        "Checkout is open. Cancel it from campaign status before editing the mission.",
      );
      Object.assign(c, command.patch, { updatedAt: now });
      validateCampaign(c);
      entityId = c.id;
      break;
    }
    case "record-payment": {
      const c = campaignById(command.campaignId);
      assert(
        actor.role === "admin" || c.founderId === actor.id,
        "You cannot pay for this campaign.",
      );
      assert(c.tasksApproved, "Approve the mission before checkout.");
      validateCampaign(c);
      assert(command.reference.trim(), "A payment reference is required.");
      if (c.payment === "paid") {
        assert(
          c.paymentReference === command.reference,
          "This campaign has already been paid.",
        );
        break;
      }
      Object.assign(c, {
        payment: "paid",
        paymentReference: command.reference,
        updatedAt: now,
      });
      delete c.checkoutExpiresAt;
      entityId = c.id;
      break;
    }
    case "invite-tester": {
      admin();
      const c = campaignById(command.campaignId);
      assert(
        c.payment === "paid",
        "Payment must be confirmed before matching.",
      );
      assert(
        !data.reports.some(
          (r) => r.campaignId === c.id && r.status === "published",
        ),
        "This campaign is complete.",
      );
      const tester = data.profiles.find(
        (p) => p.id === command.testerId && p.role === "tester",
      );
      assert(tester, "Select a human tester profile.");
      assert(
        tester.availability === "available" && tester.expertise.length > 0,
        "The tester needs an available, completed profile.",
      );
      assert(
        campaignCounts(data, c.id).invited < TESTER_SLOTS,
        "All five tester slots are filled.",
      );
      assert(
        !data.assignments.some(
          (a) =>
            a.campaignId === c.id &&
            a.testerId === tester.id &&
            a.status !== "declined",
        ),
        "This tester already has an invitation.",
      );
      const assignment = {
        id: id(),
        campaignId: c.id,
        testerId: tester.id,
        status: "invited" as const,
        invitedAt: now,
      };
      data.assignments.push(assignment);
      entityId = assignment.id;
      break;
    }
    case "respond-invite": {
      const a = data.assignments.find((a) => a.id === command.assignmentId);
      assert(
        a && a.testerId === actor.id && actor.role === "tester",
        "Invitation not found.",
      );
      assert(
        a.status === "invited",
        "This invitation has already been answered.",
      );
      a.status = command.accept ? "accepted" : "declined";
      if (command.accept) a.acceptedAt = now;
      entityId = a.id;
      break;
    }
    case "submit-feedback": {
      const a = data.assignments.find((a) => a.id === command.assignmentId);
      assert(
        a && a.testerId === actor.id && actor.role === "tester",
        "Assignment not found.",
      );
      assert(
        ["accepted", "revision"].includes(a.status),
        "Accept the invitation before submitting feedback.",
      );
      const c = campaignById(a.campaignId);
      assert(
        command.results.length === c.tasks.length &&
          new Set(command.results.map((r) => r.taskId)).size === c.tasks.length,
        "Complete every mission task once.",
      );
      for (const result of command.results) {
        assert(
          c.tasks.some((t) => t.id === result.taskId),
          "Feedback contains an unknown task.",
        );
        assert(
          ["success", "partial", "blocked"].includes(result.outcome),
          "Record an outcome for every task.",
        );
        assert(
          result.durationSeconds === undefined ||
            (typeof result.durationSeconds === "number" &&
              Number.isFinite(result.durationSeconds) &&
              result.durationSeconds >= 0 &&
              result.durationSeconds <= 86400),
          "Task time must be between 0 and 86400 seconds, or left unrecorded.",
        );
        assert(
          result.executionOutcome === undefined ||
            ["failed", "abandoned", "assisted"].includes(
              result.executionOutcome,
            ),
          "Choose a valid task execution outcome.",
        );
        assert(
          !["failed", "abandoned"].includes(result.executionOutcome ?? "") ||
            result.outcome !== "success",
          "A failed or abandoned task cannot also be marked completed.",
        );
        assert(
          result.answer.trim().length >= 10 &&
            result.observation.trim().length >= 10,
          "Add useful answers and observations (at least 10 characters each).",
        );
        assert(
          ["none", "blocker", "major", "minor"].includes(result.severity),
          "Choose a valid severity.",
        );
        assert(
          result.evidence.every(
            (e) =>
              ["image", "video", "link"].includes(e.kind) &&
              (validProductUrl(e.url) ||
                /^data:image\/(png|jpeg|webp|gif);base64,/.test(e.url)),
          ),
          "Evidence must be an image, recording or valid HTTP(S) link.",
        );
        assert(
          result.evidence.length <= 6,
          "Attach up to six evidence items per task.",
        );
      }
      assert(
        command.results.some((r) => r.evidence.length > 0),
        "Attach at least one screenshot, recording or supporting link.",
      );
      assert(
        command.consentConfirmed === undefined ||
          typeof command.consentConfirmed === "boolean",
        "Record valid participant consent.",
      );
      assert(
        !command.results.some((result) =>
          result.evidence.some(
            (asset) => asset.kind === "image" || asset.kind === "video",
          ),
        ) || command.consentConfirmed === true,
        "Confirm participant consent before submitting screenshots or recordings.",
      );
      assert(
        command.overallFeedback.trim().length >= 10,
        "Add a useful overall observation.",
      );
      let submission = data.submissions.find((s) => s.assignmentId === a.id);
      if (submission)
        Object.assign(submission, {
          results: command.results,
          overallFeedback: command.overallFeedback,
          status: "submitted",
          updatedAt: now,
          consentConfirmed: command.consentConfirmed,
          submittedVia: "workspace",
          participantSubmittedAt: undefined,
        });
      else {
        submission = {
          id: id(),
          assignmentId: a.id,
          campaignId: a.campaignId,
          testerId: actor.id,
          results: command.results,
          overallFeedback: command.overallFeedback,
          status: "submitted",
          qaNote: "",
          createdAt: now,
          updatedAt: now,
          consentConfirmed: command.consentConfirmed,
          submittedVia: "workspace",
        };
        data.submissions.push(submission);
      }
      a.status = "submitted";
      entityId = submission.id;
      break;
    }
    case "review-submission": {
      admin();
      const s = data.submissions.find((s) => s.id === command.submissionId);
      assert(s, "Submission not found.");
      assert(
        s.status === "submitted",
        "Only pending submissions can be reviewed.",
      );
      assert(
        ["approved", "revision"].includes(command.decision),
        "Choose approve or request revision.",
      );
      if (command.decision === "revision")
        assert(
          command.note.trim().length >= 10,
          "Tell the tester what to improve.",
        );
      s.status = command.decision;
      s.qaNote = command.note.trim();
      s.updatedAt = now;
      data.assignments.find((a) => a.id === s.assignmentId)!.status =
        command.decision;
      if (
        command.decision === "approved" &&
        !data.payouts.some((p) => p.assignmentId === s.assignmentId)
      )
        data.payouts.push({
          id: id(),
          assignmentId: s.assignmentId,
          testerId: s.testerId,
          campaignId: s.campaignId,
          amountCents: TESTER_REWARD,
          currency: "usd",
          status: "pending",
          reference: "",
        });
      // A changed source set invalidates a draft; synthesis must include the final reviewed cohort.
      data.reports = data.reports.filter(
        (r) => r.campaignId !== s.campaignId || r.status === "published",
      );
      break;
    }
    case "record-payout": {
      admin();
      const p = data.payouts.find((p) => p.id === command.payoutId);
      assert(p, "Payout not found.");
      assert(
        p.status === "pending",
        "This reward has already been recorded as paid.",
      );
      assert(
        command.reference.trim().length >= 3,
        "Record the manual payment reference.",
      );
      p.status = "paid";
      p.reference = command.reference.trim();
      p.paidAt = now;
      break;
    }
    case "synthesize-report": {
      admin();
      const c = campaignById(command.campaignId);
      const sources = evidenceSources(data, c.id);
      assert(
        sources.length > 0,
        "Approve human feedback before generating a report.",
      );
      assert(
        !data.reports.some(
          (r) => r.campaignId === c.id && r.status === "published",
        ),
        "A published report is immutable. Create a retest.",
      );
      const findings: Finding[] = c.tasks.flatMap((task) => {
        const issues = sources.filter(
          (s) =>
            s.taskId === task.id &&
            (s.result.outcome !== "success" ||
              s.result.severity !== "none" ||
              Boolean(s.result.executionOutcome)),
        );
        if (!issues.length) return [];
        const severity = issues.some(
          (s) =>
            s.result.severity === "blocker" || s.result.outcome === "blocked",
        )
          ? "blocker"
          : issues.some((s) => s.result.severity === "major")
            ? "major"
            : "minor";
        return [
          {
            id: id(),
            title: `Friction in: ${task.title}`,
            severity,
            description: issues
              .map((s) => `${s.testerName}: ${s.result.observation}`)
              .join("\n\n"),
            recommendation: `Review the cited feedback for “${task.title}”, address the observed friction, and repeat this task in the next round.`,
            sourceIds: issues.map((s) => s.id),
            taskIds: [task.id],
          },
        ];
      });
      const m = reportMetrics(data, c.id);
      data.reports = data.reports.filter((r) => r.campaignId !== c.id);
      const report = {
        id: id(),
        campaignId: c.id,
        summary: `${m.testers} reviewed human tester${m.testers === 1 ? "" : "s"} recorded ${m.tasks} task attempts. ${m.success} succeeded without assistance. ${sources.filter((source) => source.result.executionOutcome === "assisted").length} needed help, ${sources.filter((source) => source.result.executionOutcome === "abandoned").length} were abandoned, ${sources.filter((source) => source.result.executionOutcome === "failed").length} failed. ${m.partial} legacy outcomes were partial and ${m.blocked} were blocked. ${findings.length} task-level issue${findings.length === 1 ? "" : "s"} ${findings.length === 1 ? "is" : "are"} backed by the cited submissions. This describes the tested cohort, not market demand.`,
        findings,
        status: "draft" as const,
        method: "structured" as const,
        generatedAt: now,
      };
      data.reports.push(report);
      entityId = report.id;
      break;
    }
    case "update-report": {
      admin();
      const r = data.reports.find((r) => r.id === command.reportId);
      assert(r && r.status === "draft", "Only draft reports can be edited.");
      assert(
        command.summary.trim().length >= 10,
        "Add a meaningful report summary.",
      );
      validateFindings(data, r.campaignId, command.findings);
      r.summary = command.summary;
      r.findings = command.findings;
      if (command.method !== undefined) {
        assert(
          ["structured", "ai"].includes(command.method),
          "Choose a valid report generation method.",
        );
        r.method = command.method;
      }
      entityId = r.id;
      break;
    }
    case "publish-report": {
      admin();
      const r = data.reports.find((r) => r.id === command.reportId);
      assert(
        r && r.status === "draft",
        "Review a draft report before publishing.",
      );
      assert(
        campaignCounts(data, r.campaignId).approved === TESTER_SLOTS,
        "All five human submissions must pass QA before the report ships.",
      );
      validateFindings(data, r.campaignId, r.findings);
      r.status = "published";
      r.reviewedAt = now;
      r.reviewerId = actor.id;
      entityId = r.id;
      break;
    }
    case "retest": {
      const c = campaignById(command.campaignId);
      owner(c);
      assert(
        data.reports.some(
          (r) => r.campaignId === c.id && r.status === "published",
        ),
        "Review a published report before retesting.",
      );
      assert(validProductUrl(command.url), "Enter the updated product URL.");
      assert(
        command.changes.trim().length >= 10,
        "Describe what changed for the next round.",
      );
      assert(
        !data.campaigns.some(
          (n) =>
            n.parentCampaignId === c.id &&
            !data.reports.some(
              (r) => r.campaignId === n.id && r.status === "published",
            ),
        ),
        "Finish the existing next round before creating another.",
      );
      const next: Campaign = {
        ...c,
        id: id(),
        url: command.url,
        tasks: c.tasks.map((t) => ({ ...t })),
        tasksApproved: false,
        payment: "unpaid",
        paymentReference: undefined,
        round: c.round + 1,
        parentCampaignId: c.id,
        changes: command.changes.trim(),
        createdAt: now,
        updatedAt: now,
      };
      data.campaigns.push(next);
      entityId = next.id;
      break;
    }
    default:
      throw new Error("Unknown action.");
  }
  return { data, entityId };
}
export function publicData(
  original: WorkspaceData,
  actor: Profile,
): WorkspaceData {
  if (actor.role === "admin") return original;
  const campaigns =
    actor.role === "founder"
      ? original.campaigns.filter((c) => c.founderId === actor.id)
      : original.campaigns.filter((c) =>
          original.assignments.some(
            (a) => a.campaignId === c.id && a.testerId === actor.id,
          ),
        );
  const campaignIds = new Set(campaigns.map((c) => c.id));
  const assignments = original.assignments.filter(
    (a) =>
      campaignIds.has(a.campaignId) &&
      (actor.role === "founder" || a.testerId === actor.id),
  );
  const testerIds = new Set(assignments.map((a) => a.testerId));
  return {
    schemaVersion: 1,
    campaigns,
    profiles: original.profiles
      .filter(
        (p) =>
          p.id === actor.id ||
          (actor.role === "founder" && testerIds.has(p.id)),
      )
      .map((p) => (p.id === actor.id ? p : { ...p, email: "" })),
    assignments,
    submissions: original.submissions.filter(
      (s) =>
        campaignIds.has(s.campaignId) &&
        (actor.role === "founder"
          ? s.status === "approved"
          : s.testerId === actor.id),
    ),
    reports:
      actor.role === "founder"
        ? original.reports.filter(
            (r) => campaignIds.has(r.campaignId) && r.status === "published",
          )
        : [],
    payouts: original.payouts.filter(
      (p) =>
        campaignIds.has(p.campaignId) &&
        (actor.role === "founder" || p.testerId === actor.id),
    ),
  };
}
