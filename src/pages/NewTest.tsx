import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Globe,
  ChevronDown,
  Sparkles,
  Target,
  Check,
  Bot,
  Users,
  Compass,
  FlaskConical,
} from "lucide-react";
import { useDemo } from "../simulation/store";
import Engine from "../components/Engine";
import { buildStrategy } from "../intelligence/model";
import { saveStrategyOptions, useStrategyOptions } from "../workspace/strategy";
const prompts = [
  {
    label: "Understand the value",
    question:
      "Do first-time users understand the product and know what to do next?",
  },
  {
    label: "Reduce onboarding friction",
    question: "Where do users hesitate or abandon the onboarding flow?",
  },
  {
    label: "Test trial intent",
    question:
      "What do founders need to know about pricing before starting their first test?",
  },
  {
    label: "Validate a feature",
    question: "Is this feature useful enough for users to return to it?",
  },
  {
    label: "Review a sensitive flow",
    question:
      "What security and privacy risks need review before shipping authentication?",
  },
];
export default function NewTest() {
  const { state, startAnalysis } = useDemo();
  const navigate = useNavigate();
  const location = useLocation();
  const savedOptions = useStrategyOptions();
  const [options, setOptions] = useState({ ...savedOptions });
  const [url, setUrl] = useState(state.url);
  const [question, setQuestion] = useState(
    (location.state as { question?: string } | null)?.question ??
      state.question,
  );
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [building, setBuilding] = useState(false);
  const previousPhase = useRef(state.phase);
  const strategy = buildStrategy(question, options);
  useEffect(() => {
    if (
      state.phase === "plan" &&
      (building || previousPhase.current === "analysing")
    )
      navigate("/tests/playground/plan");
    previousPhase.current = state.phase;
  }, [building, state.phase, navigate]);
  if (state.phase === "analysing") return <Engine />;
  const submit = () => {
    try {
      const parsed = new URL(url.includes("://") ? url : `https://${url}`);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        !parsed.hostname.includes(".")
      )
        throw Error();
      if (question.trim().length < 10) {
        setError("Give us a question with a little more detail.");
        return;
      }
      setError("");
      saveStrategyOptions(options);
      setBuilding(true);
      startAnalysis(parsed.href, question.trim());
    } catch {
      setError("Add a valid product URL, like https://tryplayground.net.");
    }
  };
  return (
    <div className="study-builder">
      <div className="page-heading">
        <div>
          <div className="eyebrow">QUESTION → STRATEGY</div>
          <h1>
            What do you need to know<span className="heading-dot">?</span>
          </h1>
          <p className="muted">
            Start with a decision. We’ll work out what evidence it needs.
          </p>
        </div>
        <span className="builder-step-label">
          <span>01</span> DESIGN YOUR STUDY
        </span>
      </div>
      <div className="study-builder-grid">
        <form
          className="study-builder-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="form-label" htmlFor="product-url">
            THE PRODUCT YOU’RE BUILDING
          </label>
          <div className="url-input">
            <Globe size={18} />
            <input
              id="product-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-product.dev"
              required
            />
            <span className="badge badge-neutral">PRODUCT URL</span>
          </div>
          <label className="form-label question-label" htmlFor="test-question">
            THE QUESTION THAT MATTERS
          </label>
          <textarea
            id="test-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            required
            maxLength={500}
          />
          <div className="question-footer">
            <span>
              <Target size={14} />
              Make it specific enough to change a decision.
            </span>
            <span>{question.length}/500</span>
          </div>
          <div className="builder-templates">
            <span className="eyebrow">START FROM A COMMON QUESTION</span>
            {prompts.map((prompt) => (
              <button
                type="button"
                key={prompt.label}
                className={question === prompt.question ? "selected" : ""}
                onClick={() => setQuestion(prompt.question)}
              >
                <span>{prompt.label}</span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
          <button
            className="advanced-toggle"
            type="button"
            onClick={() => setAdvanced(!advanced)}
            aria-expanded={advanced}
          >
            Set the study context
            <span>
              {options.audience} · {options.depth}
            </span>
            <ChevronDown
              size={17}
              style={{ transform: advanced ? "rotate(180deg)" : "" }}
            />
          </button>
          {advanced && (
            <div className="advanced-grid">
              {(
                [
                  {
                    field: "audience",
                    label: "Audience",
                    choices: [
                      "Startup founders",
                      "Product teams",
                      "Developers",
                      "First-time users",
                    ],
                  },
                  {
                    field: "stage",
                    label: "Product stage",
                    choices: ["Pre-launch", "Live product", "Prototype"],
                  },
                  {
                    field: "risk",
                    label: "Decision risk",
                    choices: ["Low", "Medium", "High"],
                  },
                  {
                    field: "depth",
                    label: "Study depth",
                    choices: ["Quick screen", "Balanced", "Deep validation"],
                  },
                ] as const
              ).map((config) => (
                <label key={config.field}>
                  {config.label}
                  <select
                    aria-label={config.label}
                    value={options[config.field]}
                    onChange={(e) =>
                      setOptions({ ...options, [config.field]: e.target.value })
                    }
                  >
                    {config.choices.map((choice) => (
                      <option key={choice}>{choice}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary build-plan" type="submit">
            <Sparkles size={18} />
            Build test plan
            <ArrowRight size={18} />
          </button>
          <div className="builder-assurance">
            <Check size={14} />
            Review the plan and cohort before running.
          </div>
        </form>
        <aside className="strategy-preview">
          <div className="eyebrow">
            <FlaskConical size={15} />
            YOUR STRATEGY IS TAKING SHAPE
          </div>
          <h2>{strategy.title}</h2>
          <p>{strategy.objective}</p>
          <div className="strategy-journey">
            <span className="eyebrow">THE JOURNEY WE’LL TEST</span>
            {strategy.journeys.map((journey, i) => (
              <div key={journey}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{journey}</strong>
                {i < strategy.journeys.length - 1 && (
                  <span className="journey-thread" />
                )}
              </div>
            ))}
          </div>
          <div className="strategy-preview-mix">
            <span className="eyebrow">RECOMMENDED EVIDENCE MIX</span>
            <div>
              <Bot size={17} />
              <span>Scout screening</span>
              <strong>20</strong>
            </div>
            <div>
              <Users size={17} />
              <span>Founder validation</span>
              <strong>5</strong>
            </div>
            <div>
              <Compass size={17} />
              <span>Expert interpretation</span>
              <strong>2</strong>
            </div>
          </div>
          <div className="strategy-preview-note">
            <strong>
              {options.risk === "High"
                ? "Higher risk. Deeper review."
                : options.depth === "Quick screen"
                  ? "Start with the highest-risk assumption."
                  : "A question deserves more than one perspective."}
            </strong>
            <p>
              {options.risk === "High"
                ? "Your strategy prioritizes specialist and expert assessment before the launch decision."
                : "AI explores the pattern. Matched founders test the behavior. Experts connect it to what should change."}
            </p>
            <small>
              This offline demo illustrates your strategy with the synthetic
              Playground study.
            </small>
          </div>
        </aside>
      </div>
    </div>
  );
}
