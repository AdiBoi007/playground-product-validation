import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  GitCompareArrows,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  getEvidenceCohort,
  getFindingsForVersion,
  getMetrics,
  getSessionCohort,
} from "../simulation/selectors";
import { getDecisionBrief } from "../intelligence/model";
import { recommendedActions } from "../intelligence/actions";
import { useDecision } from "../intelligence/store";
import { useDemo } from "../simulation/store";
import type { Session } from "../types";
import "../report.css";

type CompareTab = "overview" | "signals" | "findings" | "evidence";
const tabs: { id: CompareTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "signals", label: "Signals" },
  { id: "findings", label: "Findings" },
  { id: "evidence", label: "Evidence" },
];

export default function Compare({
  onFinding,
  onReplay,
}: {
  onFinding: (id: string, version?: 1 | 2) => void;
  onReplay: (session: Session) => void;
}) {
  const { state } = useDemo();
  const { committedActionIds } = useDecision();
  const navigate = useNavigate();
  const [tab, setTab] = useState<CompareTab>("overview");
  const [version, setVersion] = useState<1 | 2>(2);
  const before = getMetrics(50, 1);
  const after = getMetrics(50, 2);
  const brief = getDecisionBrief(2);
  const ship = brief.verdict === "ship";
  const sessions = getSessionCohort(1);
  const v2Sessions = getSessionCohort(2);
  const evidence = getEvidenceCohort(version);
  const findings = getFindingsForVersion(version);
  const v2Findings = getFindingsForVersion(2);
  const ready = state.phase === "v2-complete";
  const running = state.phase === "retesting";
  const progress = Math.min(100, (state.clock / 8) * 100);
  const resolved = v2Findings.filter((finding) => finding.resolvedV2);
  const remaining = v2Findings.filter(
    (finding) =>
      !finding.resolvedV2 &&
      ["critical", "high", "medium"].includes(finding.severity),
  );
  const comparisons = [
    {
      name: "Value proposition",
      before: before.comprehension,
      after: after.comprehension,
      note: committedActionIds.includes("orchestration")
        ? "The engine is now part of the headline."
        : "The hero repositioning was excluded from this scope.",
    },
    {
      name: "Usability",
      before: before.usability,
      after: after.usability,
      note:
        after.usability === before.usability
          ? "Unchanged in this scope."
          : "The selected explanation changes are checked against the original task flow.",
    },
    {
      name: "Trust",
      before: before.trust,
      after: after.trust,
      note: committedActionIds.includes("pricing")
        ? "First-test expectations and product access are explained."
        : after.trust === before.trust
          ? "Unchanged in this scope."
          : "The first-test assurance change was excluded; these are indirect effects of the selected scope.",
    },
    {
      name: "Purchase intent",
      before: before.purchaseIntent,
      after: after.purchaseIntent,
      note:
        after.purchaseIntent === before.purchaseIntent
          ? "Unchanged in this scope."
          : "Compare stated trial intent with the original matched cohort.",
    },
    {
      name: "AI / human model",
      before: before.clarity,
      after: after.clarity,
      note: committedActionIds.includes("model")
        ? "The AI → human handoff is visible."
        : "The explicit handoff was excluded from this scope.",
    },
  ];
  const steps = [
    {
      at: 0,
      text: committedActionIds.length
        ? `Applying ${committedActionIds.length} selected changes`
        : "Replaying the unchanged baseline",
    },
    { at: 1.7, text: "Replaying the same founder cohort" },
    { at: 3.5, text: "Checking comprehension, trust, and intent" },
    { at: 5.6, text: "Checking for regressions and new blockers" },
    { at: 7, text: "Comparing the evidence" },
  ];
  const comparisonSessions = (version === 2 ? v2Sessions : sessions)
    .filter(
      (session) =>
        session.source === "human" ||
        sessions
          .find((baseline) => baseline.id === session.id)
          ?.findingIds.includes("model"),
    )
    .sort((a, b) => Number(b.source === "human") - Number(a.source === "human"))
    .slice(0, 10);

  return (
    <div className="compare-page report-surface">
      <div className="report-page-heading compact">
        <div>
          <span className="eyebrow">THE NEXT VERSION</span>
          <h1>
            {ready && !committedActionIds.length
              ? "A baseline. Rechecked."
              : "Progress you can prove."}
          </h1>
          <p className="muted">
            {ready && !committedActionIds.length
              ? "No changes committed. The original outcome holds."
              : "Same question. Same cohort. A clearer answer."}
          </p>
        </div>
        <span className={`badge ${ready ? "badge-green" : "badge-blue"}`}>
          {ready ? <Check size={13} /> : <GitCompareArrows size={14} />}
          {ready
            ? "Retest complete"
            : running
              ? "Retest in progress"
              : "Version 2 ready to test"}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {!ready ? (
          <motion.section
            className="retest-engine"
            key="engine"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="retest-engine-left">
              <span className="eyebrow">PLAYGROUND ENGINE / RETEST</span>
              <h2>
                {running ? (
                  <>
                    {committedActionIds.length
                      ? "A focused change."
                      : "An unchanged control."}
                    <br />
                    Same high bar.
                  </>
                ) : (
                  <>
                    Three changes.
                    <br />
                    One more test.
                  </>
                )}
              </h2>
              <p>
                {running
                  ? "The same cohort is testing the updated story. We are checking what improved and what stayed solid."
                  : "Validate the recommended changes against the same question and founder cohort."}
              </p>
              {!running ? (
                <button
                  className="btn btn-primary"
                  onClick={() => navigate("/tests/playground/changes")}
                >
                  Choose changes for version 2
                  <ArrowRight size={16} />
                </button>
              ) : (
                <div className="retest-progress">
                  <div>
                    <span>Replaying {sessions.length} sessions</span>
                    <strong>{Math.round(progress)}%</strong>
                  </div>
                  <span>
                    <motion.i
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.2 }}
                    />
                  </span>
                </div>
              )}
            </div>
            <div className="retest-engine-steps">
              {steps.map((step, index) => {
                const done =
                  running && state.clock >= (steps[index + 1]?.at ?? 8);
                const active = running && state.clock >= step.at && !done;
                return (
                  <div
                    key={step.text}
                    className={`${done ? "done" : ""} ${active ? "active" : ""}`}
                  >
                    <span>
                      {done ? (
                        <Check size={16} />
                      ) : active ? (
                        <CircleDashed size={19} className="retest-spin" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </span>
                    <p>{step.text}</p>
                    {active && <span className="report-live-dot" />}
                  </div>
                );
              })}
            </div>
          </motion.section>
        ) : (
          <motion.section
            className="comparison-verdict"
            key="results"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            <div className="comparison-before">
              <span className="eyebrow">VERSION 01</span>
              <strong>
                {before.score}
                <span>/100</span>
              </strong>
              <span className="comparison-verdict-label">ITERATE</span>
            </div>
            <div className="comparison-direction">
              <ArrowRight size={30} />
              <span>+{after.score - before.score} points</span>
              <div>
                <Check size={13} />
                {committedActionIds.length} changes applied
              </div>
              <div className="compare-model-improvement">
                <span>AI / HUMAN CLARITY</span>
                <strong>
                  {before.clarity}
                  <ArrowRight size={13} />
                  {after.clarity}
                </strong>
              </div>
            </div>
            <div className={`comparison-after ${ship ? "ship" : "iterate"}`}>
              <div className="comparison-after-head">
                <span className="eyebrow">VERSION 02</span>
                <span
                  className={`badge ${ship ? "badge-green" : "badge-orange"}`}
                >
                  <Check size={12} />
                  {ship ? "Validated" : "More iteration needed"}
                </span>
              </div>
              <strong>
                {after.score}
                <span>/100</span>
              </strong>
              <span className="comparison-verdict-label">
                {ship ? "READY TO SHIP" : "ITERATE"}
                <span>✳</span>
              </span>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {ready && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="comparison-tested-scope">
            <span className="eyebrow">THE SCOPE WE RETESTED</span>
            <div>
              {recommendedActions.map((action) => (
                <span
                  key={action.id}
                  className={
                    committedActionIds.includes(action.id)
                      ? "applied"
                      : "excluded"
                  }
                >
                  {committedActionIds.includes(action.id) ? (
                    <Check size={14} />
                  ) : (
                    <CircleDashed size={14} />
                  )}
                  {action.id === "orchestration"
                    ? "Engine in the hero"
                    : action.id === "model"
                      ? "AI → human handoff"
                      : "First-test expectations"}
                  <small>
                    {committedActionIds.includes(action.id)
                      ? "Applied"
                      : "Not applied"}
                  </small>
                </span>
              ))}
            </div>
          </div>
          <div className="compare-health">
            <span>
              <CheckCircle2 size={18} />
              <strong>{resolved.length}</strong> findings resolved
            </span>
            <span>
              <ShieldCheck size={18} />
              <strong>3</strong> regressions checked
            </span>
            <span>
              <CheckCircle2 size={18} />
              <strong>
                {
                  v2Sessions.filter(
                    (s) =>
                      s.taskResult === "failed" &&
                      sessions.find((baseline) => baseline.id === s.id)
                        ?.taskResult !== "failed",
                  ).length
                }
              </strong>{" "}
              new blockers
            </span>
            <span>
              <CircleDashed size={18} />
              <strong>{remaining.length}</strong> finding remaining
            </span>
          </div>
          <div className="compare-tabs-row">
            <div
              className="compare-tabs"
              role="tablist"
              aria-label="Comparison detail"
            >
              {tabs.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={tab === item.id}
                  className={tab === item.id ? "active" : ""}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {(tab === "findings" || tab === "evidence") && (
              <div
                className="compare-version-switch"
                role="group"
                aria-label="Select version"
              >
                <button
                  className={version === 1 ? "active" : ""}
                  onClick={() => setVersion(1)}
                >
                  V1
                </button>
                <button
                  className={version === 2 ? "active" : ""}
                  onClick={() => setVersion(2)}
                >
                  V2
                </button>
              </div>
            )}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${tab}-${version}`}
              initial={{ opacity: 0, y: 7 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
            >
              {(tab === "overview" || tab === "signals") && (
                <div className="comparison-signal-layout">
                  <section className="comparison-signal-list">
                    <div className="comparison-signal-header">
                      <span>VALIDATION SIGNAL</span>
                      <span>V1</span>
                      <span>V2</span>
                      <span>CHANGE</span>
                    </div>
                    {comparisons.map((signal, index) => (
                      <div className="comparison-signal" key={signal.name}>
                        <div className="comparison-signal-name">
                          <strong>{signal.name}</strong>
                          {tab === "signals" && <p>{signal.note}</p>}
                          <div className="comparison-paired-bars">
                            <span style={{ width: `${signal.before}%` }} />
                            <motion.span
                              initial={{ width: 0 }}
                              animate={{ width: `${signal.after}%` }}
                              transition={{
                                duration: 0.6,
                                delay: index * 0.05,
                              }}
                            />
                          </div>
                        </div>
                        <span className="comparison-old-score">
                          {signal.before}
                        </span>
                        <strong className="comparison-new-score">
                          {signal.after}
                        </strong>
                        <span className="comparison-delta">
                          <ArrowUp size={12} />
                          {signal.after - signal.before}
                        </span>
                      </div>
                    ))}
                  </section>
                  <aside className="comparison-insight">
                    <span className="eyebrow">THE BIGGEST SHIFT</span>
                    <div>
                      <span>{before.clarity}</span>
                      <ArrowRight size={26} />
                      <strong>{after.clarity}</strong>
                    </div>
                    <h3>AI / human clarity.</h3>
                    <p>
                      {committedActionIds.includes("model")
                        ? "The handoff is now visible. Inspect the comprehension checks to see which participants can explain the testing model."
                        : "The AI → human handoff was excluded from this scope. This signal shows the impact of the changes you did choose."}
                    </p>
                    <button onClick={() => onFinding("model", 2)}>
                      Inspect the finding
                      <ArrowUpRight size={15} />
                    </button>
                    <div className="comparison-cohort-note">
                      <Bot size={17} />
                      <span>
                        Same deterministic cohort.
                        <br />
                        Changes isolated. Progress traceable.
                      </span>
                    </div>
                  </aside>
                </div>
              )}
              {tab === "findings" && (
                <div className="compare-finding-list">
                  {findings.map((finding, index) => (
                    <button
                      key={finding.id}
                      onClick={() => onFinding(finding.id, version)}
                    >
                      <span>0{index + 1}</span>
                      <div>
                        <h3>{finding.title}</h3>
                        <p>
                          {version === 2 && finding.resolvedV2
                            ? "The recommended change improved this signal in the matched retest."
                            : finding.summary}
                        </p>
                      </div>
                      <span
                        className={`badge ${version === 2 && finding.resolvedV2 ? "badge-green" : finding.severity === "critical" ? "badge-orange" : "badge-blue"}`}
                      >
                        {version === 2 && finding.resolvedV2 ? (
                          <>
                            <Check size={12} />
                            Resolved
                          </>
                        ) : finding.severity === "low" ||
                          finding.severity === "opportunity" ? (
                          "Validated strength"
                        ) : version === 2 ? (
                          "Keep improving"
                        ) : (
                          finding.severity
                        )}
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              )}
              {tab === "evidence" && (
                <div className="compare-evidence-list">
                  <div className="compare-evidence-intro">
                    <h3>
                      {version === 2
                        ? "The changes show up in behaviour."
                        : "The original signals that prompted a change."}
                    </h3>
                    <p className="muted">
                      Replay the same session in either version to inspect the
                      difference.
                    </p>
                  </div>
                  {comparisonSessions.map((session) => {
                    const baseline = sessions.find((s) => s.id === session.id);
                    const improved =
                      version === 2 &&
                      session.aiHumanUnderstood &&
                      !baseline?.aiHumanUnderstood;
                    return (
                      <article key={session.id}>
                        <span
                          className={`evidence-avatar source-${session.source}`}
                          style={
                            session.source === "human"
                              ? { background: session.color }
                              : undefined
                          }
                        >
                          {session.source === "ai" ? (
                            <Bot size={17} />
                          ) : (
                            session.initials
                          )}
                        </span>
                        <div>
                          <span>
                            {session.name} · {session.role}
                          </span>
                          <h3>{session.quote}</h3>
                          <p>
                            {version === 2
                              ? `${session.aiHumanUnderstood ? "Understood" : "Still exploring"} the AI / human model · ${session.trust}/100 trust · ${session.purchaseIntent}/100 trial intent`
                              : (evidence.find(
                                  (item) =>
                                    item.sessionId === session.id &&
                                    item.findingIds.includes("model"),
                                )?.detail ?? session.observations[0])}
                          </p>
                        </div>
                        {improved && (
                          <span className="badge badge-green">
                            <Check size={11} />
                            Improved
                          </span>
                        )}
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onReplay(session)}
                        >
                          <Play size={12} />
                          Replay
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <section className="compare-ready-note">
            <div className="compare-ready-icon">
              <Sparkles size={27} />
            </div>
            <div>
              <span className="eyebrow">READY FOR THE NEXT QUESTION.</span>
              <h2>
                {ship ? "Ship with evidence." : "Keep the bar where it is."}
              </h2>
              <p>
                {ship
                  ? "The next feature, redesign, or market gets the same high bar."
                  : brief.summary}
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() =>
                navigate(ship ? "/new-test" : "/tests/playground/changes")
              }
            >
              {ship ? "Start the next test" : "Revise retest scope"}
              <ArrowRight size={16} />
            </button>
          </section>
        </motion.div>
      )}
    </div>
  );
}
