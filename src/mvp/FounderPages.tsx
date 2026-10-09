import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  ExternalLink,
  FileCheck2,
  FileText,
  FlaskConical,
  Globe2,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useMvp } from "./store";
import {
  campaignStage,
  campaignCounts,
  reportMetrics,
  money,
  CAMPAIGN_PRICE,
} from "./model";
import type {
  Campaign,
  CampaignStage,
  Finding,
  Report,
  Task,
  WorkspaceData,
} from "./types";
import "./founder.css";

const stageLabels: Record<CampaignStage, string> = {
  draft: "Draft",
  recruiting: "Recruiting",
  testing: "In progress",
  review: "Evidence review",
  analysis: "Report in review",
  complete: "Report ready",
};
const stageDescriptions: Record<CampaignStage, string> = {
  draft: "Approve the tasks and complete checkout to launch.",
  recruiting: "Invite five testers in Operations.",
  testing: "Waiting for testers to submit feedback.",
  review: "Review submitted feedback in Operations.",
  analysis: "Generate and publish the report in Operations.",
  complete: "Published report available.",
};
const getError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
const getHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const safeUrl = (url: string) =>
  /^(https?:|blob:|data:image\/)/i.test(url) ? url : undefined;
const taskId = () => `task_${crypto.randomUUID()}`;

function useDialogFocus(open: boolean, close: () => void, blocked: boolean) {
  const container = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = container.current;
    if (!open || !dialog) return;
    const previous = document.activeElement;
    const controls = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex='0']",
        ),
      ).filter((element) => element.getClientRects().length);
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !blocked) {
        event.preventDefault();
        close();
      }
      if (event.key !== "Tab") return;
      const focusable = controls();
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [open, close, blocked]);
  return useCallback((node: HTMLElement | null) => {
    container.current = node;
  }, []);
}

function StageBadge({ stage }: { stage: CampaignStage }) {
  return (
    <span className={`fp-badge fp-badge-${stage}`}>
      <span />
      {stageLabels[stage]}
    </span>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <div className="fp-error" role="alert">
      {message}
    </div>
  ) : null;
}

function PageMissing() {
  return (
    <div className="fp-empty">
      <FileText size={30} />
      <h2>Test not found</h2>
      <Link className="fp-btn" to="/dashboard">
        Back to tests <ArrowRight size={16} />
      </Link>
    </div>
  );
}

