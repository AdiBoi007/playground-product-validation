import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  Lightbulb,
  Play,
  Quote,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import {
  getCurrentEvidence,
  getFindingsForVersion,
  getSessionCohort,
  getSpecialistSession,
} from "../simulation/selectors";
import { recommendedActions } from "../intelligence/actions";
import { useDemo } from "../simulation/store";
import type { Session } from "../types";
import "../report.css";

export default function FindingDrawer({
  findingId,
  onClose,
  onReplay,
  version: preferredVersion,
}: {
  findingId: string;
  onClose: () => void;
  onReplay: (session: Session) => void;
  version?: 1 | 2;
}) {
  const { state } = useDemo();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [version, setVersion] = useState<1 | 2>(
    preferredVersion ?? (state.phase === "v2-complete" ? 2 : 1),
  );
  useEffect(() => {
    setVersion(preferredVersion ?? (state.phase === "v2-complete" ? 2 : 1));
    setExpanded(null);
    setSourceFilter("all");
  }, [preferredVersion, findingId, state.phase]);
  const findings = getFindingsForVersion(version);
  const finding = findings.find((item) => item.id === findingId);
  const action = recommendedActions.find((item) =>
    item.findingIds.includes(findingId),
  );
  const complete = ["complete", "retesting", "v2-complete"].includes(
    state.phase,
  );
  const currentClock = complete
    ? 50
    : ["running", "analysing-results"].includes(state.phase)
      ? state.clock
      : 0;
  const support = getCurrentEvidence(currentClock, version).filter((item) =>
    item.findingIds.includes(findingId),
  );
  const cohort = [...getSessionCohort(version), getSpecialistSession(version)];
  const visibleSupport = support.filter(
    (item) =>
      sourceFilter === "all" ||
      (sourceFilter === "expert"
        ? ["expert", "specialist"].includes(item.source)
        : item.source === sourceFilter),
  );
  const sourceCounts = [
    {
      label: "AI",
      source: "ai",
      icon: Bot,
      count: support.filter((item) => item.source === "ai").length,
    },
    {
      label: "Founders",
      source: "human",
      icon: Users,
      count: support.filter((item) => item.source === "human").length,
    },
    {
      label: "Experts",
      source: "expert",
      icon: ShieldCheck,
      count: support.filter((item) =>
        ["expert", "specialist"].includes(item.source),
      ).length,
    },
  ];
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  if (!finding) return null;

  return (
    <div
      className="finding-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finding-title"
    >
      <motion.button
        className="finding-backdrop"
        aria-label="Close finding"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.aside
        className="finding-drawer"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 32, stiffness: 320 }}
      >
        <header className="finding-drawer-header">
          <span>
            <Lightbulb size={17} />
            FINDING / {String(findings.indexOf(finding) + 1).padStart(2, "0")}
          </span>
          <button
            className="finding-close"
            onClick={onClose}
            aria-label="Close finding"
          >
            <X size={20} />
          </button>
        </header>
        <div className="finding-drawer-scroll">
          <div className="finding-drawer-intro">
            <div className="finding-status-row">
              <span
                className={`badge ${finding.severity === "critical" || finding.severity === "high" ? "badge-orange" : finding.severity === "opportunity" || finding.severity === "low" ? "badge-green" : "badge-blue"}`}
              >
                {finding.severity === "opportunity"
                  ? "Opportunity"
                  : `${finding.severity} priority`}
              </span>
              {version === 2 &&
                state.phase === "v2-complete" &&
                finding.resolvedV2 && (
                  <span className="badge badge-green">
                    <Check size={12} />
                    Resolved in V2
                  </span>
                )}
            </div>
            <h2 id="finding-title">{finding.title}</h2>
            <p>
              {complete
                ? finding.summary
                : support.length
                  ? support[support.length - 1].detail
                  : "This pattern is waiting for the first supporting session. Evidence will appear as the test progresses."}
            </p>
            <div className="finding-confidence">
              <ShieldCheck size={16} />
              <span>
                {complete
                  ? finding.confidence
                  : Math.min(
                      finding.confidence,
                      Math.round(
                        (support.length /
                          Math.max(finding.evidenceIds.length, 1)) *
                          finding.confidence,
                      ),
                    )}
                % confidence
              </span>
              <span>
                {complete
                  ? "Cross-validated evidence"
                  : "Building with each signal"}
              </span>
            </div>
          </div>
          <div className="finding-recommendation">
            <span className="eyebrow">
              <ArrowUpRight size={13} />
              THE NEXT MOVE
            </span>
            <p>{finding.recommendation}</p>
            {action && (
              <button
                className="finding-experiment-link"
                onClick={() => {
                  onClose();
                  navigate(`/tests/playground/changes?focus=${action.id}`);
                }}
              >
                Preview the experiment
                <ArrowUpRight size={15} />
              </button>
            )}
          </div>
          <div className="finding-evidence-head">
            <div>
              <span className="eyebrow">THE EVIDENCE · VERSION {version}</span>
              <h3>
                {support.length} supporting signal
                {support.length === 1 ? "" : "s"}
              </h3>
            </div>
            {state.phase === "v2-complete" && (
              <div
                className="compare-version-switch"
                role="group"
                aria-label="Finding evidence version"
              >
                <button
                  className={version === 1 ? "active" : ""}
                  onClick={() => {
                    setVersion(1);
                    setExpanded(null);
                  }}
                >
                  V1
                </button>
                <button
                  className={version === 2 ? "active" : ""}
                  onClick={() => {
                    setVersion(2);
                    setExpanded(null);
                  }}
                >
                  V2
                </button>
              </div>
            )}
          </div>
          <div className="finding-source-counts">
            {sourceCounts.map((source) => (
              <button
                key={source.label}
                className={sourceFilter === source.source ? "selected" : ""}
                onClick={() =>
                  setSourceFilter(
                    sourceFilter === source.source ? "all" : source.source,
                  )
                }
              >
                <source.icon size={16} />
                <strong>{source.count}</strong>
                <span>{source.label} signals</span>
              </button>
            ))}
          </div>
          <div className="finding-support-list">
            {visibleSupport.map((item) => {
              const session = cohort.find((s) => s.id === item.sessionId);
              return (
                <article key={item.id} className="finding-support-item">
                  <button
                    className="finding-support-top"
                    aria-expanded={expanded === item.id}
                    onClick={() =>
                      setExpanded(expanded === item.id ? null : item.id)
                    }
                  >
                    <span
                      className={`evidence-avatar source-${item.source}`}
                      style={
                        item.source === "human"
                          ? { background: session?.color }
                          : undefined
                      }
                    >
                      {item.source === "ai" ? (
                        <Bot size={17} />
                      ) : item.source === "human" ? (
                        session?.initials
                      ) : (
                        <ShieldCheck size={17} />
                      )}
                    </span>
                    <div>
                      <span>
                        {session?.name}
                        <i>
                          {" "}
                          ·{" "}
                          {item.source === "human"
                            ? "Founder"
                            : item.source === "ai"
                              ? "AI persona"
                              : "Expert"}
                        </i>
                      </span>
                      <strong>{item.title}</strong>
                    </div>
                    <ChevronDown
                      size={16}
                      className={expanded === item.id ? "reversed" : ""}
                    />
                  </button>
                  {expanded === item.id && (
                    <motion.div
                      className="finding-support-detail"
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <p>
                        <Quote size={15} />
                        {item.detail}
                      </p>
                      {session && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            onClose();
                            onReplay(session);
                          }}
                        >
                          <Play size={12} />
                          Replay {session.name}
                          <ArrowUpRight size={12} />
                        </button>
                      )}
                      <span className="finding-evidence-id">
                        {item.id} · {Math.floor(item.at / 60)}:
                        {Math.floor(item.at % 60)
                          .toString()
                          .padStart(2, "0")}{" "}
                        in test
                      </span>
                    </motion.div>
                  )}
                </article>
              );
            })}
            {support.length === 0 && (
              <div className="empty-state">
                <Bot size={28} />
                <h3>Waiting for supporting signals.</h3>
                <p>This finding will build as sessions progress.</p>
              </div>
            )}
          </div>
        </div>
        <footer className="finding-drawer-footer">
          <ShieldCheck size={15} />
          <span>Synthetic demo evidence. Always traceable.</span>
        </footer>
      </motion.aside>
    </div>
  );
}
