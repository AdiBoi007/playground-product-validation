import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  Command,
  FileText,
  FlaskConical,
  FolderOpen,
  Layers,
  ListFilter,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  SkipForward,
  Users,
  X,
} from "lucide-react";
import Brand from "./components/Brand";
import Dashboard from "./pages/Dashboard";
import Overview from "./pages/Overview";
import Project from "./pages/Project";
import Changes from "./pages/Changes";
import NewTest from "./pages/NewTest";
import Plan from "./pages/Plan";
import Live from "./pages/Live";
import Sessions from "./pages/Sessions";
import Scout from "./pages/Scout";
import Evidence from "./pages/Evidence";
import Report from "./pages/Report";
import Compare from "./pages/Compare";
import Findings from "./pages/Findings";
import Testers from "./pages/Testers";
import WorkspaceSettings from "./pages/Settings";
import Matching from "./components/Matching";
import ReplayModal from "./components/ReplayModal";
import FindingDrawer from "./components/FindingDrawer";
import { useDemo } from "./simulation/store";
import {
  getCurrentEvidence,
  getFindingsForVersion,
  getSessionCohort,
} from "./simulation/selectors";
import type { Session } from "./types";
import { useWorkspace } from "./useWorkspace";
import { resetStrategyOptions } from "./workspace/strategy";

const testBase = "/tests/playground";
const navItems = [
  { path: "/dashboard", label: "Projects", Icon: FolderOpen },
  { path: `${testBase}/overview`, label: "Tests", Icon: FlaskConical },
  { path: `${testBase}/evidence`, label: "Evidence", Icon: Layers },
  { path: "/testers", label: "Testers", Icon: Users },
  { path: "/scout", label: "Scout", Icon: Bot },
  { path: `${testBase}/report`, label: "Reports", Icon: FileText },
];