export function DashboardPage() {
  const { data, user, mode } = useMvp();
  const campaigns = data.campaigns
    .filter((c) => c.founderId === user?.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = campaigns.filter(
    (c) => !["draft", "complete"].includes(campaignStage(data, c)),
  );
  const ready = campaigns.filter((c) => campaignStage(data, c) === "complete");
  const drafts = campaigns.filter((c) => campaignStage(data, c) === "draft");
  const [filter, setFilter] = useState("all");
  const visible =
    filter === "active"
      ? active
      : filter === "ready"
        ? ready
        : filter === "draft"
          ? drafts
          : campaigns;

  return (
    <div className="fp-page">
      <div className="fp-page-top">
        <div>
          <h1>Tests</h1>
        </div>
        <Link to="/create" className="fp-btn">
          <Plus size={17} /> Create test
        </Link>
      </div>

      {campaigns.length > 0 && (
        <div className="fp-test-filterbar">
          <div className="fp-filters" aria-label="Filter tests">
            {[
              { key: "all", label: "All tests", count: campaigns.length },
              { key: "active", label: "Active", count: active.length },
              { key: "ready", label: "Reports", count: ready.length },
              { key: "draft", label: "Drafts", count: drafts.length },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                className={filter === key ? "is-active" : ""}
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
              >
                {label} <span>{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {visible.length ? (
        <div className="fp-campaign-list">
          {visible.map((campaign) => {
            const stage = campaignStage(data, campaign);
            const counts = campaignCounts(data, campaign.id);
            return (
              <Link
                className="fp-campaign-row"
                to={
                  stage === "draft" &&
                  !(mode === "connected" && campaign.checkoutExpiresAt)
                    ? `/create?draft=${campaign.id}`
                    : `/campaigns/${campaign.id}`
                }
                key={campaign.id}
              >
                <div className="fp-product-icon">
                  <Globe2 size={22} strokeWidth={1.6} />
                </div>
                <div className="fp-campaign-identity">
                  <h3>{campaign.title}</h3>
                  <span>
                    {getHost(campaign.url)} <i>·</i> Round {campaign.round}
                  </span>
                </div>
                <StageBadge stage={stage} />
                <div className="fp-campaign-people">
                  <div className="fp-mini-slots">
                    {Array.from({ length: 5 }, (_, i) => (
                      <span
                        className={
                          i < counts.approved
                            ? "is-done"
                            : i < counts.accepted
                              ? "is-active"
                              : ""
                        }
                        key={i}
                      >
                        {i < counts.approved ? (
                          <Check size={10} />
                        ) : (
                          <Users size={10} />
                        )}
                      </span>
                    ))}
                  </div>
                  <small>{counts.approved}/5 approved submissions</small>
                </div>
                <span className="fp-campaign-date">
                  {dateLabel(campaign.createdAt)}
                </span>
                <ArrowUpRight className="fp-row-arrow" size={20} />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="fp-empty fp-dashboard-empty">
          <div className="fp-empty-mark">
            <FlaskConical size={26} strokeWidth={1.5} />
          </div>
          <h3>{filter === "all" ? "No tests yet" : "No matching tests"}</h3>
        </div>
      )}
    </div>
  );
}

type CampaignInput = Pick<
  Campaign,
  "title" | "url" | "audience" | "objective" | "assumption"
>;

export function CreateTestPage() {
  const [params] = useSearchParams();
  const { data, user, mode } = useMvp();
  const id = params.get("draft");
  const campaign = data.campaigns.find(
    (c) => c.id === id && c.founderId === user?.id,
  );
  if (id && !campaign) return <PageMissing />;
  if (
    mode === "connected" &&
    campaign?.payment === "unpaid" &&
    campaign.checkoutExpiresAt &&
    Date.parse(campaign.checkoutExpiresAt) > Date.now()
  ) {
    return (
      <div className="fp-page">
        <Link className="fp-back" to="/dashboard">
          <ArrowLeft size={15} /> Tests
        </Link>
        <section className="fp-empty fp-checkout-pending">
          <div className="fp-empty-mark">
            <CreditCard size={27} strokeWidth={1.5} />
          </div>

          <h2>Checkout pending</h2>
          <p>
            Resume checkout or cancel it to edit the tasks. Payment is confirmed
            by Stripe.
          </p>
          <Link className="fp-btn" to={`/campaigns/${campaign.id}`}>
            Manage checkout <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    );
  }
  const prefill: CampaignInput = {
    title: (params.get("title") || "").slice(0, 120),
    url: (params.get("url") || "").slice(0, 2000),
    audience: (params.get("audience") || "").slice(0, 4000),
    objective: (params.get("objective") || "").slice(0, 4000),
    assumption: (params.get("assumption") || "").slice(0, 4000),
  };
  return (
    <CampaignWizard
      key={id || params.toString() || "new"}
      initial={campaign}
      prefill={prefill}
    />
  );
}

function CampaignWizard({
  initial,
  prefill,
}: {
  initial?: Campaign;
  prefill?: CampaignInput;
}) {
  const store = useMvp();
  const navigate = useNavigate();
  const [input, setInput] = useState<CampaignInput>({
    title: initial?.title ?? prefill?.title ?? "",
    url: initial?.url ?? prefill?.url ?? "",
    audience: initial?.audience ?? prefill?.audience ?? "",
    objective: initial?.objective ?? prefill?.objective ?? "",
    assumption: initial?.assumption ?? prefill?.assumption ?? "",
  });
  const [tasks, setTasks] = useState<Task[]>(initial?.tasks || []);
  const [step, setStep] = useState(
    initial?.tasksApproved ? 3 : initial?.tasks.length ? 2 : 1,
  );
  const [approved, setApproved] = useState(initial?.tasksApproved || false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [method, setMethod] = useState<"ai" | "template" | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const closePayment = useCallback(() => setPaymentOpen(false), []);
  const paymentDialogRef = useDialogFocus(paymentOpen, closePayment, working);
  const price = initial
    ? money(initial.priceCents, initial.currency)
    : money(CAMPAIGN_PRICE, "usd");
  const changeInput = (key: keyof CampaignInput, value: string) => {
    setInput((v) => ({ ...v, [key]: value }));
    setApproved(false);
    setSavedMessage("");
  };
  const changeTask = (
    id: string,
    key: keyof Omit<Task, "id">,
    value: string,
  ) => {
    setTasks((current) =>
      current.map((t) => (t.id === id ? { ...t, [key]: value } : t)),
    );
    setApproved(false);
    setSavedMessage("");
  };
  const validateInput = () => {
    if (
      !input.title.trim() ||
      !input.audience.trim() ||
      !input.objective.trim()
    )
      throw new Error(
        "Add a test name, target audience and objective before saving.",
      );
    try {
      const url = new URL(input.url);
      if (!/^https?:$/.test(url.protocol)) throw new Error();
    } catch {
      throw new Error(
        "Enter a complete product URL starting with https:// or http://.",
      );
    }
  };
  const persist = async (tasksApproved = approved, draftTasks = tasks) => {
    validateInput();
    const fields = { ...input, tasks: draftTasks, tasksApproved };
    const result = initial
      ? await store.command({
          type: "update-campaign",
          campaignId: initial.id,
          patch: fields,
        })
      : await store.command({ type: "create-campaign", campaign: fields });
    return initial?.id || result.entityId;
  };
  const saveDraft = async () => {
    setError("");
    setWorking(true);
    try {
      const id = await persist();
      setSavedMessage("Draft saved.");
      if (!initial && id) navigate(`/create?draft=${id}`, { replace: true });
    } catch (e) {
      setError(getError(e));
    } finally {
      setWorking(false);
    }
  };
  const generate = async (event?: FormEvent) => {
    event?.preventDefault();
    setError("");
    setWorking(true);
    try {
      validateInput();
      const generated = await store.suggestTasks(input);
      setTasks(generated.tasks);
      setMethod(generated.method);
      setApproved(false);
      setStep(2);
    } catch (e) {
      setError(getError(e));
    } finally {
      setWorking(false);
    }
  };
  const approve = async () => {
    setError("");
    setWorking(true);
    try {
      if (
        !tasks.length ||
        tasks.some(
          (t) =>
            !t.title.trim() || !t.instructions.trim() || !t.question.trim(),
        )
      )
        throw new Error(
          "Every task needs a title, instructions and a follow-up question.",
        );
      const id = await persist(true);
      setApproved(true);
      setStep(3);
      if (!initial && id) navigate(`/create?draft=${id}`, { replace: true });
    } catch (e) {
      setError(getError(e));
    } finally {
      setWorking(false);
    }
  };
  const checkout = async () => {
    setWorking(true);
    setError("");
    try {
      const id =
        initial?.tasksApproved && approved ? initial.id : await persist(true);
      if (!id)
        throw new Error(
          "Couldn’t find the saved test. Save your draft and try again.",
        );
      await store.checkout(id);
      setPaymentOpen(false);
      if (store.mode === "local") navigate(`/campaigns/${id}`);
    } catch (e) {
      setError(getError(e));
    } finally {
      setWorking(false);
    }
  };

  if (initial?.payment === "paid")
    return (
      <div className="fp-empty">
        <CheckCircle2 size={35} />
        <h2>Test active</h2>
        <Link className="fp-btn" to={`/campaigns/${initial.id}`}>
          View test <ArrowRight size={16} />
        </Link>
      </div>
    );
  return (
    <div className="fp-page fp-create-page">
      <Link className="fp-back" to="/dashboard">
        <ArrowLeft size={15} /> Tests
      </Link>
      <div className="fp-page-top">
        <div>
          <h1>Create test</h1>
        </div>
        <button
          className="fp-btn fp-btn-outline"
          onClick={saveDraft}
          disabled={working || store.busy}
        >
          <FileText size={16} /> Save draft
        </button>
      </div>
      <div className="fp-wizard-steps">
        {["Product details", "Tasks", "Review & checkout"].map(
          (title, index) => (
            <button
              className={
                step === index + 1
                  ? "is-current"
                  : step > index + 1
                    ? "is-complete"
                    : ""
              }
              key={title}
              disabled={index + 1 > step}
              onClick={() => {
                setStep(index + 1);
                setError("");
              }}
            >
              <span className="fp-step-number">
                {step > index + 1 ? <Check size={16} /> : `0${index + 1}`}
              </span>
              <span>
                <strong>{title}</strong>
              </span>
              {index < 2 && <ChevronRight size={16} />}
            </button>
          ),
        )}
      </div>
      <ErrorNotice message={error} />
      {savedMessage && (
        <div className="fp-saved" role="status">
          <CheckCircle2 size={16} /> {savedMessage}
        </div>
      )}
      <div className="fp-create-grid">
        <section className="fp-card fp-wizard-main">
          {step === 1 && (
            <form onSubmit={generate}>
              <label className="fp-field">
                <span>
                  Test name <span className="fp-required">*</span>
                </span>
                <input
                  value={input.title}
                  onChange={(e) => changeInput("title", e.target.value)}
                  required
                  maxLength={120}
                  placeholder="e.g. Can new users finish onboarding?"
                />
              </label>
              <label className="fp-field">
                <span>
                  Product URL <span className="fp-required">*</span>
                </span>
                <div className="fp-input-icon">
                  <Globe2 size={17} />
                  <input
                    type="url"
                    value={input.url}
                    onChange={(e) => changeInput("url", e.target.value)}
                    placeholder="https://your-product.com"
                    required
                  />
                </div>
                <small>Testers must be able to access this URL.</small>
              </label>
              <label className="fp-field">
                <span>
                  Target audience <span className="fp-required">*</span>
                </span>
                <textarea
                  value={input.audience}
                  onChange={(e) => changeInput("audience", e.target.value)}
                  required
                  rows={2}
                  maxLength={1200}
                  placeholder="e.g. Freelance designers managing 3–5 client projects, mostly on desktop."
                />
                <small>Include role, experience and device.</small>
              </label>
              <label className="fp-field">
                <span>
                  Test objective <span className="fp-required">*</span>
                </span>
                <textarea
                  value={input.objective}
                  onChange={(e) => changeInput("objective", e.target.value)}
                  required
                  rows={2}
                  maxLength={2000}
                  placeholder="e.g. Can first-time users create a project without instructions?"
                />
              </label>
              <label className="fp-field">
                <span>
                  Assumption <span className="fp-optional">Optional</span>
                </span>
                <textarea
                  value={input.assumption}
                  onChange={(e) => changeInput("assumption", e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="e.g. People will understand that a workspace can contain multiple projects."
                />
              </label>
              <div className="fp-form-footer">
                <button
                  className="fp-btn"
                  type="submit"
                  disabled={working || store.busy}
                >
                  {working ? (
                    <Loader2 size={16} className="fp-spin" />
                  ) : (
                    <Sparkles size={16} />
                  )}{" "}
                  Generate tasks <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}
          {step === 2 && (
            <div>
              <div className="fp-suggestion-note">
                <Sparkles size={17} />
                <div>
                  <strong>
                    {method === "ai" ? "AI-generated tasks" : "Suggested tasks"}
                  </strong>
                  <p>Edit before approval.</p>
                </div>
                <button
                  onClick={() => generate()}
                  disabled={working || store.busy}
                  aria-label="Regenerate mission"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              <div className="fp-task-editor-list">
                {tasks.map((task, i) => (
                  <div className="fp-task-editor" key={task.id}>
                    <div className="fp-task-editor-top">
                      <span className="fp-kicker">
                        TASK {String(i + 1).padStart(2, "0")}
                      </span>
                      <button
                        aria-label={`Remove task ${i + 1}`}
                        onClick={() => {
                          setTasks((ts) => ts.filter((t) => t.id !== task.id));
                          setApproved(false);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <label className="fp-field">
                      <span>Task title</span>
                      <input
                        value={task.title}
                        onChange={(e) =>
                          changeTask(task.id, "title", e.target.value)
                        }
                        placeholder="Describe the thing to do"
                        maxLength={200}
                        required
                      />
                    </label>
                    <label className="fp-field">
                      <span>Instructions</span>
                      <textarea
                        rows={2}
                        value={task.instructions}
                        onChange={(e) =>
                          changeTask(task.id, "instructions", e.target.value)
                        }
                        placeholder="Give the tester a real goal, without giving away how to do it."
                        maxLength={3000}
                        required
                      />
                    </label>
                    <label className="fp-field">
                      <span>Follow-up question</span>
                      <input
                        value={task.question}
                        onChange={(e) =>
                          changeTask(task.id, "question", e.target.value)
                        }
                        placeholder="What was easy, confusing or unexpected?"
                        maxLength={1000}
                        required
                      />
                    </label>
                  </div>
                ))}
              </div>
              <button
                className="fp-add-task"
                onClick={() => {
                  setTasks((ts) => [
                    ...ts,
                    { id: taskId(), title: "", instructions: "", question: "" },
                  ]);
                  setApproved(false);
                }}
                disabled={tasks.length >= 6}
              >
                <Plus size={17} /> Add a task <span>{tasks.length}/6</span>
              </button>
              <div className="fp-approval-note">
                <ShieldCheck size={17} />
                <p>Tasks cannot be changed after launch.</p>
              </div>
              <div className="fp-form-footer">
                <button className="fp-text-btn" onClick={() => setStep(1)}>
                  <ArrowLeft size={15} /> Back to details
                </button>
                <button
                  className="fp-btn"
                  onClick={approve}
                  disabled={working || store.busy}
                >
                  {working ? (
                    <Loader2 size={16} className="fp-spin" />
                  ) : (
                    <Check size={16} />
                  )}{" "}
                  Approve mission <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div>
              <div className="fp-review-product">
                <div className="fp-product-icon">
                  <Globe2 size={24} />
                </div>
                <div>
                  <h3>{input.title}</h3>
                  <a href={input.url} target="_blank" rel="noreferrer">
                    {getHost(input.url)} <ExternalLink size={12} />
                  </a>
                </div>
                <button className="fp-text-btn" onClick={() => setStep(1)}>
                  Edit
                </button>
              </div>
              <dl className="fp-review-details">
                <div>
                  <dt>TARGET AUDIENCE</dt>
                  <dd>{input.audience}</dd>
                </div>
                <div>
                  <dt>TEST OBJECTIVE</dt>
                  <dd>{input.objective}</dd>
                </div>
                {input.assumption && (
                  <div>
                    <dt>ASSUMPTION</dt>
                    <dd>{input.assumption}</dd>
                  </div>
                )}
              </dl>
              <div className="fp-review-mission">
                <div>
                  <h3>
                    Tasks{" "}
                    <span className="fp-pill">
                      <Check size={12} /> Approved
                    </span>
                  </h3>
                  <button className="fp-text-btn" onClick={() => setStep(2)}>
                    Edit tasks
                  </button>
                </div>
                {tasks.map((task, i) => (
                  <div className="fp-review-task" key={task.id}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <p>{task.title}</p>
                    <CheckCircle2 size={15} />
                  </div>
                ))}
              </div>
              <div className="fp-checkout-summary">
                <div>
                  <h3>5 testers</h3>
                  <p>Matching, feedback and report</p>
                </div>
                <strong>
                  {price}
                  <small>USD / one round</small>
                </strong>
              </div>
              {store.mode === "local" && (
                <div className="fp-local-checkout-note">
                  <FlaskConical size={16} />
                  <p>Checkout is simulated. No payment is collected.</p>
                </div>
              )}
              <div className="fp-form-footer">
                <button className="fp-text-btn" onClick={() => setStep(2)}>
                  <ArrowLeft size={15} /> Back to mission
                </button>
                <button
                  className="fp-btn"
                  onClick={() =>
                    store.mode === "local"
                      ? setPaymentOpen(true)
                      : void checkout()
                  }
                  disabled={working || store.busy}
                >
                  {working ? (
                    <Loader2 size={16} className="fp-spin" />
                  ) : (
                    <CreditCard size={16} />
                  )}
                  {store.mode === "local"
                    ? "Simulate checkout"
                    : "Continue to checkout"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      {paymentOpen && (
        <div
          className="fp-modal-backdrop"
          onClick={() => !working && setPaymentOpen(false)}
        >
          <section
            className="fp-modal"
            ref={paymentDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="local-checkout-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="fp-modal-close"
              onClick={() => setPaymentOpen(false)}
              disabled={working}
              aria-label="Close checkout"
            >
              <X size={20} />
            </button>
            <div className="fp-modal-icon">
              <FlaskConical size={27} />
            </div>

            <h2 id="local-checkout-title">Simulate checkout</h2>
            <p>No payment is collected. This opens five tester slots.</p>
            <div className="fp-modal-receipt">
              <span>Simulated payment</span>
              <strong>{price}</strong>
            </div>
            <ErrorNotice message={error} />
            <button className="fp-btn" onClick={checkout} disabled={working}>
              {working ? (
                <Loader2 size={17} className="fp-spin" />
              ) : (
                <CheckCircle2 size={17} />
              )}{" "}
              Confirm simulated payment
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

export function CampaignPage() {
  const { id } = useParams();
  const store = useMvp();
  const campaign = store.data.campaigns.find(
    (c) => c.id === id && c.founderId === store.user?.id,
  );
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [checkoutAction, setCheckoutAction] = useState<
    "resume" | "cancel" | null
  >(null);
  if (!campaign) return <PageMissing />;
  const stage = campaignStage(store.data, campaign);
  const checkoutPending =
    store.mode === "connected" &&
    campaign.payment === "unpaid" &&
    Boolean(campaign.checkoutExpiresAt);
  const counts = campaignCounts(store.data, campaign.id);
  const assignments = store.data.assignments
    .filter((a) => a.campaignId === campaign.id && a.status !== "declined")
    .slice(0, 5);
  const report = store.data.reports.find(
    (r) => r.campaignId === campaign.id && r.status === "published",
  );
  const approvedSubmissions = store.data.submissions.filter(
    (s) => s.campaignId === campaign.id && s.status === "approved",
  );
  const stages: CampaignStage[] = [
    "recruiting",
    "testing",
    "review",
    "analysis",
    "complete",
  ];
  const current = stages.indexOf(stage);
  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      await store.refresh();
    } catch (e) {
      setError(getError(e));
    } finally {
      setRefreshing(false);
    }
  };
  const manageCheckout = async (action: "resume" | "cancel") => {
    setCheckoutAction(action);
    setError("");
    try {
      if (action === "resume") await store.checkout(campaign.id);
      else await store.cancelCheckout(campaign.id);
    } catch (e) {
      setError(getError(e));
    } finally {
      setCheckoutAction(null);
    }
  };
  return (
    <div className="fp-page">
      <Link className="fp-back" to="/dashboard">
        <ArrowLeft size={15} /> Tests
      </Link>
      <div className="fp-page-top">
        <div>
          <span className="fp-eyebrow">ROUND {campaign.round}</span>
          <h1>{campaign.title}</h1>
          <p>
            <a
              className="fp-host-link"
              href={campaign.url}
              target="_blank"
              rel="noreferrer"
            >
              {getHost(campaign.url)} <ExternalLink size={12} />
            </a>
            <span className="fp-meta-dot">·</span>Created{" "}
            {dateLabel(campaign.createdAt)}
          </p>
        </div>
        <div className="fp-header-actions">
          <button
            className="fp-btn fp-btn-outline"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? "fp-spin" : ""} size={15} />{" "}
            Refresh
          </button>
          {report && (
            <Link className="fp-btn" to={`/campaigns/${campaign.id}/results`}>
              View report <ArrowUpRight size={17} />
            </Link>
          )}
          {checkoutPending && (
            <>
              <button
                className="fp-btn fp-btn-outline"
                disabled={store.busy || Boolean(checkoutAction)}
                onClick={() => void manageCheckout("cancel")}
              >
                {checkoutAction === "cancel" ? (
                  <Loader2 className="fp-spin" size={15} />
                ) : (
                  <X size={15} />
                )}{" "}
                Cancel checkout
              </button>
              <button
                className="fp-btn"
                disabled={store.busy || Boolean(checkoutAction)}
                onClick={() => void manageCheckout("resume")}
              >
                {checkoutAction === "resume" ? (
                  <Loader2 className="fp-spin" size={15} />
                ) : (
                  <CreditCard size={15} />
                )}{" "}
                Resume checkout <ArrowUpRight size={15} />
              </button>
            </>
          )}
          {stage === "draft" && !checkoutPending && (
            <Link className="fp-btn" to={`/create?draft=${campaign.id}`}>
              Continue setup <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </div>
      <ErrorNotice message={error} />
      <section className="fp-status-hero">
        <div>
          <h2>{checkoutPending ? "Checkout pending" : stageLabels[stage]}</h2>
          <p>
            {checkoutPending
              ? "Resume checkout or cancel it to edit the tasks."
              : stageDescriptions[stage]}
          </p>
        </div>
        <div className="fp-status-counter">
          <strong>
            {counts.approved}
            <span>/ 5</span>
          </strong>
          <span>APPROVED SUBMISSIONS</span>
          <div className="fp-counter-track">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                className={i < counts.approved ? "is-complete" : ""}
                key={i}
              />
            ))}
          </div>
        </div>
      </section>
      <div className="fp-status-steps">
        {stages.map((s, i) => (
          <div
            className={
              i < current ? "is-done" : i === current ? "is-current" : ""
            }
            key={s}
          >
            <span>
              {i < current ? (
                <Check size={15} />
              ) : (
                String(i + 1).padStart(2, "0")
              )}
            </span>
            <p>
              {["Recruiting", "Testing", "Review", "Report", "Complete"][i]}
            </p>
            {i < 4 && <div className="fp-stage-connector" />}
          </div>
        ))}
      </div>
      <div className="fp-campaign-grid">
        <div>
          <section className="fp-card fp-slots-card">
            <div className="fp-card-top">
              <div>
                <h2>Testers</h2>
              </div>
              <span className="fp-pill">{counts.accepted}/5 accepted</span>
            </div>
            <p className="fp-card-description">
              Invite and manage testers in Operations.
            </p>
            <div className="fp-tester-slots">
              {Array.from({ length: 5 }, (_, i) => {
                const assignment = assignments[i];
                const profile = store.data.profiles.find(
                  (p) => p.id === assignment?.testerId,
                );
                const labels = {
                  invited: "Invitation sent",
                  accepted: "Testing",
                  submitted: "Feedback in review",
                  revision: "Revising feedback",
                  approved: "Evidence approved",
                  declined: "Declined",
                };
                return (
                  <div
                    className={`fp-tester-slot ${assignment ? `fp-slot-${assignment.status}` : "fp-slot-empty"}`}
                    key={assignment?.id || i}
                  >
                    <div className="fp-slot-avatar">
                      {profile ? (
                        profile.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((n) => n[0])
                          .join("")
                      ) : (
                        <Users size={19} strokeWidth={1.5} />
                      )}
                      {assignment?.status === "approved" && (
                        <span>
                          <Check size={10} />
                        </span>
                      )}
                    </div>
                    <span className="fp-slot-number">SLOT 0{i + 1}</span>
                    <strong>{profile?.name || "Awaiting match"}</strong>
                    <p>
                      {assignment
                        ? labels[assignment.status]
                        : "Not yet invited"}
                    </p>
                    {profile && (
                      <small>
                        {profile.device === "both"
                          ? "Desktop + mobile"
                          : profile.device === "desktop"
                            ? "Desktop"
                            : "Mobile"}
                      </small>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="fp-slots-footer">
              <ShieldCheck size={15} />
              <p>Approval requires an evidence review.</p>
            </div>
          </section>
          <section className="fp-card fp-mission-card">
            <div className="fp-card-top">
              <div>
                <h2>Mission</h2>
              </div>
              {campaign.tasksApproved && (
                <span className="fp-pill">
                  <Check size={12} /> Approved
                </span>
              )}
            </div>
            <div className="fp-objective">
              <Target size={18} />
              <div>
                <span>TEST OBJECTIVE</span>
                <p>{campaign.objective}</p>
              </div>
            </div>
            {campaign.tasks.map((task, i) => (
              <details className="fp-mission-task" key={task.id}>
                <summary>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <strong>{task.title}</strong>
                  <ChevronDown size={17} />
                </summary>
                <div>
                  <p>{task.instructions}</p>
                  <small>FOLLOW-UP QUESTION</small>
                  <p>{task.question}</p>
                </div>
              </details>
            ))}
          </section>
          {approvedSubmissions.length > 0 && (
            <section className="fp-card fp-approved-card">
              <div className="fp-card-top">
                <div>
                  <h2>Approved feedback</h2>
                </div>
                <span className="fp-pill">
                  {approvedSubmissions.length} approved
                </span>
              </div>
              {approvedSubmissions.map((submission, i) => (
                <details className="fp-approved-submission" key={submission.id}>
                  <summary>
                    <span className="fp-small-avatar">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>
                        {store.data.profiles.find(
                          (p) => p.id === submission.testerId,
                        )?.name || "Tester"}
                      </strong>
                      <small>
                        {submission.results.length} task results ·{" "}
                        {dateLabel(submission.updatedAt)}
                      </small>
                    </div>
                    <span className="fp-evidence-approved">
                      <CheckCircle2 size={14} /> QA approved
                    </span>
                    <ChevronDown size={16} />
                  </summary>
                  <div>
                    {submission.overallFeedback && (
                      <blockquote>“{submission.overallFeedback}”</blockquote>
                    )}
                    {submission.results.map((result) => (
                      <div className="fp-approved-result" key={result.taskId}>
                        <strong>
                          {campaign.tasks.find((t) => t.id === result.taskId)
                            ?.title || "Task feedback"}
                        </strong>
                        <span
                          className={`fp-outcome fp-outcome-${result.outcome}`}
                        >
                          {result.outcome}
                        </span>
                        <p>{result.observation || result.answer}</p>
                        <div className="fp-evidence-links">
                          {result.evidence.map(
                            (asset) =>
                              safeUrl(asset.url) && (
                                <a
                                  href={safeUrl(asset.url)}
                                  key={asset.id}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <ExternalLink size={12} /> {asset.name}
                                </a>
                              ),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </section>
          )}
        </div>
        <aside className="fp-campaign-aside">
          <section className="fp-card">
            <span className="fp-eyebrow">TEST DETAILS</span>
            <dl className="fp-campaign-details">
              <div>
                <dt>Payment</dt>
                <dd className={campaign.payment === "paid" ? "fp-paid" : ""}>
                  {campaign.payment === "paid" ? (
                    <>
                      <CheckCircle2 size={14} /> Confirmed
                    </>
                  ) : (
                    "Not yet paid"
                  )}
                </dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{money(campaign.priceCents, campaign.currency)}</dd>
              </div>
              <div>
                <dt>Tester slots</dt>
                <dd>5</dd>
              </div>
              <div>
                <dt>Mission</dt>
                <dd>{campaign.tasks.length} tasks</dd>
              </div>
              <div>
                <dt>Round</dt>
                <dd>{String(campaign.round).padStart(2, "0")}</dd>
              </div>
            </dl>
            {store.mode === "local" && (
              <p className="fp-detail-note">
                Payment is simulated. No payment was collected.
              </p>
            )}
          </section>
          <section className="fp-card fp-audience-card">
            <Users size={20} />
            <span className="fp-eyebrow">TARGET AUDIENCE</span>
            <p>{campaign.audience}</p>
            {campaign.assumption && (
              <div>
                <span className="fp-eyebrow">ASSUMPTION</span>
                <p>{campaign.assumption}</p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function citedResults(
  data: WorkspaceData,
  campaignId: string,
  finding: Finding,
) {
  return data.submissions
    .filter((s) => s.campaignId === campaignId && s.status === "approved")
    .flatMap((submission) =>
      submission.results
        .filter((result) =>
          finding.sourceIds.includes(`${submission.id}:${result.taskId}`),
        )
        .map((result) => ({ submission, result })),
    );
}

function ReportDownload({
  data,
  campaign,
  report,
}: {
  data: WorkspaceData;
  campaign: Campaign;
  report: Report;
}) {
  const download = () => {
    const metrics = reportMetrics(data, campaign.id);
    const lines = [
      `# ${campaign.title} — Round ${campaign.round}`,
      "",
      `Product: ${campaign.url}`,
      `Audience: ${campaign.audience}`,
      `Objective: ${campaign.objective}`,
      "",
      `Approved testers: ${metrics.testers}/5`,
      `Reviewed task attempts: ${metrics.tasks}`,
      `Successful: ${metrics.success} | Partial: ${metrics.partial} | Blocked: ${metrics.blocked}`,
      "",
      "## Summary",
      "",
      report.summary,
      "",
      "## Findings",
      "",
    ];
    for (const finding of report.findings) {
      lines.push(
        `### ${finding.title} (${finding.severity})`,
        "",
        finding.description,
        "",
        `Recommendation: ${finding.recommendation}`,
        "",
        "Sources:",
      );
      for (const { submission, result } of citedResults(
        data,
        campaign.id,
        finding,
      )) {
        const name =
          data.profiles.find((p) => p.id === submission.testerId)?.name ||
          "Tester";
        lines.push(
          `- ${name} — ${campaign.tasks.find((t) => t.id === result.taskId)?.title || result.taskId} (${result.outcome})`,
          `  Source: ${submission.id}:${result.taskId}`,
          `  Answer: ${result.answer}`,
          `  Observation: ${result.observation}`,
        );
        result.evidence.forEach((asset) =>
          lines.push(
            `  Evidence: ${asset.name} — ${asset.kind === "link" ? asset.url : "Attached in workspace"}`,
          ),
        );
      }
      lines.push("");
    }
    lines.push("## Mission", "");
    campaign.tasks.forEach((task, i) =>
      lines.push(
        `${i + 1}. ${task.title}`,
        `   ${task.instructions}`,
        `   Question: ${task.question}`,
        "",
      ),
    );
    const url = URL.createObjectURL(
      new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${campaign.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-round-${campaign.round}.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <button className="fp-btn fp-btn-outline" onClick={download}>
      <ArrowDownToLine size={16} /> Export report
    </button>
  );
}

function FindingCard({
  finding,
  campaign,
  data,
  index,
}: {
  finding: Finding;
  campaign: Campaign;
  data: WorkspaceData;
  index: number;
}) {
  const sources = citedResults(data, campaign.id, finding);
  const people = new Set(sources.map((s) => s.submission.testerId)).size;
  return (
    <article className="fp-finding-card">
      <div className="fp-finding-top">
        <span className="fp-kicker">
          FINDING {String(index + 1).padStart(2, "0")}
        </span>
        <span className={`fp-severity fp-severity-${finding.severity}`}>
          <span />
          {finding.severity}
        </span>
      </div>
      <h3>{finding.title}</h3>
      <p>{finding.description}</p>
      <div className="fp-recommendation">
        <ArrowUpRight size={18} />
        <div>
          <span>RECOMMENDATION</span>
          <p>{finding.recommendation}</p>
        </div>
      </div>
      <details className="fp-finding-sources">
        <summary>
          <Layers3 size={15} />
          <strong>
            {sources.length} cited task{" "}
            {sources.length === 1 ? "result" : "results"}
          </strong>
          <span>
            from {people} {people === 1 ? "tester" : "testers"}
          </span>
          <ChevronDown size={16} />
        </summary>
        <div className="fp-source-list">
          {sources.map(({ submission, result }) => (
            <div
              className="fp-source"
              key={`${submission.id}:${result.taskId}`}
            >
              <div className="fp-source-top">
                <span className="fp-source-avatar">
                  {data.profiles
                    .find((p) => p.id === submission.testerId)
                    ?.name.slice(0, 1) || "T"}
                </span>
                <div>
                  <strong>
                    {data.profiles.find((p) => p.id === submission.testerId)
                      ?.name || "Tester"}
                  </strong>
                  <small>
                    {campaign.tasks.find((t) => t.id === result.taskId)
                      ?.title || "Task feedback"}
                  </small>
                </div>
                <span className={`fp-outcome fp-outcome-${result.outcome}`}>
                  {result.outcome}
                </span>
              </div>
              {result.answer && (
                <div className="fp-source-quote">
                  <span>ANSWER</span>
                  <blockquote>“{result.answer}”</blockquote>
                </div>
              )}
              {result.observation && (
                <div className="fp-source-quote">
                  <span>OBSERVATION</span>
                  <blockquote>“{result.observation}”</blockquote>
                </div>
              )}
              {result.evidence.length > 0 && (
                <div className="fp-source-evidence">
                  {result.evidence.map(
                    (asset) =>
                      safeUrl(asset.url) && (
                        <a
                          className={
                            asset.kind === "image"
                              ? "fp-evidence-image"
                              : "fp-evidence-attachment"
                          }
                          href={safeUrl(asset.url)}
                          target="_blank"
                          rel="noreferrer"
                          key={asset.id}
                        >
                          {asset.kind === "image" && (
                            <img
                              src={safeUrl(asset.url)}
                              alt={asset.name}
                              loading="lazy"
                            />
                          )}
                          <span>
                            <ExternalLink size={13} />
                            {asset.name}
                          </span>
                        </a>
                      ),
                  )}
                </div>
              )}
            </div>
          ))}
          {sources.length === 0 && (
            <p className="fp-no-sources">
              No approved source results are linked to this finding.
            </p>
          )}
        </div>
      </details>
    </article>
  );
}

function RoundComparison({
  campaign,
  data,
}: {
  campaign: Campaign;
  data: WorkspaceData;
}) {
  const parent = data.campaigns.find((c) => c.id === campaign.parentCampaignId);
  if (!parent) return null;
  const before = reportMetrics(data, parent.id);
  const after = reportMetrics(data, campaign.id);
  const beforeRate = before.tasks
    ? Math.round((before.success / before.tasks) * 100)
    : 0;
  const afterRate = after.tasks
    ? Math.round((after.success / after.tasks) * 100)
    : 0;
  return (
    <section className="fp-card fp-round-comparison">
      <div className="fp-card-top">
        <div>
          <h2>Round comparison</h2>
        </div>
        <RefreshCw size={20} />
      </div>
      <div className="fp-round-compare-table">
        <div>
          <span>APPROVED EVIDENCE</span>
          <strong>Round {parent.round}</strong>
          <strong>Round {campaign.round}</strong>
        </div>
        {[
          ["Testers", `${before.testers}/5`, `${after.testers}/5`],
          [
            "Task success",
            `${beforeRate}% (${before.success}/${before.tasks})`,
            `${afterRate}% (${after.success}/${after.tasks})`,
          ],
          ["Blocked attempts", String(before.blocked), String(after.blocked)],
        ].map(([label, a, b]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{a}</strong>
            <strong>{b}</strong>
          </div>
        ))}
      </div>
      <div className="fp-comparison-change">
        <span className="fp-kicker">CHANGES</span>
        <p>{campaign.changes}</p>
      </div>

      <Link className="fp-text-btn" to={`/campaigns/${parent.id}/results`}>
        View round {parent.round} report <ArrowUpRight size={14} />
      </Link>
    </section>
  );
}

function RetestPanel({ campaign }: { campaign: Campaign }) {
  const store = useMvp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(campaign.url);
  const [changes, setChanges] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const closeRetest = useCallback(() => setOpen(false), []);
  const retestDialogRef = useDialogFocus(open, closeRetest, working);
  const child = store.data.campaigns.find(
    (c) => c.parentCampaignId === campaign.id,
  );
  const createRetest = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      if (!changes.trim())
        throw new Error(
          "Describe what you changed so the next round has context.",
        );
      const result = await store.command({
        type: "retest",
        campaignId: campaign.id,
        url,
        changes,
      });
      if (!result.entityId)
        throw new Error("Retest could not be created. Please try again.");
      navigate(`/create?draft=${result.entityId}`);
    } catch (e) {
      setError(getError(e));
    } finally {
      setWorking(false);
    }
  };
  return (
    <>
      <section className="fp-retest-card">
        <div>
          <h2>Retest</h2>
          {!child && (
            <p>New round using the current tasks. Checkout required.</p>
          )}
        </div>
        {child ? (
          <Link
            className="fp-btn fp-btn-lime"
            to={
              child.payment === "paid"
                ? `/campaigns/${child.id}`
                : `/create?draft=${child.id}`
            }
          >
            View round {child.round} <ArrowUpRight size={17} />
          </Link>
        ) : (
          <button className="fp-btn fp-btn-lime" onClick={() => setOpen(true)}>
            Create retest <ArrowRight size={17} />
          </button>
        )}
      </section>
      {open && (
        <div
          className="fp-modal-backdrop"
          onClick={() => !working && setOpen(false)}
        >
          <form
            className="fp-modal fp-retest-modal"
            ref={retestDialogRef}
            onSubmit={createRetest}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="retest-title"
          >
            <button
              className="fp-modal-close"
              type="button"
              onClick={() => setOpen(false)}
              disabled={working}
              aria-label="Close retest"
            >
              <X size={20} />
            </button>
            <span className="fp-eyebrow">
              ROUND {String(campaign.round + 1).padStart(2, "0")}
            </span>
            <h2 id="retest-title">Create retest</h2>
            <p>
              Review the copied tasks and complete checkout for a new round.
            </p>
            <label className="fp-field">
              <span>Updated product URL</span>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-product.com"
                required
              />
            </label>
            <label className="fp-field">
              <span>What did you change?</span>
              <textarea
                value={changes}
                onChange={(e) => setChanges(e.target.value)}
                rows={4}
                placeholder="List the fixes you made and the findings they address."
                maxLength={4000}
                required
              />
            </label>
            <ErrorNotice message={error} />
            <button
              className="fp-btn"
              type="submit"
              disabled={working || store.busy}
            >
              {working ? (
                <Loader2 size={17} className="fp-spin" />
              ) : (
                <RefreshCw size={17} />
              )}{" "}
              Create retest draft <ArrowRight size={17} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export function ResultsPage() {
  const { id } = useParams();
  const { data, user } = useMvp();
  const campaign = data.campaigns.find(
    (c) => c.id === id && c.founderId === user?.id,
  );
  const [severity, setSeverity] = useState("all");
  if (!campaign) return <PageMissing />;
  const report = data.reports.find(
    (r) => r.campaignId === campaign.id && r.status === "published",
  );
  if (!report)
    return (
      <div className="fp-page">
        <Link className="fp-back" to={`/campaigns/${campaign.id}`}>
          <ArrowLeft size={15} /> Test status
        </Link>
        <div className="fp-report-wait">
          <div className="fp-empty-mark">
            <FileText size={32} strokeWidth={1.5} />
          </div>

          <h1>Test report</h1>
          <p>
            Available after five submissions are approved and the report is
            published.
          </p>
          <Link to={`/campaigns/${campaign.id}`} className="fp-btn">
            View test status <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    );
  const metrics = reportMetrics(data, campaign.id);
  const successRate = metrics.tasks
    ? Math.round((metrics.success / metrics.tasks) * 100)
    : 0;
  const findings = report.findings.filter(
    (f) => severity === "all" || f.severity === severity,
  );
  const blockers = report.findings.filter(
    (f) => f.severity === "blocker",
  ).length;
  return (
    <div className="fp-page fp-results-page">
      <Link className="fp-back" to={`/campaigns/${campaign.id}`}>
        <ArrowLeft size={15} /> Test status
      </Link>
      <div className="fp-page-top">
        <div>
          <span className="fp-eyebrow">ROUND {campaign.round}</span>
          <h1>Test report</h1>
          <p>
            {campaign.title}
            <span className="fp-meta-dot">·</span>
            <a
              className="fp-host-link"
              href={campaign.url}
              target="_blank"
              rel="noreferrer"
            >
              {getHost(campaign.url)} <ExternalLink size={12} />
            </a>
          </p>
        </div>
        <ReportDownload data={data} campaign={campaign} report={report} />
      </div>
      <section className="fp-report-summary">
        <div className="fp-report-summary-copy">
          <span className="fp-summary-approved">
            <ShieldCheck size={15} /> PUBLISHED
          </span>
          <h2>Summary</h2>
          <p>{report.summary}</p>
          <div className="fp-report-method">
            <span>
              <Users size={14} /> {metrics.testers} approved testers
            </span>
            <span>
              <FileCheck2 size={14} /> {metrics.tasks} reviewed task attempts
            </span>
            <span>
              <CheckCircle2 size={14} /> Operations reviewed
            </span>
          </div>
        </div>
        <div className="fp-report-summary-aside">
          <span className="fp-eyebrow">TEST OBJECTIVE</span>
          <Target size={24} />
          <p>{campaign.objective}</p>
          <span>
            Published {dateLabel(report.reviewedAt || report.generatedAt)}
          </span>
        </div>
      </section>
      <div className="fp-result-stats">
        <div>
          <span>Task success</span>
          <strong>
            {successRate}
            <small>%</small>
          </strong>
          <p>
            {metrics.success} of {metrics.tasks} attempts completed successfully
          </p>
        </div>
        <div>
          <span>Partial completion</span>
          <strong>{String(metrics.partial).padStart(2, "0")}</strong>
        </div>
        <div>
          <span>Blocked attempts</span>
          <strong>{String(metrics.blocked).padStart(2, "0")}</strong>
        </div>
        <div>
          <span>Blocker findings</span>
          <strong className={blockers ? "fp-blocker-value" : ""}>
            {String(blockers).padStart(2, "0")}
          </strong>
        </div>
      </div>

      <div className="fp-section-heading">
        <div>
          <h2>
            Findings <span className="fp-count">{report.findings.length}</span>
          </h2>
        </div>
        <div className="fp-filters" aria-label="Filter findings by severity">
          {[
            ["all", "All findings"],
            ["blocker", "Blocker"],
            ["major", "Major"],
            ["minor", "Minor"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={severity === key ? "is-active" : ""}
              onClick={() => setSeverity(key)}
              aria-pressed={severity === key}
            >
              {label}
              {key !== "all" && (
                <span>
                  {report.findings.filter((f) => f.severity === key).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {findings.length ? (
        <div className="fp-findings-list">
          {findings.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              campaign={campaign}
              data={data}
              index={report.findings.indexOf(finding)}
            />
          ))}
        </div>
      ) : (
        <div className="fp-empty fp-findings-empty">
          <CheckCircle2 size={26} />
          <h3>
            {severity === "all"
              ? "No findings"
              : `No ${severity} findings in this report.`}
          </h3>
        </div>
      )}
      <RoundComparison campaign={campaign} data={data} />
      <RetestPanel campaign={campaign} />
    </div>
  );
}
