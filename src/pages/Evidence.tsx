import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  Filter,
  Lightbulb,
  List,
  Network,
  Play,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import {
  getCurrentEvidence,
  getEvidenceCohort,
  getFindingsForVersion,
  getSessionCohort,
  getSpecialistSession,
} from "../simulation/selectors";
import EvidenceGraph from "../components/EvidenceGraph";
import { useDemo } from "../simulation/store";
import type { Evidence as EvidenceItem, Session, Source } from "../types";
import "../report.css";

type EvidenceFilter =
  "all" | "ai" | "human" | "expert" | "positive" | "negative" | "critical";
const filters: { id: EvidenceFilter; label: string }[] = [
  { id: "all", label: "All signals" },
  { id: "ai", label: "AI" },
  { id: "human", label: "Founders" },
  { id: "expert", label: "Experts" },
  { id: "positive", label: "Positive" },
  { id: "negative", label: "Friction" },
  { id: "critical", label: "Critical" },
];
const sourceLabels: Record<Source, string> = {
  ai: "Scout observation",
  human: "Founder session",
  expert: "Expert review",
  specialist: "Specialist review",
};
const SourceIcon = ({
  source,
  size = 15,
}: {
  source: Source;
  size?: number;
}) =>
  source === "ai" ? (
    <Bot size={size} />
  ) : source === "human" ? (
    <Users size={size} />
  ) : (
    <ShieldCheck size={size} />
  );
const timestamp = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;

