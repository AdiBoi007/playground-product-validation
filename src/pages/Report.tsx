import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  FlaskConical,
  Info,
  Play,
  Printer,
  ShieldCheck,
  Users,
} from "lucide-react";
import { getDecisionBrief } from "../intelligence/model";
import { useDecision } from "../intelligence/store";
import {
  getEvidenceCohort,
  getFindingsForVersion,
  getSessionCohort,
  getSpecialistSession,
} from "../simulation/selectors";
import { useDemo } from "../simulation/store";
import type { Session } from "../types";
import "../report.css";

export default function Report({
  onFinding,
  onReplay,
}: {
  onFinding: (id: string, version?: 1 | 2) => void;
  onReplay: (session: Session) => void;
}) {
  const navigate = useNavigate();
  const { state } = useDemo();
  const { committedActionIds } = useDecision();
  const latestVersion = state.phase === "v2-complete" ? 2 : 1;
  const [version, setVersion] = useState<1 | 2>(latestVersion);
  useEffect(() => {
    setVersion(latestVersion);
  }, [latestVersion]);
  const brief = getDecisionBrief(version);
  const metrics = brief.metrics;
  const cohort = [...getSessionCohort(version), getSpecialistSession(version)];
  const findings = getFindingsForVersion(version);
  const evidence = getEvidenceCohort(version);
  const passed = brief.assumptions.filter(
    (assumption) => assumption.passed,
  ).length;
  const ship = brief.verdict === "ship";
  const founder =
    cohort.find(
      (session) =>
        session.source === "human" &&
        (ship ? session.aiHumanUnderstood : !session.aiHumanUnderstood),
    ) ?? cohort.find((session) => session.source === "human");
  const scores = [
    { name: "Value proposition", value: metrics.comprehension },
    { name: "Usability", value: metrics.usability },
    { name: "Trust", value: metrics.trust },
    { name: "Trial intent", value: metrics.purchaseIntent },
    { name: "AI / human clarity", value: metrics.clarity },
  ];
  const exportReport = () => {
    const text = `# Playground decision brief — Version ${version}\n\nSynthetic demo research\n\n## Research question\n${state.question}\n\n## Decision: ${ship ? "SHIP" : "ITERATE"}\n\n${brief.headline}\n\n${brief.summary}\n\nValidation score: ${metrics.score}/100. Confidence: ${brief.confidence.score}% (${brief.confidence.level}).\n\n## Success criteria\n${brief.assumptions.map((assumption) => `- ${assumption.title}: ${assumption.value}${assumption.unit === "percent" ? "%" : "/100"} against ${assumption.threshold}${assumption.unit === "percent" ? "%" : "/100"} target — ${assumption.status}. Evidence: ${assumption.evidenceIds.join(", ")}`).join("\n")}\n\n## AI and founder evidence\n${brief.contrasts.map((contrast) => `- ${contrast.label}: AI ${contrast.ai}/100, founders ${contrast.human}/100. ${contrast.interpretation}`).join("\n")}\n\n## Cohort\n${brief.coverage.ai} AI personas, ${brief.coverage.human} founders, ${brief.coverage.experts} experts, ${brief.coverage.specialists} specialists. ${brief.coverage.evidenceItems} evidence items.\n\n## Findings\n${findings
      .map(
        (finding) =>
          `### ${finding.title}\n\n${finding.summary}\n\n${finding.recommendation}\n\nEvidence: ${finding.evidenceIds.join(", ")}\n\n${evidence
            .filter((item) => item.findingIds.includes(finding.id))
            .map(
              (item) =>
                `- ${item.id} — ${cohort.find((session) => session.id === item.sessionId)?.name}: ${item.detail}`,
            )
            .join("\n")}`,
      )
      .join(
        "\n\n",
      )}\n\n## Next actions\n${brief.priorities.map((action) => `- ${action.title}: ${action.description}\n  ${action.reason}\n  Scope: ${action.changes.join("; ")}`).join("\n")}\n\n## Research limitations\n${brief.limitations.map((limitation) => `- ${limitation}`).join("\n")}\n\nAll participants, sessions, evidence, projections, and verdicts in this environment are synthetic.\n`;
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `playground-decision-brief-v${version}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="report-page decision-report report-surface">
      <div className="report-page-heading compact">
        <div>
          <span className="eyebrow">PG-TEST-0042 / DECISION BRIEF</span>
          <h1>A decision. With receipts.</h1>
          <p className="muted">
            {brief.coverage.totalSessions} sessions + specialist review ·{" "}
            {brief.coverage.evidenceItems} evidence items ·{" "}
            {version === 1
              ? "Original site"
              : `${committedActionIds.length} changes tested`}
          </p>
        </div>
        <div className="decision-report-tools">
          <div
            className="decision-version-control"
            role="group"
            aria-label="Report version"
          >
            <button
              className={version === 1 ? "active" : ""}
              onClick={() => setVersion(1)}
            >
              V1<span>Baseline</span>
            </button>
            <button
              className={version === 2 ? "active" : ""}
              disabled={latestVersion !== 2}
              onClick={() => setVersion(2)}
            >
              V2<span>Retest</span>
            </button>
          </div>
          <div className="report-header-actions">
            <button
              className="btn btn-secondary"
              onClick={() => window.print()}
              aria-label="Print report"
            >
              <Printer size={16} />
            </button>
            <button className="btn btn-secondary" onClick={exportReport}>
              <Download size={16} />
              Export
            </button>
          </div>
        </div>
      </div>
      <motion.section
        className={`decision-verdict ${ship ? "ship" : "iterate"}`}
        key={version}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="decision-score">
          <span className="eyebrow">VALIDATION SCORE</span>
          <div className="giant-score">
            {metrics.score}
            <span>/100</span>
          </div>
          <div className="decision-confidence">
            <ShieldCheck size={17} />
            <span>{brief.confidence.score}% evidence confidence</span>
          </div>
          <p>
            {passed} of {brief.assumptions.length} success criteria met
          </p>
        </div>
        <div className="decision-verdict-story">
          <span className="eyebrow">
            VERSION 0{version} / {ship ? "SHIP DECISION" : "ITERATION DECISION"}
          </span>
          <h2>
            {ship ? "SHIP" : "ITERATE"}
            <span>✳</span>
          </h2>
          <h3>{brief.headline}</h3>
          <p>{brief.summary}</p>
          <div className="decision-verdict-actions">
            <button
              className="btn btn-primary"
              onClick={() =>
                navigate(ship ? "/new-test" : "/tests/playground/changes")
              }
            >
              {ship
                ? "Test the next assumption"
                : version === 1
                  ? "Create version 2"
                  : "Revise the changes"}
              <ArrowRight size={17} />
            </button>
            <button onClick={() => navigate("/tests/playground/evidence")}>
              Follow the evidence
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
      </motion.section>
      <section className="report-score-grid" aria-label="Validation subscores">
        {scores.map((score) => (
          <div
            key={score.name}
            className={`report-score-card ${score.value < 65 ? "needs-work" : ""}`}
          >
            <span>{score.name}</span>
            <div>
              <strong>{score.value}</strong>
              <span>/100</span>
            </div>
            <div className="report-score-track">
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${score.value}%` }}
                transition={{ duration: 0.55 }}
              />
            </div>
          </div>
        ))}
      </section>

      <section className="decision-question">
        <FlaskConical size={22} />
        <div>
          <span className="eyebrow">THE QUESTION WE TESTED</span>
          <h2>{state.question}</h2>
        </div>
        <span className="badge badge-neutral">
          Same question across versions
        </span>
      </section>
      <section className="decision-criteria">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE BAR, SET BEFORE TESTING</span>
            <h2>Did the assumptions hold?</h2>
          </div>
          <span className="decision-section-context">
            {passed} supported · {brief.assumptions.length - passed} need
            attention
          </span>
        </div>
        <div
          className="decision-criteria-table"
          role="table"
          aria-label="Success criteria"
        >
          <div className="decision-criteria-header" role="row">
            <span>Assumption</span>
            <span>Target</span>
            <span>Observed</span>
            <span>Decision</span>
          </div>
          {brief.assumptions.map((assumption, index) => (
            <button
              role="row"
              key={assumption.hypothesisId}
              onClick={() => onFinding(assumption.findingIds[0], version)}
            >
              <div>
                <span>H{index + 1}</span>
                <div>
                  <strong>{assumption.title}</strong>
                  <p>{assumption.measurement}</p>
                </div>
              </div>
              <span>
                ≥{assumption.threshold}
                <small>{assumption.unit === "percent" ? "%" : "/100"}</small>
              </span>
              <strong
                className={
                  assumption.passed
                    ? "criterion-passed-value"
                    : "criterion-failed-value"
                }
              >
                {assumption.value}
                <small>{assumption.unit === "percent" ? "%" : "/100"}</small>
              </strong>
              <span
                className={`criterion-status ${assumption.passed ? "passed" : "failed"}`}
              >
                {assumption.passed ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <Info size={15} />
                )}
                {assumption.passed
                  ? "Supported"
                  : assumption.status === "at-risk"
                    ? "At risk"
                    : "Not supported"}
                <ArrowUpRight size={13} />
              </span>
            </button>
          ))}
        </div>
        <p className="decision-table-note">
          Observed values come from completed behavioural sessions. Percentage
          measures count participants; score measures average their ratings.
        </p>
      </section>

      <section className="decision-source-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">TRIANGULATE THE SIGNAL</span>
            <h2>What AI saw. What founders proved.</h2>
          </div>
          <div className="decision-source-legend">
            <span>
              <i />
              {brief.coverage.ai} AI personas
            </span>
            <span>
              <i />
              {brief.coverage.human} founders
            </span>
          </div>
        </div>
        <div className="decision-source-layout">
          <div className="decision-source-table">
            <div className="decision-source-header">
              <span>Signal</span>
              <span>AI</span>
              <span>Founders</span>
            </div>
            {brief.contrasts.map((contrast) => (
              <div className="decision-source-row" key={contrast.metric}>
                <div>
                  <strong>{contrast.label}</strong>
                  <div className="decision-source-bars">
                    <span style={{ width: `${contrast.ai}%` }} />
                    <span style={{ width: `${contrast.human}%` }} />
                  </div>
                  <p>{contrast.interpretation}</p>
                </div>
                <span>{contrast.ai}</span>
                <strong>{contrast.human}</strong>
              </div>
            ))}
          </div>
          <aside className="decision-research-note">
            <span className="eyebrow">HOW TO READ THIS</span>
            <h3>
              Agreement makes
              <br />a pattern stronger.
            </h3>
            <p>
              AI screening explores more behaviours. Founder sessions show
              whether the pattern also holds for the target audience.
            </p>
            <div>
              <Users size={20} />
              <span>
                <strong>{brief.coverage.human} founders</strong>
                <span>
                  A focused, directional sample. Differences are signals to
                  investigate, not population estimates.
                </span>
              </span>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => navigate("/tests/playground/sessions")}
            >
              Inspect the cohort
              <ArrowUpRight size={15} />
            </button>
          </aside>
        </div>
      </section>

      <section className="decision-actions">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FROM A FINDING TO A TESTABLE CHANGE</span>
            <h2>
              {ship
                ? "What to keep. What to check next."
                : "The next version has a job to do."}
            </h2>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/tests/playground/changes")}
          >
            Design the retest
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="decision-action-list">
          {brief.priorities.map((action, index) => (
            <article key={action.id}>
              <span className="decision-action-number">0{index + 1}</span>
              <div>
                <div className="decision-action-title">
                  <h3>{action.title}</h3>
                  <span>{action.effort}</span>
                </div>
                <p>{action.reason}</p>
                <ul>
                  {action.changes.map((change) => (
                    <li key={change}>
                      <Check size={14} />
                      {change}
                    </li>
                  ))}
                </ul>
                <div className="decision-action-foot">
                  <button
                    onClick={() => onFinding(action.findingIds[0], version)}
                  >
                    {action.evidenceIds.length} supporting evidence items
                    <ArrowUpRight size={14} />
                  </button>
                  <button
                    onClick={() =>
                      navigate(`/tests/playground/changes?focus=${action.id}`)
                    }
                  >
                    Preview the experiment
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="report-findings">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE COMPLETE FINDING SET</span>
            <h2>Everything worth knowing.</h2>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => navigate("/tests/playground/findings")}
          >
            Open findings
            <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="report-finding-grid">
          {findings.map((finding, index) => (
            <button
              className="report-finding-card"
              key={finding.id}
              onClick={() => onFinding(finding.id, version)}
            >
              <div className="report-finding-card-top">
                <span>0{index + 1}</span>
                <span
                  className={`signal-tag ${finding.severity === "critical" ? "negative" : finding.severity === "low" || (version === 2 && finding.resolvedV2) ? "positive" : "neutral"}`}
                >
                  {version === 2 && finding.resolvedV2
                    ? "Improved"
                    : finding.severity === "low"
                      ? "Validated strength"
                      : finding.severity}
                </span>
              </div>
              <h3>{finding.title}</h3>
              <p>{finding.summary}</p>
              <div className="report-finding-footer">
                <span>
                  {finding.evidenceIds.length} signals · {finding.confidence}%
                  confidence
                </span>
                <ChevronRight size={17} />
              </div>
            </button>
          ))}
        </div>
      </section>
      {founder && (
        <section className="report-founder-quote">
          <span className="report-quote-mark">“</span>
          <div>
            <blockquote>{founder.quote}</blockquote>
            <div className="report-quote-person">
              <span style={{ background: founder.color }}>
                {founder.initials}
              </span>
              <div>
                <strong>{founder.name}</strong>
                <span>{founder.role} · Synthetic founder session</span>
              </div>
            </div>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => onReplay(founder)}
          >
            <Play size={14} />
            Inspect session
          </button>
        </section>
      )}
      <section className="decision-limitations">
        <div>
          <Info size={21} />
          <span className="eyebrow">CONFIDENCE HAS BOUNDARIES</span>
          <h2>What this test can tell you.</h2>
          <p>{brief.confidence.summary}</p>
        </div>
        <ul>
          {brief.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </section>
      <footer className="report-method-note">
        <span>
          <FileText size={15} />
          All people, research, and projections are synthetic in this demo.
        </span>
        <span>
          <Bot size={15} />
          {brief.coverage.ai} AI
          <Users size={15} />
          {brief.coverage.human} founders
          <ShieldCheck size={15} />
          {brief.coverage.experts} experts
        </span>
      </footer>
    </div>
  );
}
