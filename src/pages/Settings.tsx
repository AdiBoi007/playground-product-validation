import { useState } from "react";
import { Check, Monitor, ShieldCheck, ArrowRight } from "lucide-react";
import { useDemo } from "../simulation/store";
import { readWorkspace } from "../useWorkspace";
import { resetStrategyOptions } from "../workspace/strategy";
export default function Settings() {
  const { state, togglePresentation, reset, setSpeed } = useDemo();
  const [settings, setSettings] = useState(readWorkspace);
  const [saved, setSaved] = useState(false);
  const save = () => {
    localStorage.setItem("playground-settings", JSON.stringify(settings));
    window.dispatchEvent(new Event("playground-settings-updated"));
    document.documentElement.dataset.reducedMotion = String(
      settings.reducedMotion,
    );
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };
  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE YOURSELF AT HOME</span>
          <h1>Workspace settings.</h1>
          <p className="muted">Small adjustments. A smoother demo.</p>
        </div>
      </div>
      <section className="panel settings-panel">
        <h2>Your workspace</h2>
        <div className="settings-fields">
          <label>
            Your name
            <input
              value={settings.name}
              onChange={(e) =>
                setSettings({ ...settings, name: e.target.value })
              }
            />
          </label>
          <label>
            Workspace name
            <input
              value={settings.workspace}
              onChange={(e) =>
                setSettings({ ...settings, workspace: e.target.value })
              }
            />
          </label>
        </div>
        <button className="btn btn-primary" onClick={save}>
          {saved ? (
            <>
              <Check size={16} />
              Saved
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </section>
      <section className="panel settings-panel">
        <h2>Presentation & playback</h2>
        <div className="setting-row">
          <div>
            <strong>Presentation mode</strong>
            <p>More room for the story. Press P to toggle.</p>
          </div>
          <button
            className={`switch ${state.presentation ? "on" : ""}`}
            role="switch"
            aria-checked={state.presentation}
            aria-label="Presentation mode"
            onClick={togglePresentation}
          >
            <span />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>Reduce decorative motion</strong>
            <p>Keep the evidence readable while sessions still play.</p>
          </div>
          <button
            className={`switch ${settings.reducedMotion ? "on" : ""}`}
            role="switch"
            aria-checked={settings.reducedMotion}
            aria-label="Reduce decorative motion"
            onClick={() => {
              const next = {
                ...settings,
                reducedMotion: !settings.reducedMotion,
              };
              setSettings(next);
              document.documentElement.dataset.reducedMotion = String(
                next.reducedMotion,
              );
              localStorage.setItem("playground-settings", JSON.stringify(next));
            }}
          >
            <span />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>Default demo speed</strong>
            <p>The virtual clock controls every result and session.</p>
          </div>
          <div className="speed-select">
            {[1, 2, 4, 8].map((s) => (
              <button
                className={state.speed === s ? "active" : ""}
                key={s}
                onClick={() => setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      </section>
      <div className="settings-bottom">
        <div>
          <ShieldCheck size={24} />
          <h3>Local by design.</h3>
          <p>
            All people, evidence, and outcomes are synthetic. No external
            services, no API keys, no product data leaving this device.
          </p>
        </div>
        <div>
          <Monitor size={24} />
          <h3>A clean slate.</h3>
          <p>
            Restore the starting question, cohort, and simulation. Your local
            workspace settings stay saved.
          </p>
          <button
            className="text-btn"
            onClick={() => {
              reset();
              resetStrategyOptions();
            }}
          >
            Reset demo
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
