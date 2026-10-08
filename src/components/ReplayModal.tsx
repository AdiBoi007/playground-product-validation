import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  AudioLines,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Flag,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type { Session } from "../types";
import BrowserMock from "./BrowserMock";

export default function ReplayModal({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState<"replay" | "attention">("replay");
  const [heatmapSource, setHeatmapSource] = useState<
    "ai" | "human" | "combined"
  >(session.source === "human" ? "human" : "ai");
  const isHuman = session.source === "human";
  const currentEvent =
    [...session.events].reverse().find((event) => event.at <= time) ||
    session.events[0];
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const interval = window.setInterval(
      () => setTime((value) => Math.min(session.duration, value + 0.1 * speed)),
      100,
    );
    return () => window.clearInterval(interval);
  }, [playing, speed, session.duration]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
      if (event.key === " " && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        setPlaying((value) => !value);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setTime((value) => Math.min(session.duration, value + 3));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setTime((value) => Math.max(0, value - 3));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, session.duration]);
  function togglePlayback() {
    if (time >= session.duration) setTime(0);
    setPlaying((value) => (time >= session.duration ? true : !value));
  }
  return (
    <motion.div
      className="replay-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        className="replay-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="replay-title"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.25 }}
      >
        <header className="replay-header">
          <div>
            <span className="eyebrow">
              <span className="badge badge-blue">
                {isHuman ? <Users size={11} /> : <Bot size={11} />}
                {isHuman
                  ? "FOUNDER SESSION"
                  : session.source === "ai"
                    ? "SCOUT SESSION"
                    : "EXPERT REVIEW"}
              </span>
              <span>SESSION REPLAY</span>
            </span>
            <h2 id="replay-title">
              See what {isHuman ? session.name.split(" ")[0] : session.name}{" "}
              saw.
            </h2>
          </div>
          <button
            className="icon-button replay-close"
            aria-label="Close replay"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="replay-body">
          <div className="replay-main">
            <div className="replay-task">
              <Flag size={16} />
              <div>
                <span>THE MISSION</span>
                <p>{session.goal}</p>
              </div>
            </div>
            <div className="replay-view-tabs">
              <button
                className={view === "replay" ? "selected" : ""}
                onClick={() => setView("replay")}
              >
                <MousePointer2 size={13} />
                Browser replay
              </button>
              <button
                className={view === "attention" ? "selected" : ""}
                onClick={() => setView("attention")}
              >
                <Eye size={13} />
                Attention + paths
              </button>
              <span>
                <span className="status-small-dot" /> Deterministic replay
              </span>
            </div>
            {view === "attention" && (
              <div className="replay-heatmap-sources">
                <span>ATTENTION LAYER</span>
                <div role="group" aria-label="Heatmap source">
                  {(["ai", "human", "combined"] as const).map((source) => (
                    <button
                      key={source}
                      onClick={() => setHeatmapSource(source)}
                      className={heatmapSource === source ? "selected" : ""}
                    >
                      {source === "ai"
                        ? "AI"
                        : source === "human"
                          ? "Human"
                          : "Combined"}
                    </button>
                  ))}
                </div>
                <span>Recorded hover + click density</span>
              </div>
            )}
            <BrowserMock
              session={session}
              time={time}
              heatmap={view === "attention" ? heatmapSource : null}
              large
            />
            <div className="replay-timeline">
              <div className="timeline-markers">
                {session.events
                  .filter((event) =>
                    [
                      "click",
                      "hesitation",
                      "task_success",
                      "task_failure",
                      "abandon",
                    ].includes(event.type),
                  )
                  .map((event, index) => (
                    <button
                      key={`${event.at}-${index}`}
                      className={`timeline-marker marker-${event.type} ${event.at <= time ? "passed" : ""}`}
                      style={{
                        left: `${(event.at / session.duration) * 100}%`,
                      }}
                      title={`${formatTime(event.at)} · ${event.text}`}
                      aria-label={`Seek to ${event.text}`}
                      onClick={() => setTime(event.at)}
                    />
                  ))}
              </div>
              <input
                aria-label="Seek session replay"
                type="range"
                min={0}
                max={session.duration}
                step={0.1}
                value={time}
                onChange={(event) => setTime(Number(event.target.value))}
                style={{
                  background: `linear-gradient(to right, #168ef9 ${(time / session.duration) * 100}%, #e4e5dc ${(time / session.duration) * 100}%)`,
                }}
              />
              <div className="timeline-labels">
                <span>Page loaded</span>
                <span>Explore + evaluate</span>
                <span>Decision</span>
              </div>
            </div>
            <div className="replay-controls">
              <div>
                <button
                  className="replay-play"
                  aria-label={
                    playing && time < session.duration
                      ? "Pause replay"
                      : "Play replay"
                  }
                  onClick={togglePlayback}
                >
                  {playing && time < session.duration ? (
                    <Pause size={17} fill="currentColor" />
                  ) : (
                    <Play size={17} fill="currentColor" />
                  )}
                </button>
                <button
                  className="icon-button"
                  aria-label="Back three seconds"
                  onClick={() => setTime((value) => Math.max(0, value - 3))}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Forward three seconds"
                  onClick={() =>
                    setTime((value) => Math.min(session.duration, value + 3))
                  }
                >
                  <ChevronRight size={18} />
                </button>
                <span className="replay-time">
                  {formatTime(time)} <i>/ {formatTime(session.duration)}</i>
                </span>
              </div>
              <div>
                <button
                  className="text-action"
                  onClick={() => {
                    setTime(0);
                    setPlaying(true);
                  }}
                >
                  <RotateCcw size={13} /> Restart
                </button>
                <select
                  aria-label="Replay speed"
                  value={speed}
                  onChange={(event) => setSpeed(Number(event.target.value))}
                >
                  {[0.5, 1, 2, 4].map((value) => (
                    <option value={value} key={value}>
                      {value}×
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="replay-current-event">
              <span className="pulse-dot" />
              <strong>
                {currentEvent?.text || "Opening the landing page"}
              </strong>
              <span>{currentEvent?.type.replace(/_/g, " ")}</span>
            </div>
          </div>
          <aside className="replay-participant">
            <div
              className={`participant-avatar ${isHuman ? "is-human" : ""}`}
              style={{
                backgroundColor: isHuman
                  ? `color-mix(in srgb, ${session.color} 18%, #fbf7eb)`
                  : "#e0edf2",
              }}
            >
              {isHuman ? session.initials : <Bot size={31} />}
              <span>
                {isHuman ? <AudioLines size={13} /> : <Check size={13} />}
              </span>
            </div>
            <h3>{session.name}</h3>
            <p>{session.role}</p>
            <span className="participant-location">
              {session.location} <span>·</span>{" "}
              {isHuman
                ? `${session.match}% audience match`
                : session.persona.device}
            </span>
            <div className="participant-waveform">
              {Array.from({ length: 36 }, (_, index) => (
                <motion.i
                  key={index}
                  animate={{
                    height:
                      playing && time < session.duration
                        ? [
                            5 + ((index * 13) % 25),
                            7 + ((index * 7) % 23),
                            5 + ((index * 13) % 25),
                          ]
                        : 5 + ((index * 13) % 25),
                  }}
                  transition={{
                    duration: 0.6 + (index % 5) * 0.1,
                    repeat: Infinity,
                  }}
                />
              ))}
            </div>
            <span className="participant-synthetic">
              {isHuman
                ? "Synthetic participant · no video recorded"
                : "AI behavioural simulation"}
            </span>
            <div className="replay-outcome">
              <span>SESSION OUTCOME</span>
              <strong className={`outcome-${session.taskResult}`}>
                {session.taskResult === "success" ? (
                  <Check size={15} />
                ) : (
                  <Flag size={15} />
                )}
                {session.taskResult === "success"
                  ? "Task completed"
                  : session.taskResult === "partial"
                    ? "Partial success"
                    : "Task abandoned"}
              </strong>
              <div>
                <span>
                  <Clock size={13} />
                  Comprehension
                </span>
                <b>{session.comprehensionTime.toFixed(1)}s</b>
              </div>
              <div>
                <span>
                  <MousePointer2 size={13} />
                  Primary CTA
                </span>
                <b>{session.ctaFound ? "Found" : "Missed"}</b>
              </div>
              <div>
                <span>
                  <ShieldCheck size={13} />
                  Trust score
                </span>
                <b>{(session.trust / 10).toFixed(1)} / 10</b>
              </div>
              <div>
                <span>
                  <Users size={13} />
                  AI + human model
                </span>
                <b className={session.aiHumanUnderstood ? "" : "negative"}>
                  {session.aiHumanUnderstood ? "Understood" : "Unclear"}
                </b>
              </div>
            </div>
            <div className="replay-quote">
              <span>THE TAKEAWAY</span>
              <blockquote>“{session.quote}”</blockquote>
            </div>
            <div className="replay-event-transcript">
              <span>
                {isHuman ? "BEHAVIOURAL TRANSCRIPT" : "SCOUT OBSERVATIONS"}
              </span>
              {session.events.map((event, index) => (
                <motion.button
                  key={`${event.at}-${index}`}
                  className={`${event.at <= time ? "transcript-observed" : ""} ${event === currentEvent ? "transcript-current" : ""}`}
                  aria-label={`Jump to ${event.text}`}
                  initial={{ opacity: 0, x: 5 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => {
                    setTime(event.at);
                    setPlaying(false);
                  }}
                >
                  <time>{formatTime(event.at)}</time>
                  <p>{event.text}</p>
                  <ArrowUpRight size={11} />
                </motion.button>
              ))}
            </div>
          </aside>
        </div>
      </motion.section>
    </motion.div>
  );
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
