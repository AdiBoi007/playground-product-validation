import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Globe,
  Activity,
  Check,
  FlaskConical,
  Network,
  Layers,
  GitBranch,
  Play,
} from "lucide-react";
import { motion } from "motion/react";
import { useDemo } from "../simulation/store";
import {
  getMetrics,
  getCurrentEvidence,
  getFindingsForVersion,
} from "../simulation/selectors";
import { getDecisionBrief, hypotheses } from "../intelligence/model";
import { useWorkspace } from "../useWorkspace";
import { sampleProjects, sampleScore } from "../workspace/catalog";

export default function Dashboard() {
  const { state } = useDemo();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const complete = ["complete", "v2-complete"].includes(state.phase);
  const running = [
    "matching",
    "running",
    "analysing-results",
    "retesting",
  ].includes(state.phase);
  const clock = complete
    ? 50
    : ["running", "analysing-results"].includes(state.phase)
      ? state.clock
      : 0;
  const version = state.phase === "v2-complete" ? 2 : 1;
  const metrics = getMetrics(clock, version);
  const brief = getDecisionBrief(version);
  const evidence = getCurrentEvidence(clock, version);
  const open = getFindingsForVersion(version).filter(
    (f) => f.severity !== "low" && (version === 1 || !f.resolvedV2),
  );
  const nextPath = complete
    ? "report"
    : running
      ? "live"
      : state.phase === "plan"
        ? "plan"
        : "overview";
  const nextLabel = complete
    ? "Read the decision"
    : running
      ? "Open observation room"
      : state.phase === "plan"
        ? "Review test strategy"
        : "Open validation map";
  const loop = [
    { label: "Question", Icon: FlaskConical, path: "overview", done: true },
    {
      label: "Strategy",
      Icon: Network,
      path: "plan",
      done: state.phase !== "idle",
    },
    { label: "Observe", Icon: Play, path: "live", done: running || complete },
    {
      label: "Evidence",
      Icon: Layers,
      path: "evidence",
      done: evidence.length > 0,
    },
    { label: "Decision", Icon: GitBranch, path: "report", done: complete },
  ];
  return (
    <div className="workspace-dashboard">
      <div className="page-heading dashboard-heading">
        <div>
          <div className="eyebrow">
            {workspace.workspace.toUpperCase()} / PRODUCT INTELLIGENCE
          </div>
          <h1>
            Make your next move count<span className="heading-dot">.</span>
          </h1>
          <p className="muted">
            A workspace for turning product questions into decisions you can
            defend.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/new-test")}
        >
          <Plus size={18} /> New test
        </button>
      </div>
      <div className="workspace-pulse">
        <span>
          <i className={running ? "live-dot" : "pulse-dot"} />
          {running
            ? "One study in motion"
            : complete
              ? "Your latest study is ready for a decision"
              : "Your first study is ready to design"}
        </span>
        <span className="mono">4 PRODUCTS · 1 ACTIVE WORKSPACE</span>
      </div>
      <motion.section
        className="mission-project"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mission-project-main">
          <div className="mission-project-heading">
            <span className="product-mark">
              p<span>.</span>
            </span>
            <div>
              <h2>Playground</h2>
              <span>Website validation · Pre-launch</span>
            </div>
            <span
              className={`badge ${complete ? "badge-green" : running ? "badge-blue" : "badge-neutral"}`}
            >
              <i />
              {complete
                ? "Decision ready"
                : running
                  ? "Live study"
                  : "Study 001"}
            </span>
          </div>
          <div className="mission-question">
            <span className="eyebrow">THE QUESTION WE’RE ANSWERING</span>
            <h2>{state.question}</h2>
            <span>
              <Globe size={14} /> {new URL(state.url).hostname}{" "}
              <span className="question-dot">·</span>{" "}
              {version === 2 ? "Version 02" : "Version 01"}
            </span>
          </div>
          <div className="decision-loop">
            {loop.map((step, i) => (
              <button
                key={step.label}
                className={step.done ? "is-done" : ""}
                onClick={() => navigate(`/tests/playground/${step.path}`)}
              >
                <span>
                  {step.done ? <Check size={14} /> : <step.Icon size={14} />}
                </span>
                <strong>{step.label}</strong>
                {i < 4 && <ArrowRight className="loop-arrow" size={14} />}
              </button>
            ))}
          </div>
          <div className="mission-project-actions">
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/tests/playground/${nextPath}`)}
            >
              {nextLabel}
              <ArrowRight size={18} />
            </button>
            <button
              className="text-link"
              onClick={() => navigate("/tests/playground/sessions")}
            >
              Meet the cohort <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
        <div className={`mission-decision ${complete ? "has-decision" : ""}`}>
          <div className="mission-decision-top">
            <span className="eyebrow">
              {complete
                ? "THE CURRENT SIGNAL"
                : running
                  ? "SIGNAL IS BUILDING"
                  : "DECISION, BY DESIGN"}
            </span>
            <Network size={20} />
          </div>
          {complete ? (
            <>
              <div className="decision-score">
                {metrics.score}
                <small>/100</small>
                <span className="score-orbit" />
              </div>
              <h3>{brief.headline}</h3>
              <p>{brief.summary}</p>
              <button onClick={() => navigate("/tests/playground/changes")}>
                {version === 2
                  ? "Explore the next experiment"
                  : "Design version 02"}
                <ArrowRight size={17} />
              </button>
            </>
          ) : (
            <>
              <div className="abstract-field">
                <img
                  src="/brand/landscape.png"
                  alt="Playground illustrated field"
                />
                <span className="field-cross cross-one">✳</span>
                <span className="field-cross cross-two">+</span>
                <div className="field-note">ASK → OBSERVE → DECIDE</div>
              </div>
              <h3>
                {running
                  ? `${metrics.completed}/25 behavioral sessions complete`
                  : "Every assumption gets a test."}
              </h3>
              <p>
                {running
                  ? `${evidence.length} observed signals are connecting into a clearer picture.`
                  : "Scout explores. People validate. Experts explain what to change."}
              </p>
            </>
          )}
        </div>
        <div className="mission-stat-strip">
          {[
            [
              complete ? String(metrics.completed + 2) : "27",
              complete ? "Completed sessions" : "Matched participants",
              "20 Scout · 5 founders · 2 experts",
            ],
            [
              String(evidence.length),
              "Evidence signals",
              evidence.length
                ? "Linked to behavior and source"
                : "Arrive as the study runs",
            ],
            [
              complete ? String(open.length) : "5",
              complete ? "Open opportunities" : "Assumptions to test",
              complete
                ? "Prioritized by decision impact"
                : "Explicit pass / fail thresholds",
            ],
            [
              complete ? `${metrics.confidence}%` : "3",
              complete ? "Evidence confidence" : "Validation lenses",
              complete ? "Local synthetic study" : "AI · human · expert",
            ],
          ].map(([value, label, detail]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
              <small>{detail}</small>
            </div>
          ))}
        </div>
      </motion.section>
      <div className="workspace-next-grid">
        <section className="assumption-preview">
          <div className="section-heading">
            <h2>
              {complete
                ? "What the evidence says"
                : "The assumptions behind the launch"}
            </h2>
            <button
              className="text-link"
              onClick={() => navigate("/tests/playground/overview")}
            >
              Validation map <ArrowUpRight size={15} />
            </button>
          </div>
          {hypotheses.slice(0, 3).map((h, i) => {
            const result = brief.assumptions.find(
              (a) => a.hypothesisId === h.id,
            );
            return (
              <button
                className="assumption-preview-row"
                key={h.id}
                onClick={() =>
                  navigate(
                    complete
                      ? "/tests/playground/evidence"
                      : "/tests/playground/overview",
                  )
                }
              >
                <span className="assumption-index">0{i + 1}</span>
                <span>
                  <strong>{h.title}</strong>
                  <small>{h.successSignal}</small>
                </span>
                <span
                  className={`assumption-chip ${complete && result?.passed ? "supported" : complete ? "at-risk" : ""}`}
                >
                  {complete
                    ? `${result?.value ?? 0}${result?.unit === "percent" ? "%" : "/100"}`
                    : "Untested"}
                </span>
                <ArrowUpRight size={16} />
              </button>
            );
          })}
        </section>
        <aside className="workspace-field-note">
          <div className="eyebrow">
            <Activity size={13} />{" "}
            {complete ? "LATEST FIELD NOTE" : "YOUR VALIDATION PARTNER"}
          </div>
          <blockquote>
            {complete
              ? (evidence
                  .filter((e) => e.type.toLowerCase().includes("quote"))
                  .at(-1)?.detail ?? brief.summary)
              : "You don’t need another opinion. You need to know what people do, why they do it, and what to change."}
          </blockquote>
          <div>
            <span className="note-avatar">p.</span>
            <span>
              {complete
                ? "Linked to a recorded participant session"
                : "One question. A complete learning loop."}
            </span>
          </div>
        </aside>
      </div>
      <div className="section-heading sample-heading">
        <div>
          <h2>More questions. Different products.</h2>
          <p className="muted">
            Explore three complete studies from this synthetic workspace.
          </p>
        </div>
        <span className="badge badge-neutral">SAMPLE STUDIES</span>
      </div>
      <div className="sample-study-grid">
        {sampleProjects.map((project) => (
          <button
            className="sample-study-card"
            key={project.id}
            onClick={() => navigate(`/projects/${project.id}`)}
          >
            <div>
              <span
                className="sample-product-mark"
                style={{ background: project.color }}
              >
                {project.name[0].toLowerCase()}
                <span>.</span>
              </span>
              <span className="mono">{project.stage.toUpperCase()}</span>
              <ArrowUpRight size={18} />
            </div>
            <h3>
              {project.name}
              <span>{project.category}</span>
            </h3>
            <p>{project.question}</p>
            <div className="sample-study-footer">
              <span>
                <strong>{sampleScore(project)}</strong>/100
              </span>
              <span>
                {project.verdict.startsWith("SHIP")
                  ? "Ship with guardrails"
                  : "Iterate"}
                <i
                  className={
                    project.verdict.startsWith("SHIP") ? "positive" : ""
                  }
                />
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
