import { useNavigate } from "react-router-dom";
import {
  Bot,
  Users,
  Compass,
  Accessibility,
  ArrowRight,
  Check,
  Clock,
  ShieldCheck,
  Fingerprint,
  Pencil,
  Target,
} from "lucide-react";
import { useDemo } from "../simulation/store";
import { buildStrategy } from "../intelligence/model";
import { useStrategyOptions } from "../workspace/strategy";
import Engine from "../components/Engine";
export default function Plan() {
  const { state, startRun } = useDemo();
  const navigate = useNavigate();
  const options = useStrategyOptions();
  const strategy = buildStrategy(state.question, options);
  if (state.phase === "analysing") return <Engine />;
  const security = strategy.category === "security";
  const active = ["matching", "running", "analysing-results"].includes(
    state.phase,
  );
  const complete = ["complete", "v2-complete"].includes(state.phase);
  const run = () => {
    if (complete) {
      navigate("/tests/playground/changes");
      return;
    }
    startRun();
    navigate("/tests/playground/live");
  };
  const methods = [
    {
      Icon: Bot,
      title: "Scout screens",
      count: "20",
      unit: "behavioral personas",
      tag: "EXPLORE THE PATTERN",
      text: "Vary patience, skepticism and reading behavior to expose where the journey breaks.",
      color: "blue",
    },
    {
      Icon: Users,
      title: "Founders validate",
      count: "5",
      unit: "matched founder profiles",
      tag: "PROVE THE BEHAVIOR",
      text: "Check the signal against the people making the real decision to try the product.",
      color: "green",
    },
    {
      Icon: Compass,
      title: "Experts interpret",
      count: "2",
      unit: "product + growth experts",
      tag: "EXPLAIN THE WHY",
      text: "Connect what participants do to the positioning and workflow that should change.",
      color: "orange",
    },
    {
      Icon: security ? ShieldCheck : Accessibility,
      title: security ? "Security pathway" : "Specialist review",
      count: "1",
      unit: security
        ? "cybersecurity researcher"
        : "UX / accessibility specialist",
      tag: "REVIEW THE RISK",
      text: security
        ? "Assess flagged authentication scenarios through a specialist review pathway."
        : "Check the interaction risks and accessibility issues broad screening can miss.",
      color: "neutral",
    },
  ];
  return (
    <div className="plan-page strategy-plan">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <Check size={13} />
            STRATEGY READY FOR REVIEW
          </div>
          <h1>
            {strategy.title}
            <span className="heading-dot">.</span>
          </h1>
          <p className="muted">
            A methodology built around the question, with success defined up
            front.
          </p>
        </div>
        <button className="btn btn-primary" onClick={run}>
          {complete ? "Design a retest" : active ? "Continue test" : "Run test"}
          <ArrowRight size={18} />
        </button>
      </div>
      <section className="strategy-question">
        <div>
          <span className="eyebrow">THE DECISION WE’RE INFORMING</span>
          <h2>{state.question}</h2>
          <p>{strategy.objective}</p>
        </div>
        <button className="text-link" onClick={() => navigate("/new-test")}>
          <Pencil size={14} />
          Edit question
        </button>
        <div className="strategy-context">
          <span>
            <Users size={14} />
            {options.audience}
          </span>
          <span>{options.stage}</span>
          <span>{options.risk} risk</span>
          <span>{options.depth} depth</span>
        </div>
      </section>
      <div className="section-heading">
        <h2>The right mix. In the right order.</h2>
        <span className="eyebrow">QUESTION-DRIVEN METHODOLOGY</span>
      </div>
      <div className="method-grid">
        {methods.map((method, i) => (
          <div
            className={`method-card method-${method.color}`}
            key={method.title}
          >
            <div className="method-top">
              <method.Icon size={24} />
              <span className="eyebrow">0{i + 1}</span>
            </div>
            <h3>{method.title}</h3>
            <div className="method-number">
              {method.count}
              <span>{method.unit}</span>
            </div>
            <p>{method.text}</p>
            <span className="method-tag">{method.tag}</span>
          </div>
        ))}
      </div>
      <div className="strategy-rationale">
        <Fingerprint size={22} />
        <div>
          <strong>Why this strategy?</strong>
          <p>{strategy.rationale}</p>
        </div>
      </div>
      <section className="strategy-task-path">
        <div>
          <span className="eyebrow">THE PARTICIPANT JOURNEY</span>
          <h2>Follow the decision, step by step.</h2>
        </div>
        <div>
          {strategy.journeys.map((journey, i) => (
            <span key={journey}>
              <strong>{String(i + 1).padStart(2, "0")}</strong>
              {journey}
              {i < strategy.journeys.length - 1 && <ArrowRight size={15} />}
            </span>
          ))}
        </div>
      </section>
      <div className="plan-details-grid">
        <section className="panel plan-hypotheses">
          <div className="section-heading">
            <h2>Assumptions under test</h2>
            <span className="count">{strategy.assumptions.length}</span>
          </div>
          {strategy.assumptions.map((hypothesis, i) => (
            <div className="hypothesis" key={hypothesis}>
              <span className="mono">H0{i + 1}</span>
              <p>{hypothesis}</p>
            </div>
          ))}
        </section>
        <section className="panel plan-criteria">
          <div className="section-heading">
            <h2>What good looks like</h2>
            <Target size={20} />
          </div>
          {strategy.successSignals.map((criterion, i) => (
            <div className="strategy-success-signal" key={criterion}>
              <span>
                <Check size={14} />
              </span>
              <p>{criterion}</p>
              <small>0{i + 1}</small>
            </div>
          ))}
        </section>
      </div>
      <div className="plan-run-footer">
        <div>
          <span>
            <Clock size={17} />
            ~18 min research equivalent
          </span>
          <span>
            <ShieldCheck size={17} />
            Synthetic local demonstration
          </span>
          <small>
            27 primary sessions + a separate specialist pathway. About 50
            seconds at 1×.
          </small>
        </div>
        <button className="btn btn-primary" onClick={run}>
          {complete
            ? "Design version 02"
            : active
              ? "Open observation room"
              : "Let’s put it to the test"}
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
