import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Users,
  Compass,
  Check,
  FlaskConical,
  Network,
  Layers,
  GitBranch,
  Plus,
  Play,
  Target,
} from "lucide-react";
import { useDemo } from "../simulation/store";
import {
  getDecisionBrief,
  hypotheses,
  buildStrategy,
} from "../intelligence/model";
import { getCurrentEvidence } from "../simulation/selectors";
import { useStrategyOptions } from "../workspace/strategy";

const stages = [
  {
    id: "question",
    label: "Question",
    Icon: FlaskConical,
    path: "overview",
    description: "Define the decision you need to make.",
  },
  {
    id: "strategy",
    label: "Strategy",
    Icon: Network,
    path: "plan",
    description: "Make the assumptions measurable.",
  },
  {
    id: "observe",
    label: "Observe",
    Icon: Play,
    path: "live",
    description: "Watch people try the real journey.",
  },
  {
    id: "evidence",
    label: "Evidence",
    Icon: Layers,
    path: "evidence",
    description: "Connect behavior to an explanation.",
  },
  {
    id: "decision",
    label: "Decision",
    Icon: GitBranch,
    path: "report",
    description: "Choose what to ship and what to change.",
  },
];
function readQuestions(): string[] {
  try {
    const saved = JSON.parse(
      localStorage.getItem("playground-question-backlog") ?? "[]",
    );
    return Array.isArray(saved)
      ? saved.filter((q) => typeof q === "string").slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
export default function Overview({
  onFinding,
}: {
  onFinding: (id: string) => void;
}) {
  const { state } = useDemo();
  const options = useStrategyOptions();
  const strategy = buildStrategy(state.question, options);
  const navigate = useNavigate();
  const [selected, setSelected] = useState("question");
  const [questions, setQuestions] = useState(readQuestions);
  const [draft, setDraft] = useState("");
  const complete = ["complete", "v2-complete"].includes(state.phase);
  const running = [
    "running",
    "matching",
    "analysing-results",
    "retesting",
  ].includes(state.phase);
  const version = state.phase === "v2-complete" ? 2 : 1;
  const brief = getDecisionBrief(version);
  const evidence = getCurrentEvidence(
    complete ? 50 : state.phase === "running" ? state.clock : 0,
    version,
  );
  const currentStage = complete
    ? 4
    : running
      ? 2
      : state.phase === "plan"
        ? 1
        : 0;
  const detail = stages.find((s) => s.id === selected)!;
  const addQuestion = () => {
    const text = draft.trim();
    if (text.length < 10) return;
    const next = [text, ...questions].slice(0, 20);
    setQuestions(next);
    setDraft("");
    try {
      localStorage.setItem("playground-question-backlog", JSON.stringify(next));
    } catch {
      /* Questions remain available this session. */
    }
  };
  return (
    <div className="validation-overview">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ONE QUESTION → A DEFENSIBLE DECISION</div>
          <h1>
            Your validation map<span className="heading-dot">.</span>
          </h1>
          <p className="muted">
            See what we’re testing, how we’ll learn, and what the answer
            changes.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() =>
            navigate(
              complete
                ? "/tests/playground/report"
                : running
                  ? "/tests/playground/live"
                  : state.phase === "plan"
                    ? "/tests/playground/plan"
                    : "/new-test",
            )
          }
        >
          {complete
            ? "Read the decision"
            : running
              ? "Watch the study"
              : "Build the strategy"}
          <ArrowRight size={18} />
        </button>
      </div>
      <section className="validation-mission">
        <div>
          <span className="eyebrow">
            MISSION 001 / {options.stage.toUpperCase()}
          </span>
          <h2>{state.question}</h2>
          <p>{strategy.objective}</p>
        </div>
        <span className="mission-version">
          0{version}
          <small>VERSION</small>
        </span>
      </section>
      <section
        className="validation-map"
        aria-label="Interactive validation workflow"
      >
        <div className="map-stage-row">
          {stages.map((stage, i) => (
            <button
              className={`map-stage ${selected === stage.id ? "selected" : ""} ${i <= currentStage ? "reached" : ""}`}
              key={stage.id}
              onClick={() => setSelected(stage.id)}
              aria-pressed={selected === stage.id}
            >
              <span className="map-stage-number">0{i + 1}</span>
              <span className="map-stage-icon">
                <stage.Icon size={23} />
              </span>
              <strong>{stage.label}</strong>
              <small>
                {i < currentStage
                  ? "Complete"
                  : i === currentStage
                    ? "Current stage"
                    : "Up next"}
              </small>
              {i < 4 && <ArrowRight className="map-stage-arrow" size={18} />}
            </button>
          ))}
        </div>
        <div className="map-inspector">
          <div className="map-inspector-intro">
            <span className="eyebrow">
              {detail.label.toUpperCase()} / INSPECT THE CONNECTION
            </span>
            <h3>{detail.description}</h3>
          </div>
          <div className="map-inspector-content">
            {selected === "question" ? (
              <>
                <p>
                  A launch decision is only useful when the underlying
                  assumptions are explicit. This study tests five parts of the
                  journey, then turns the weak signals into specific changes.
                </p>
                <div className="map-inline-stats">
                  <span>
                    <Target size={16} />
                    <strong>5</strong> testable assumptions
                  </span>
                  <span>
                    <Users size={16} />
                    <strong>27</strong> primary sessions
                  </span>
                  <span>
                    <Layers size={16} />
                    <strong>{evidence.length}</strong> observed signals
                  </span>
                </div>
              </>
            ) : selected === "strategy" ? (
              <>
                <p>{strategy.rationale}</p>
                <div className="map-inline-stats">
                  <span>
                    <Bot size={16} />
                    <strong>20</strong> Scout personas
                  </span>
                  <span>
                    <Users size={16} />
                    <strong>5</strong> founders
                  </span>
                  <span>
                    <Compass size={16} />
                    <strong>2</strong> experts
                  </span>
                </div>
              </>
            ) : selected === "observe" ? (
              <>
                <p>
                  Each participant gets a task, a behavioral profile, and a
                  recorded path through the product. Compare an impatient
                  first-time visitor with a skeptical founder, without losing
                  the context behind their clicks.
                </p>
                <div className="map-inline-stats">
                  <span>
                    <Play size={16} />
                    Synchronized browser fleet
                  </span>
                  <span>
                    <Check size={16} />
                    Task outcomes + replay
                  </span>
                </div>
              </>
            ) : selected === "evidence" ? (
              <>
                <p>
                  {complete
                    ? `${evidence.length} observations, quotes and expert notes connect to the findings. Inspect the evidence graph to see where AI predictions and founder behavior agree.`
                    : "Signals connect each assumption to the session that supports it. AI, founder and expert contributions stay visible so you can assess the strength of the explanation."}
                </p>
                <div className="map-inline-stats">
                  <span>
                    <Layers size={16} />
                    Source → signal → finding
                  </span>
                  <span>
                    <Network size={16} />
                    Interactive evidence graph
                  </span>
                </div>
              </>
            ) : (
              <>
                <p>
                  {complete
                    ? brief.summary
                    : "The verdict combines measurable success criteria, participant outcomes and unresolved risks. Use the strongest evidence to choose changes, then retest the same question."}
                </p>
                <div className="map-inline-stats">
                  <span>
                    <GitBranch size={16} />
                    Selected changes → version 02
                  </span>
                  <span>
                    <Check size={16} />
                    Comparable cohort and criteria
                  </span>
                </div>
              </>
            )}
          </div>
          {selected !== "question" && (
            <button
              className="text-link"
              onClick={() => navigate(`/tests/playground/${detail.path}`)}
            >
              Open {detail.label.toLowerCase()}
              <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      </section>
      <div className="section-heading overview-assumption-heading">
        <div>
          <h2>The launch depends on these assumptions</h2>
          <p className="muted">
            Success criteria are defined before the study begins.
          </p>
        </div>
        <span className="badge badge-neutral">
          {complete ? "MEASURED RESULTS" : "PRE-REGISTERED CRITERIA"}
        </span>
      </div>
      <section className="assumption-register">
        {hypotheses.map((hypothesis, i) => {
          const result = brief.assumptions.find(
            (a) => a.hypothesisId === hypothesis.id,
          );
          return (
            <div className="register-row" key={hypothesis.id}>
              <span className="register-number">H0{i + 1}</span>
              <div>
                <h3>{hypothesis.title}</h3>
                <p>{hypothesis.rationale}</p>
              </div>
              <div className="register-criterion">
                <strong>{hypothesis.successSignal}</strong>
                <small>
                  {complete
                    ? `${result?.sessionIds.length ?? 0} supporting sessions`
                    : "Measured across AI + founder behavior"}
                </small>
              </div>
              <button
                className={`register-result ${complete && result?.passed ? "supported" : complete ? "at-risk" : ""}`}
                onClick={() => complete && onFinding(hypothesis.findingIds[0])}
                disabled={!complete}
              >
                {complete ? (
                  <>
                    <strong>
                      {result?.value ?? 0}
                      {result?.unit === "percent" ? "%" : "/100"}
                    </strong>
                    <span>{result?.passed ? "Supported" : "Needs work"}</span>
                    <ArrowUpRight size={15} />
                  </>
                ) : (
                  <span>Awaiting test</span>
                )}
              </button>
            </div>
          );
        })}
      </section>
      <section className="question-backlog">
        <div>
          <span className="eyebrow">THE NEXT QUESTION</span>
          <h2>Keep the learning moving.</h2>
          <p className="muted">
            Capture the next uncertainty while this one is in focus.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addQuestion();
          }}
        >
          <label htmlFor="next-question" className="sr-only">
            Add a question to your backlog
          </label>
          <input
            id="next-question"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What will we need to know next?"
            minLength={10}
            maxLength={500}
            required
          />
          <button className="btn btn-secondary" type="submit">
            <Plus size={16} /> Save question
          </button>
        </form>
        {questions.length > 0 && (
          <div className="backlog-list">
            {questions.map((question, i) => (
              <div key={`${question}-${i}`}>
                <span>Q{String(i + 2).padStart(2, "0")}</span>
                <strong>{question}</strong>
                <button
                  className="text-link"
                  onClick={() => navigate("/new-test", { state: { question } })}
                >
                  Build a test
                  <ArrowRight size={15} />
                </button>
                <button
                  className="remove-question"
                  aria-label={`Remove question ${i + 1}`}
                  onClick={() => {
                    const next = questions.filter((_, index) => index !== i);
                    setQuestions(next);
                    try {
                      localStorage.setItem(
                        "playground-question-backlog",
                        JSON.stringify(next),
                      );
                    } catch {
                      /* In-memory list works. */
                    }
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
