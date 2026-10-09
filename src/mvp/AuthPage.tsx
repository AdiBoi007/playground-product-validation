import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { getAuthClient } from "./auth-client";
import { useMvp } from "./store";
import "./auth.css";

type AuthMode = "login" | "signup" | "recover" | "update-password";
export function AuthPage({ mode = "login" }: { mode?: AuthMode }) {
  const { error: workspaceError, refresh } = useMvp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"founder" | "tester">("founder");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();
  const heading =
    mode === "signup"
      ? "Create your account"
      : mode === "recover"
        ? "Reset your password"
        : mode === "update-password"
          ? "Choose a new password"
          : "Sign in";
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const client = getAuthClient();
      if (mode === "signup") {
        const result = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { name: name.trim(), role },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (result.error) throw result.error;
        if (result.data.session)
          navigate(role === "tester" ? "/tester" : "/dashboard", {
            replace: true,
          });
        else setNotice("Check your email to confirm your account.");
      } else if (mode === "recover") {
        const result = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/update-password`,
        });
        if (result.error) throw result.error;
        setNotice("If an account exists, a reset link has been sent.");
      } else if (mode === "update-password") {
        const result = await client.auth.updateUser({ password });
        if (result.error) throw result.error;
        setNotice("Password updated.");
        navigate("/dashboard", { replace: true });
      } else {
        const result = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (result.error) throw result.error;
        navigate("/dashboard", { replace: true });
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete this request.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-shell">
      <Link className="mvp-logo auth-logo" to="/login" aria-label="Playground">
        <span className="mvp-logo-mark" aria-hidden="true" />
        <span>
          playground<span className="mvp-logo-dot">.</span>
        </span>
      </Link>
      <form className="auth-card" onSubmit={submit}>
        <h1>{heading}</h1>
        {mode === "signup" && (
          <>
            <label className="mvp-field">
              Name
              <input
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="mvp-field">
              Account type
              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as "founder" | "tester")
                }
              >
                <option value="founder">Founder</option>
                <option value="tester">Tester</option>
              </select>
            </label>
          </>
        )}
        {mode !== "update-password" && (
          <label className="mvp-field">
            Email
            <input
              required
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        )}
        {mode !== "recover" && (
          <label className="mvp-field">
            Password
            <input
              required
              type="password"
              minLength={mode === "login" ? 1 : 10}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}
        {(error || workspaceError) && (
          <div className="mvp-error" role="alert">
            {error || workspaceError}
          </div>
        )}
        {notice && (
          <p className="auth-notice" role="status">
            {notice}
          </p>
        )}
        <button className="mvp-btn mvp-btn-dark mvp-btn-full" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "signup"
              ? "Create account"
              : mode === "recover"
                ? "Send reset link"
                : mode === "update-password"
                  ? "Save password"
                  : "Sign in"}
          <ArrowRight size={16} />
        </button>
        {workspaceError && (
          <button
            type="button"
            className="mvp-btn mvp-btn-full"
            disabled={busy}
            onClick={() => {
              void refresh().catch((cause) =>
                setError(
                  cause instanceof Error ? cause.message : "Could not refresh.",
                ),
              );
            }}
          >
            Retry workspace
          </button>
        )}
        <div className="auth-links">
          {mode === "login" ? (
            <>
              <Link to="/signup">Create account</Link>
              <Link to="/reset-password">Forgot password?</Link>
            </>
          ) : (
            <Link to="/login">Back to sign in</Link>
          )}
        </div>
      </form>
    </div>
  );
}
