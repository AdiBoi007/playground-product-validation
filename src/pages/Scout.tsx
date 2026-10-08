import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  Compass,
  Grid2X2,
  List,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Timer,
  Users,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDemo } from "../simulation/store";
import { getSessionCohort, getSessionStatus } from "../simulation/selectors";
import type { Persona, Session } from "../types";
import BrowserMock from "../components/BrowserMock";
import "../session.css";

interface Draft {
  sessionId: string;
  persona: Persona;
  goal: string;
}
export default function Scout({
  onReplay,
}: {
  onReplay: (session: Session) => void;
}) {
  const { state, startRun } = useDemo();
  const navigate = useNavigate();
  const fleet = getSessionCohort(state.version).filter(
    (session) => session.source === "ai",
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [selectedId, setSelectedId] = useState("scout-01");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<Session | null>(null);
  const [previewTime, setPreviewTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const selected =
    fleet.find((session) => session.id === selectedId) || fleet[0];
  const editor =
    draft?.sessionId === selected.id
      ? draft
      : {
          sessionId: selected.id,
          persona: selected.persona,
          goal: selected.goal,
        };
  const started = [
    "running",
    "analysing-results",
    "complete",
    "retesting",
    "v2-complete",
  ].includes(state.phase);
  const clock = started ? state.clock : -Infinity;
  const completed = fleet.filter(
    (session) => getSessionStatus(session, clock) === "completed",
  ).length;
  const active = fleet.filter((session) =>
    ["active", "starting"].includes(getSessionStatus(session, clock)),
  ).length;
  const filtered = fleet.filter(
    (session) =>
      `${session.name} ${session.role} ${session.persona.behavior}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "low-patience" && session.persona.patience === "Low") ||
        (filter === "high-trust" &&
          session.persona.trustThreshold === "High") ||
        (filter === "active" && getSessionStatus(session, clock) === "active")),
  );
  const previewSession = preview || selected;
  const currentEvent =
    [...previewSession.events]
      .reverse()
      .find((event) => event.at <= previewTime) || previewSession.events[0];
  const changed =
    editor.goal !== selected.goal ||
    JSON.stringify(editor.persona) !== JSON.stringify(selected.persona);
  useEffect(() => {
    if (!playing || !preview) return;
    const interval = window.setInterval(
      () => setPreviewTime((time) => Math.min(preview.duration, time + 0.12)),
      120,
    );
    return () => window.clearInterval(interval);
  }, [playing, preview]);
  function chooseSession(session: Session) {
    setSelectedId(session.id);
    setDraft(null);
    setPreview(null);
    setPreviewTime(0);
    setPlaying(false);
  }
  function updatePersona(key: keyof Persona, value: string) {
    setDraft({ ...editor, persona: { ...editor.persona, [key]: value } });
  }
  function runPreview() {
    setPreview(makeDraftPreview(selected, editor));
    setPreviewTime(0);
    setPlaying(true);
  }
  const parameters: {
    key: keyof Persona;
    label: string;
    options: string[];
    icon: ReactNode;
  }[] = [
    {
      key: "patience",
      label: "Patience",
      options: ["Low", "Medium", "High"],
      icon: <Timer size={13} />,
    },
    {
      key: "literacy",
      label: "Product literacy",
      options: ["Developing", "Medium", "High"],
      icon: <Compass size={13} />,
    },
    {
      key: "trustThreshold",
      label: "Trust threshold",
      options: ["Low", "Medium", "High"],
      icon: <ShieldCheck size={13} />,
    },
    {
      key: "reading",
      label: "Reading style",
      options: ["Skims", "Scans, then reads", "Reads deliberately"],
      icon: <Search size={13} />,
    },
    {
      key: "device",
      label: "Device",
      options: ["Desktop", "Mobile"],
      icon: <Monitor size={13} />,
    },
  ];
  return (
    <div className="scout-page persona-studio">
      <div className="studio-page-heading">
        <div>
          <div className="eyebrow">
            <Compass size={13} /> THE SCOUT PERSONA STUDIO
          </div>
          <h1>
            Your users. Before your users<span className="heading-dot">.</span>
          </h1>
          <p>
            Twenty perspectives, calibrated to your audience. Explore how a
            different instinct changes the journey.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (!started) startRun();
            navigate("/tests/playground/live");
          }}
        >
          {started ? <Monitor size={15} /> : <Zap size={15} />}
          {started ? "Watch the fleet" : "Launch the fleet"}
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="studio-cohort-strip">
        <span>
          <Bot size={17} />
          <strong>20 calibrated personas</strong>
          <i />
          Founder cohort · tryplayground.net
        </span>
        <div>
          <span>
            <i className="status-active" />
            {active} exploring
          </span>
          <span>
            <i className="status-complete" />
            {completed} complete
          </span>
          <span>
            <Users size={13} />5 founders validate the signals
          </span>
        </div>
      </div>
      <div className="persona-studio-layout">
        <section className="studio-fleet">
          <header>
            <div>
              <strong>The fleet</strong>
              <span>{filtered.length} perspectives</span>
            </div>
            <div
              className="studio-layout-toggle"
              role="group"
              aria-label="Fleet layout"
            >
              <button
                aria-label="List view"
                className={layout === "list" ? "selected" : ""}
                onClick={() => setLayout("list")}
              >
                <List size={14} />
              </button>
              <button
                aria-label="Grid view"
                className={layout === "grid" ? "selected" : ""}
                onClick={() => setLayout("grid")}
              >
                <Grid2X2 size={14} />
              </button>
            </div>
          </header>
          <label className="studio-search">
            <Search size={14} />
            <input
              placeholder="Find a perspective…"
              aria-label="Search Scout personas"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            className="studio-fleet-filter"
            aria-label="Filter Scout personas"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All behaviours</option>
            <option value="low-patience">Low patience</option>
            <option value="high-trust">High trust threshold</option>
            <option value="active">Currently exploring</option>
          </select>
          <div
            className={`studio-fleet-list ${layout === "grid" ? "studio-fleet-grid" : ""}`}
          >
            {filtered.map((session) => (
              <button
                className={`scout-agent-card studio-fleet-row ${selected.id === session.id ? "selected" : ""}`}
                key={session.id}
                onClick={() => chooseSession(session)}
              >
                <span className="studio-fleet-avatar">
                  <Bot size={17} />
                </span>
                <div>
                  <span>
                    {session.name}
                    <i
                      className={
                        getSessionStatus(session, clock) === "active"
                          ? "active"
                          : getSessionStatus(session, clock) === "completed"
                            ? "complete"
                            : ""
                      }
                    />
                  </span>
                  <strong>{session.role}</strong>
                  <small>
                    {session.persona.patience} patience ·{" "}
                    {session.persona.reading}
                  </small>
                </div>
                <ChevronRight size={14} />
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="studio-fleet-empty">
                <Search size={23} />
                <p>No perspectives match.</p>
                <button
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
          <footer>
            <ShieldCheck size={13} />
            <span>
              Local simulations.
              <br />
              Recorded results stay unchanged.
            </span>
          </footer>
        </section>
        <section className="studio-workbench">
          <header className="studio-identity">
            <span className="studio-avatar">
              <Bot size={29} />
            </span>
            <div>
              <span className="eyebrow">
                {selected.name} / BEHAVIOURAL PROFILE
              </span>
              <h2>{selected.role}</h2>
              <p>{selected.persona.behavior}</p>
            </div>
            <button
              className="studio-recorded-replay"
              onClick={() => onReplay(selected)}
            >
              <Play size={13} />
              Recorded session
              <ArrowUpRight size={13} />
            </button>
          </header>
          <div className="studio-behavior-editor">
            <div className="studio-editor-label">
              <span>
                <SlidersHorizontal size={14} />
                Behaviour controls
              </span>
              <span className={changed ? "draft-edited" : ""}>
                {changed ? "Local draft edited" : "Explore a local draft"}
              </span>
            </div>
            <div className="studio-parameter-fields">
              {parameters.map((parameter) => (
                <label key={parameter.key}>
                  <span>
                    {parameter.icon}
                    {parameter.label}
                  </span>
                  <select
                    aria-label={`Draft ${parameter.label}`}
                    value={editor.persona[parameter.key]}
                    onChange={(event) =>
                      updatePersona(parameter.key, event.target.value)
                    }
                  >
                    {parameter.options.map((option) => (
                      <option value={option} key={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="studio-goal-field">
              <label htmlFor="draft-scout-goal">
                <Target size={13} />
                Mission goal
              </label>
              <textarea
                id="draft-scout-goal"
                aria-label="Draft mission goal"
                value={editor.goal}
                onChange={(event) =>
                  setDraft({ ...editor, goal: event.target.value })
                }
                rows={2}
              />
              <div>
                <button
                  className="text-action"
                  onClick={() => {
                    setDraft(null);
                    setPreview(null);
                    setPlaying(false);
                    setPreviewTime(0);
                  }}
                >
                  <RotateCcw size={12} />
                  Reset profile
                </button>
                <button className="btn btn-primary btn-sm" onClick={runPreview}>
                  <Play size={13} />
                  Run behavioural preview
                </button>
              </div>
            </div>
          </div>
          <div className="studio-preview-heading">
            <div>
              <span
                className={`badge ${preview ? "badge-blue" : "badge-green"}`}
              >
                {preview ? <Sparkles size={10} /> : <Check size={10} />}
                {preview ? "Draft simulation preview" : "Recorded perspective"}
              </span>
              <span>
                {preview
                  ? `${editor.persona.patience} patience · ${editor.persona.reading} · ${editor.persona.device}`
                  : "Run a draft to see behaviour change."}
              </span>
            </div>
            <span>
              {preview
                ? `${Math.floor(previewTime)} / ${preview.duration}s`
                : `${selected.duration}s recorded`}
            </span>
          </div>
          <div
            className={`studio-browser-preview ${preview && editor.persona.device === "Mobile" ? "studio-mobile-preview" : ""}`}
          >
            <BrowserMock session={previewSession} time={previewTime} large />
          </div>
          <div className="studio-preview-controls">
            <button
              className="studio-preview-play"
              aria-label={
                playing ? "Pause draft preview" : "Play draft preview"
              }
              onClick={() => {
                if (!preview) runPreview();
                else {
                  if (previewTime >= preview.duration) setPreviewTime(0);
                  setPlaying((value) => !value);
                }
              }}
            >
              {playing && previewTime < previewSession.duration ? (
                <Pause size={14} />
              ) : (
                <Play size={14} />
              )}
            </button>
            <input
              type="range"
              aria-label="Seek persona preview"
              min={0}
              max={previewSession.duration}
              step={0.1}
              value={previewTime}
              onChange={(event) => {
                setPreviewTime(Number(event.target.value));
                setPlaying(false);
              }}
            />
            <time>{formatTime(previewTime)}</time>
            <button
              className="text-action"
              onClick={() => {
                setPreviewTime(0);
                setPlaying(Boolean(preview));
              }}
            >
              <RotateCcw size={12} />
              Restart
            </button>
          </div>
          <div className="studio-preview-event">
            <span className="pulse-dot" />
            <p>{currentEvent.text}</p>
            <span>{currentEvent.type.replace(/_/g, " ")}</span>
          </div>
          <div className="studio-draft-explanation">
            <Sparkles size={15} />
            <p>
              {preview
                ? `${editor.persona.patience === "Low" ? "Low patience shortens the journey. " : editor.persona.patience === "High" ? "High patience adds time to inspect. " : "Medium patience balances speed and depth. "}${editor.persona.trustThreshold === "High" ? "A high trust bar sends this draft through the privacy page. " : "This draft prioritises the workflow and first test. "}This scripted preview does not change research scores.`
                : "Change patience, trust, reading or device and run a new scripted preview. Canonical evidence and findings remain attached to the recorded sessions."}
            </p>
          </div>
        </section>
      </div>
      <div className="studio-human-note">
        <Users size={19} />
        <div>
          <strong>AI screens it. Real people prove it.</strong>
          <p>
            Scout explores possible behaviour. Five matched founders validate
            the patterns that matter.
          </p>
        </div>
        <button
          className="text-action"
          onClick={() => navigate("/tests/playground/sessions?source=human")}
        >
          Meet the founders
          <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  );
}

function makeDraftPreview(session: Session, draft: Draft): Session {
  const duration =
    draft.persona.patience === "Low"
      ? 18
      : draft.persona.patience === "High"
        ? 34
        : 26;
  const skims = draft.persona.reading === "Skims";
  const skeptical = draft.persona.trustThreshold === "High";
  const needsHelp = draft.persona.literacy === "Developing";
  return {
    ...session,
    id: `${session.id}-draft`,
    persona: { ...draft.persona },
    goal: draft.goal,
    duration,
    startedAt: 0,
    quote: "Local behavioural draft preview. Historical research is unchanged.",
    observations: ["Draft preview follows the edited behavioural parameters."],
    evidenceIds: [],
    findingIds: [],
    events: [
      {
        at: 0,
        type: "page_view",
        text: `Opens the product on ${draft.persona.device.toLowerCase()}`,
        x: 42,
        y: 23,
        scroll: 0,
        route: "/",
      },
      {
        at: 2,
        type: "hover",
        text: skims
          ? "Skims the headline and looks for the next action"
          : "Reads the value proposition before moving on",
        x: 47,
        y: 40,
        scroll: 0,
      },
      {
        at: duration * 0.21,
        type: "scroll",
        text: skims
          ? "Skips secondary copy to find proof and commitment"
          : "Reads how the testing workflow fits together",
        x: 72,
        y: 64,
        scroll: skims ? 420 : 235,
      },
      {
        at: duration * 0.35,
        type: skeptical ? "focus" : "click",
        text: skeptical
          ? "Checks privacy and private-product access before proceeding"
          : "Opens the testing explanation",
        x: 61,
        y: 46,
        scroll: 0,
        route: skeptical ? "/privacy" : "/how-it-works",
      },
      {
        at: duration * 0.58,
        type: needsHelp ? "hesitation" : "click",
        text: needsHelp
          ? "Pauses to understand how AI and human tests differ"
          : "Checks what the first test involves",
        x: 53,
        y: 60,
        scroll: 0,
        route: needsHelp ? "/how-it-works" : "/first-test",
      },
      {
        at: duration * 0.74,
        type: "back",
        text: "Returns to the original question and next step",
        x: 21,
        y: 15,
        scroll: 0,
        route: "/",
      },
      {
        at: duration * 0.88,
        type: needsHelp ? "hesitation" : "click",
        text: needsHelp
          ? "Looks for help before starting a mission"
          : "Begins a mission with the draft goal",
        x: 52,
        y: 64,
        scroll: 0,
        route: needsHelp ? "/" : "/new-test",
      },
      {
        at: duration,
        type: "task_success",
        text: "Draft preview complete · no historical results modified",
        x: 53,
        y: 64,
        scroll: 0,
      },
    ],
  };
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
