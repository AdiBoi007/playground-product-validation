import { authHeaders } from "./auth-client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  CreditCard,
  ExternalLink,
  FileCheck2,
  FileText,
  ImagePlus,
  Link2,
  Monitor,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useMvp } from "./store";
import { campaignCounts, campaignStage, money, reportMetrics } from "./model";
import { readDraft, removeDraft, writeDraft } from "./draft-store";
import {
  buildParticipantMissionHtml,
  parseParticipantFeedback,
  participantMissionFilename,
  PARTICIPANT_FEEDBACK_MAX_BYTES,
} from "./human-handoff";
import type {
  Assignment,
  Campaign,
  EvidenceAsset,
  Finding,
  Profile,
  Report,
  Severity,
  Submission,
  TaskResult,
  WorkspaceData,
} from "./types";
import "./operations.css";

const severityLabels: Record<Severity | "none", string> = {
  blocker: "Blocker",
  major: "Major",
  minor: "Minor",
  none: "No issue",
};
const statusLabels: Record<Assignment["status"], string> = {
  invited: "New invitation",
  accepted: "In progress",
  declined: "Declined",
  submitted: "Under review",
  revision: "Changes requested",
  approved: "Approved",
};
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
const taskSourceId = (submission: Submission, taskId: string) =>
  `${submission.id}:${taskId}`;

function useAction() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function run(work: () => Promise<unknown>, success = "") {
    setError("");
    setMessage("");
    setPending(true);
    try {
      await work();
      setMessage(success);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The action could not be completed. Please try again.",
      );
      return false;
    } finally {
      setPending(false);
    }
  }
  return { run, pending, message, error, setError };
}

function ActionMessage({ action }: { action: ReturnType<typeof useAction> }) {
  if (!action.message && !action.error) return null;
  return (
    <div
      className={`mvp-op-notice ${action.error ? "is-error" : "is-success"}`}
      role={action.error ? "alert" : "status"}
    >
      {action.error ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}
      <span>{action.error || action.message}</span>
    </div>
  );
}

