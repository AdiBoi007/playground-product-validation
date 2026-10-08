import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Eye,
  Flag,
  MousePointer2,
  Play,
  Radio,
  ScanLine,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Session, Source } from "../types";
import { useDemo } from "../simulation/store";
import {
  getCurrentEvidence,
  getMetrics,
  getSessionCohort,
  getSessionStatus,
} from "../simulation/selectors";
import BrowserMock from "../components/BrowserMock";
import "../session.css";

export default function Live({
  onReplay,
  onFinding,
}: {
  onReplay: (session: Session) => void;
  onFinding: (id: string) => void;
}) {
  const { state, startRun, pause, resume, setSpeed, skipToResults } = useDemo();
  const navigate = useNavigate();
  const [lane, setLane] = useState<Source>("ai");
  const [focusedId, setFocusedId] = useState("scout-01");
  const [inspectionTime, setInspectionTime] = useState<number | null>(null);
  const cohort = getSessionCohort(state.version);
  const hasRun = [
    "running",
    "analysing-results",
    "complete",
    "retesting",
    "v2-complete",
  ].includes(state.phase);
  const clock = hasRun ? state.clock : -Infinity;
  const metrics = getMetrics(hasRun ? state.clock : 0, state.version);
  const signals = getCurrentEvidence(hasRun ? state.clock : -1, state.version);
  const modelEvidence = signals.filter((item) =>
    item.findingIds.includes("model"),
  );
  const modelNegative = modelEvidence.filter(
    (item) => item.sentiment === "negative",
  );
  const counts = { completed: 0, active: 0, starting: 0, queued: 0 };
  cohort.forEach((session) => {
    counts[getSessionStatus(session, clock)] += 1;
  });
  const laneSessions = cohort.filter((session) => session.source === lane);
  const focus =
    cohort.find((session) => session.id === focusedId) ||
    laneSessions[0] ||
    cohort[0];
  const status = getSessionStatus(focus, clock);
  const localTime = hasRun
    ? Math.max(0, Math.min(focus.duration, state.clock - focus.startedAt))
    : -1;
  const focusTime = inspectionTime ?? localTime;
  const focusEvent =
    [...focus.events].reverse().find((event) => event.at <= focusTime) ||
    focus.events[0];
  const representativeIds =
    lane === "ai"
      ? ["scout-02", "scout-03", "scout-14", "scout-01"]
      : laneSessions.map((session) => session.id);
  const representatives = representativeIds
    .map((id) => cohort.find((session) => session.id === id))
    .filter(
      (session): session is Session =>
        Boolean(session) && session?.id !== focus.id,
    );
  const stillRunning = cohort.filter(
    (session) =>
      session.id !== focus.id && getSessionStatus(session, clock) === "active",
  );
  const pool = [
    ...representatives.filter(
      (session) => getSessionStatus(session, clock) !== "completed",
    ),
    ...stillRunning.filter((session) => session.source === lane),
    ...representatives,
    ...cohort,
  ];
  const previews = pool
    .filter(
      (session, index, list) =>
        session.id !== focus.id &&
        list.findIndex((item) => item.id === session.id) === index,
    )
    .slice(0, 3);
  const focusSignals = signals.filter((item) => item.sessionId === focus.id);
  const finished = clock >= 45;
  function focusSession(session: Session) {
    setFocusedId(session.id);
    setLane(session.source);
    setInspectionTime(null);
  }
  function chooseLane(source: Source) {
    setLane(source);
    const first = cohort.find((session) => session.source === source);
    if (first) focusSession(first);
  }
  const signalMetrics = [
    { label: "Understanding", value: metrics.comprehension },
    { label: "Navigation", value: metrics.usability },
    { label: "Trust", value: metrics.trust },
    { label: "Trial intent", value: metrics.purchaseIntent },
    { label: "AI + human clarity", value: metrics.clarity },
  ];
  return (
    <div className="live-page observation-page">
      <div className="session-page-heading observation-heading">
        <div>
          <div className="eyebrow">
            <Radio size={13} /> THE OBSERVATION ROOM
          </div>
          <h1>
            Watch the thinking. Find the friction
            <span className="heading-dot">.</span>
          </h1>
        </div>
        <div className="live-header-actions">
          <span className={`badge ${finished ? "badge-green" : "badge-blue"}`}>
            <span
              className={
                hasRun && !finished && !state.paused
                  ? "pulse-dot"
                  : "status-small-dot"
              }
            />
            {finished
              ? "Evidence collected"
              : !hasRun
                ? "Mission ready"
                : state.paused
                  ? "Paused"
                  : "Observing live"}
          </span>
          {hasRun ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={state.paused ? resume : pause}
            >
              {state.paused ? (
                <CirclePlay size={15} />
              ) : (
                <CirclePause size={15} />
              )}
              {state.paused ? "Resume" : "Pause"}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={startRun}>
              <Zap size={15} />
              Launch mission
            </button>
          )}
        </div>
      </div>
      <div className="observation-metrics">
        {signalMetrics.map(({ label, value }, index) => (
          <div key={label}>
            <span>{label}</span>
            <strong>
              {hasRun && value > 0 ? value : "—"}
              <small>{hasRun && value > 0 ? "%" : ""}</small>
            </strong>
            <div className="observation-metric-bar">
              <motion.i
                animate={{ width: `${hasRun ? value : 0}%` }}
                className={index >= 2 ? "warm" : ""}
                transition={{ duration: 0.65 }}
              />
            </div>
          </div>
        ))}
        <div className="observation-confidence">
          <span>
            <Activity size={11} />
            Confidence
          </span>
          <strong>
            {hasRun && metrics.confidence > 0 ? metrics.confidence : "—"}
            <small>{hasRun && metrics.confidence > 0 ? "%" : ""}</small>
          </strong>
          <div>
            <b>{counts.completed}</b> of 27 complete
          </div>
        </div>
      </div>
      <div className="observation-orchestration">
        <div className="observation-mission-steps">
          <span className="completed">
            <Check size={12} />
            Strategy
          </span>
          <ChevronRight size={11} />
          <span className="completed">
            <Check size={12} />
            Cohort matched
          </span>
          <ChevronRight size={11} />
          <span
            className={
              hasRun && !finished ? "current" : finished ? "completed" : ""
            }
          >
            {finished ? <Check size={12} /> : <span className="pulse-dot" />}
            Testing <b>{counts.active + counts.starting}</b>
          </span>
          <ChevronRight size={11} />
          <span className={finished ? "current" : ""}>
            <Sparkles size={12} />
            Synthesis
          </span>
        </div>
        <div className="observation-speed">
          <span>Mission speed</span>
          {[1, 2, 4, 8].map((speed) => (
            <button
              key={speed}
              className={state.speed === speed ? "selected" : ""}
              onClick={() => setSpeed(speed)}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>
      <div className="observation-room-toolbar">
        <div
          className="observation-lanes"
          role="tablist"
          aria-label="Observation source"
        >
          {[
            {
              source: "ai" as Source,
              label: "Scout fleet",
              count: 20,
              icon: <Bot size={14} />,
            },
            {
              source: "human" as Source,
              label: "Founders",
              count: 5,
              icon: <Users size={14} />,
            },
            {
              source: "expert" as Source,
              label: "Experts",
              count: 2,
              icon: <Sparkles size={14} />,
            },
          ].map((item) => (
            <button
              role="tab"
              aria-selected={lane === item.source}
              className={lane === item.source ? "selected" : ""}
              key={item.source}
              onClick={() => chooseLane(item.source)}
            >
              {item.icon}
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
        <div className="observation-focus-picker">
          <label htmlFor="observation-focus">In focus</label>
          <select
            id="observation-focus"
            value={focus.id}
            onChange={(event) => {
              const selected = cohort.find(
                (session) => session.id === event.target.value,
              );
              if (selected) focusSession(selected);
            }}
          >
            {cohort.map((session) => (
              <option value={session.id} key={session.id}>
                {session.name} · {session.role}
              </option>
            ))}
          </select>
          <button
            className="text-action"
            onClick={() => {
              const next =
                stillRunning.find((session) => session.source === lane) ||
                stillRunning[0] ||
                cohort[(cohort.indexOf(focus) + 1) % cohort.length];
              focusSession(next);
            }}
          >
            Next session
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
      <div className="observation-room">
        <section className="observation-focus live-browser-card" key={focus.id}>
          <header className="observation-focus-header">
            <span
              className={`observation-person-avatar source-${focus.source}`}
            >
              {focus.source === "ai" ? (
                <Bot size={21} />
              ) : focus.source === "human" ? (
                focus.initials
              ) : (
                <Sparkles size={20} />
              )}
            </span>
            <div>
              <strong>{focus.name}</strong>
              <span>{focus.role}</span>
            </div>
            <span className={`session-status session-status-${status}`}>
              <i />
              {status === "completed"
                ? "Session complete"
                : status === "active"
                  ? "Browsing now"
                  : status === "starting"
                    ? "Connecting"
                    : "Queued"}
            </span>
            <button
              className="observation-replay-button"
              aria-label={`Replay ${focus.name}`}
              onClick={() => onReplay(focus)}
            >
              <Play size={13} />
              Replay
              <ArrowUpRight size={13} />
            </button>
          </header>
          <div className="observation-focus-mission">
            <Flag size={14} />
            <p>{focus.goal}</p>
          </div>
          <BrowserMock session={focus} time={focusTime} large />
          <div className="observation-focus-event">
            <span className="pulse-dot" />
            <strong>
              {localTime < 0 ? "Ready to explore the product" : focusEvent.text}
            </strong>
            <time>{formatTime(Math.max(0, focusTime))}</time>
            {inspectionTime !== null && (
              <button onClick={() => setInspectionTime(null)}>
                Return to live
              </button>
            )}
          </div>
        </section>
        <section
          className="observation-preview-stack"
          aria-label="Concurrent browser sessions"
        >
          <div className="observation-preview-label">
            <span className="pulse-dot" />
            THREE MORE PERSPECTIVES
          </div>
          {previews.map((session) => {
            const previewStatus = getSessionStatus(session, clock);
            const time = hasRun
              ? Math.max(
                  0,
                  Math.min(session.duration, state.clock - session.startedAt),
                )
              : -1;
            const event = [...session.events]
              .reverse()
              .find((item) => item.at <= time);
            return (
              <button
                className="observation-preview live-browser-card"
                key={session.id}
                onClick={() => focusSession(session)}
                aria-label={`Focus ${session.name}`}
              >
                <div className="observation-preview-header">
                  <span>
                    {session.source === "ai" ? (
                      <Bot size={13} />
                    ) : session.source === "human" ? (
                      <Users size={13} />
                    ) : (
                      <Sparkles size={13} />
                    )}
                    <strong>{session.name}</strong>
                  </span>
                  <span
                    className={`session-status session-status-${previewStatus}`}
                  >
                    <i />
                    {previewStatus === "completed"
                      ? "Done"
                      : previewStatus === "active"
                        ? "Live"
                        : "Queued"}
                  </span>
                  <ArrowUpRight size={12} />
                </div>
                <BrowserMock session={session} time={time} />
                <div className="observation-preview-event">
                  {time < 0 ? session.role : event?.text || session.role}
                </div>
              </button>
            );
          })}
        </section>
        <aside className="observation-inspector">
          <div className="observation-inspector-heading">
            <ScanLine size={14} />
            <span>SESSION INTELLIGENCE</span>
          </div>
          <div className="observation-persona-context">
            <span className="eyebrow">
              {focus.source === "ai"
                ? "THE PERSPECTIVE"
                : focus.source === "human"
                  ? "THE FOUNDER"
                  : "THE EXPERT"}
            </span>
            <h3>{focus.role}</h3>
            <p>{focus.persona.behavior}</p>
            <div>
              <span>{focus.persona.patience} patience</span>
              <span>{focus.persona.trustThreshold} trust bar</span>
            </div>
          </div>
          <div className="observation-event-list">
            <div>
              <strong>Behavioural timeline</strong>
              <span>{formatTime(focus.duration)}</span>
            </div>
            {focus.events.map((event, index) => (
              <button
                key={`${event.at}-${index}`}
                className={`${event.at <= focusTime ? "observed" : ""} ${event === focusEvent ? "event-current" : ""}`}
                onClick={() => setInspectionTime(event.at)}
                aria-label={`Inspect ${event.text}`}
              >
                <time>{formatTime(event.at)}</time>
                <span className="observation-event-symbol">
                  {event.type === "click" ? (
                    <MousePointer2 size={12} />
                  ) : event.type.startsWith("task") ? (
                    <Check size={12} />
                  ) : event.type === "hesitation" ? (
                    <Eye size={12} />
                  ) : (
                    <span />
                  )}
                </span>
                <p>{event.text}</p>
              </button>
            ))}
          </div>
          <div
            className={`observation-result ${status === "completed" ? "result-ready" : ""}`}
          >
            <span>
              {status === "completed" ? "THE OUTCOME" : "EVIDENCE SO FAR"}
            </span>
            <strong>
              {status === "completed"
                ? focus.taskResult === "success"
                  ? "Understood. Ready to try."
                  : focus.taskResult === "partial"
                    ? "Interested, with questions."
                    : "The next step isn’t clear."
                : `${focusSignals.length} observations captured`}
            </strong>
            {status === "completed" && <p>“{focus.quote}”</p>}
          </div>
          <div className="observation-pattern observation-inspector-pattern">
            <span>
              <Sparkles size={14} />
              {modelEvidence.length >= 3
                ? modelNegative.length
                  ? "PATTERN DETECTED"
                  : "RETEST SIGNAL"
                : "PATTERN WATCH"}
            </span>
            <button onClick={() => onFinding("model")}>
              <strong>
                {modelNegative.length
                  ? "Users get the problem. Who does the testing?"
                  : modelEvidence.length >= 3
                    ? "The AI + human handoff is landing."
                    : "Watching the AI + human handoff."}
              </strong>
              <span>
                {modelEvidence.length
                  ? `${modelEvidence.length} supporting signals`
                  : "See the hypothesis and evidence"}
                <ArrowUpRight size={16} />
              </span>
            </button>
          </div>
        </aside>
      </div>
      <div className="observation-evidence-rail">
        <div className="observation-signal-stream">
          <header>
            <span className="pulse-dot" />
            <strong>Evidence arriving</strong>
            <span>{signals.length} captured</span>
          </header>
          <div>
            <AnimatePresence initial={false}>
              {signals
                .filter((signal) => signal.type !== "Page view")
                .slice(-3)
                .reverse()
                .map((signal) => {
                  const source = cohort.find(
                    (session) => session.id === signal.sessionId,
                  );
                  return (
                    <motion.button
                      key={signal.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => source && focusSession(source)}
                    >
                      <span>
                        {signal.source === "ai" ? (
                          <Bot size={11} />
                        ) : signal.source === "human" ? (
                          <Users size={11} />
                        ) : (
                          <Sparkles size={11} />
                        )}
                        {source?.name}
                        <time>{formatTime(signal.at)}</time>
                      </span>
                      <p>{signal.title}</p>
                    </motion.button>
                  );
                })}
            </AnimatePresence>
            {signals.length === 0 && (
              <p className="observation-awaiting">
                Clicks, hesitations and lightbulb moments become evidence here.
              </p>
            )}
          </div>
        </div>
      </div>
      {finished && (
        <div className="observation-complete">
          <span>
            <Check size={16} />
            Twenty-seven perspectives. One next move.
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              skipToResults();
              navigate("/tests/playground/report");
            }}
          >
            See the verdict
            <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