export default function Evidence({
  onReplay,
  onFinding,
}: {
  onReplay: (session: Session) => void;
  onFinding: (id: string) => void;
}) {
  const { state } = useDemo();
  const [filter, setFilter] = useState<EvidenceFilter>("all");
  const [view, setView] = useState<"graph" | "list">("graph");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newestFirst, setNewestFirst] = useState(true);
  const complete = ["complete", "retesting", "v2-complete"].includes(
    state.phase,
  );
  const currentClock = complete
    ? 50
    : ["running", "analysing-results"].includes(state.phase)
      ? state.clock
      : 0;
  const version = state.phase === "v2-complete" ? 2 : 1;
  const cohort = [...getSessionCohort(version), getSpecialistSession(version)];
  const findings = getFindingsForVersion(version);
  const available = getCurrentEvidence(currentClock, version);
  const filtered = available
    .filter((item) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "expert"
          ? ["expert", "specialist"].includes(item.source)
          : filter === "critical"
            ? item.critical
            : filter === "positive" || filter === "negative"
              ? item.sentiment === filter
              : item.source === filter);
      const session = cohort.find((s) => s.id === item.sessionId);
      return (
        matchesFilter &&
        `${item.title} ${item.detail} ${session?.name ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .sort((a, b) => (newestFirst ? b.at - a.at : a.at - b.at));
  const sources = [
    {
      source: "ai" as const,
      label: "AI observations",
      count: available.filter((item) => item.source === "ai").length,
    },
    {
      source: "human" as const,
      label: "Founder signals",
      count: available.filter((item) => item.source === "human").length,
    },
    {
      source: "expert" as const,
      label: "Expert insights",
      count: available.filter(
        (item) => item.source === "expert" || item.source === "specialist",
      ).length,
    },
  ];

  const matches = (item: EvidenceItem) =>
    cohort.find((session) => session.id === item.sessionId);

  return (
    <div className="evidence-page intelligence-evidence report-surface">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">THE EVIDENCE ROOM</span>
          <h1>Every decision has a trail.</h1>
          <p className="muted">
            Behaviour, conversations, and expert reviews. One clear trail.
          </p>
        </div>
        <span className={`badge ${complete ? "badge-green" : "badge-blue"}`}>
          {complete ? (
            <Check size={13} />
          ) : (
            <span className="report-live-dot" />
          )}
          {complete ? "Evidence collected" : "Collecting signals"}
        </span>
      </div>

      <div className="evidence-summary">
        <div className="evidence-total">
          <span className="eyebrow">COLLECTED SIGNALS · V{version}</span>
          <strong>
            {available.length}
            <span> / {getEvidenceCohort(version).length}</span>
          </strong>
          <span className="muted">
            Connected to{" "}
            {new Set(available.flatMap((item) => item.findingIds)).size}{" "}
            findings
          </span>
        </div>
        {sources.map((source) => (
          <button
            className={`evidence-source-card ${filter === source.source ? "selected" : ""}`}
            key={source.source}
            onClick={() => {
              setView("list");
              setFilter(filter === source.source ? "all" : source.source);
            }}
          >
            <span className={`evidence-source-icon source-${source.source}`}>
              <SourceIcon source={source.source} size={21} />
            </span>
            <div>
              <strong>{source.count}</strong>
              <span>{source.label}</span>
            </div>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </div>

      <div
        className="evidence-view-tabs"
        role="tablist"
        aria-label="Evidence view"
      >
        <button
          role="tab"
          aria-selected={view === "graph"}
          className={view === "graph" ? "active" : ""}
          onClick={() => setView("graph")}
        >
          <Network size={17} />
          Evidence graph
        </button>
        <button
          role="tab"
          aria-selected={view === "list"}
          className={view === "list" ? "active" : ""}
          onClick={() => setView("list")}
        >
          <List size={17} />
          Signal library<span>{available.length}</span>
        </button>
        <span>
          Version {version} ·{" "}
          {new Set(available.map((item) => item.sessionId)).size} contributing
          sessions
        </span>
      </div>
      {view === "graph" ? (
        <EvidenceGraph
          evidence={available}
          findings={findings}
          sessions={cohort}
          onFinding={onFinding}
          onReplay={onReplay}
        />
      ) : (
        <>
          <div className="evidence-toolbar">
            <div
              className="evidence-filters"
              role="group"
              aria-label="Filter evidence"
            >
              {filters.map((item) => (
                <button
                  key={item.id}
                  className={filter === item.id ? "active" : ""}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  {filter === item.id && <span>{filtered.length}</span>}
                </button>
              ))}
            </div>
            <div className="evidence-search">
              <Search size={16} />
              <input
                aria-label="Search evidence"
                placeholder="Search signals…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button aria-label="Clear search" onClick={() => setQuery("")}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="evidence-layout">
            <div className="evidence-list">
              <div className="evidence-list-label">
                <span>
                  {filtered.length} signal{filtered.length !== 1 ? "s" : ""}
                </span>
                <button onClick={() => setNewestFirst(!newestFirst)}>
                  <ArrowDown
                    size={13}
                    className={newestFirst ? "" : "reversed"}
                  />
                  {newestFirst ? "Newest first" : "Oldest first"}
                </button>
              </div>
              <AnimatePresence initial={false}>
                {filtered.map((item) => {
                  const session = matches(item);
                  const isExpanded = expanded === item.id;
                  return (
                    <motion.article
                      key={item.id}
                      className={`evidence-item ${isExpanded ? "is-expanded" : ""}`}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0, pointerEvents: "auto" }}
                      exit={{ opacity: 0, pointerEvents: "none" }}
                      transition={{ duration: 0.2 }}
                    >
                      <button
                        className="evidence-item-main"
                        aria-expanded={isExpanded}
                        onClick={() => setExpanded(isExpanded ? null : item.id)}
                      >
                        <span
                          className={`evidence-avatar source-${item.source}`}
                          style={
                            session?.source === "human"
                              ? { background: session.color }
                              : undefined
                          }
                        >
                          {item.source === "ai" ? (
                            <Bot size={18} />
                          ) : (
                            (session?.initials ?? <ShieldCheck size={18} />)
                          )}
                        </span>
                        <div className="evidence-item-copy">
                          <div className="evidence-item-meta">
                            <strong>
                              {session?.name ?? sourceLabels[item.source]}
                            </strong>
                            <span>{sourceLabels[item.source]}</span>
                            <time>{timestamp(item.at)}</time>
                          </div>
                          <h3>{item.title}</h3>
                          <div className="evidence-item-tags">
                            <span className={`signal-tag ${item.sentiment}`}>
                              {item.sentiment === "positive" ? (
                                <Check size={11} />
                              ) : item.critical ? (
                                <Filter size={11} />
                              ) : null}
                              {item.critical
                                ? "Critical signal"
                                : item.sentiment === "positive"
                                  ? "Positive"
                                  : item.sentiment === "negative"
                                    ? "Friction"
                                    : "Observation"}
                            </span>
                            <span className="evidence-type">
                              {item.type.replaceAll("_", " ")}
                            </span>
                          </div>
                        </div>
                        <ChevronDown
                          className={isExpanded ? "reversed" : ""}
                          size={18}
                        />
                      </button>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            className="evidence-item-detail"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                          >
                            <p>{item.detail}</p>
                            <div className="evidence-related">
                              {item.findingIds.map((id) => (
                                <button key={id} onClick={() => onFinding(id)}>
                                  <Lightbulb size={13} />
                                  {findings.find((finding) => finding.id === id)
                                    ?.title ?? id}
                                  <ArrowUpRight size={12} />
                                </button>
                              ))}
                            </div>
                            {session && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => onReplay(session)}
                              >
                                <Play size={13} />
                                Replay supporting session
                              </button>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
              {filtered.length === 0 && (
                <div className="empty-state evidence-empty">
                  <Search size={30} />
                  <h3>
                    {available.length === 0
                      ? "The first signals are on their way."
                      : "No signals match this view."}
                  </h3>
                  <p>
                    {available.length === 0
                      ? "Evidence appears here as Scout and founder sessions progress."
                      : "Try another filter or search term."}
                  </p>
                  {(query || filter !== "all") && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setQuery("");
                        setFilter("all");
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
            <aside className="evidence-insights panel">
              <span className="eyebrow">PATTERNS, NOT OPINIONS</span>
              <h3>
                What the signals
                <br />
                are telling us.
              </h3>
              <p className="muted">
                Every finding connects back to what someone actually did.
              </p>
              <div className="evidence-pattern-list">
                {findings
                  .filter((finding) =>
                    available.some((item) =>
                      item.findingIds.includes(finding.id),
                    ),
                  )
                  .map((finding, index) => (
                    <button
                      key={finding.id}
                      onClick={() => onFinding(finding.id)}
                    >
                      <span className="pattern-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>{finding.title}</strong>
                        <span>
                          {
                            available.filter((item) =>
                              item.findingIds.includes(finding.id),
                            ).length
                          }{" "}
                          supporting signals
                        </span>
                      </div>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
              </div>
              <div className="evidence-trace-note">
                <ShieldCheck size={17} />
                <span>
                  Trace every conclusion
                  <br />
                  to its original session.
                </span>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