function EmptyState({
  title,
  children,
}: {
  icon?: typeof Users;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mvp-op-empty">
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function AssignmentBadge({ status }: { status: Assignment["status"] }) {
  return (
    <span
      className={`mvp-op-pill ${status === "approved" ? "is-lime" : status === "revision" ? "is-amber" : ""}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function ProfileEditor({ user }: { user: Profile }) {
  const { command, busy, data } = useMvp();
  const unsaved = !data.profiles.some((profile) => profile.id === user.id);
  const [editing, setEditing] = useState(unsaved);
  const [name, setName] = useState(unsaved ? "" : user.name);
  const [expertise, setExpertise] = useState(user.expertise.join(", "));
  const [device, setDevice] = useState(user.device);
  const [availability, setAvailability] = useState(user.availability);
  const [bio, setBio] = useState(user.bio);
  const action = useAction();
  const reset = () => {
    setName(unsaved ? "" : user.name);
    setExpertise(user.expertise.join(", "));
    setDevice(user.device);
    setAvailability(user.availability);
    setBio(user.bio);
  };
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (
      await action.run(
        () =>
          command({
            type: "update-profile",
            profile: {
              name: name.trim(),
              expertise: [
                ...new Set(
                  expertise
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                ),
              ],
              device,
              availability,
              bio: bio.trim(),
            },
          }),
        "Profile saved.",
      )
    )
      setEditing(false);
  }
  return (
    <section className="mvp-card mvp-op-profile">
      <div className="mvp-op-section-top">
        <div>
          <h2>Tester profile</h2>
        </div>
        <button
          className="mvp-btn secondary"
          onClick={() => {
            reset();
            setEditing(!editing);
          }}
        >
          {editing ? "Cancel" : "Edit profile"}
        </button>
      </div>
      <ActionMessage action={action} />
      {editing ? (
        <form className="mvp-op-form" onSubmit={save}>
          <label className="mvp-field">
            Name
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="mvp-field">
            Expertise
            <input
              value={expertise}
              onChange={(event) => setExpertise(event.target.value)}
              placeholder="Product design, finance, small business"
            />
            <small>Separate expertise areas with commas.</small>
          </label>
          <div className="mvp-op-form-pair">
            <label className="mvp-field">
              Your device
              <select
                value={device}
                onChange={(event) =>
                  setDevice(event.target.value as Profile["device"])
                }
              >
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobile</option>
                <option value="both">Desktop and mobile</option>
              </select>
            </label>
            <label className="mvp-field">
              Availability
              <select
                value={availability}
                onChange={(event) =>
                  setAvailability(event.target.value as Profile["availability"])
                }
              >
                <option value="available">Available for invitations</option>
                <option value="busy">Currently busy</option>
              </select>
            </label>
          </div>
          <label className="mvp-field">
            Experience
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Relevant work or product experience"
              rows={3}
            />
          </label>
          <button className="mvp-btn" disabled={busy || action.pending}>
            Save profile <Check size={16} />
          </button>
        </form>
      ) : (
        <div className="mvp-op-profile-read">
          <div className="mvp-op-person">
            <span className="mvp-op-avatar">{initials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <div className="mvp-op-tags">
            <span className="mvp-op-pill">
              {user.device === "mobile" ? (
                <Smartphone size={13} />
              ) : (
                <Monitor size={13} />
              )}
              {user.device === "both" ? "Desktop + mobile" : user.device}
            </span>
            <span
              className={`mvp-op-pill ${user.availability === "available" ? "is-lime" : ""}`}
            >
              {user.availability === "available"
                ? "Available"
                : "Currently busy"}
            </span>
            {user.expertise.map((area) => (
              <span className="mvp-op-pill" key={area}>
                {area}
              </span>
            ))}
          </div>
          {user.bio && <p>{user.bio}</p>}
          {!user.expertise.length && <p>Add expertise before matching.</p>}
        </div>
      )}
    </section>
  );
}

export function TesterHomePage() {
  const { data, user, command, busy } = useMvp();
  const action = useAction();
  if (!user) return null;
  const assignments = data.assignments
    .filter((item) => item.testerId === user.id)
    .sort((a, b) => b.invitedAt.localeCompare(a.invitedAt));
  const active = assignments.filter(
    (item) => !["declined", "approved"].includes(item.status),
  );
  const history = assignments.filter((item) =>
    ["declined", "approved"].includes(item.status),
  );
  const payouts = data.payouts.filter((item) => item.testerId === user.id);
  const renderAssignment = (assignment: Assignment) => {
    const campaign = data.campaigns.find(
      (item) => item.id === assignment.campaignId,
    );
    if (!campaign) return null;
    const submission = data.submissions.find(
      (item) => item.assignmentId === assignment.id,
    );
    const payout = payouts.find((item) => item.assignmentId === assignment.id);
    return (
      <article className="mvp-card mvp-op-assignment-card" key={assignment.id}>
        <div className="mvp-op-section-top">
          <AssignmentBadge status={assignment.status} />
          <span className="mvp-op-muted">
            {dateLabel(assignment.invitedAt)} · Round {campaign.round}
          </span>
        </div>
        <h3>{campaign.title}</h3>
        <p>{campaign.objective}</p>
        <div className="mvp-op-assignment-meta">
          <span>
            <ClipboardCheck size={15} />
            {campaign.tasks.length} tasks
          </span>
          <span>
            <Users size={15} />
            {campaign.audience}
          </span>
        </div>
        {assignment.status === "revision" && (
          <div className="mvp-op-review-note">
            <strong>Review note</strong>
            <p>
              {submission?.qaNote ||
                "Please add more detail to your feedback and submit again."}
            </p>
          </div>
        )}
        {assignment.status === "invited" ? (
          <div className="mvp-op-actions">
            <button
              className="mvp-btn"
              disabled={busy || action.pending}
              onClick={() =>
                action.run(
                  () =>
                    command({
                      type: "respond-invite",
                      assignmentId: assignment.id,
                      accept: true,
                    }),
                  "Invitation accepted.",
                )
              }
            >
              Accept invitation <ArrowRight size={16} />
            </button>
            <button
              className="mvp-btn secondary"
              disabled={busy || action.pending}
              onClick={() =>
                action.run(
                  () =>
                    command({
                      type: "respond-invite",
                      assignmentId: assignment.id,
                      accept: false,
                    }),
                  "Invitation declined.",
                )
              }
            >
              Decline
            </button>
          </div>
        ) : assignment.status !== "declined" ? (
          <div className="mvp-op-actions">
            <Link
              className="mvp-btn secondary"
              to={`/tester/assignments/${assignment.id}`}
            >
              {assignment.status === "accepted"
                ? "Open workspace"
                : assignment.status === "revision"
                  ? "Revise feedback"
                  : "View submission"}
              <ArrowRight size={16} />
            </Link>
            {payout && (
              <span className="mvp-op-payout-label">
                {money(payout.amountCents, payout.currency)} ·{" "}
                {payout.status === "paid" ? "Paid" : "Payment pending"}
              </span>
            )}
          </div>
        ) : null}
      </article>
    );
  };
  return (
    <div className="mvp-op-page">
      <div className="mvp-op-page-heading">
        <div>
          <h1>Assignments</h1>
        </div>
      </div>
      <ActionMessage action={action} />
      <div className="mvp-op-home-layout">
        <div>
          <div className="mvp-op-section-top">
            <h2>Active assignments</h2>
            <span className="mvp-op-muted">{active.length} active</span>
          </div>
          {active.length ? (
            <div className="mvp-op-card-list">
              {active.map(renderAssignment)}
            </div>
          ) : (
            <div className="mvp-card">
              <EmptyState title="No active assignments">
                <p>Complete your profile to receive campaign invitations.</p>
              </EmptyState>
            </div>
          )}
          {history.length > 0 && (
            <>
              <div className="mvp-op-section-top mvp-op-history-heading">
                <h2>Previous assignments</h2>
                <span className="mvp-op-muted">{history.length}</span>
              </div>
              <div className="mvp-op-card-list">
                {history.map(renderAssignment)}
              </div>
            </>
          )}
        </div>
        <div>
          <ProfileEditor key={user.id} user={user} />
          {payouts.length > 0 && (
            <section className="mvp-card mvp-op-earnings">
              <h3>Payout history</h3>
              {payouts.map((payout) => (
                <div className="mvp-op-ledger-mini" key={payout.id}>
                  <div>
                    <strong>
                      {data.campaigns.find(
                        (item) => item.id === payout.campaignId,
                      )?.title || "Campaign"}
                    </strong>
                    <small>
                      {payout.status === "paid"
                        ? `Paid ${payout.paidAt ? dateLabel(payout.paidAt) : ""}`
                        : "Awaiting manual payment"}
                    </small>
                    {payout.reference && (
                      <small>Reference: {payout.reference}</small>
                    )}
                  </div>
                  <strong>{money(payout.amountCents, payout.currency)}</strong>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

type FeedbackDraft = {
  results: Array<
    Omit<TaskResult, "outcome"> & { outcome: TaskResult["outcome"] | "" }
  >;
  overallFeedback: string;
  savedAt: string;
  consentConfirmed: boolean;
};
const draftKey = (userId: string, assignmentId: string) =>
  `playground:mvp:feedback:${userId}:${assignmentId}`;
function initialDraft(
  campaign: Campaign,
  submission?: Submission,
): FeedbackDraft {
  const previous = submission?.results || [];
  return {
    results: campaign.tasks.map((task) => {
      const value = previous.find((item) => item.taskId === task.id);
      return {
        taskId: task.id,
        outcome:
          value && ["success", "partial", "blocked"].includes(value.outcome)
            ? value.outcome
            : "",
        answer: typeof value?.answer === "string" ? value.answer : "",
        observation:
          typeof value?.observation === "string" ? value.observation : "",
        severity:
          value &&
          ["none", "blocker", "major", "minor"].includes(value.severity)
            ? value.severity
            : "none",
        evidence: Array.isArray(value?.evidence) ? value.evidence : [],
        durationSeconds:
          typeof value?.durationSeconds === "number" &&
          Number.isFinite(value.durationSeconds)
            ? value.durationSeconds
            : undefined,
        executionOutcome: value?.executionOutcome,
      };
    }),
    overallFeedback: submission?.overallFeedback || "",
    savedAt: "",
    consentConfirmed: submission?.consentConfirmed === true,
  };
}

function hydrateDraft(
  base: FeedbackDraft,
  stored: Partial<FeedbackDraft> | null,
): FeedbackDraft {
  if (!stored || !Array.isArray(stored.results)) return base;
  return {
    results: base.results.map((result) => {
      const value = stored.results?.find(
        (item) => item?.taskId === result.taskId,
      );
      if (!value) return result;
      return {
        ...result,
        outcome: ["success", "partial", "blocked"].includes(value.outcome)
          ? value.outcome
          : "",
        answer: typeof value.answer === "string" ? value.answer : "",
        observation:
          typeof value.observation === "string" ? value.observation : "",
        severity: ["none", "minor", "major", "blocker"].includes(value.severity)
          ? value.severity
          : "none",
        evidence: Array.isArray(value.evidence)
          ? value.evidence.filter(
              (asset) =>
                asset &&
                typeof asset.id === "string" &&
                typeof asset.name === "string" &&
                typeof asset.url === "string",
            )
          : [],
        durationSeconds:
          typeof value.durationSeconds === "number" &&
          Number.isFinite(value.durationSeconds) &&
          value.durationSeconds >= 0 &&
          value.durationSeconds <= 86400
            ? value.durationSeconds
            : undefined,
        executionOutcome:
          value.executionOutcome &&
          ["failed", "abandoned", "assisted"].includes(value.executionOutcome)
            ? value.executionOutcome
            : undefined,
      };
    }),
    overallFeedback:
      typeof stored.overallFeedback === "string"
        ? stored.overallFeedback
        : base.overallFeedback,
    savedAt: typeof stored.savedAt === "string" ? stored.savedAt : "",
    consentConfirmed: stored.consentConfirmed === true,
  };
}

export function TesterWorkspacePage() {
  const { id } = useParams();
  const { data, user, command, busy } = useMvp();
  const action = useAction();
  const assignment = data.assignments.find(
    (item) => item.id === id && item.testerId === user?.id,
  );
  const campaign = data.campaigns.find(
    (item) => item.id === assignment?.campaignId,
  );
  const submission = data.submissions.find(
    (item) => item.assignmentId === assignment?.id,
  );
  const [storedDraft, setStoredDraft] = useState<Partial<FeedbackDraft> | null>(
    null,
  );
  const storageKey = user && assignment ? draftKey(user.id, assignment.id) : "";
  const loadDraft =
    assignment && ["accepted", "revision"].includes(assignment.status);
  useEffect(() => {
    let active = true;
    setStoredDraft(null);
    if (storageKey && loadDraft)
      void readDraft<Partial<FeedbackDraft>>(storageKey)
        .then((value) => {
          if (active) setStoredDraft(value);
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [storageKey, loadDraft]);
  if (!assignment || !campaign || !user)
    return (
      <div className="mvp-op-page mvp-card">
        <EmptyState title="Assignment unavailable">
          <p>Choose the tester assigned to this mission.</p>
          <Link className="mvp-btn secondary" to="/tester">
            Back to your assignments
          </Link>
        </EmptyState>
      </div>
    );
  const draft = hydrateDraft(initialDraft(campaign, submission), storedDraft);
  const done = draft.results.filter(
    (item) =>
      item.outcome &&
      item.answer.trim().length >= 10 &&
      item.observation.trim().length >= 10,
  ).length;
  const canWork =
    assignment.status === "accepted" || assignment.status === "revision";
  const payout = data.payouts.find(
    (item) => item.assignmentId === assignment.id,
  );
  return (
    <div className="mvp-op-page">
      <Link className="mvp-op-back" to="/tester">
        ← Your assignments
      </Link>
      <div className="mvp-op-page-heading">
        <div>
          <div className="mvp-op-tags">
            <span className="mvp-op-kicker">Round {campaign.round}</span>
            <AssignmentBadge status={assignment.status} />
          </div>
          <h1>{campaign.title}</h1>
          <p>{campaign.objective}</p>
        </div>
      </div>
      <ActionMessage action={action} />
      {assignment.status === "invited" && (
        <div className="mvp-op-invite-banner">
          <div>
            <strong>Campaign invitation</strong>
            <p>Review the tasks, then accept or decline.</p>
          </div>
          <div className="mvp-op-actions">
            <button
              className="mvp-btn"
              disabled={busy || action.pending}
              onClick={() =>
                action.run(
                  () =>
                    command({
                      type: "respond-invite",
                      assignmentId: assignment.id,
                      accept: true,
                    }),
                  "Invitation accepted.",
                )
              }
            >
              Accept invitation
            </button>
            <button
              className="mvp-btn secondary"
              disabled={busy || action.pending}
              onClick={() =>
                action.run(
                  () =>
                    command({
                      type: "respond-invite",
                      assignmentId: assignment.id,
                      accept: false,
                    }),
                  "Invitation declined.",
                )
              }
            >
              Decline
            </button>
          </div>
        </div>
      )}
      {assignment.status === "revision" && (
        <div className="mvp-op-review-note">
          <strong>
            <CircleAlert size={17} /> QA requested an update
          </strong>
          <p>{submission?.qaNote}</p>
          <Link to={`/tester/assignments/${assignment.id}/feedback`}>
            Update your evidence <ArrowRight size={15} />
          </Link>
        </div>
      )}
      {assignment.status === "submitted" && (
        <div className="mvp-op-notice is-success">
          <Clock3 size={18} />
          <span>Submitted. Awaiting review.</span>
        </div>
      )}
      {assignment.status === "approved" && (
        <div className="mvp-op-notice is-success">
          <CheckCircle2 size={18} />
          <span>
            Approved.{" "}
            {payout
              ? `${money(payout.amountCents, payout.currency)} reward: ${payout.status === "paid" ? "paid" : "awaiting manual payment"}.`
              : "Payout pending."}
          </span>
        </div>
      )}
      <div className="mvp-op-workspace-layout">
        <div>
          <section className="mvp-op-product-card">
            <div>
              <h2>Product</h2>
              <p>{campaign.url}</p>
            </div>
            <a
              className="mvp-btn"
              href={campaign.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open product <ArrowUpRight size={17} />
            </a>
          </section>
          <section className="mvp-card mvp-op-mission">
            <div className="mvp-op-section-top">
              <h2>Tasks</h2>
              <span className="mvp-op-pill">{campaign.tasks.length} tasks</span>
            </div>
            <p className="mvp-op-muted">
              Attempt each task in the product and record its outcome.
            </p>
            <div className="mvp-op-task-list">
              {campaign.tasks.map((task, index) => {
                const result = draft.results.find(
                  (item) => item.taskId === task.id,
                );
                const complete =
                  result?.outcome &&
                  result.answer.trim() &&
                  result.observation.trim();
                return (
                  <article className="mvp-op-mission-task" key={task.id}>
                    <span
                      className={`mvp-op-task-number ${complete ? "is-done" : ""}`}
                    >
                      {complete ? (
                        <Check size={16} />
                      ) : (
                        String(index + 1).padStart(2, "0")
                      )}
                    </span>
                    <div>
                      <h3>{task.title}</h3>
                      <p>{task.instructions}</p>
                      <div className="mvp-op-question">
                        <span>Question</span>
                        <p>{task.question}</p>
                      </div>
                      {canWork && (
                        <Link
                          className="mvp-op-text-link"
                          to={`/tester/assignments/${assignment.id}/feedback#task-${task.id}`}
                        >
                          {complete
                            ? "Edit task feedback"
                            : "Record task feedback"}
                          <ArrowRight size={14} />
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
        <aside>
          <section className="mvp-card mvp-op-mission-aside">
            <h3>Submission requirements</h3>
            <ul>
              <li>
                <Check size={15} />
                Record an outcome, answer and observation for every task.
              </li>
              <li>
                <Check size={15} />
                Answers and observations need at least 10 characters.
              </li>
              <li>
                <Check size={15} />
                Add at least one screenshot, recording or link.
              </li>
              <li>
                <Check size={15} />
                Add overall feedback.
              </li>
            </ul>
            <div className="mvp-op-progress-track">
              <span
                style={{
                  width: `${campaign.tasks.length ? (done / campaign.tasks.length) * 100 : 0}%`,
                }}
              />
            </div>
            <p>
              {done} of {campaign.tasks.length} tasks documented
            </p>
            {canWork ? (
              <Link
                className="mvp-btn mvp-op-full"
                to={`/tester/assignments/${assignment.id}/feedback`}
              >
                {assignment.status === "revision"
                  ? "Update & resubmit"
                  : done
                    ? "Continue feedback"
                    : "Start feedback"}
                <ArrowRight size={16} />
              </Link>
            ) : ["submitted", "approved"].includes(assignment.status) ? (
              <Link
                className="mvp-btn secondary mvp-op-full"
                to={`/tester/assignments/${assignment.id}/feedback`}
              >
                View your feedback <FileText size={16} />
              </Link>
            ) : null}
          </section>
          <div className="mvp-op-small-note">
            <ShieldCheck size={18} />
            <p>Drafts and evidence save on this device.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EvidenceList({
  assets,
  editable,
  onRemove,
}: {
  assets: EvidenceAsset[];
  editable?: boolean;
  onRemove?: (id: string) => void;
}) {
  if (!assets.length) return null;
  return (
    <div className="mvp-op-evidence-list">
      {assets.map((asset) => (
        <div className="mvp-op-evidence" key={asset.id}>
          {asset.kind === "image" && (
            <a href={asset.url} target="_blank" rel="noopener noreferrer">
              <img src={asset.url} alt={asset.name} />
            </a>
          )}
          <a href={asset.url} target="_blank" rel="noopener noreferrer">
            <span>
              {asset.kind === "image" ? (
                <ImagePlus size={16} />
              ) : (
                <Link2 size={16} />
              )}
            </span>
            <strong>{asset.name}</strong>
            <ExternalLink size={14} />
          </a>
          {editable && (
            <button
              type="button"
              className="mvp-op-icon-btn"
              title={`Remove ${asset.name}`}
              onClick={() => onRemove?.(asset.id)}
            >
              <X size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function FeedbackForm({
  assignment,
  campaign,
  submission,
  user,
}: {
  assignment: Assignment;
  campaign: Campaign;
  submission?: Submission;
  user: Profile;
}) {
  const { command, uploadEvidence, busy } = useMvp();
  const navigate = useNavigate();
  const action = useAction();
  const [draft, setDraft] = useState(() => initialDraft(campaign, submission));
  const [uploading, setUploading] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});
  const [urlErrors, setUrlErrors] = useState<Record<string, string>>({});
  const [taskTimers, setTaskTimers] = useState<Record<string, number>>({});
  const readonly = !["accepted", "revision"].includes(assignment.status);
  const [draftLoaded, setDraftLoaded] = useState(readonly);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const previousSaved = useRef(JSON.stringify(draft));
  const storageKey = draftKey(user.id, assignment.id);
  useEffect(() => {
    if (readonly) return;
    let active = true;
    void readDraft<Partial<FeedbackDraft>>(storageKey)
      .then((stored) => {
        if (!active) return;
        setDraft((base) => {
          const value = hydrateDraft(base, stored);
          previousSaved.current = JSON.stringify(value);
          return value;
        });
        setSavedAt(stored?.savedAt || "");
        setDraftLoaded(true);
      })
      .catch((cause) => {
        if (!active) return;
        setSaveError(
          cause instanceof Error
            ? cause.message
            : "Could not load your saved draft.",
        );
        setDraftLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [readonly, storageKey]);
  useEffect(() => {
    if (
      readonly ||
      !draftLoaded ||
      previousSaved.current === JSON.stringify(draft)
    )
      return;
    const value = { ...draft, savedAt: new Date().toISOString() };
    let active = true;
    setSaving(true);
    void writeDraft(storageKey, value)
      .then(() => {
        if (!active) return;
        previousSaved.current = JSON.stringify(draft);
        setSaving(false);
        setSavedAt(value.savedAt);
        setSaveError("");
      })
      .catch((cause) => {
        if (!active) return;
        setSaving(false);
        setSaveError(
          cause instanceof Error
            ? cause.message
            : "Your draft could not be saved.",
        );
      });
    return () => {
      active = false;
    };
  }, [draft, draftLoaded, storageKey, readonly]);
  const update = (
    taskId: string,
    patch: Partial<FeedbackDraft["results"][number]>,
  ) =>
    setDraft((previous) => ({
      ...previous,
      results: previous.results.map((result) =>
        result.taskId === taskId ? { ...result, ...patch } : result,
      ),
    }));
  async function upload(taskId: string, files: FileList | null) {
    if (!files?.length) return;
    if (!draft.consentConfirmed) {
      action.setError(
        "Confirm consent before uploading screenshots or recordings.",
      );
      return;
    }
    const existing =
      draft.results.find((result) => result.taskId === taskId)?.evidence
        .length || 0;
    if (existing + files.length > 6) {
      action.setError(
        "Attach up to six evidence items per task. Remove an item before adding more.",
      );
      return;
    }
    setUploading(taskId);
    await action.run(async () => {
      const assets: EvidenceAsset[] = [];
      for (const file of Array.from(files))
        assets.push(await uploadEvidence(file, assignment.id));
      setDraft((previous) => ({
        ...previous,
        results: previous.results.map((result) =>
          result.taskId === taskId
            ? { ...result, evidence: [...result.evidence, ...assets] }
            : result,
        ),
      }));
    }, "Evidence added to your draft.");
    setUploading(null);
  }
  function addUrl(taskId: string) {
    const value = urlInputs[taskId]?.trim();
    if (
      (draft.results.find((result) => result.taskId === taskId)?.evidence
        .length || 0) >= 6
    ) {
      setUrlErrors((previous) => ({
        ...previous,
        [taskId]: "This task already has six evidence items.",
      }));
      return;
    }
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      const asset: EvidenceAsset = {
        id: crypto.randomUUID(),
        name: url.hostname + (url.pathname === "/" ? "" : url.pathname),
        kind: /youtube\.com|youtu\.be|loom\.com|vimeo\.com|\.mp4(?:$|\?)/i.test(
          value,
        )
          ? "video"
          : "link",
        url: url.href,
      };
      if (asset.kind === "video" && !draft.consentConfirmed) {
        setUrlErrors((previous) => ({
          ...previous,
          [taskId]: "Confirm consent before attaching a recording.",
        }));
        return;
      }
      const result = draft.results.find((item) => item.taskId === taskId);
      update(taskId, { evidence: [...(result?.evidence || []), asset] });
      setUrlInputs((previous) => ({ ...previous, [taskId]: "" }));
      setUrlErrors((previous) => ({ ...previous, [taskId]: "" }));
    } catch {
      setUrlErrors((previous) => ({
        ...previous,
        [taskId]: "Enter a full https:// or http:// link.",
      }));
    }
  }
  const completeCount = draft.results.filter(
    (result) =>
      result.outcome &&
      result.answer.trim().length >= 10 &&
      result.observation.trim().length >= 10,
  ).length;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (Object.keys(taskTimers).length) {
      action.setError("Stop each running task timer before submitting.");
      return;
    }
    const missing = draft.results.find(
      (result) =>
        !result.outcome ||
        result.answer.trim().length < 10 ||
        result.observation.trim().length < 10,
    );
    if (missing) {
      action.setError(
        "Record every task outcome, answer and observation (at least 10 characters each).",
      );
      document
        .getElementById(`task-${missing.taskId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (draft.overallFeedback.trim().length < 10) {
      action.setError(
        "Add your overall feedback (at least 10 characters) before submitting.",
      );
      return;
    }
    if (!draft.results.some((result) => result.evidence.length > 0)) {
      action.setError(
        "Add at least one screenshot, recording, or supporting link before submitting.",
      );
      return;
    }
    if (
      !draft.consentConfirmed &&
      draft.results.some((result) =>
        result.evidence.some(
          (asset) => asset.kind === "image" || asset.kind === "video",
        ),
      )
    ) {
      action.setError(
        "Confirm consent before submitting screenshots or recordings.",
      );
      return;
    }
    const success = await action.run(() =>
      command({
        type: "submit-feedback",
        assignmentId: assignment.id,
        results: draft.results as TaskResult[],
        overallFeedback: draft.overallFeedback.trim(),
        consentConfirmed: draft.consentConfirmed,
      }),
    );
    if (success) {
      await removeDraft(storageKey).catch(() => undefined);
      navigate(`/tester/assignments/${assignment.id}`);
    }
  }
  if (!draftLoaded)
    return (
      <div className="mvp-op-notice" role="status">
        <Clock3 size={17} />
        Loading your saved task feedback…
      </div>
    );
  return (
    <form onSubmit={submit}>
      <div className="mvp-op-feedback-save">
        <span>
          {readonly ? <ShieldCheck size={16} /> : <FileCheck2 size={16} />}
          {readonly
            ? "Submitted feedback"
            : saveError ||
              (saving
                ? "Saving draft…"
                : savedAt
                  ? `Saved on this device · ${new Date(savedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
                  : "Draft saves automatically on this device")}
        </span>
        <span>
          {completeCount}/{campaign.tasks.length} tasks documented
        </span>
      </div>
      <ActionMessage action={action} />
      <div className="mvp-op-consent">
        <label>
          <input
            type="checkbox"
            checked={draft.consentConfirmed}
            disabled={readonly}
            onChange={(event) =>
              setDraft((previous) => ({
                ...previous,
                consentConfirmed: event.target.checked,
              }))
            }
          />
          I agree to share my screenshots and recordings with the founder and
          Playground reviewers. I have removed personal or confidential
          information and have permission from anyone shown.
        </label>
      </div>
      {assignment.status === "revision" && (
        <div className="mvp-op-review-note">
          <strong>QA requested an update</strong>
          <p>{submission?.qaNote}</p>
        </div>
      )}
      <div className="mvp-op-feedback-tasks">
        {campaign.tasks.map((task, index) => {
          const result = draft.results.find((item) => item.taskId === task.id)!;
          return (
            <section
              className="mvp-card mvp-op-feedback-task"
              key={task.id}
              id={`task-${task.id}`}
            >
              <div className="mvp-op-feedback-title">
                <div>
                  <span className="mvp-op-kicker">
                    TASK {index + 1} OF {campaign.tasks.length}
                  </span>
                  <h2>{task.title}</h2>
                  <p>{task.instructions}</p>
                  {task.successCriteria && (
                    <p>
                      <strong>Success:</strong> {task.successCriteria}
                    </p>
                  )}
                </div>
              </div>
              <fieldset className="mvp-op-outcome">
                <legend>What happened?</legend>
                {(
                  [
                    {
                      value: "success",
                      label: "Completed",
                      hint: "I finished the task",
                      icon: CheckCircle2,
                      executionOutcome: undefined,
                      outcome: "success",
                    },
                    {
                      value: "partial",
                      label: "Partly completed",
                      hint: "I got part of the way",
                      icon: Clock3,
                      executionOutcome: undefined,
                      outcome: "partial",
                    },
                    {
                      value: "blocked",
                      label: "Blocked",
                      hint: "I could not finish",
                      icon: CircleAlert,
                      executionOutcome: undefined,
                      outcome: "blocked",
                    },
                    {
                      value: "failed",
                      label: "Failed",
                      hint: "The attempt did not work",
                      icon: CircleAlert,
                      executionOutcome: "failed",
                      outcome: "blocked",
                    },
                    {
                      value: "abandoned",
                      label: "Abandoned",
                      hint: "I stopped trying",
                      icon: X,
                      executionOutcome: "abandoned",
                      outcome: "partial",
                    },
                    {
                      value: "assisted",
                      label: "Completed with help",
                      hint: "I needed assistance",
                      icon: Users,
                      executionOutcome: "assisted",
                      outcome: "success",
                    },
                  ] as const
                ).map(
                  ({
                    value,
                    label,
                    hint,
                    icon: Icon,
                    executionOutcome,
                    outcome,
                  }) => (
                    <label
                      className={
                        (result.executionOutcome || result.outcome) === value
                          ? `is-selected is-${value}`
                          : ""
                      }
                      key={value}
                    >
                      <input
                        type="radio"
                        name={`outcome-${task.id}`}
                        value={value}
                        checked={
                          (result.executionOutcome || result.outcome) === value
                        }
                        disabled={readonly}
                        onChange={() =>
                          update(task.id, {
                            outcome,
                            executionOutcome,
                            severity:
                              value === "success"
                                ? "none"
                                : result.severity === "none"
                                  ? "minor"
                                  : result.severity,
                          })
                        }
                      />
                      <Icon size={19} />
                      <strong>{label}</strong>
                      <small>{hint}</small>
                    </label>
                  ),
                )}
              </fieldset>
              <div className="mvp-op-task-time">
                <label className="mvp-field">
                  Time on task (seconds)
                  <input
                    type="number"
                    min="0"
                    max="86400"
                    step="0.1"
                    placeholder="Not recorded"
                    value={result.durationSeconds ?? ""}
                    disabled={readonly || taskTimers[task.id] !== undefined}
                    onChange={(event) =>
                      update(task.id, {
                        durationSeconds:
                          event.target.value === ""
                            ? undefined
                            : Number(event.target.value),
                      })
                    }
                  />
                  <small>
                    Use the timer while attempting the task, or enter the time
                    you measured. Leave blank if unknown.
                  </small>
                </label>
                {!readonly && (
                  <button
                    type="button"
                    className="mvp-btn secondary"
                    onClick={() => {
                      const started = taskTimers[task.id];
                      if (started === undefined)
                        setTaskTimers((previous) => ({
                          ...previous,
                          [task.id]: performance.now(),
                        }));
                      else {
                        update(task.id, {
                          durationSeconds:
                            Math.round((performance.now() - started) / 100) /
                            10,
                        });
                        setTaskTimers((previous) => {
                          const next = { ...previous };
                          delete next[task.id];
                          return next;
                        });
                      }
                    }}
                  >
                    <Clock3 size={16} />{" "}
                    {taskTimers[task.id] === undefined
                      ? "Start timer"
                      : "Stop timer"}
                  </button>
                )}
              </div>
              <label className="mvp-field">
                {task.question}
                <textarea
                  rows={3}
                  required
                  minLength={10}
                  value={result.answer}
                  readOnly={readonly}
                  onChange={(event) =>
                    update(task.id, { answer: event.target.value })
                  }
                  placeholder="Answer from your experience with the product."
                />
              </label>
              <label className="mvp-field">
                What did you notice?
                <textarea
                  rows={3}
                  required
                  minLength={10}
                  value={result.observation}
                  readOnly={readonly}
                  onChange={(event) =>
                    update(task.id, { observation: event.target.value })
                  }
                  placeholder="Describe the steps you tried, what you expected, and what actually happened."
                />
              </label>
              <div className="mvp-op-severity-row">
                <label className="mvp-field">
                  Issue severity
                  <select
                    value={result.severity}
                    disabled={readonly}
                    onChange={(event) =>
                      update(task.id, {
                        severity: event.target.value as TaskResult["severity"],
                      })
                    }
                  >
                    <option value="none">No issue</option>
                    <option value="minor">
                      Minor — friction, but I could continue
                    </option>
                    <option value="major">Major — difficult to complete</option>
                    <option value="blocker">
                      Blocker — prevents completing the task
                    </option>
                  </select>
                </label>
                <p>
                  Use the impact you experienced. Describe the issue in your
                  observation.
                </p>
              </div>
              <div className="mvp-op-capture">
                <div className="mvp-op-section-top">
                  <div>
                    <strong>Supporting evidence</strong>
                    <p>
                      Screenshots up to 3 MB, recordings, or supporting links.
                      Attach up to six items per task.
                    </p>
                  </div>
                  <span className="mvp-op-pill">
                    {result.evidence.length} attached
                  </span>
                </div>
                <EvidenceList
                  assets={result.evidence}
                  editable={!readonly}
                  onRemove={(assetId) =>
                    update(task.id, {
                      evidence: result.evidence.filter(
                        (asset) => asset.id !== assetId,
                      ),
                    })
                  }
                />
                {!readonly && (
                  <>
                    <div className="mvp-op-capture-actions">
                      <label
                        className={`mvp-op-upload ${uploading ? "is-disabled" : ""}`}
                      >
                        <ImagePlus size={18} />
                        <span>
                          {uploading === task.id
                            ? "Uploading evidence…"
                            : "Upload screenshot"}
                        </span>
                        <input
                          type="file"
                          multiple
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          disabled={
                            Boolean(uploading) ||
                            busy ||
                            !draft.consentConfirmed
                          }
                          onChange={(event) => {
                            upload(task.id, event.target.files);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      <span className="mvp-op-muted">or</span>
                      <div className="mvp-op-url-input">
                        <Link2 size={16} />
                        <input
                          aria-label={`Evidence link for task ${index + 1}`}
                          type="url"
                          placeholder="https://loom.com/share/…"
                          value={urlInputs[task.id] || ""}
                          onChange={(event) =>
                            setUrlInputs((previous) => ({
                              ...previous,
                              [task.id]: event.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="mvp-op-icon-btn"
                          aria-label={`Add evidence link to task ${index + 1}`}
                          onClick={() => addUrl(task.id)}
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>
                    {urlErrors[task.id] && (
                      <p className="mvp-op-input-error" role="alert">
                        {urlErrors[task.id]}
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <section className="mvp-card mvp-op-overall">
        <h2>Overall feedback</h2>
        <label className="mvp-field">
          What helped, what got in the way, and what would you change?
          <textarea
            rows={5}
            required
            minLength={10}
            readOnly={readonly}
            value={draft.overallFeedback}
            onChange={(event) =>
              setDraft((previous) => ({
                ...previous,
                overallFeedback: event.target.value,
              }))
            }
            placeholder="What worked, what failed, and what should change?"
          />
        </label>
        {!readonly && (
          <div className="mvp-op-submit-row">
            <p>
              <ShieldCheck size={17} />
              Complete every task and attach evidence before submitting.
            </p>
            <button
              className="mvp-btn"
              disabled={busy || action.pending || Boolean(uploading)}
            >
              {action.pending
                ? "Submitting…"
                : assignment.status === "revision"
                  ? "Resubmit feedback"
                  : "Submit feedback"}
              <Send size={17} />
            </button>
          </div>
        )}
      </section>
    </form>
  );
}

export function FeedbackPage() {
  const { id } = useParams();
  const { data, user } = useMvp();
  const assignment = data.assignments.find(
    (item) => item.id === id && item.testerId === user?.id,
  );
  const campaign = data.campaigns.find(
    (item) => item.id === assignment?.campaignId,
  );
  const submission = data.submissions.find(
    (item) => item.assignmentId === assignment?.id,
  );
  useEffect(() => {
    if (window.location.hash) {
      const timer = window.setTimeout(
        () =>
          document
            .getElementById(decodeURIComponent(window.location.hash.slice(1)))
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        100,
      );
      return () => window.clearTimeout(timer);
    }
  }, [id]);
  if (
    !assignment ||
    !campaign ||
    !user ||
    ["invited", "declined"].includes(assignment.status)
  )
    return (
      <div className="mvp-op-page mvp-card">
        <EmptyState title="Accept the invitation first">
          <p>
            Open your assignment and accept the invitation to start recording
            feedback.
          </p>
          <Link
            className="mvp-btn secondary"
            to={assignment ? `/tester/assignments/${assignment.id}` : "/tester"}
          >
            Back to your workspace
          </Link>
        </EmptyState>
      </div>
    );
  return (
    <div className="mvp-op-page mvp-op-feedback-page">
      <Link className="mvp-op-back" to={`/tester/assignments/${assignment.id}`}>
        ← Test workspace
      </Link>
      <div className="mvp-op-page-heading">
        <div>
          <h1>
            {["submitted", "approved"].includes(assignment.status)
              ? "Feedback"
              : "Submit feedback"}
          </h1>
          <p>
            {campaign.title} · Round {campaign.round}
          </p>
        </div>
        <a
          className="mvp-btn secondary"
          href={campaign.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open product <ExternalLink size={16} />
        </a>
      </div>
      <FeedbackForm
        key={`${assignment.id}:${user.id}:${assignment.status}`}
        assignment={assignment}
        campaign={campaign}
        submission={submission}
        user={user}
      />
    </div>
  );
}

function SubmissionEvidence({
  submission,
  data,
  campaign,
}: {
  submission: Submission;
  data: WorkspaceData;
  campaign: Campaign;
}) {
  const tester = data.profiles.find((item) => item.id === submission.testerId);
  return (
    <div className="mvp-op-submission-detail">
      <div className="mvp-op-person">
        <span className="mvp-op-avatar">
          {initials(tester?.name || "Tester")}
        </span>
        <div>
          <strong>{tester?.name || "Tester"}</strong>
          <span>{tester?.email}</span>
        </div>
      </div>
      <div className="mvp-op-tags">
        <span className="mvp-op-pill">
          Submitted {dateLabel(submission.updatedAt)}
        </span>
        <span className="mvp-op-pill">
          {submission.consentConfirmed
            ? "Media consent recorded"
            : "Media consent not recorded"}
        </span>
        <span
          className={`mvp-op-pill ${submission.status === "approved" ? "is-lime" : submission.status === "revision" ? "is-amber" : ""}`}
        >
          {submission.status === "approved"
            ? "QA approved"
            : submission.status === "revision"
              ? "Revision requested"
              : "Awaiting QA"}
        </span>
      </div>
      {submission.results.map((result, index) => {
        const task = campaign.tasks.find((item) => item.id === result.taskId);
        return (
          <article className="mvp-op-source-result" key={result.taskId}>
            <div className="mvp-op-section-top">
              <strong>
                {String(index + 1).padStart(2, "0")} · {task?.title || "Task"}
              </strong>
              <div className="mvp-op-tags">
                <span className={`mvp-op-pill is-${result.outcome}`}>
                  {result.executionOutcome || result.outcome}
                </span>
                <span className="mvp-op-pill">
                  {result.durationSeconds === undefined
                    ? "Time not recorded"
                    : `${result.durationSeconds}s recorded`}
                </span>
                {result.severity !== "none" && (
                  <span className={`mvp-op-pill is-${result.severity}`}>
                    {severityLabels[result.severity]}
                  </span>
                )}
              </div>
            </div>
            <dl>
              <dt>{task?.question || "Answer"}</dt>
              <dd>{result.answer}</dd>
              <dt>Observation</dt>
              <dd>{result.observation}</dd>
            </dl>
            <EvidenceList assets={result.evidence} />
            <span className="mvp-op-source-id">
              SOURCE {taskSourceId(submission, result.taskId)}
            </span>
          </article>
        );
      })}
      <div className="mvp-op-overall-quote">
        <span className="mvp-op-kicker">OVERALL FEEDBACK</span>
        <p>{submission.overallFeedback}</p>
      </div>
      {submission.qaNote && (
        <div className="mvp-op-review-note">
          <strong>Previous QA note</strong>
          <p>{submission.qaNote}</p>
        </div>
      )}
    </div>
  );
}

export function ParticipantMissionActions({
  campaign,
  assignment,
}: {
  campaign: Campaign;
  assignment: Assignment;
}) {
  const { user, data, command, busy } = useMvp();
  const action = useAction();
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const participant = data.profiles.find(
    (profile) => profile.id === assignment.testerId,
  );
  const available =
    campaign.tasksApproved &&
    campaign.payment === "paid" &&
    ["invited", "accepted", "revision"].includes(assignment.status);
  async function importFile(file: File | undefined) {
    if (!file) return;
    await action.run(async () => {
      if (!identityConfirmed)
        throw new Error(
          "Confirm the participant's identity and consent before importing.",
        );
      if (file.size > PARTICIPANT_FEEDBACK_MAX_BYTES)
        throw new Error("Participant feedback files must be 25 MB or smaller.");
      const feedback = parseParticipantFeedback(
        await file.text(),
        campaign,
        assignment,
      );
      await command({
        type: "import-participant-feedback",
        feedback,
        identityConfirmed: true,
      });
      setIdentityConfirmed(false);
    }, "Participant feedback imported. Review it before approval.");
  }
  return (
    <div className="mvp-op-handoff">
      <div className="mvp-op-handoff-actions">
        <button
          type="button"
          className="mvp-btn secondary"
          disabled={!available || busy || action.pending}
          onClick={() =>
            action.run(async () => {
              const html = buildParticipantMissionHtml(
                campaign,
                assignment,
                participant?.name || "Participant",
              );
              const url = URL.createObjectURL(
                  new Blob([html], { type: "text/html" }),
                ),
                link = document.createElement("a");
              link.href = url;
              link.download = participantMissionFilename(assignment);
              link.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            }, "Mission downloaded. Send the HTML file to the assigned participant, then collect their feedback JSON.")
          }
        >
          <ArrowDownToLine size={14} /> Download participant mission
        </button>
        {user?.role === "admin" && available && (
          <>
            <button
              type="button"
              className="mvp-btn secondary"
              disabled={!identityConfirmed || busy || action.pending}
              onClick={() => input.current?.click()}
            >
              <FileText size={14} /> Import participant feedback
            </button>
            <input
              ref={input}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                void importFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </>
        )}
      </div>
      {user?.role === "admin" && available && (
        <label className="mvp-op-checkbox">
          <input
            type="checkbox"
            checked={identityConfirmed}
            onChange={(event) => setIdentityConfirmed(event.target.checked)}
          />{" "}
          I confirmed this response is from{" "}
          {participant?.name || "the assigned participant"} and checked their
          consent.
        </label>
      )}
      <ActionMessage action={action} />
    </div>
  );
}

function MatchingPanel({ campaign }: { campaign: Campaign }) {
  const { data, command, busy } = useMvp();
  const [query, setQuery] = useState("");
  const [device, setDevice] = useState("all");
  const [availableOnly, setAvailableOnly] = useState(true);
  const action = useAction();
  const assignments = data.assignments.filter(
    (item) => item.campaignId === campaign.id,
  );
  const occupied = assignments.filter(
    (item) => item.status !== "declined",
  ).length;
  const testers = data.profiles.filter(
    (profile) =>
      profile.role === "tester" &&
      (!availableOnly || profile.availability === "available") &&
      (device === "all" ||
        profile.device === "both" ||
        profile.device === device) &&
      (!query.trim() ||
        `${profile.name} ${profile.email} ${profile.expertise.join(" ")} ${profile.bio}`
          .toLowerCase()
          .includes(query.toLowerCase().trim())),
  );
  return (
    <div>
      <div className="mvp-op-section-top">
        <div>
          <h2>Match testers</h2>
          <p className="mvp-op-muted">
            Choose up to five available testers for this audience.
          </p>
        </div>
        <span className="mvp-op-pill is-lime">{occupied}/5 slots reserved</span>
      </div>
      <div className="mvp-op-audience">
        <span className="mvp-op-kicker">TARGET AUDIENCE</span>
        <p>{campaign.audience}</p>
      </div>
      <div className="mvp-op-recruitment-link">
        <div>
          <strong>Test with participants on another device</strong>
          <span>
            Download each assigned mission below. Send the HTML file to that
            participant and import their returned feedback JSON. Operations
            confirms identity and reviews every submission.
          </span>
        </div>
      </div>
      <ActionMessage action={action} />
      {campaign.payment !== "paid" && (
        <div className="mvp-op-notice">
          <CreditCard size={18} />
          <span>Complete checkout before inviting testers.</span>
        </div>
      )}
      <div className="mvp-op-filterbar">
        <div className="mvp-op-search">
          <Search size={17} />
          <input
            aria-label="Search testers by audience or expertise"
            placeholder="Search experience, audience or name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          aria-label="Filter tester device"
          value={device}
          onChange={(event) => setDevice(event.target.value)}
        >
          <option value="all">All devices</option>
          <option value="desktop">Desktop compatible</option>
          <option value="mobile">Mobile compatible</option>
        </select>
        <label className="mvp-op-checkbox">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(event) => setAvailableOnly(event.target.checked)}
          />
          Available only
        </label>
      </div>
      {testers.length ? (
        <div className="mvp-op-tester-grid">
          {testers.map((tester) => {
            const assignment = assignments.find(
              (item) => item.testerId === tester.id,
            );
            const already = assignment && assignment.status !== "declined";
            return (
              <article className="mvp-op-tester-match mvp-card" key={tester.id}>
                <div className="mvp-op-person">
                  <span className="mvp-op-avatar">{initials(tester.name)}</span>
                  <div>
                    <strong>{tester.name}</strong>
                    <span>{tester.email}</span>
                  </div>
                </div>
                <div className="mvp-op-tags">
                  <span className="mvp-op-pill">
                    {tester.device === "both"
                      ? "Desktop + mobile"
                      : tester.device}
                  </span>
                  <span
                    className={`mvp-op-pill ${tester.availability === "available" ? "is-lime" : ""}`}
                  >
                    {tester.availability}
                  </span>
                  {tester.expertise.map((item) => (
                    <span className="mvp-op-pill" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
                {tester.bio && <p>{tester.bio}</p>}
                {already ? (
                  <AssignmentBadge status={assignment.status} />
                ) : assignment?.status === "declined" ? (
                  <span className="mvp-op-pill">Invitation declined</span>
                ) : (
                  <button
                    className="mvp-btn secondary"
                    disabled={
                      busy ||
                      action.pending ||
                      occupied >= 5 ||
                      campaign.payment !== "paid" ||
                      !tester.expertise.length ||
                      tester.availability !== "available"
                    }
                    onClick={() =>
                      action.run(
                        () =>
                          command({
                            type: "invite-tester",
                            campaignId: campaign.id,
                            testerId: tester.id,
                          }),
                        `Invitation sent to ${tester.name}.`,
                      )
                    }
                  >
                    {tester.expertise.length
                      ? "Invite tester"
                      : "Profile needs expertise"}{" "}
                    <Plus size={16} />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mvp-card">
          <EmptyState
            title={
              data.profiles.some((profile) => profile.role === "tester")
                ? "No profiles match these filters."
                : "No tester profiles"
            }
          >
            <p>
              {data.profiles.some((profile) => profile.role === "tester")
                ? "Change the search, device or availability filter."
                : "Use Add tester, then complete their expertise and device details."}
            </p>
          </EmptyState>
        </div>
      )}
      <section className="mvp-card mvp-op-roster">
        <div className="mvp-op-section-top">
          <h3>Campaign roster</h3>
          <span className="mvp-op-muted">{assignments.length} invitations</span>
        </div>
        {assignments.length ? (
          assignments.map((assignment) => {
            const tester = data.profiles.find(
              (item) => item.id === assignment.testerId,
            );
            return (
              <div className="mvp-op-roster-participant" key={assignment.id}>
                <div className="mvp-op-roster-row">
                  <div className="mvp-op-person">
                    <span className="mvp-op-avatar small">
                      {initials(tester?.name || "Tester")}
                    </span>
                    <div>
                      <strong>{tester?.name || "Tester"}</strong>
                      <span>Invited {dateLabel(assignment.invitedAt)}</span>
                    </div>
                  </div>
                  <AssignmentBadge status={assignment.status} />
                </div>
                <ParticipantMissionActions
                  campaign={campaign}
                  assignment={assignment}
                />
              </div>
            );
          })
        ) : (
          <p className="mvp-op-muted">No invitations sent yet.</p>
        )}
      </section>
    </div>
  );
}

function ReviewPanel({ campaign }: { campaign: Campaign }) {
  const { data, command, busy } = useMvp();
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("pending");
  const action = useAction();
  const submissions = data.submissions.filter(
    (item) => item.campaignId === campaign.id,
  );
  const filtered = submissions.filter(
    (item) =>
      filter === "all" ||
      (filter === "pending"
        ? item.status === "submitted"
        : item.status === filter),
  );
  const selected =
    filtered.find((item) => item.id === selectedId) || filtered[0];
  async function review(decision: "approved" | "revision") {
    if (!selected) return;
    if (decision === "revision" && note.trim().length < 10) {
      action.setError(
        "Tell the tester exactly what they need to revise (at least 10 characters).",
      );
      return;
    }
    if (
      await action.run(
        () =>
          command({
            type: "review-submission",
            submissionId: selected.id,
            decision,
            note: note.trim(),
          }),
        decision === "approved"
          ? "Submission approved. Its payout is now in the ledger."
          : "Revision requested. The tester can update and resubmit their feedback.",
      )
    ) {
      setNote("");
      setSelectedId("");
    }
  }
  return (
    <div>
      <div className="mvp-op-section-top">
        <div>
          <h2>Review submissions</h2>
          <p className="mvp-op-muted">
            Check task results and evidence. Approve or request a revision.
          </p>
        </div>
        <select
          aria-label="Filter QA submissions"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setSelectedId("");
            setNote("");
          }}
        >
          <option value="pending">Awaiting review</option>
          <option value="revision">Needs revision</option>
          <option value="approved">Approved</option>
          <option value="all">All submissions</option>
        </select>
      </div>
      <ActionMessage action={action} />
      {data.assignments.some(
        (assignment) =>
          assignment.campaignId === campaign.id &&
          ["invited", "accepted", "revision"].includes(assignment.status),
      ) && (
        <details className="mvp-op-import-drawer">
          <summary>Import returned participant files</summary>
          <p className="mvp-op-muted">
            Confirm the assigned participant and consent. Imported feedback
            enters QA; it does not count as approved evidence.
          </p>
          {data.assignments
            .filter(
              (assignment) =>
                assignment.campaignId === campaign.id &&
                ["invited", "accepted", "revision"].includes(assignment.status),
            )
            .map((assignment) => (
              <div className="mvp-op-roster-participant" key={assignment.id}>
                <strong>
                  {data.profiles.find(
                    (profile) => profile.id === assignment.testerId,
                  )?.name || "Participant"}
                </strong>
                <ParticipantMissionActions
                  campaign={campaign}
                  assignment={assignment}
                />
              </div>
            ))}
        </details>
      )}
      {filtered.length ? (
        <div className="mvp-op-review-layout">
          <nav className="mvp-op-review-list" aria-label="Submitted testers">
            {filtered.map((submission) => {
              const tester = data.profiles.find(
                (item) => item.id === submission.testerId,
              );
              return (
                <button
                  className={
                    selected?.id === submission.id ? "is-selected" : ""
                  }
                  key={submission.id}
                  onClick={() => {
                    setSelectedId(submission.id);
                    setNote("");
                  }}
                >
                  <span className="mvp-op-avatar small">
                    {initials(tester?.name || "Tester")}
                  </span>
                  <span>
                    <strong>{tester?.name || "Tester"}</strong>
                    <small>
                      {submission.results.length} task results ·{" "}
                      {submission.status === "submitted"
                        ? "Needs review"
                        : submission.status}
                    </small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              );
            })}
          </nav>
          {selected && (
            <section className="mvp-card mvp-op-review-card">
              <SubmissionEvidence
                submission={selected}
                data={data}
                campaign={campaign}
              />
              <div className="mvp-op-qa-checklist">
                <strong>Evidence quality check</strong>
                <ul>
                  <li>
                    <Check size={15} />
                    Every task has an outcome, answer and observation.
                  </li>
                  <li>
                    <Check size={15} />
                    Observations describe the attempted steps and result.
                  </li>
                  <li>
                    <Check size={15} />
                    Evidence supports reported issues.
                  </li>
                </ul>
              </div>
              {selected.status === "submitted" ? (
                <div className="mvp-op-qa-actions">
                  <label className="mvp-field">
                    Review note
                    <textarea
                      rows={3}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="If requesting a revision, explain which task needs detail and what evidence to add."
                    />
                  </label>
                  <div className="mvp-op-actions">
                    <button
                      className="mvp-btn"
                      disabled={busy || action.pending}
                      onClick={() => review("approved")}
                    >
                      Approve submission <Check size={17} />
                    </button>
                    <button
                      className="mvp-btn secondary"
                      disabled={busy || action.pending}
                      onClick={() => review("revision")}
                    >
                      Request revision
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mvp-op-notice">
                  <ShieldCheck size={17} />
                  <span>
                    {selected.status === "approved"
                      ? "Approved for report citations."
                      : "Waiting for a revised submission."}
                  </span>
                </div>
              )}
            </section>
          )}
        </div>
      ) : (
        <div className="mvp-card">
          <EmptyState
            icon={ClipboardCheck}
            title={
              filter === "pending"
                ? "No submissions waiting for QA."
                : "No submissions in this view."
            }
          >
            <p>
              {submissions.length
                ? "Change the filter to view other submissions."
                : "Submitted task results will appear here for review."}
            </p>
          </EmptyState>
        </div>
      )}
    </div>
  );
}

function PayoutRow({
  payout,
  data,
}: {
  payout: WorkspaceData["payouts"][number];
  data: WorkspaceData;
}) {
  const { command, busy } = useMvp();
  const [reference, setReference] = useState("");
  const [editing, setEditing] = useState(false);
  const action = useAction();
  const tester = data.profiles.find((item) => item.id === payout.testerId);
  async function pay(event: React.FormEvent) {
    event.preventDefault();
    if (reference.trim().length < 3) {
      action.setError(
        "Enter the payment reference (at least 3 characters) for the payment you completed.",
      );
      return;
    }
    if (
      await action.run(
        () =>
          command({
            type: "record-payout",
            payoutId: payout.id,
            reference: reference.trim(),
          }),
        "Payment recorded.",
      )
    )
      setEditing(false);
  }
  return (
    <div className="mvp-op-payout-row">
      <div className="mvp-op-payout-main">
        <div className="mvp-op-person">
          <span className="mvp-op-avatar small">
            {initials(tester?.name || "Tester")}
          </span>
          <div>
            <strong>{tester?.name || "Tester"}</strong>
            <span>{tester?.email}</span>
          </div>
        </div>
        <strong>{money(payout.amountCents, payout.currency)}</strong>
        <span
          className={`mvp-op-pill ${payout.status === "paid" ? "is-lime" : "is-amber"}`}
        >
          {payout.status === "paid" ? "Paid" : "Pending"}
        </span>
        {payout.status === "paid" ? (
          <span className="mvp-op-payment-ref">
            {payout.reference}
            <small>{payout.paidAt ? dateLabel(payout.paidAt) : ""}</small>
          </span>
        ) : (
          <button
            className="mvp-btn secondary"
            onClick={() => setEditing(!editing)}
          >
            {editing ? "Cancel" : "Record payment"}
            <CreditCard size={15} />
          </button>
        )}
      </div>
      <ActionMessage action={action} />
      {editing && (
        <form className="mvp-op-payout-form" onSubmit={pay}>
          <label className="mvp-field">
            Completed payment reference
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              required
              placeholder="Bank transfer or payment receipt reference"
            />
          </label>
          <p>
            Pay the tester using your payment method, then record the reference
            here.
          </p>
          <button className="mvp-btn" disabled={busy || action.pending}>
            Mark manually paid <Check size={16} />
          </button>
        </form>
      )}
    </div>
  );
}

function PayoutPanel({ campaign }: { campaign: Campaign }) {
  const { data } = useMvp();
  const payouts = data.payouts.filter(
    (item) => item.campaignId === campaign.id,
  );
  const pending = payouts.filter((item) => item.status === "pending");
  const paid = payouts.filter((item) => item.status === "paid");
  return (
    <div>
      <div className="mvp-op-section-top">
        <div>
          <h2>Payouts</h2>
          <p className="mvp-op-muted">
            Pay approved testers manually, then record the payment reference.
          </p>
        </div>
        <span className="mvp-op-pill">
          {paid.length}/{payouts.length} paid
        </span>
      </div>
      <div className="mvp-op-payout-stats">
        <div className="mvp-card">
          <span>Pending rewards</span>
          <strong>
            {money(
              pending.reduce((sum, item) => sum + item.amountCents, 0),
              campaign.currency,
            )}
          </strong>
          <small>{pending.length} testers awaiting payment</small>
        </div>
        <div className="mvp-card">
          <span>Recorded payments</span>
          <strong>
            {money(
              paid.reduce((sum, item) => sum + item.amountCents, 0),
              campaign.currency,
            )}
          </strong>
          <small>{paid.length} payments completed</small>
        </div>
      </div>
      {payouts.length ? (
        <section className="mvp-card mvp-op-ledger">
          <div className="mvp-op-section-top">
            <h3>Reward ledger</h3>
          </div>
          {payouts.map((payout) => (
            <PayoutRow key={payout.id} payout={payout} data={data} />
          ))}
        </section>
      ) : (
        <div className="mvp-card">
          <EmptyState icon={CreditCard} title="No rewards ready to pay.">
            <p>Approve a submission to create a pending payout.</p>
          </EmptyState>
        </div>
      )}
    </div>
  );
}

function FindingEditor({
  finding,
  campaign,
  sources,
  onChange,
  onRemove,
  readonly,
}: {
  finding: Finding;
  campaign: Campaign;
  sources: Array<{
    id: string;
    submission: Submission;
    result: TaskResult;
    tester: Profile | undefined;
  }>;
  onChange: (finding: Finding) => void;
  onRemove: () => void;
  readonly: boolean;
}) {
  const selectedSources = sources.filter((source) =>
    finding.sourceIds.includes(source.id),
  );
  function toggleSource(sourceId: string, checked: boolean) {
    const sourceIds = checked
      ? [...new Set([...finding.sourceIds, sourceId])]
      : finding.sourceIds.filter((id) => id !== sourceId);
    const taskIds = [
      ...new Set(
        sources
          .filter((source) => sourceIds.includes(source.id))
          .map((source) => source.result.taskId),
      ),
    ];
    onChange({ ...finding, sourceIds, taskIds });
  }
  return (
    <article className="mvp-op-finding-editor">
      <div className="mvp-op-section-top">
        {!readonly && (
          <button
            type="button"
            className="mvp-op-icon-btn"
            aria-label={`Remove finding ${finding.title || "Untitled"}`}
            onClick={onRemove}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <div className="mvp-op-finding-title-row">
        <label className="mvp-field">
          Finding title
          <input
            required
            readOnly={readonly}
            value={finding.title}
            onChange={(event) =>
              onChange({ ...finding, title: event.target.value })
            }
            placeholder="Describe the specific issue"
          />
        </label>
        <label className="mvp-field">
          Severity
          <select
            disabled={readonly}
            value={finding.severity}
            onChange={(event) =>
              onChange({ ...finding, severity: event.target.value as Severity })
            }
          >
            <option value="blocker">Blocker</option>
            <option value="major">Major</option>
            <option value="minor">Minor</option>
          </select>
        </label>
      </div>
      <label className="mvp-field">
        What the evidence shows
        <textarea
          rows={3}
          readOnly={readonly}
          required
          value={finding.description}
          onChange={(event) =>
            onChange({ ...finding, description: event.target.value })
          }
          placeholder="Describe the observed issue and its impact. Avoid unsupported claims."
        />
      </label>
      <label className="mvp-field">
        Recommended fix
        <textarea
          rows={2}
          readOnly={readonly}
          required
          value={finding.recommendation}
          onChange={(event) =>
            onChange({ ...finding, recommendation: event.target.value })
          }
          placeholder="A concrete next step for the founder"
        />
      </label>
      <details className="mvp-op-source-picker">
        <summary>
          <span>
            <Link2 size={16} />
            {selectedSources.length} approved task sources cited
          </span>
          <ChevronDown size={16} />
        </summary>
        <div className="mvp-op-source-options">
          {sources.map((source) => (
            <label
              key={source.id}
              className={
                finding.sourceIds.includes(source.id) ? "is-selected" : ""
              }
            >
              <input
                type="checkbox"
                disabled={readonly}
                checked={finding.sourceIds.includes(source.id)}
                onChange={(event) =>
                  toggleSource(source.id, event.target.checked)
                }
              />
              <span>
                <strong>
                  {source.tester?.name || "Tester"} ·{" "}
                  {campaign.tasks.find(
                    (task) => task.id === source.result.taskId,
                  )?.title || "Task"}
                </strong>
                <small>
                  {source.result.executionOutcome || source.result.outcome} ·{" "}
                  {severityLabels[source.result.severity]}
                </small>
                <q>{source.result.observation}</q>
                <code>{source.id}</code>
              </span>
            </label>
          ))}
        </div>
      </details>
      {!selectedSources.length && (
        <p className="mvp-op-input-error">
          Attach at least one QA-approved task source to this finding.
        </p>
      )}
      {selectedSources.length > 0 && (
        <div className="mvp-op-selected-citations">
          {selectedSources.map((source) => (
            <div key={source.id}>
              <span className="mvp-op-pill is-lime">
                <Check size={12} />
                {source.tester?.name || "Tester"}
              </span>
              <p>“{source.result.observation}”</p>
              <EvidenceList assets={source.result.evidence} />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ReportEditor({
  report,
  campaign,
  onDirtyChange,
}: {
  report: Report;
  campaign: Campaign;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { data, command, busy } = useMvp();
  const [summary, setSummary] = useState(report.summary);
  const [findings, setFindings] = useState(report.findings);
  const [savedVersion, setSavedVersion] = useState(
    JSON.stringify({ summary: report.summary, findings: report.findings }),
  );
  const action = useAction();
  const approved = data.submissions.filter(
    (item) => item.campaignId === campaign.id && item.status === "approved",
  );
  const sources = approved.flatMap((submission) =>
    submission.results.map((result) => ({
      id: taskSourceId(submission, result.taskId),
      submission,
      result,
      tester: data.profiles.find((item) => item.id === submission.testerId),
    })),
  );
  const metrics = reportMetrics(data, campaign.id);
  const readonly = report.status === "published";
  const dirty = savedVersion !== JSON.stringify({ summary, findings });
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const citationsValid = findings.every(
    (finding) =>
      finding.sourceIds.length > 0 &&
      finding.sourceIds.every((id) =>
        sources.some((source) => source.id === id),
      ) &&
      finding.title.trim() &&
      finding.description.trim() &&
      finding.recommendation.trim(),
  );
  async function save(event?: React.FormEvent) {
    event?.preventDefault();
    if (
      await action.run(
        () =>
          command({
            type: "update-report",
            reportId: report.id,
            summary: summary.trim(),
            findings,
          }),
        "Report draft saved.",
      )
    )
      setSavedVersion(JSON.stringify({ summary, findings }));
  }
  async function publish() {
    if (dirty) {
      action.setError("Save your report edits before publishing.");
      return;
    }
    await action.run(
      () => command({ type: "publish-report", reportId: report.id }),
      "Report published.",
    );
  }
  function download() {
    const content = [
      `# ${campaign.title} — Round ${campaign.round}`,
      "",
      summary,
      "",
      `QA-approved testers: ${approved.length}/5`,
      `Task completion: ${metrics.success}/${metrics.tasks} successful (${metrics.completionRate}%)`,
      "",
      ...findings.flatMap((finding) => [
        `## ${finding.title}`,
        `Severity: ${finding.severity}`,
        "",
        finding.description,
        "",
        `Recommended fix: ${finding.recommendation}`,
        "",
        "Evidence sources:",
        ...finding.sourceIds.map((sourceId) => {
          const source = sources.find((item) => item.id === sourceId);
          return source
            ? `- ${source.tester?.name || "Tester"} — ${campaign.tasks.find((task) => task.id === source.result.taskId)?.title}: "${source.result.observation}" (${sourceId})${source.result.evidence.map((asset) => `\n  ${asset.name}: ${asset.url}`).join("")}`
            : `- ${sourceId}`;
        }),
        "",
      ]),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${campaign.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-round-${campaign.round}.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <form className="mvp-card mvp-op-report-editor" onSubmit={save}>
      <div className="mvp-op-section-top">
        <div>
          <span className="mvp-op-kicker">
            {readonly ? "Published report" : "Draft report"}
          </span>
          <h3>
            {campaign.title} · Round {campaign.round}
          </h3>
        </div>
        <span className={`mvp-op-pill ${readonly ? "is-lime" : ""}`}>
          {report.method === "ai"
            ? "AI-assisted synthesis"
            : "Structured synthesis"}
        </span>
      </div>
      <ActionMessage action={action} />
      <div className="mvp-op-report-statline">
        <span>
          <strong>{approved.length}/5</strong> QA-approved testers
        </span>
        <span>
          <strong>{metrics.tasks}</strong> task results
        </span>
        <span>
          <strong>
            {metrics.success}/{metrics.tasks}
          </strong>{" "}
          completed tasks
        </span>
      </div>
      <label className="mvp-field">
        Founder summary
        <textarea
          rows={5}
          readOnly={readonly}
          required
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="Summarize the observed issues and priority fixes."
        />
      </label>
      <div className="mvp-op-section-top">
        <h3>Findings & recommended fixes</h3>
        {!readonly && (
          <button
            className="mvp-btn secondary"
            type="button"
            onClick={() =>
              setFindings((previous) => [
                ...previous,
                {
                  id: crypto.randomUUID(),
                  title: "",
                  severity: "minor",
                  description: "",
                  recommendation: "",
                  sourceIds: [],
                  taskIds: [],
                },
              ])
            }
          >
            Add finding <Plus size={15} />
          </button>
        )}
      </div>
      {findings.map((finding) => (
        <FindingEditor
          key={finding.id}
          finding={finding}
          campaign={campaign}
          sources={sources}
          readonly={readonly}
          onChange={(value) =>
            setFindings((previous) =>
              previous.map((item) => (item.id === finding.id ? value : item)),
            )
          }
          onRemove={() =>
            setFindings((previous) =>
              previous.filter((item) => item.id !== finding.id),
            )
          }
        />
      ))}
      {!findings.length && (
        <div className="mvp-op-no-findings">
          <p>No findings. Add findings supported by the submitted evidence.</p>
        </div>
      )}
      <div className="mvp-op-report-publish">
        <div>
          <strong>
            {readonly ? "Reviewed and published" : "Publication checklist"}
          </strong>
          {readonly ? (
            <p>
              {report.reviewedAt
                ? `Reviewed ${dateLabel(report.reviewedAt)}.`
                : "Report published."}
            </p>
          ) : (
            <>
              <p className={approved.length === 5 ? "is-ready" : ""}>
                {approved.length === 5 ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <Clock3 size={15} />
                )}
                Five QA-approved human submissions ({approved.length}/5)
              </p>
              <p className={citationsValid ? "is-ready" : ""}>
                {citationsValid ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <Clock3 size={15} />
                )}
                Every finding has verified source citations
              </p>
              <p className={!dirty ? "is-ready" : ""}>
                {!dirty ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}
                Latest report edits saved
              </p>
            </>
          )}
        </div>
        <div className="mvp-op-actions">
          <button
            type="button"
            className="mvp-btn secondary"
            onClick={download}
          >
            <ArrowDownToLine size={16} />
            Export Markdown
          </button>
          {!readonly && (
            <>
              <button
                className="mvp-btn secondary"
                disabled={busy || action.pending}
              >
                {action.pending ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                className="mvp-btn"
                disabled={
                  busy ||
                  action.pending ||
                  approved.length !== 5 ||
                  !citationsValid ||
                  !summary.trim() ||
                  dirty
                }
                onClick={publish}
              >
                Publish to founder <ArrowRight size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}

function ReportPanel({ campaign }: { campaign: Campaign }) {
  const { data, command, busy, mode } = useMvp();
  const action = useAction();
  const report = data.reports.find((item) => item.campaignId === campaign.id);
  const approved = data.submissions.filter(
    (item) => item.campaignId === campaign.id && item.status === "approved",
  );
  const metrics = reportMetrics(data, campaign.id);
  const [method, setMethod] = useState<"structured" | "ai">(
    mode === "local" ? "structured" : "ai",
  );
  const [draftDirty, setDraftDirty] = useState(false);
  const [fixVersion, setFixVersion] = useState(0);
  const fixController = useRef<AbortController | null>(null);
  useEffect(() => () => fixController.current?.abort(), [campaign.id]);
  async function generateFixes() {
    await action.run(async () => {
      const controller = new AbortController();
      fixController.current?.abort();
      fixController.current = controller;
      const redact = (text: string) => {
        let result = text;
        for (const profile of [...data.profiles].sort(
          (a, b) => b.name.length - a.name.length,
        ))
          if (profile.name.length >= 2)
            result = result.split(profile.name).join("Participant");
        return result.replace(
          /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
          "[email removed]",
        );
      };
      const response = await fetch("/api/validation-findings", {
        method: "POST",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          campaign: {
            title: redact(campaign.title),
            url: campaign.url,
            audience: redact(campaign.audience),
            objective: redact(campaign.objective),
            tasks: campaign.tasks.map((task) => ({
              ...task,
              title: redact(task.title),
              instructions: redact(task.instructions),
              question: redact(task.question),
              ...(task.successCriteria === undefined
                ? {}
                : { successCriteria: redact(task.successCriteria) }),
            })),
          },
          observations: approved.flatMap((submission) =>
            submission.results.map((result) => ({
              id: taskSourceId(submission, result.taskId),
              taskId: result.taskId,
              outcome: result.executionOutcome || result.outcome,
              answer: redact(result.answer).slice(0, 5000),
              observation: redact(result.observation).slice(0, 5000),
              severity: result.severity,
            })),
          ),
        }),
      });
      const result = (await response.json()) as {
        findings?: Finding[];
        method?: "ai" | "structured";
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          result.error ||
            "Proposed fixes could not be generated. Your previous report is kept.",
        );
      if (controller.signal.aborted)
        throw new Error("Proposed-fix generation was cancelled.");
      if (
        !Array.isArray(result.findings) ||
        !["ai", "structured"].includes(result.method || "")
      )
        throw new Error(
          "The proposed fixes could not be read. Your previous report is kept.",
        );
      let reportId = report?.id,
        summary = report?.summary;
      if (!reportId) {
        const generated = await command({
          type: "synthesize-report",
          campaignId: campaign.id,
          method: "structured",
        });
        reportId = generated.entityId;
        summary = generated.data.reports.find(
          (entry) => entry.id === reportId,
        )?.summary;
      }
      if (!reportId || !summary)
        throw new Error(
          "Generate a report draft before adding proposed fixes.",
        );
      await command({
        type: "update-report",
        reportId,
        summary,
        findings: result.findings,
        method: result.method,
      });
      setFixVersion((version) => version + 1);
    }, "Proposed fixes saved as a draft. Review the exact changes and cited observations before publishing.");
  }
  return (
    <div>
      <div className="mvp-op-section-top">
        <div>
          <h2>Campaign report</h2>
        </div>
        {report?.status !== "published" && (
          <button
            className="mvp-btn"
            disabled={busy || action.pending || !approved.length}
            onClick={() =>
              action.run(
                () =>
                  command({
                    type: "synthesize-report",
                    campaignId: campaign.id,
                    method,
                  }),
                "Report draft generated.",
              )
            }
          >
            {action.pending
              ? "Synthesizing…"
              : report
                ? "Regenerate from evidence"
                : "Synthesize approved feedback"}
            <FileText size={16} />
          </button>
        )}
      </div>
      {report?.status !== "published" && (
        <div className="mvp-op-synthesis-method">
          <button
            type="button"
            className="mvp-btn secondary"
            disabled={busy || action.pending || !approved.length || draftDirty}
            onClick={() => void generateFixes()}
          >
            Generate evidence-backed fixes
          </button>
          <p>
            {draftDirty
              ? "Save the current draft before generating proposed fixes."
              : "Optional AI draft from approved written observations. One bounded model call; review each proposed change before publishing."}
          </p>
        </div>
      )}
      {mode === "connected" && report?.status !== "published" && (
        <label className="mvp-field mvp-op-method-choice">
          Synthesis method
          <select
            value={method}
            onChange={(event) =>
              setMethod(event.target.value as "structured" | "ai")
            }
          >
            <option value="ai">
              AI synthesis with verified source citations
            </option>
            <option value="structured">
              Structured grouping from approved observations
            </option>
          </select>
          <small>
            Structured grouping remains available when the AI service is
            unavailable.
          </small>
        </label>
      )}
      <ActionMessage action={action} />
      {!report && (
        <div className="mvp-op-synthesis-method">
          <p>
            Generate a draft from approved submissions. Publishing requires five
            QA approvals and citations for every finding.
          </p>
        </div>
      )}
      <div className="mvp-op-report-metrics">
        <div>
          <span>Approved people</span>
          <strong>
            {metrics.testers}
            <small>/5</small>
          </strong>
        </div>
        <div>
          <span>Completed tasks</span>
          <strong>{metrics.success}</strong>
        </div>
        <div>
          <span>Partly completed</span>
          <strong>{metrics.partial}</strong>
        </div>
        <div>
          <span>Blocked tasks</span>
          <strong>{metrics.blocked}</strong>
        </div>
      </div>
      {report ? (
        <ReportEditor
          key={`${report.id}:${report.generatedAt}:${report.status}:${fixVersion}`}
          report={report}
          campaign={campaign}
          onDirtyChange={setDraftDirty}
        />
      ) : (
        <div className="mvp-card">
          <EmptyState
            icon={FileText}
            title={
              approved.length
                ? "No report generated"
                : "No approved submissions"
            }
          >
            <p>
              {approved.length
                ? `${approved.length} approved submissions available.`
                : "Approve a submission to generate a report."}
            </p>
          </EmptyState>
        </div>
      )}
    </div>
  );
}

export function AdminPage() {
  const { data, user } = useMvp();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const selectedId = params.get("campaign") || "";
  const tab = params.get("tab") || "matching";
  const campaigns = useMemo(
    () =>
      [...data.campaigns].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    [data.campaigns],
  );
  const filtered = campaigns.filter(
    (campaign) =>
      (!query.trim() ||
        `${campaign.title} ${campaign.audience} ${data.profiles.find((profile) => profile.id === campaign.founderId)?.name || ""}`
          .toLowerCase()
          .includes(query.toLowerCase().trim())) &&
      (stageFilter === "all" || campaignStage(data, campaign) === stageFilter),
  );
  const campaign =
    filtered.find((item) => item.id === selectedId) || filtered[0];
  const counts = campaign
    ? campaignCounts(data, campaign.id)
    : { invited: 0, accepted: 0, submitted: 0, approved: 0, paid: 0 };
  const pendingQa = data.submissions.filter(
    (item) => item.status === "submitted",
  ).length;
  const pendingPayouts = data.payouts.filter(
    (item) => item.status === "pending",
  ).length;
  const registered = data.profiles.filter(
    (item) => item.role === "tester",
  ).length;
  if (user?.role !== "admin")
    return (
      <div className="mvp-op-page mvp-card">
        <EmptyState icon={ShieldCheck} title="Operations access required">
          <p>
            Open the Operations view to review submissions and manage campaigns.
          </p>
        </EmptyState>
      </div>
    );
  const setTab = (value: string) =>
    setParams({ campaign: campaign?.id || "", tab: value });
  return (
    <div className="mvp-op-page mvp-op-admin">
      <div className="mvp-op-page-heading">
        <div>
          <h1>Operations</h1>
        </div>
      </div>
      <div className="mvp-op-admin-stats">
        <div>
          <span>
            <Users size={17} />
            Tester profiles
          </span>
          <strong>{registered}</strong>
        </div>
        <div>
          <span>
            <ClipboardCheck size={17} />
            Awaiting QA
          </span>
          <strong>{pendingQa}</strong>
        </div>
        <div>
          <span>
            <CreditCard size={17} />
            Pending payouts
          </span>
          <strong>{pendingPayouts}</strong>
        </div>
        <div>
          <span>
            <FileCheck2 size={17} />
            Published reports
          </span>
          <strong>
            {data.reports.filter((item) => item.status === "published").length}
          </strong>
        </div>
      </div>
      <div className="mvp-op-admin-layout">
        <aside className="mvp-op-campaign-sidebar">
          <div className="mvp-op-section-top">
            <h2>Campaigns</h2>
            <span className="mvp-op-pill">{data.campaigns.length}</span>
          </div>
          <div className="mvp-op-search">
            <Search size={16} />
            <input
              aria-label="Search campaigns"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search campaigns"
            />
          </div>
          <select
            className="mvp-op-stage-filter"
            aria-label="Filter campaign stage"
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value)}
          >
            <option value="all">All stages</option>
            <option value="draft">Awaiting payment</option>
            <option value="recruiting">Recruiting</option>
            <option value="testing">Testing</option>
            <option value="review">QA review</option>
            <option value="analysis">Analysis</option>
            <option value="complete">Published</option>
          </select>
          <div className="mvp-op-campaign-list">
            {filtered.map((item) => {
              const counts = campaignCounts(data, item.id);
              return (
                <button
                  key={item.id}
                  className={campaign?.id === item.id ? "is-selected" : ""}
                  onClick={() =>
                    setParams({ campaign: item.id, tab: "matching" })
                  }
                >
                  <span className="mvp-op-kicker">
                    ROUND {item.round} · {campaignStage(data, item)}
                  </span>
                  <strong>{item.title}</strong>
                  <small>
                    {data.profiles.find(
                      (profile) => profile.id === item.founderId,
                    )?.name || "Founder"}
                  </small>
                  <div className="mvp-op-progress-track">
                    <span
                      style={{ width: `${(counts.approved / 5) * 100}%` }}
                    />
                  </div>
                  <span className="mvp-op-campaign-count">
                    {counts.approved}/5 approved ·{" "}
                    {item.payment === "paid"
                      ? "Paid campaign"
                      : "Awaiting payment"}
                  </span>
                </button>
              );
            })}
          </div>
          {campaigns.length > 0 && !filtered.length && (
            <p className="mvp-op-muted">No campaigns match these filters.</p>
          )}
        </aside>
        <main className="mvp-op-admin-main">
          {campaign ? (
            <>
              <div className="mvp-op-campaign-heading">
                <div>
                  <span className="mvp-op-kicker">Round {campaign.round}</span>
                  <h2>{campaign.title}</h2>
                  <a
                    href={campaign.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {campaign.url}
                    <ArrowUpRight size={14} />
                  </a>
                </div>
                <span
                  className={`mvp-op-pill ${campaign.payment === "paid" ? "is-lime" : "is-amber"}`}
                >
                  {campaign.payment === "paid"
                    ? "Payment confirmed"
                    : "Payment required"}
                </span>
              </div>
              <div className="mvp-op-fulfilment-strip">
                <span>
                  <strong>{counts.invited}</strong>Invited
                </span>
                <ArrowRight size={14} />
                <span>
                  <strong>{counts.accepted}</strong>Accepted
                </span>
                <ArrowRight size={14} />
                <span>
                  <strong>{counts.submitted}</strong>Submitted
                </span>
                <ArrowRight size={14} />
                <span>
                  <strong>{counts.approved}/5</strong>QA approved
                </span>
                <ArrowRight size={14} />
                <span>
                  <strong>{counts.paid}</strong>Paid
                </span>
              </div>
              <nav
                className="mvp-op-admin-tabs"
                aria-label="Campaign operations"
              >
                {[
                  { id: "matching", label: "Match testers", Icon: Users },
                  {
                    id: "review",
                    label: "Review evidence",
                    Icon: ClipboardCheck,
                  },
                  { id: "payouts", label: "Payout ledger", Icon: CreditCard },
                  { id: "report", label: "Report", Icon: FileText },
                ].map(({ id, label, Icon }) => (
                  <button
                    className={tab === id ? "is-active" : ""}
                    key={id}
                    onClick={() => setTab(id)}
                  >
                    <Icon size={16} />
                    {label}
                    {id === "review" &&
                      data.submissions.filter(
                        (item) =>
                          item.campaignId === campaign.id &&
                          item.status === "submitted",
                      ).length > 0 && (
                        <span>
                          {
                            data.submissions.filter(
                              (item) =>
                                item.campaignId === campaign.id &&
                                item.status === "submitted",
                            ).length
                          }
                        </span>
                      )}
                  </button>
                ))}
              </nav>
              <div className="mvp-op-admin-panel" key={`${campaign.id}:${tab}`}>
                {tab === "review" ? (
                  <ReviewPanel campaign={campaign} />
                ) : tab === "payouts" ? (
                  <PayoutPanel campaign={campaign} />
                ) : tab === "report" ? (
                  <ReportPanel campaign={campaign} />
                ) : (
                  <MatchingPanel campaign={campaign} />
                )}
              </div>
            </>
          ) : (
            <div className="mvp-card">
              <EmptyState
                icon={FileCheck2}
                title={
                  campaigns.length
                    ? "No campaigns in this view."
                    : "No campaigns"
                }
              >
                {campaigns.length ? (
                  <p>Change the search or stage filter.</p>
                ) : (
                  <Link className="mvp-btn" to="/create">
                    Create test <Plus size={16} />
                  </Link>
                )}
              </EmptyState>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
