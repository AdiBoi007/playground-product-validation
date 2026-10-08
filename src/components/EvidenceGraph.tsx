import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  CircleDashed,
  FlaskConical,
  Play,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Evidence, Finding, Session, Source } from "../types";
import { hypotheses } from "../intelligence/model";

const hypothesisNodes = hypotheses.map((hypothesis, index) => ({
  ...hypothesis,
  code: `H${index + 1}`,
  y: [54, 145, 236, 372, 508][index],
}));
const findingOrder = [
  "value",
  "cta",
  "model",
  "pricing",
  "trust",
  "orchestration",
];
const graphSources = [
  {
    id: "ai" as const,
    label: "Scout screening",
    detail: "AI behavioural evidence",
    icon: Bot,
    y: 90,
  },
  {
    id: "human" as const,
    label: "Founder validation",
    detail: "Target-audience evidence",
    icon: Users,
    y: 273,
  },
  {
    id: "expert" as const,
    label: "Expert judgment",
    detail: "Expert + specialist reviews",
    icon: ShieldCheck,
    y: 456,
  },
];
const groupSource = (source: Source) =>
  source === "specialist" ? "expert" : source;

export default function EvidenceGraph({
  evidence,
  findings,
  sessions,
  onFinding,
  onReplay,
}: {
  evidence: Evidence[];
  findings: Finding[];
  sessions: Session[];
  onFinding: (id: string) => void;
  onReplay: (session: Session) => void;
}) {
  const [selected, setSelected] = useState("model");
  const [source, setSource] = useState<"all" | "ai" | "human" | "expert">(
    "all",
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const [signalLimit, setSignalLimit] = useState(4);
  const visibleEvidence = useMemo(
    () =>
      evidence.filter(
        (item) => source === "all" || groupSource(item.source) === source,
      ),
    [evidence, source],
  );
  const graphFindings = findingOrder
    .map((id) => findings.find((finding) => finding.id === id))
    .filter((finding): finding is Finding => Boolean(finding));
  const support = visibleEvidence.filter((item) =>
    item.findingIds.includes(selected),
  );
  const currentFinding = findings.find((finding) => finding.id === selected);
  const selectedHasSupport = evidence.some((item) =>
    item.findingIds.includes(selected),
  );
  const focusedFindings = hovered?.startsWith("s:")
    ? graphFindings
        .filter((finding) =>
          evidence.some(
            (item) =>
              item.findingIds.includes(finding.id) &&
              groupSource(item.source) === hovered.slice(2),
          ),
        )
        .map((finding) => finding.id)
    : hovered?.startsWith("h:")
      ? (hypothesisNodes.find(
          (hypothesis) => hypothesis.id === hovered.slice(2),
        )?.findingIds ?? [])
      : hovered?.startsWith("f:")
        ? [hovered.slice(2)]
        : [selected];
  const sourceHovered = hovered?.startsWith("s:") ? hovered.slice(2) : null;
  const changeSelection = (id: string) => {
    setSelected(id);
    setSignalLimit(4);
  };

  return (
    <section className="evidence-graph" aria-label="Interactive evidence graph">
      <div className="graph-heading">
        <div>
          <span className="eyebrow">FROM QUESTION TO PROOF</span>
          <h2>Connect the dots.</h2>
          <p>Select a finding. Trace every source of evidence.</p>
        </div>
        <div
          className="graph-source-filter"
          role="group"
          aria-label="Graph evidence source"
        >
          <button
            className={source === "all" ? "active" : ""}
            onClick={() => setSource("all")}
          >
            All sources
          </button>
          {graphSources.map((item) => (
            <button
              key={item.id}
              className={source === item.id ? "active" : ""}
              onClick={() => setSource(item.id)}
            >
              <item.icon size={15} />
              {item.id === "ai"
                ? "AI"
                : item.id === "human"
                  ? "Founders"
                  : "Experts"}
            </button>
          ))}
        </div>
      </div>
      <div className="graph-canvas-scroll">
        <svg
          className="graph-canvas"
          viewBox="0 0 1120 612"
          role="group"
          aria-label="Five assumptions connected to six findings and three evidence sources"
        >
          <defs>
            <pattern
              id="evidence-dot-grid"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r=".65" fill="#b5c2b4" opacity=".48" />
            </pattern>
          </defs>
          <rect width="1120" height="612" fill="url(#evidence-dot-grid)" />
          <text x="30" y="31" className="graph-column-label">
            THE ASSUMPTIONS
          </text>
          <text x="390" y="31" className="graph-column-label">
            WHAT WE FOUND
          </text>
          <text x="881" y="31" className="graph-column-label">
            THE SUPPORTING EVIDENCE
          </text>
          {hypothesisNodes.flatMap((hypothesis) =>
            hypothesis.findingIds.map((id) => {
              const findingIndex = findingOrder.indexOf(id);
              const focused = focusedFindings.includes(id);
              return (
                <path
                  key={`${hypothesis.id}-${id}`}
                  d={`M 279 ${hypothesis.y + 38} C 332 ${hypothesis.y + 38}, 337 ${54 + findingIndex * 91 + 38}, 390 ${54 + findingIndex * 91 + 38}`}
                  className={`graph-link ${focused ? "focused" : ""}`}
                />
              );
            }),
          )}
          {graphFindings.flatMap((finding, index) =>
            graphSources.map((graphSource) => {
              const count = visibleEvidence.filter(
                (item) =>
                  item.findingIds.includes(finding.id) &&
                  groupSource(item.source) === graphSource.id,
              ).length;
              if (!count) return null;
              const focused =
                (sourceHovered === graphSource.id ||
                  (!sourceHovered && focusedFindings.includes(finding.id))) &&
                (source === "all" || source === graphSource.id);
              return (
                <path
                  key={`${finding.id}-${graphSource.id}`}
                  d={`M 760 ${54 + index * 91 + 38} C 815 ${54 + index * 91 + 38}, 826 ${graphSource.y + 61}, 881 ${graphSource.y + 61}`}
                  className={`graph-link graph-source-link ${focused ? "focused" : ""} source-path-${graphSource.id}`}
                />
              );
            }),
          )}
          {hypothesisNodes.map((hypothesis) => (
            <foreignObject
              key={hypothesis.id}
              x="30"
              y={hypothesis.y}
              width="249"
              height="78"
            >
              <button
                className={`graph-hypothesis-node ${hypothesis.findingIds.includes(selected) ? "selected" : ""}`}
                onClick={() => changeSelection(hypothesis.findingIds[0])}
                onMouseEnter={() => setHovered(`h:${hypothesis.id}`)}
                onMouseLeave={() => setHovered(null)}
              >
                <span>{hypothesis.code}</span>
                <strong>{hypothesis.title}</strong>
                <ArrowRight size={16} />
              </button>
            </foreignObject>
          ))}
          {graphFindings.map((finding, index) => {
            const signals = visibleEvidence.filter((item) =>
              item.findingIds.includes(finding.id),
            );
            return (
              <foreignObject
                key={finding.id}
                x="390"
                y={54 + index * 91}
                width="370"
                height="78"
              >
                <button
                  className={`graph-finding-node ${selected === finding.id ? "selected" : ""} ${finding.severity === "critical" ? "critical" : ""}`}
                  onClick={() => changeSelection(finding.id)}
                  onMouseEnter={() => setHovered(`f:${finding.id}`)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <span className="graph-finding-icon">
                    {signals.length === 0 ? (
                      <CircleDashed size={18} />
                    ) : finding.severity === "critical" ? (
                      <FlaskConical size={18} />
                    ) : finding.severity === "low" ? (
                      <Check size={18} />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {signals.length ? finding.title : "Awaiting evidence"}
                    </strong>
                    <span>
                      {signals.length} linked signals ·{" "}
                      {new Set(signals.map((item) => item.sessionId)).size}{" "}
                      sessions
                    </span>
                  </div>
                  <span className="graph-node-port" />
                </button>
              </foreignObject>
            );
          })}
          {graphSources.map((graphSource) => {
            const sourceEvidence = evidence.filter(
              (item) => groupSource(item.source) === graphSource.id,
            );
            return (
              <foreignObject
                key={graphSource.id}
                x="881"
                y={graphSource.y}
                width="209"
                height="122"
              >
                <button
                  className={`graph-source-node source-${graphSource.id} ${source === graphSource.id ? "selected" : ""} ${source !== "all" && source !== graphSource.id ? "dimmed" : ""}`}
                  onClick={() =>
                    setSource(
                      source === graphSource.id ? "all" : graphSource.id,
                    )
                  }
                  onMouseEnter={() => setHovered(`s:${graphSource.id}`)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div>
                    <graphSource.icon size={20} />
                    <strong>{sourceEvidence.length}</strong>
                  </div>
                  <span>{graphSource.label}</span>
                  <small>
                    {new Set(sourceEvidence.map((item) => item.sessionId)).size}{" "}
                    contributing sessions
                  </small>
                </button>
              </foreignObject>
            );
          })}
        </svg>
      </div>
      <div className="graph-inspector">
        <div className="graph-inspector-heading">
          <div>
            <span className="eyebrow">SELECTED FINDING</span>
            <h3>
              {selectedHasSupport
                ? currentFinding?.title
                : "Waiting for the first supporting signal."}
            </h3>
            <p>
              {support.length} signals from{" "}
              {new Set(support.map((item) => item.sessionId)).size} sessions
              {source !== "all"
                ? ` · ${source === "human" ? "Founder" : source === "expert" ? "Expert" : "AI"} evidence`
                : " across all sources"}
            </p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => onFinding(selected)}
          >
            Open finding
            <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="graph-support-grid">
          {support.slice(0, signalLimit).map((item) => {
            const session = sessions.find(
              (participant) => participant.id === item.sessionId,
            );
            return (
              <article key={item.id}>
                <div>
                  <span
                    className={`graph-support-avatar source-${groupSource(item.source)}`}
                  >
                    {item.source === "ai" ? (
                      <Bot size={17} />
                    ) : item.source === "human" ? (
                      session?.initials
                    ) : (
                      <ShieldCheck size={17} />
                    )}
                  </span>
                  <span>
                    <strong>{session?.name ?? "Review"}</strong>
                    <small>
                      {item.source === "human"
                        ? "Founder"
                        : item.source === "ai"
                          ? "AI persona"
                          : "Expert review"}
                    </small>
                  </span>
                </div>
                <h4>{item.title}</h4>
                <p>{item.detail}</p>
                {session && (
                  <button onClick={() => onReplay(session)}>
                    <Play size={13} />
                    Inspect session
                    <ArrowUpRight size={13} />
                  </button>
                )}
              </article>
            );
          })}
          {support.length === 0 && (
            <div className="graph-awaiting">
              <FlaskConical size={24} />
              <strong>No evidence from this source yet.</strong>
              <span>
                Change the source filter, or watch the next sessions arrive.
              </span>
            </div>
          )}
        </div>
        {support.length > signalLimit && (
          <button
            className="graph-more-signals"
            onClick={() => setSignalLimit((limit) => limit + 4)}
          >
            Show {Math.min(4, support.length - signalLimit)} more signals
            <ArrowRight size={15} />
          </button>
        )}
      </div>
    </section>
  );
}
