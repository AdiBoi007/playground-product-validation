import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  ClipboardCheck,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { MvpProvider, useMvp } from "./mvp/store";
import {
  CampaignPage,
  CreateTestPage,
  DashboardPage,
  ResultsPage,
} from "./mvp/FounderPages";
import {
  AdminPage,
  FeedbackPage,
  TesterHomePage,
  TesterWorkspacePage,
} from "./mvp/OperationsPages";
import type { Role } from "./mvp/types";
import { MarketResearchPage } from "./mvp/MarketResearchPage";
import { AuthPage } from "./mvp/AuthPage";
import { authConfigurationError, getAuthClient } from "./mvp/auth-client";
function Logo() {
  return (
    <span className="mvp-logo">
      <span className="mvp-logo-mark" aria-hidden="true" />
      <span>
        playground<span className="mvp-logo-dot">.</span>
      </span>
    </span>
  );
}
const homeFor = (role: Role) =>
  role === "admin" ? "/admin" : role === "tester" ? "/tester" : "/dashboard";
function ErrorNotice() {
  const { error, clearError } = useMvp();
  return error ? (
    <div className="mvp-error" role="alert">
      <span>{error}</span>
      <button aria-label="Dismiss error" onClick={clearError}>
        <X size={17} />
      </button>
    </div>
  ) : null;
}

