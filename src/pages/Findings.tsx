import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Fingerprint,
  Lightbulb,
} from "lucide-react";
import { getDecisionBrief } from "../intelligence/model";
import { getFindingsForVersion } from "../simulation/selectors";
import { useDemo } from "../simulation/store";
import "../report.css";

type FindingFilter = "all" | "actionable" | "strengths" | "improved";
export default function Findings({
  onFinding,
}: {
  onFinding: (id: string, version?: 1 | 2) => void;
}) {
  const { state } = useDemo();
  const navigate = useNavigate();
  const [version, setVersion] = useState<1 | 2>(
    state.phase === "v2-complete" ? 2 : 1,
  );
  const [filter, setFilter] = useState<FindingFilter>("all");
  const brief = getDecisionBrief(version);
  const findings = getFindingsForVersion(version);
  const actionable = findings.filter(
    (finding) =>
      finding.severity !== "low" && !(version === 2 && finding.resolvedV2),
  );
  const visible = findings.filter(
    (finding) =>
      filter === "all" ||
      (filter === "actionable" &&
        actionable.some((item) => item.id === finding.id)) ||
      (filter === "strengths" && finding.severity === "low") ||
      (filter === "improved" && version === 2 && finding.resolvedV2),
  );

  return (
    <div className="findings-page intelligence-findings report-surface">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">
            PATTERNS WITH PROOF / VERSION 0{version}
          </span>
          <h1>What the evidence means.</h1>
          <p className="muted">
            {findings.length} findings. {actionable.length} next{" "}
            {actionable.length === 1 ? "move" : "moves"}. Every one traceable.
          </p>
        </div>
        <span className="badge badge-green">
          <Fingerprint size={15} />
          {brief.confidence.score}% evidence confidence
        </span>
      </div>
      <div className="findings-synthesis">
        <Lightbulb size={25} />
        <div>
          <h2>{brief.headline}</h2>
          <p>{brief.summary}</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/tests/playground/changes")}
        >
          Design the next version
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="findings-toolbar">
        <div
          className="evidence-filters"
          role="group"
          aria-label="Filter findings"
        >
          {[
            { id: "all" as const, label: "All findings" },
            { id: "actionable" as const, label: "Needs a change" },
            { id: "strengths" as const, label: "Validated strengths" },
            ...(state.phase === "v2-complete"
              ? [{ id: "improved" as const, label: "Improved in V2" }]
              : []),
          ].map((item) => (
            <button
              key={item.id}
              className={filter === item.id ? "active" : ""}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              {filter === item.id && <span>{visible.length}</span>}
            </button>
          ))}
        </div>
        <div
          className="compare-version-switch"
          role="group"
          aria-label="Findings version"
        >
          <button
            className={version === 1 ? "active" : ""}
            onClick={() => setVersion(1)}
          >
            V1
          </button>
          <button
            disabled={state.phase !== "v2-complete"}
            className={version === 2 ? "active" : ""}
            onClick={() => setVersion(2)}
          >
            V2
          </button>
        </div>
      </div>
      <div className="report-finding-grid">
        {visible.map((finding) => (
          <button
            className="report-finding-card"
            key={finding.id}
            onClick={() => onFinding(finding.id, version)}
          >
            <div className="report-finding-card-top">
              <span>0{findings.indexOf(finding) + 1}</span>
              <span
                className={`badge ${version === 2 && finding.resolvedV2 ? "badge-green" : finding.severity === "critical" ? "badge-orange" : "badge-neutral"}`}
              >
                {version === 2 && finding.resolvedV2 ? (
                  <>
                    <Check size={13} />
                    Improved
                  </>
                ) : finding.severity === "low" ? (
                  "Validated strength"
                ) : (
                  finding.severity
                )}
              </span>
            </div>
            <h3>{finding.title}</h3>
            <p>{finding.summary}</p>
            <div className="finding-next-step">
              <span>NEXT MOVE</span>
              <p>{finding.recommendation}</p>
            </div>
            <div className="report-finding-footer">
              <span>
                {finding.evidenceIds.length} evidence items ·{" "}
                {finding.confidence}% confidence
              </span>
              <ArrowUpRight size={17} />
            </div>
          </button>
        ))}
      </div>
      {visible.length === 0 && (
        <div className="empty-state">
          <Lightbulb size={30} />
          <h3>No findings in this view.</h3>
          <p>Choose another filter to explore the evidence.</p>
          <button
            className="btn btn-secondary"
            onClick={() => setFilter("all")}
          >
            Show all findings
          </button>
        </div>
      )}
    </div>
  );
}