export default function App() {
  const demo = useDemo();
  const { state } = demo;
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const profileInitials = workspace.name
    .split(/\s+/)
    .slice(0, 2)
    .map((name) => name[0])
    .join("")
    .toUpperCase();
  const [collapsed, setCollapsed] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [search, setSearch] = useState("");
  const [replay, setReplay] = useState<Session | null>(null);
  const [finding, setFinding] = useState<string | null>(null);
  const [selectedFindingVersion, setSelectedFindingVersion] = useState<
    1 | 2 | undefined
  >();
  const openFinding = (id: string, version?: 1 | 2) => {
    setSelectedFindingVersion(version);
    setFinding(id);
  };
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState("");
  const paletteRef = useRef<HTMLInputElement>(null);
  const complete = state.phase === "complete" || state.phase === "v2-complete";
  const active = [
    "analysing",
    "matching",
    "running",
    "analysing-results",
    "retesting",
  ].includes(state.phase);
  const inTest = location.pathname.startsWith("/tests/");
  const currentClock = complete
    ? 50
    : ["running", "analysing-results"].includes(state.phase)
      ? state.clock
      : 0;
  const evidenceCount = getCurrentEvidence(
    currentClock,
    state.phase === "v2-complete" ? 2 : 1,
  ).length;
  const findingCount = complete
    ? getFindingsForVersion(state.version).length
    : new Set(
        getCurrentEvidence(currentClock).flatMap((item) => item.findingIds),
      ).size;
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  };
  const reset = () => {
    demo.reset();
    resetStrategyOptions();
    setReplay(null);
    setFinding(null);
    setDemoOpen(false);
    navigate("/dashboard");
    notify("Fresh lap. Demo reset.");
  };
  const showResults = () => {
    demo.skipToResults();
    navigate(`${testBase}/report`);
    setDemoOpen(false);
  };
  const start = () => {
    demo.startRun();
    navigate(`${testBase}/live`);
    setDemoOpen(false);
  };
  const replayAnalysis = () => {
    demo.replayAnalysis();
    navigate("/new-test");
    setDemoOpen(false);
  };
  const commandItems = [
    {
      label: "Open validation map",
      description: "Connect the question, assumptions, evidence and decision",
      Icon: FlaskConical,
      action: () => navigate(`${testBase}/overview`),
    },
    {
      label: "Build a new test plan",
      description: "Ask the question that matters",
      Icon: Plus,
      action: () => navigate("/new-test"),
    },
    {
      label: "Start test / jump to live run",
      description: "Launch the Scout fleet",
      Icon: Play,
      action: start,
    },
    {
      label: "Open Scout",
      description: "20 behavioural personas",
      Icon: Bot,
      action: () => navigate("/scout"),
    },
    {
      label: "Open Evidence",
      description: "Follow every signal",
      Icon: Layers,
      action: () => navigate(`${testBase}/evidence`),
    },
    {
      label: "Show verdict",
      description: "Skip cleanly to the report",
      Icon: FileText,
      action: showResults,
    },
    {
      label: "Design version 02",
      description: "Choose evidence-backed changes and retest",
      Icon: ListFilter,
      action: () => navigate(`${testBase}/changes`),
    },
    {
      label: "Compare versions",
      description: "See the next lap",
      Icon: ListFilter,
      action: () => {
        if (!complete) demo.skipToResults();
        navigate(`${testBase}/compare`);
      },
    },
    {
      label: "Replay analysis",
      description: "Watch the engine assemble a strategy",
      Icon: RotateCcw,
      action: replayAnalysis,
    },
    {
      label: "Presentation mode",
      description: "P · put the story front and centre",
      Icon: Maximize2,
      action: demo.togglePresentation,
    },
    {
      label: "Reset demo",
      description: "Shift + R · back to the beginning",
      Icon: RotateCcw,
      action: reset,
    },
  ];
  const handledRoute = useRef<string | null>(null);
  useEffect(() => {
    if (handledRoute.current === location.pathname) return;
    handledRoute.current = location.pathname;
    if (
      /\/(report|findings|compare|changes)$/.test(location.pathname) &&
      !["complete", "v2-complete", "retesting"].includes(state.phase)
    )
      demo.skipToResults();
  }, [location.pathname, state.phase, demo]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setDemoOpen(false);
    setWorkspaceOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (palette) {
      setSearch("");
      window.setTimeout(() => paletteRef.current?.focus(), 40);
    }
  }, [palette]);
  useEffect(() => {
    try {
      const settings = JSON.parse(
        localStorage.getItem("playground-settings") ?? "{}",
      );
      document.documentElement.dataset.reducedMotion = String(
        Boolean(settings.reducedMotion),
      );
    } catch {
      /* Defaults work when storage is unavailable. */
    }
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      const editing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
        (event.target as HTMLElement).isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (event.key === "Escape") {
        setPalette(false);
        setReplay(null);
        setFinding(null);
        setHelp(false);
        setDemoOpen(false);
        setWorkspaceOpen(false);
        if (state.presentation) demo.togglePresentation();
        return;
      }
      if (editing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "p") {
        demo.togglePresentation();
      }
      if (event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        demo.reset();
        resetStrategyOptions();
        setReplay(null);
        setFinding(null);
        navigate("/dashboard");
      }
      if (event.key === " " && active && !replay) {
        event.preventDefault();
        if (state.paused) demo.resume();
        else demo.pause();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [state.presentation, state.paused, demo, active, replay, navigate]);
  useEffect(() => {
    document.body.style.overflow =
      palette || replay || finding || help ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [palette, replay, finding, help]);
  const currentNav =
    location.pathname === "/new-test"
      ? "New test"
      : location.pathname === "/scout"
        ? "Scout"
        : location.pathname === "/testers"
          ? "Tester network"
          : location.pathname === "/settings"
            ? "Settings"
            : inTest
              ? "Website validation"
              : "Projects";
  const tabs = [
    { label: "Overview", path: "overview" },
    { label: "Plan", path: "plan" },
    { label: "Live", path: "live", dot: state.phase === "running" },
    { label: "Sessions", path: "sessions", count: 27 },
    { label: "Evidence", path: "evidence", count: evidenceCount },
    {
      label: "Findings",
      path: "findings",
      count: findingCount,
    },
    { label: "Report", path: "report" },
    { label: "Changes", path: "changes" },
    { label: "Versions", path: "compare", count: state.version },
  ];
  return (
    <MotionConfig reducedMotion={workspace.reducedMotion ? "always" : "user"}>
      <div
        className={`app-shell ${collapsed ? "sidebar-collapsed" : ""} ${state.presentation ? "presentation" : ""}`}
      >
        <aside className="sidebar">
          <Link to="/dashboard" className="sidebar-brand">
            <Brand compact={collapsed} />
          </Link>
          <button
            className="workspace-select"
            onClick={() => setWorkspaceOpen((v) => !v)}
            aria-expanded={workspaceOpen}
          >
            <span className="workspace-avatar">
              p<span>.</span>
            </span>
            {!collapsed && (
              <>
                <span>
                  {workspace.workspace} workspace
                  <small>Founder workspace</small>
                </span>
                <ChevronDown size={14} />
              </>
            )}
          </button>
          {workspaceOpen && (
            <div className="workspace-menu">
              <span className="eyebrow">YOUR WORKSPACE</span>
              <button
                onClick={() => {
                  navigate("/dashboard");
                  setWorkspaceOpen(false);
                }}
              >
                <Check size={15} />
                Playground<small>Demo</small>
              </button>
              <button onClick={() => navigate("/settings")}>
                <Settings2 size={15} />
                Workspace settings
              </button>
            </div>
          )}
          <div className="nav-group-label">WORKSPACE</div>
          <nav className="primary-nav">
            {navItems.map(({ path, label, Icon }) => (
              <NavLink
                key={label}
                to={path}
                title={collapsed ? label : undefined}
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                <Icon size={18} />
                {!collapsed && <span>{label}</span>}
                {!collapsed && label === "Scout" && (
                  <span className="nav-ai-tag">AI</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-project">
            <div className="nav-group-label">
              YOUR PRODUCT{" "}
              <button
                className="icon-btn"
                aria-label="Add new product test"
                onClick={() => navigate("/new-test")}
              >
                <Plus size={13} />
              </button>
            </div>
            <button
              className="sidebar-project-button"
              onClick={() => navigate(`${testBase}/overview`)}
            >
              <span className="project-tiny-icon">p.</span>
              {!collapsed && (
                <span>
                  Playground<small>Website validation</small>
                </span>
              )}
            </button>
          </div>
          <div className="sidebar-bottom">
            <button
              className="sidebar-demo"
              onClick={() => setDemoOpen((v) => !v)}
              aria-expanded={demoOpen}
              title="Demo controls"
            >
              <span className="demo-control-icon">
                <Play size={13} />
              </span>
              {!collapsed && (
                <>
                  <span>
                    Demo mode<small>Everything. On your terms.</small>
                  </span>
                  <ChevronDown size={14} />
                </>
              )}
            </button>
            <NavLink className="settings-nav" to="/settings">
              <Settings2 size={17} />
              {!collapsed && <span>Settings</span>}
            </NavLink>
            <button
              className="sidebar-profile"
              onClick={() => setHelp(true)}
              aria-label="Open pitch shortcuts"
            >
              <span className="profile-avatar">{profileInitials}</span>
              {!collapsed && (
                <>
                  <span>
                    {workspace.name}
                    <small>Founder</small>
                  </span>
                  <span className="help-key">?</span>
                </>
              )}
            </button>
          </div>
          <button
            className="sidebar-collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
          >
            <ChevronLeft
              size={13}
              style={{ transform: collapsed ? "rotate(180deg)" : "" }}
            />
          </button>
        </aside>
        <div className="workspace-content">
          <header className="topbar">
            <div className="breadcrumbs">
              {state.presentation && (
                <Link to="/dashboard">
                  <Brand compact />
                </Link>
              )}
              <span>Workspace</span>
              <span className="crumb-divider">/</span>
              <strong>{currentNav}</strong>
            </div>
            <div className="topbar-right">
              <span className="demo-indicator">
                <span />
                Demo environment
              </span>
              <button
                className="command-trigger"
                onClick={() => setPalette(true)}
                aria-label="Open command palette"
              >
                <Search size={15} />
                <span>Quick find</span>
                <kbd>⌘ K</kbd>
              </button>
              <button
                className="icon-btn present-trigger"
                title="Presentation mode (P)"
                aria-label="Toggle presentation mode"
                onClick={demo.togglePresentation}
              >
                {state.presentation ? (
                  <Minimize2 size={17} />
                ) : (
                  <Maximize2 size={17} />
                )}
              </button>
            </div>
          </header>
          <main className={`main-content ${inTest ? "test-content" : ""}`}>
            {inTest && (
              <div className="test-workspace-header">
                <div className="test-title-row">
                  <div>
                    <span className="eyebrow">
                      PG-TEST-0042 / VERSION 0{state.version}
                    </span>
                    <h2>Playground Website Validation</h2>
                  </div>
                  <div className="test-title-meta">
                    <span
                      className={`badge ${complete ? "badge-green" : active ? "badge-blue" : "badge-neutral"}`}
                    >
                      <i />
                      {complete
                        ? "Complete"
                        : state.paused
                          ? "Paused"
                          : active
                            ? "Live"
                            : "Ready"}
                    </span>
                    <button
                      className="test-url"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(state.url)
                          .then(() => notify("Product URL copied."))
                          .catch(() => notify(state.url));
                      }}
                      title="Copy product URL"
                    >
                      {new URL(state.url).hostname}
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                </div>
                <nav className="test-tabs">
                  {tabs.map((t) => (
                    <NavLink
                      key={t.path}
                      to={`${testBase}/${t.path}`}
                      className={({ isActive }) => (isActive ? "active" : "")}
                    >
                      {t.dot && <i className="live-dot" />}
                      {t.label}
                      {typeof t.count === "number" && <span>{t.count}</span>}
                    </NavLink>
                  ))}
                </nav>
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                className="route-surface"
                key={location.pathname}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.16 }}
              >
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/new-test" element={<NewTest />} />
                  <Route
                    path="/projects/:id"
                    element={<Project onReplay={setReplay} />}
                  />
                  <Route
                    path="/tests/:id/overview"
                    element={<Overview onFinding={openFinding} />}
                  />
                  <Route path="/tests/:id/plan" element={<Plan />} />
                  <Route
                    path="/tests/:id/changes"
                    element={<Changes onFinding={openFinding} />}
                  />
                  <Route
                    path="/tests/:id/live"
                    element={
                      state.phase === "matching" ? (
                        <Matching />
                      ) : (
                        <Live onReplay={setReplay} onFinding={openFinding} />
                      )
                    }
                  />
                  <Route
                    path="/tests/:id/sessions"
                    element={<Sessions onReplay={setReplay} />}
                  />
                  <Route
                    path="/tests/:id/simulations"
                    element={<Sessions onReplay={setReplay} />}
                  />
                  <Route
                    path="/tests/:id/participants"
                    element={<Testers onReplay={setReplay} />}
                  />
                  <Route
                    path="/tests/:id/evidence"
                    element={
                      <Evidence onReplay={setReplay} onFinding={openFinding} />
                    }
                  />
                  <Route
                    path="/tests/:id/report"
                    element={
                      <Report onReplay={setReplay} onFinding={openFinding} />
                    }
                  />
                  <Route
                    path="/tests/:id/findings"
                    element={<Findings onFinding={openFinding} />}
                  />
                  <Route
                    path="/tests/:id/compare"
                    element={
                      <Compare onReplay={setReplay} onFinding={openFinding} />
                    }
                  />
                  <Route
                    path="/scout"
                    element={<Scout onReplay={setReplay} />}
                  />
                  <Route
                    path="/testers"
                    element={<Testers onReplay={setReplay} />}
                  />
                  <Route path="/settings" element={<WorkspaceSettings />} />
                  <Route
                    path="*"
                    element={
                      <div className="empty-state">
                        <FolderOpen size={30} />
                        <h1>This trail leads off the playground.</h1>
                        <p>Your workspace is one click away.</p>
                        <button
                          className="btn btn-primary"
                          onClick={() => navigate("/dashboard")}
                        >
                          Back to projects
                          <ArrowRight size={17} />
                        </button>
                      </div>
                    }
                  />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </main>
          <footer className="workspace-footer">
            <Brand compact />
            <span>Stop guessing. Start testing.</span>
            <span className="local-status">
              <Check size={12} />
              Saved on this device
            </span>
          </footer>
        </div>
        <AnimatePresence>
          {demoOpen && (
            <>
              <div
                className="dropdown-dismiss"
                onClick={() => setDemoOpen(false)}
              />
              <motion.div
                className="demo-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
              >
                <div className="demo-menu-heading">
                  <div>
                    <span className="eyebrow">YOUR DEMO. YOUR PACE.</span>
                    <h3>Take control.</h3>
                  </div>
                  <button
                    className="icon-btn"
                    aria-label="Close demo controls"
                    onClick={() => setDemoOpen(false)}
                  >
                    <X size={17} />
                  </button>
                </div>
                <div className="demo-phase">
                  <span
                    className={
                      active && !state.paused ? "live-dot" : "status-static"
                    }
                  />
                  {state.paused ? "Paused" : state.phase.replace(/-/g, " ")}
                  <span className="mono">{state.clock.toFixed(1)}s</span>
                </div>
                <div className="demo-menu-actions">
                  <button onClick={start}>
                    <Play size={16} />
                    Start run
                    <ArrowRight size={13} />
                  </button>
                  <button
                    disabled={!active}
                    onClick={() =>
                      state.paused ? demo.resume() : demo.pause()
                    }
                  >
                    {state.paused ? <Play size={16} /> : <Pause size={16} />}{" "}
                    {state.paused ? "Resume" : "Pause"}
                    <kbd>space</kbd>
                  </button>
                  <button onClick={showResults}>
                    <SkipForward size={16} />
                    Skip to results
                  </button>
                  <button onClick={replayAnalysis}>
                    <RotateCcw size={16} />
                    Replay analysis
                  </button>
                  <button
                    onClick={() => {
                      setReplay(getSessionCohort(state.version)[1]);
                      setDemoOpen(false);
                    }}
                  >
                    <Play size={16} />
                    Replay session
                  </button>
                </div>
                <div className="demo-speed-label">
                  <span className="eyebrow">PLAYBACK SPEED</span>
                  <div className="speed-select">
                    {[1, 2, 4, 8].map((speed) => (
                      <button
                        key={speed}
                        className={state.speed === speed ? "active" : ""}
                        onClick={() => demo.setSpeed(speed)}
                      >
                        {speed}×
                      </button>
                    ))}
                  </div>
                </div>
                <div className="demo-menu-actions demo-actions-bottom">
                  <button onClick={demo.togglePresentation}>
                    <Maximize2 size={16} />
                    Presentation mode<kbd>P</kbd>
                  </button>
                  <button onClick={reset}>
                    <RotateCcw size={16} />
                    Reset demo<kbd>⇧ R</kbd>
                  </button>
                </div>
                <p className="fine-print">
                  Local, deterministic, and entirely synthetic.
                </p>
              </motion.div>
            </>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {palette && (
            <div
              className="modal-backdrop command-backdrop"
              onClick={() => setPalette(false)}
            >
              <motion.div
                className="command-palette"
                role="dialog"
                aria-modal="true"
                aria-label="Command palette"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.98, y: -12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
              >
                <div className="command-search">
                  <Search size={20} />
                  <input
                    ref={paletteRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Where do we go from here?"
                    aria-label="Search commands"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const match = commandItems.find((c) =>
                          `${c.label} ${c.description}`
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        );
                        if (match) {
                          match.action();
                          setPalette(false);
                        }
                      }
                    }}
                  />
                  <button
                    className="icon-btn"
                    onClick={() => setPalette(false)}
                    aria-label="Close command palette"
                  >
                    <kbd>esc</kbd>
                  </button>
                </div>
                <div className="command-list">
                  {commandItems
                    .filter((c) =>
                      `${c.label} ${c.description}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((c) => (
                      <button
                        key={c.label}
                        onClick={() => {
                          c.action();
                          setPalette(false);
                        }}
                      >
                        <c.Icon size={19} />
                        <span>
                          <strong>{c.label}</strong>
                          <small>{c.description}</small>
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  {!commandItems.some((c) =>
                    `${c.label} ${c.description}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  ) && (
                    <div className="command-empty">
                      No commands match. Try “Scout” or “verdict”.
                    </div>
                  )}
                </div>
                <div className="command-footer">
                  <Brand compact />
                  <span>Different question. Same Playground.</span>
                  <kbd>↵ to select</kbd>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {replay && (
            <ReplayModal session={replay} onClose={() => setReplay(null)} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {finding && (
            <FindingDrawer
              version={selectedFindingVersion}
              findingId={finding}
              onClose={() => setFinding(null)}
              onReplay={(session) => {
                setFinding(null);
                setReplay(session);
              }}
            />
          )}
        </AnimatePresence>
        {help && (
          <div className="modal-backdrop" onClick={() => setHelp(false)}>
            <div
              className="help-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Pitch shortcuts"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="icon-btn modal-close"
                aria-label="Close shortcuts"
                onClick={() => setHelp(false)}
              >
                <X size={20} />
              </button>
              <span className="eyebrow">FOR YOUR NEXT BIG MOMENT</span>
              <h2>The pitch cheat sheet.</h2>
              <p>Every part of the demo is one command away.</p>
              {[
                { key: "⌘ K", label: "Open the command palette" },
                { key: "P", label: "Toggle presentation mode" },
                { key: "Space", label: "Pause / resume the virtual clock" },
                { key: "⇧ R", label: "Reset to the beginning" },
                { key: "Esc", label: "Close overlays / exit presentation" },
              ].map((s) => (
                <div className="shortcut-row" key={s.key}>
                  <span>{s.label}</span>
                  <kbd>{s.key}</kbd>
                </div>
              ))}
              <button
                className="btn btn-primary"
                onClick={() => {
                  setHelp(false);
                  setPalette(true);
                }}
              >
                <Command size={17} />
                Open command palette
              </button>
            </div>
          </div>
        )}
        <AnimatePresence>
          {toast && (
            <motion.div
              role="status"
              className="toast"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <Check size={16} />
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