function WorkspaceShell() {
  const {
    data,
    user,
    mode,
    loading,
    busy,
    enterWorkspace,
    addTester,
    refresh,
  } = useMvp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [testerName, setTesterName] = useState("");
  const [expertise, setExpertise] = useState("");
  const [addError, setAddError] = useState("");
  const dialogRef = useRef<HTMLFormElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const requestedRole: Role = location.pathname.startsWith("/admin")
    ? "admin"
    : location.pathname.startsWith("/tester")
      ? "tester"
      : "founder";
  const assignmentMatch = location.pathname.match(
    /^\/tester\/assignments\/([^/]+)/,
  );
  const campaignMatch = location.pathname.match(/^\/campaigns\/([^/]+)/);
  const requestedProfile = assignmentMatch
    ? data.assignments.find((a) => a.id === assignmentMatch[1])?.testerId
    : campaignMatch
      ? data.campaigns.find((c) => c.id === campaignMatch[1])?.founderId
      : undefined;
  useEffect(() => {
    if (
      mode === "local" &&
      !loading &&
      (!user ||
        user.role !== requestedRole ||
        (requestedProfile && user.id !== requestedProfile))
    )
      void enterWorkspace(requestedRole, requestedProfile).catch(
        () => undefined,
      );
  }, [enterWorkspace, loading, mode, requestedRole, requestedProfile, user]);
  useEffect(() => {
    setMobileOpen(false);
    setAddOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    if (!addOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddOpen(false);
        return;
      }
      if (event.key === "Tab") {
        const nodes = [
          ...(dialogRef.current?.querySelectorAll<HTMLElement>(
            "input,button,select,textarea,a[href]",
          ) ?? []),
        ].filter((n) => !n.hasAttribute("disabled"));
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [addOpen]);
  const saveTester = async (event: FormEvent) => {
    event.preventDefault();
    setAddError("");
    try {
      const profile = await addTester({
        name: testerName.trim(),
        expertise: expertise
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      if (requestedRole === "tester")
        await enterWorkspace("tester", profile.id);
      setAddOpen(false);
      setTesterName("");
      setExpertise("");
    } catch (error) {
      setAddError(
        error instanceof Error ? error.message : "Could not save this tester.",
      );
    }
  };
  const openAdd = () => {
    setTesterName("");
    setExpertise("");
    setAddError("");
    setAddOpen(true);
  };
  if (mode === "connected" && !loading && user && requestedRole !== user.role)
    return <Navigate to={homeFor(user.role)} replace />;
  if (
    loading ||
    !user ||
    user.role !== requestedRole ||
    (requestedProfile && user.id !== requestedProfile)
  )
    return (
      <div className="mvp-loading">
        <Logo />
        <span>Opening your workspace…</span>
      </div>
    );
  const testers = data.profiles.filter((p) => p.role === "tester");
  const nav =
    requestedRole === "founder"
      ? [
          { to: "/dashboard", label: "Tests", icon: LayoutDashboard },
          { to: "/create", label: "Create test", icon: Plus },
          { to: "/sandbox", label: "Sandbox", icon: Search },
        ]
      : requestedRole === "tester"
        ? [{ to: "/tester", label: "Your assignments", icon: ClipboardCheck }]
        : [{ to: "/admin", label: "Operations", icon: ShieldCheck }];
  return (
    <div className="mvp-shell">
      <aside className={`mvp-sidebar ${mobileOpen ? "open" : ""}`}>
        <Link
          className="mvp-sidebar-logo"
          to={homeFor(requestedRole)}
          aria-label="Playground workspace"
        >
          <Logo />
        </Link>
        <nav>
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end>
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.to === "/dashboard" && (
                <small>
                  {data.campaigns.filter((c) => c.founderId === user.id).length}
                </small>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mvp-storage-note">
          {mode === "connected"
            ? "Private connected workspace"
            : "Saved on this device"}
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="mvp-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="mvp-shell-content">
        <header className="mvp-topbar">
          <div>
            <button
              className="mvp-mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileOpen((v) => !v)}
            >
              <Menu size={20} />
            </button>
            <span className="mvp-topbar-name">
              Workspace <span>/</span>
              {requestedRole === "admin"
                ? "Operations"
                : requestedRole === "tester"
                  ? "Tester"
                  : location.pathname.startsWith("/sandbox")
                    ? "Sandbox"
                    : "Tests"}
            </span>
          </div>
          <div className="mvp-topbar-actions">
            {mode === "local" && (
              <label className="mvp-view-picker">
                <span>VIEW</span>
                <select
                  aria-label="Workspace view"
                  disabled={busy}
                  value={requestedRole}
                  onChange={(event) =>
                    navigate(homeFor(event.target.value as Role))
                  }
                >
                  <option value="founder">Founder</option>
                  <option value="tester">Tester</option>
                  <option value="admin">Operations</option>
                </select>
              </label>
            )}
            {mode === "local" &&
              requestedRole === "tester" &&
              testers.length > 0 && (
                <select
                  className="mvp-tester-picker"
                  aria-label="Tester profile"
                  disabled={busy}
                  value={testers.some((p) => p.id === user.id) ? user.id : ""}
                  onChange={(event) => {
                    void enterWorkspace("tester", event.target.value)
                      .then(() => navigate("/tester"))
                      .catch(() => undefined);
                  }}
                >
                  {!testers.some((p) => p.id === user.id) && (
                    <option value="">Choose a tester</option>
                  )}
                  {testers.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            {mode === "local" && requestedRole !== "founder" && (
              <button
                className="mvp-btn mvp-add-tester"
                disabled={busy}
                onClick={openAdd}
              >
                <Plus size={14} /> Add tester
              </button>
            )}
            <button
              className="mvp-refresh"
              disabled={busy}
              onClick={() => void refresh().catch(() => undefined)}
            >
              Refresh
            </button>
            {mode === "connected" && (
              <div className="mvp-account-menu">
                <span>{user.name}</span>
                <button
                  className="mvp-btn"
                  disabled={busy}
                  onClick={() => {
                    void getAuthClient()
                      .auth.signOut()
                      .catch(() => undefined);
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="mvp-main">
          <ErrorNotice />
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/create" element={<CreateTestPage />} />
            <Route path="/sandbox" element={<MarketResearchPage />} />
            <Route
              path="/research"
              element={<Navigate to="/sandbox" replace />}
            />
            <Route path="/campaigns/:id" element={<CampaignPage />} />
            <Route path="/campaigns/:id/results" element={<ResultsPage />} />
            <Route path="/tester" element={<TesterHomePage />} />
            <Route
              path="/tester/assignments/:id"
              element={<TesterWorkspacePage />}
            />
            <Route
              path="/tester/assignments/:id/feedback"
              element={<FeedbackPage />}
            />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
      {addOpen && (
        <div
          className="mvp-person-backdrop"
          onClick={() => !busy && setAddOpen(false)}
        >
          <form
            ref={dialogRef}
            className="mvp-person-dialog"
            onSubmit={saveTester}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-tester-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="mvp-person-close"
              type="button"
              aria-label="Close tester form"
              onClick={() => setAddOpen(false)}
            >
              <X size={19} />
            </button>
            <h2 id="add-tester-title">Add a tester</h2>
            <label className="mvp-field">
              Tester name
              <input
                required
                minLength={2}
                maxLength={100}
                placeholder="Their name"
                value={testerName}
                onChange={(e) => setTesterName(e.target.value)}
              />
            </label>
            <label className="mvp-field">
              Expertise
              <input
                maxLength={500}
                placeholder="Product design, small business, finance"
                value={expertise}
                onChange={(e) => setExpertise(e.target.value)}
              />
            </label>
            <span className="mvp-person-hint">
              Separate areas of experience with commas.
            </span>
            {addError && (
              <div className="mvp-error" role="alert">
                {addError}
              </div>
            )}
            <button
              className="mvp-btn mvp-btn-dark mvp-btn-full"
              type="submit"
              disabled={busy}
            >
              {busy ? "Saving…" : "Save tester"}
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
function Router() {
  const { loading, mode, user } = useMvp();
  const setupError = authConfigurationError();
  if (setupError)
    return (
      <div className="auth-shell">
        <Logo />
        <p className="auth-config-error" role="alert">
          {setupError}
        </p>
      </div>
    );
  if (loading)
    return (
      <div className="mvp-loading">
        <Logo />
        <span>Opening your workspace…</span>
      </div>
    );
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Navigate
            to={
              mode === "connected"
                ? user
                  ? homeFor(user.role)
                  : "/login"
                : "/dashboard"
            }
            replace
          />
        }
      />
      <Route path="/sign-in" element={<Navigate to="/login" replace />} />
      <Route
        path="/login"
        element={
          mode === "connected" && !user ? (
            <AuthPage />
          ) : (
            <Navigate to={user ? homeFor(user.role) : "/dashboard"} replace />
          )
        }
      />
      <Route
        path="/signup"
        element={
          mode === "connected" && !user ? (
            <AuthPage mode="signup" />
          ) : (
            <Navigate to={user ? homeFor(user.role) : "/dashboard"} replace />
          )
        }
      />
      <Route
        path="/reset-password"
        element={
          mode === "connected" ? (
            <AuthPage mode="recover" />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/update-password"
        element={
          mode === "connected" ? (
            <AuthPage mode="update-password" />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/auth/callback"
        element={
          <Navigate
            to={
              user
                ? homeFor(user.role)
                : mode === "connected"
                  ? "/login"
                  : "/dashboard"
            }
            replace
          />
        }
      />
      <Route
        path="*"
        element={
          mode === "connected" && !user ? (
            <Navigate to="/login" replace />
          ) : (
            <WorkspaceShell />
          )
        }
      />
    </Routes>
  );
}
export default function App() {
  return (
    <MvpProvider>
      <Router />
    </MvpProvider>
  );
}
