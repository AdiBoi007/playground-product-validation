import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  MapPin,
  Check,
  X,
  ShieldCheck,
  Users,
  Bot,
  Compass,
  Accessibility,
  ArrowRight,
} from "lucide-react";
import { motion } from "motion/react";
import { sessions, specialistSession } from "../data/demo";
import type { Session, Source } from "../types";
import { useDemo } from "../simulation/store";
import {
  getSessionCohort,
  getSpecialistSession,
} from "../simulation/selectors";
const networkSessions = [...sessions, specialistSession];
export default function Testers({
  onReplay,
}: {
  onReplay: (session: Session) => void;
}) {
  const navigate = useNavigate();
  const { state } = useDemo();
  const [tab, setTab] = useState<Source>("human");
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("All locations");
  const [experience, setExperience] = useState("All experience");
  const [stage, setStage] = useState("All stages");
  const [selected, setSelected] = useState<Session | null>(null);
  const [invited, setInvited] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("playground-shortlist") ?? "[]",
      );
      return Array.isArray(saved)
        ? saved.filter(
            (id) =>
              typeof id === "string" &&
              networkSessions.some((session) => session.id === id),
          )
        : [];
    } catch {
      return [];
    }
  });
  const toggleShortlist = (id: string) => {
    const next = invited.includes(id)
      ? invited.filter((item) => item !== id)
      : [...invited, id];
    setInvited(next);
    try {
      localStorage.setItem("playground-shortlist", JSON.stringify(next));
    } catch {
      /* The shortlist remains available this session. */
    }
  };
  const [filters, setFilters] = useState(false);
  const items = networkSessions.filter(
    (s) =>
      s.source === tab &&
      `${s.name} ${s.role} ${s.location} ${s.tags.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (location === "All locations" || s.location === location) &&
      (experience === "All experience" || s.experience === experience) &&
      (stage === "All stages" || s.stage === stage),
  );
  const sourceSessions = networkSessions.filter((s) => s.source === tab);
  const resetFilters = () => {
    setSearch("");
    setLocation("All locations");
    setExperience("All experience");
    setStage("All stages");
  };
  return (
    <div className="network-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE RIGHT HUMANS CHANGE EVERYTHING</div>
          <h1>
            Your people.
            <br />
            Their own decisions.
          </h1>
          <p className="muted">
            A question is only as good as the people you put it to.
          </p>
        </div>
        <div className="network-caption">
          <Users size={24} />
          <strong>Audience first.</strong>
          <span>Every profile is synthetic demo data.</span>
        </div>
      </div>
      <div className="network-tabs">
        {(
          [
            { id: "human", label: "People", Icon: Users },
            { id: "expert", label: "Experts", Icon: Compass },
            { id: "specialist", label: "Specialists", Icon: Accessibility },
            { id: "ai", label: "AI personas", Icon: Bot },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => {
              setTab(t.id);
              resetFilters();
            }}
          >
            <t.Icon size={17} />
            {t.label}
            <span>
              {networkSessions.filter((s) => s.source === t.id).length}
            </span>
          </button>
        ))}
      </div>
      <div className="network-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search tester network"
            placeholder="Search by role, industry, or behaviour…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="icon-btn"
              aria-label="Clear search"
              onClick={() => setSearch("")}
            >
              <X size={15} />
            </button>
          )}
        </div>
        <button
          className={`btn btn-secondary ${filters ? "selected" : ""}`}
          onClick={() => setFilters((v) => !v)}
        >
          <SlidersHorizontal size={16} />
          Filters
        </button>
        <span className="muted">{items.length} demo profiles</span>
      </div>
      {filters && (
        <div className="network-filters">
          <label>
            Location
            <select
              aria-label="Filter by location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option>All locations</option>
              {[...new Set(sourceSessions.map((s) => s.location))].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Experience
            <select
              aria-label="Filter by experience"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
            >
              <option>All experience</option>
              {[...new Set(sourceSessions.map((s) => s.experience))].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Company stage
            <select
              aria-label="Filter by stage"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <option>All stages</option>
              {[...new Set(sourceSessions.map((s) => s.stage))].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <button className="text-btn" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      )}
      <div className="network-grid">
        {items.map((s, i) => (
          <motion.button
            key={s.id}
            className="tester-card"
            onClick={() => setSelected(s)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.035, 0.25) }}
          >
            <div className="tester-card-top">
              <span
                className="avatar avatar-large"
                style={{ background: s.color }}
              >
                {s.initials}
              </span>
              <span className="match-badge">
                <Check size={12} />
                {s.match}% match
              </span>
            </div>
            <h3>{s.name}</h3>
            <p>{s.role}</p>
            <span className="tester-location">
              <MapPin size={13} />
              {s.location}
            </span>
            <div className="tester-tags">
              {s.tags.slice(0, 3).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="tester-card-bottom">
              <span>
                <i />
                {invited.includes(s.id)
                  ? "Added to cohort"
                  : "Available in demo"}
              </span>
              <ArrowUpRight size={17} />
            </div>
          </motion.button>
        ))}
      </div>
      {items.length === 0 && (
        <div className="empty-state">
          <Search size={26} />
          <h3>No profiles match this mix.</h3>
          <p>Try a wider audience or clear the filters.</p>
          <button className="btn btn-secondary" onClick={resetFilters}>
            Clear filters
          </button>
        </div>
      )}
      <div className="specialist-pathway">
        <div className="specialist-icon">
          <ShieldCheck size={30} />
        </div>
        <div>
          <span className="eyebrow">
            DIFFERENT QUESTION. DIFFERENT SPECIALIST.
          </span>
          <h3>“Can we safely ship this authentication flow?”</h3>
          <p>
            AI adversarial screening + security checklist + cybersecurity
            researcher.
            <br />
            An illustrative specialist pathway, selected when the question needs
            it.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() =>
            navigate("/new-test", {
              state: {
                question: "Can we safely ship this authentication flow?",
              },
            })
          }
        >
          Build this strategy
          <ArrowRight size={16} />
        </button>
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <motion.div
            className="tester-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name} profile`}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <button
              className="icon-btn modal-close"
              aria-label="Close profile"
              onClick={() => setSelected(null)}
            >
              <X size={21} />
            </button>
            <span className="eyebrow">
              SYNTHETIC{" "}
              {selected.source === "human"
                ? "PARTICIPANT"
                : selected.source.toUpperCase()}{" "}
              PROFILE
            </span>
            <span
              className="avatar avatar-xl"
              style={{ background: selected.color }}
            >
              {selected.initials}
            </span>
            <h2>{selected.name}</h2>
            <p>
              {selected.role} · {selected.location}
            </p>
            <div className="profile-detail">
              <div>
                <span>Experience</span>
                <strong>{selected.experience}</strong>
              </div>
              <div>
                <span>Company stage</span>
                <strong>{selected.stage}</strong>
              </div>
              <div>
                <span>Audience fit</span>
                <strong>{selected.match}%</strong>
              </div>
              <div>
                <span>Reading behaviour</span>
                <strong>{selected.persona.reading}</strong>
              </div>
              <div>
                <span>Product literacy</span>
                <strong>{selected.persona.literacy}</strong>
              </div>
              <div>
                <span>Trust threshold</span>
                <strong>{selected.persona.trustThreshold}</strong>
              </div>
            </div>
            <div className="profile-behavior">
              <span className="eyebrow">RELEVANT BEHAVIOUR</span>
              <p>{selected.persona.behavior}</p>
              <span className="eyebrow">MISSION</span>
              <p>{selected.goal}</p>
            </div>
            <div className="tester-modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  onReplay(
                    getSessionCohort(state.version).find(
                      (session) => session.id === selected.id,
                    ) ?? getSpecialistSession(state.version),
                  );
                  setSelected(null);
                }}
              >
                Preview session
                <ArrowUpRight size={16} />
              </button>
              <button
                className="btn btn-primary"
                onClick={() => toggleShortlist(selected.id)}
              >
                {invited.includes(selected.id) ? (
                  <>
                    <Check size={16} />
                    Added to cohort
                  </>
                ) : (
                  "Add to demo cohort"
                )}
              </button>
            </div>
            <span className="fine-print">
              Cohort additions are a local demo shortlist. The hero test uses
              its fixed cohort.
            </span>
          </motion.div>
        </div>
      )}
    </div>
  );
}
