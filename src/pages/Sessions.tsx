import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  Clock,
  Play,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { useDemo } from "../simulation/store";
import { getSessionStatus, getSessionCohort } from "../simulation/selectors";
import type { Session, Source } from "../types";
import "../session.css";
import PathAnalysis from "../components/PathAnalysis";

export default function Sessions({
  onReplay,
}: {
  onReplay: (session: Session) => void;
}) {
  const { state } = useDemo();
  const cohort = getSessionCohort(state.version);
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState("all");
  const source = searchParams.get("source") || "all";
  const started = [
    "running",
    "analysing-results",
    "complete",
    "retesting",
    "v2-complete",
  ].includes(state.phase);
  const clock = started ? state.clock : -Infinity;
  const filtered = cohort.filter(
    (session) =>
      (source === "all" || session.source === source) &&
      (outcome === "all" || session.taskResult === outcome) &&
      `${session.name} ${session.role} ${session.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const completed = cohort.filter(
    (session) => getSessionStatus(session, clock) === "completed",
  );
  const humanSessions = cohort.filter((session) => session.source === "human");
  return (
    <div className="sessions-page">
      <div className="session-page-heading">
        <div>
          <div className="eyebrow">THE PEOPLE. THE PERSONAS. THE PROOF.</div>
          <h1>
            Every session has a story<span className="heading-dot">.</span>
          </h1>
          <p className="muted">
            Follow the paths, hear the thinking, and see what actually happened.
          </p>
        </div>
        <span className="badge badge-blue">
          <Play size={11} />
          {completed.length} / 27 complete
        </span>
      </div>
      <div className="session-source-tabs">
        {[
          { value: "all", label: "All sessions", count: 27 },
          { value: "ai", label: "AI simulations", count: 20 },
          { value: "human", label: "Founders", count: 5 },
          { value: "expert", label: "Experts", count: 2 },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() =>
              setSearchParams(tab.value === "all" ? {} : { source: tab.value })
            }
            className={source === tab.value ? "selected" : ""}
          >
            {tab.value === "ai" ? (
              <Bot size={15} />
            ) : tab.value === "human" ? (
              <Users size={15} />
            ) : tab.value === "expert" ? (
              <Sparkles size={15} />
            ) : (
              <Play size={14} />
            )}
            {tab.label}
            <span>{tab.count}</span>
          </button>
        ))}
      </div>
      {(source === "all" || source === "human") && (
        <div className="founder-session-grid">
          {humanSessions
            .slice(0, source === "human" ? 5 : 3)
            .map((session, index) => {
              const status = getSessionStatus(session, clock);
              return (
                <motion.button
                  className="founder-session-card"
                  key={session.id}
                  onClick={() => onReplay(session)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06 }}
                >
                  <div className="founder-card-top">
                    <span
                      className="founder-avatar"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${session.color} 18%, #fbf7eb)`,
                      }}
                    >
                      {session.initials}
                    </span>
                    <div>
                      <strong>{session.name}</strong>
                      <span>{session.role}</span>
                    </div>
                    <span className="founder-play">
                      <Play size={12} fill="currentColor" />
                    </span>
                  </div>
                  <div className="founder-quote">
                    {status === "completed"
                      ? `“${session.quote}”`
                      : `“${session.goal}”`}
                  </div>
                  <div className="founder-card-bottom">
                    <span className={`session-status session-status-${status}`}>
                      <i />
                      {status === "completed"
                        ? "Replay ready"
                        : status === "active"
                          ? "Testing live"
                          : "Matched"}
                    </span>
                    <span>
                      {session.location}
                      <ArrowUpRight size={12} />
                    </span>
                  </div>
                </motion.button>
              );
            })}
        </div>
      )}
      <div className="session-table-panel">
        <div className="session-table-toolbar">
          <div>
            <h2>
              {source === "ai"
                ? "Scout fleet"
                : source === "human"
                  ? "Founder sessions"
                  : source === "expert"
                    ? "Expert reviews"
                    : "Session directory"}
            </h2>
            <span>{filtered.length} sessions</span>
          </div>
          <div>
            <label className="session-search">
              <Search size={15} />
              <input
                aria-label="Search sessions"
                placeholder="Find a session…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label="Filter by task outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            >
              <option value="all">All outcomes</option>
              <option value="success">Successful</option>
              <option value="partial">Partial success</option>
              <option value="failed">Abandoned</option>
            </select>
          </div>
        </div>
        <div className="session-table-scroll">
          <table className="session-table">
            <thead>
              <tr>
                <th>Participant</th>
                <th>Source</th>
                <th>Status</th>
                <th>Task outcome</th>
                <th>Comprehension</th>
                <th>Trust</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((session) => {
                const status = getSessionStatus(session, clock);
                const finished = status === "completed";
                return (
                  <tr
                    key={session.id}
                    onClick={() => onReplay(session)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Replay ${session.name}'s session`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onReplay(session);
                    }}
                  >
                    <td>
                      <div className="session-person">
                        <span
                          className={`table-avatar ${session.source === "ai" ? "avatar-scout" : ""}`}
                          style={
                            session.source === "human"
                              ? {
                                  backgroundColor: `color-mix(in srgb, ${session.color} 18%, #fbf7eb)`,
                                }
                              : {}
                          }
                        >
                          {session.source === "ai" ? (
                            <Bot size={17} />
                          ) : session.source === "expert" ? (
                            <Sparkles size={16} />
                          ) : (
                            session.initials
                          )}
                        </span>
                        <div>
                          <strong>{session.name}</strong>
                          <span>{session.role}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`source-tag source-${session.source}`}>
                        {sourceLabel(session.source)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`session-status session-status-${status}`}
                      >
                        <i />
                        {status === "completed"
                          ? "Complete"
                          : status === "active"
                            ? "Live"
                            : status === "starting"
                              ? "Starting"
                              : "Queued"}
                      </span>
                    </td>
                    <td>
                      {finished ? (
                        <span
                          className={`outcome-text outcome-${session.taskResult}`}
                        >
                          {session.taskResult === "success" ? (
                            <Check size={12} />
                          ) : (
                            <span className="outcome-point" />
                          )}
                          {session.taskResult === "success"
                            ? "Success"
                            : session.taskResult === "partial"
                              ? "Partial success"
                              : "Abandoned"}
                        </span>
                      ) : (
                        <span className="table-awaiting">Awaiting session</span>
                      )}
                    </td>
                    <td>
                      <span className="table-number">
                        {finished ? `${session.comprehension}%` : "—"}
                      </span>
                      {finished && (
                        <span className="table-microbar">
                          <i style={{ width: `${session.comprehension}%` }} />
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="table-number">
                        {finished ? `${session.trust}%` : "—"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="table-replay"
                        onClick={(event) => {
                          event.stopPropagation();
                          onReplay(session);
                        }}
                      >
                        <Play size={12} />
                        Replay
                        <ChevronRight size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="empty-state">
            <Search size={25} />
            <h3>No sessions found.</h3>
            <p>Try another name, role or task outcome.</p>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setQuery("");
                setOutcome("all");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
      <PathAnalysis onReplay={onReplay} />
      <div className="session-directory-note">
        <Clock size={14} />
        <span>
          Every replay follows the recorded session timeline. All participants
          and observations are synthetic demo data.
        </span>
      </div>
    </div>
  );
}

function sourceLabel(source: Source) {
  return source === "ai"
    ? "AI persona"
    : source === "human"
      ? "Founder"
      : source === "expert"
        ? "Expert"
        : "Specialist";
}
