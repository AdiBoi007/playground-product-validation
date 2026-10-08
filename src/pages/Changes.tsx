import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  Layers3,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Brand from "../components/Brand";
import { recommendedActions } from "../intelligence/actions";
import { useDecision } from "../intelligence/store";
import { getMetrics, getProjectedMetrics } from "../simulation/selectors";
import { useDemo } from "../simulation/store";
import "../report.css";

const actionIcons = {
  orchestration: Layers3,
  model: Users,
  pricing: ShieldCheck,
};

export default function Changes({
  onFinding,
}: {
  onFinding: (id: string, version?: 1 | 2) => void;
}) {
  const { state, retest } = useDemo();
  const { draftActionIds, committedActionIds, toggleAction, selectAll } =
    useDecision();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(params.get("focus"));
  const [preview, setPreview] = useState<1 | 2>(2);
  const [scopeOpen, setScopeOpen] = useState(false);
  const projected = getProjectedMetrics(draftActionIds);
  const baseline = getMetrics(50, 1);
  const changes = draftActionIds.length;
  const selected = preview === 2 ? draftActionIds : [];
  const runRetest = () => {
    retest();
    navigate("/tests/playground/compare");
  };

  return (
    <div className="changes-page report-surface">
      <div className="report-page-heading compact">
        <div>
          <span className="eyebrow">EVIDENCE → EXPERIMENT</span>
          <h1>Make the next test count.</h1>
          <p className="muted">
            Choose what to change. Keep the question and cohort consistent.
          </p>
        </div>
        <span className="badge badge-blue">
          <FlaskConical size={15} />
          Version 2 experiment
        </span>
      </div>
      <div className="changes-workbench">
        <section className="change-experiments">
          <div className="change-section-heading">
            <div>
              <span className="eyebrow">RECOMMENDED SCOPE</span>
              <h2>Three changes worth testing.</h2>
            </div>
            <button
              onClick={selectAll}
              disabled={changes === recommendedActions.length}
            >
              Select all
            </button>
          </div>
          {recommendedActions.map((action, index) => {
            const isSelected = draftActionIds.includes(action.id);
            const Icon = actionIcons[action.id];
            return (
              <article
                key={action.id}
                className={`change-experiment ${isSelected ? "selected" : ""}`}
              >
                <div className="change-experiment-head">
                  <button
                    className="change-checkbox"
                    aria-label={`${isSelected ? "Remove" : "Apply"} ${action.title}`}
                    aria-pressed={isSelected}
                    onClick={() => toggleAction(action.id)}
                  >
                    {isSelected ? <Check size={17} /> : null}
                  </button>
                  <span className="change-experiment-number">0{index + 1}</span>
                  <Icon size={21} />
                  <span>
                    {isSelected ? "In your retest" : "Excluded from retest"}
                  </span>
                </div>
                <button
                  className="change-experiment-title"
                  onClick={() =>
                    setExpanded(expanded === action.id ? null : action.id)
                  }
                  aria-expanded={expanded === action.id}
                >
                  <h3>{action.title}</h3>
                  <ChevronDown
                    size={19}
                    className={expanded === action.id ? "reversed" : ""}
                  />
                </button>
                <p>{action.description}</p>
                <div className="change-experiment-impact">
                  <span>
                    <Sparkles size={14} />
                    {action.impact}
                  </span>
                  <span>{action.effort}</span>
                </div>
                <AnimatePresence>
                  {expanded === action.id && (
                    <motion.div
                      className="change-experiment-detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                    >
                      <div className="change-copy-comparison">
                        <div>
                          <span>BEFORE</span>
                          <p>{action.before}</p>
                        </div>
                        <div>
                          <span>AFTER</span>
                          <p>{action.after}</p>
                        </div>
                      </div>
                      <ul>
                        {action.changes.map((change) => (
                          <li key={change}>
                            <CheckCircle2 size={15} />
                            {change}
                          </li>
                        ))}
                      </ul>
                      <div className="change-rationale">
                        <span className="eyebrow">WHY THIS CHANGE</span>
                        <p>{action.rationale}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="change-experiment-foot">
                  <span>{action.evidenceIds.length} linked evidence items</span>
                  <div>
                    {action.findingIds.slice(0, 2).map((id) => (
                      <button key={id} onClick={() => onFinding(id, 1)}>
                        {id === "model"
                          ? "AI / human clarity"
                          : id === "orchestration"
                            ? "Orchestration"
                            : id === "value"
                              ? "Value proposition"
                              : id === "trust"
                                ? "Trust"
                                : id === "pricing"
                                  ? "First-test friction"
                                  : "CTA"}
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
        <aside className="change-preview-column">
          <div className="change-preview-heading">
            <span className="eyebrow">THE VERSION YOU WILL TEST</span>
            <div
              className="compare-version-switch"
              role="group"
              aria-label="Hero preview version"
            >
              <button
                className={preview === 1 ? "active" : ""}
                onClick={() => {
                  setPreview(1);
                  setScopeOpen(false);
                }}
              >
                Before
              </button>
              <button
                className={preview === 2 ? "active" : ""}
                onClick={() => {
                  setPreview(2);
                  setScopeOpen(false);
                }}
              >
                Selected changes
              </button>
            </div>
          </div>
          <div className="change-projection">
            <div className="change-projection-head">
              <span className="eyebrow">SIMULATED IMPACT PROJECTION</span>
              <span>
                {changes} change{changes === 1 ? "" : "s"} selected
              </span>
            </div>
            <div className="change-projection-score">
              <span>{baseline.score}</span>
              <ArrowRight size={25} />
              <strong>{projected.score}</strong>
              <span>/100</span>
              <i>+{projected.score - baseline.score}</i>
            </div>
            <div className="change-projection-signals">
              {[
                {
                  label: "AI / human clarity",
                  from: baseline.clarity,
                  to: projected.clarity,
                },
                { label: "Trust", from: baseline.trust, to: projected.trust },
                {
                  label: "Trial intent",
                  from: baseline.purchaseIntent,
                  to: projected.purchaseIntent,
                },
              ].map((signal) => (
                <div key={signal.label}>
                  <span>{signal.label}</span>
                  <strong>
                    {signal.from}
                    <ArrowRight size={12} />
                    {signal.to}
                  </strong>
                </div>
              ))}
            </div>
            <p>
              Directional, synthetic projections. The retest will produce the
              evidence for your selected scope.
            </p>
          </div>
          <div className="change-browser-preview">
            <div className="change-browser-frame">
              <span>
                <i />
                <i />
                <i />
              </span>
              <div>
                tryplayground.net
                <span>{preview === 1 ? "V1" : "V2 preview"}</span>
              </div>
            </div>
            <div className="change-site-preview">
              <div className="change-site-nav">
                <Brand />
                <span>
                  How it works
                  <ArrowUpRight size={12} />
                </span>
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  className="change-site-body"
                  key={`${preview}-${selected.join("-")}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                >
                  <span className="change-site-eyebrow">
                    THE VALIDATION ENGINE FOR SOFTWARE
                  </span>
                  <h2>
                    {selected.includes("orchestration") ? (
                      <>
                        Know what to test.
                        <br />
                        <span>
                          And who should
                          <br />
                          test it.
                        </span>
                      </>
                    ) : (
                      <>
                        Stop guessing.
                        <br />
                        <span>Start testing.</span>
                      </>
                    )}
                  </h2>
                  <p>
                    {selected.includes("orchestration")
                      ? "Your product. Your question. Playground chooses the method, matches the testers, and connects the evidence to a decision."
                      : "AI screens it. Real users prove it. Get your software in front of the right testers."}
                  </p>
                  {selected.includes("model") && (
                    <div className="change-site-handoff">
                      <div>
                        <Bot size={20} />
                        <strong>AI screens it.</strong>
                        <span>Find the patterns</span>
                      </div>
                      <ArrowRight size={14} />
                      <div>
                        <Users size={20} />
                        <strong>Users prove it.</strong>
                        <span>Validate with founders</span>
                      </div>
                      <ArrowRight size={14} />
                      <div>
                        <ShieldCheck size={20} />
                        <strong>Experts explain.</strong>
                        <span>Understand the why</span>
                      </div>
                    </div>
                  )}
                  <button
                    className="change-site-cta"
                    onClick={() => setScopeOpen(!scopeOpen)}
                  >
                    {selected.includes("pricing")
                      ? "See your first-test scope"
                      : "Start testing"}
                    <ArrowRight size={16} />
                  </button>
                  {selected.includes("pricing") && (
                    <div className="change-site-assurance">
                      <Check size={12} />
                      One focused test. Scope and cost shown first.
                      <br />
                      <ShieldCheck size={12} />
                      You control access to your private product.
                    </div>
                  )}
                  {scopeOpen && (
                    <div className="change-preview-scope">
                      <button
                        aria-label="Close scope preview"
                        onClick={() => setScopeOpen(false)}
                      >
                        <X size={15} />
                      </button>
                      <strong>
                        {selected.includes("pricing")
                          ? "Know the scope before you start."
                          : "What happens after you submit?"}
                      </strong>
                      <p>
                        {selected.includes("pricing")
                          ? "A test strategy, a matched cohort, and an evidence-backed decision. Review scope, cost, and access before confirming."
                          : "The original hero does not explain the commitment here. This is the uncertainty the third change addresses."}
                      </p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          {state.phase === "v2-complete" && (
            <div className="change-existing-result">
              <CheckCircle2 size={17} />
              <span>
                The current V2 report reflects {committedActionIds.length}{" "}
                committed change{committedActionIds.length === 1 ? "" : "s"}.
                Draft edits apply to your next retest.
              </span>
            </div>
          )}
        </aside>
      </div>
      <div className="changes-run-bar">
        <div>
          <span className="eyebrow">YOUR RETEST SCOPE</span>
          <strong>
            {changes
              ? `${changes} evidence-backed changes`
              : "Unchanged baseline control"}
          </strong>
          <span>
            {changes
              ? "Same question. Same matched cohort. A new version to validate."
              : "Run the original copy again to compare an unchanged control."}
          </span>
        </div>
        <button className="btn btn-primary" onClick={runRetest}>
          {changes
            ? `Apply ${changes} change${changes === 1 ? "" : "s"} & retest`
            : "Run unchanged version"}
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
