import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Download,
  MessageSquare,
  Play,
  Users,
} from "lucide-react";
import { sampleProjects, sampleScore } from "../workspace/catalog";
import type { Session } from "../types";

export default function Project({
  onReplay,
}: {
  onReplay: (session: Session) => void;
}) {
  const { id } = useParams();
  const project = sampleProjects.find((p) => p.id === id);
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  if (!project)
    return (
      <div className="empty-state">
        <h1>We couldn’t find that product.</h1>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/dashboard")}
        >
          Back to projects
          <ArrowRight size={16} />
        </button>
      </div>
    );
  const success = project.sessions.filter(
    (s) => s.taskResult === "success",
  ).length;
  const exportStudy = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            project: project.name,
            question: project.question,
            method: "Synthetic local demonstration",
            score: sampleScore(project),
            verdict: project.verdict,
            sessions: project.sessions,
            recommendations: project.changes,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.id}-study.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="sample-project-page">
      <button
        className="text-link sample-back"
        onClick={() => navigate("/dashboard")}
      >
        <ArrowLeft size={15} />
        All products
      </button>
      <div className="page-heading">
        <div className="sample-page-title">
          <span
            className="sample-product-mark"
            style={{ background: project.color }}
          >
            {project.name[0].toLowerCase()}
            <span>.</span>
          </span>
          <div>
            <div className="eyebrow">SYNTHETIC STUDY / COMPLETE</div>
            <h1>{project.name}</h1>
            <p className="muted">
              {project.category} · {project.stage}
            </p>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={exportStudy}>
          <Download size={16} />
          Export study
        </button>
      </div>
      <section className="sample-study-mission">
        <div>
          <span className="eyebrow">THE QUESTION</span>
          <h2>{project.question}</h2>
          <p>Participant task: {project.mission}</p>
        </div>
        <div>
          <strong>
            {sampleScore(project)}
            <small>/100</small>
          </strong>
          <span>
            {project.verdict.startsWith("SHIP")
              ? "Ship with guardrails"
              : "Iterate before launch"}
          </span>
        </div>
      </section>
      <nav className="sample-study-tabs">
        {["overview", "sessions", "evidence"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
            {t !== "overview" && <span>{t === "sessions" ? 5 : 10}</span>}
          </button>
        ))}
      </nav>
      {tab === "overview" ? (
        <>
          <div className="sample-overview-grid">
            <section className="sample-study-summary">
              <div className="eyebrow">THE ANSWER, WITH CONTEXT</div>
              <h2>
                {project.verdict.startsWith("SHIP")
                  ? "The value lands. Keep the safety net."
                  : "The promise is clear. The journey needs work."}
              </h2>
              <p>{project.summary}</p>
              <div className="sample-outcomes">
                <span>
                  <strong>{success}/5</strong>completed the task
                </span>
                <span>
                  <strong>5</strong>matched participants
                </span>
                <span>
                  <strong>10</strong>linked signals
                </span>
              </div>
              <button className="text-link" onClick={() => setTab("sessions")}>
                Inspect the participant journeys
                <ArrowRight size={16} />
              </button>
            </section>
            <aside className="sample-quote-card">
              <MessageSquare size={23} />
              <blockquote>“{project.sessions[1].quote}”</blockquote>
              <button onClick={() => onReplay(project.sessions[1])}>
                <span
                  className="avatar"
                  style={{ background: project.sessions[1].color }}
                >
                  {project.sessions[1].initials}
                </span>
                <span>
                  {project.sessions[1].name}
                  <small>{project.sessions[1].role}</small>
                </span>
                <Play size={16} />
              </button>
            </aside>
          </div>
          <div className="section-heading">
            <h2>What should change next</h2>
            <span className="badge badge-neutral">
              LINKED TO PARTICIPANT SIGNALS
            </span>
          </div>
          <div className="sample-change-grid">
            {project.changes.map((change, i) => (
              <section key={change.title}>
                <span className="eyebrow">PRIORITY 0{i + 1}</span>
                <h3>{change.title}</h3>
                <p>{change.reason}</p>
                <button
                  className="text-link"
                  onClick={() =>
                    onReplay(
                      project.sessions.find(
                        (s) => s.id === change.sessionIds[0],
                      )!,
                    )
                  }
                >
                  {change.sessionIds.length} supporting sessions
                  <ArrowUpRight size={16} />
                </button>
              </section>
            ))}
          </div>
          <div className="sample-method-note">
            <Users size={20} />
            <div>
              <strong>About this sample study</strong>
              <p>
                Five locally scripted participant journeys demonstrate the
                workflow. Scores derive from those records; they are synthetic
                observations of a fictional product.
              </p>
            </div>
            <button
              className="text-link"
              onClick={() =>
                navigate("/new-test", { state: { question: project.question } })
              }
            >
              Test your next question
              <ArrowRight size={16} />
            </button>
          </div>
        </>
      ) : tab === "sessions" ? (
        <section className="sample-session-list">
          {project.sessions.map((session) => (
            <button key={session.id} onClick={() => onReplay(session)}>
              <span className="avatar" style={{ background: session.color }}>
                {session.initials}
              </span>
              <span>
                <strong>{session.name}</strong>
                <small>
                  {session.role} · {session.location}
                </small>
              </span>
              <span className="sample-session-task">
                {session.observations[0]}
              </span>
              <span
                className={`badge ${session.taskResult === "success" ? "badge-green" : "badge-orange"}`}
              >
                {session.taskResult === "success" ? <Check size={12} /> : null}
                {session.taskResult === "success" ? "Completed" : "Partial"}
              </span>
              <strong>
                {session.comprehension}
                <small>/100</small>
              </strong>
              <Play size={17} />
            </button>
          ))}
        </section>
      ) : (
        <div className="sample-evidence-grid">
          {project.sessions.flatMap((session) =>
            [
              { type: "PARTICIPANT QUOTE", detail: session.quote },
              { type: "BEHAVIOR OBSERVATION", detail: session.observations[0] },
            ].map((signal, i) => (
              <button
                key={`${session.id}-${i}`}
                onClick={() => onReplay(session)}
              >
                <span className="eyebrow">{signal.type}</span>
                <p>{i === 0 ? `“${signal.detail}”` : signal.detail}</p>
                <div>
                  <span
                    className="avatar"
                    style={{ background: session.color }}
                  >
                    {session.initials}
                  </span>
                  <span>
                    {session.name}
                    <small>{session.role}</small>
                  </span>
                  <ArrowUpRight size={17} />
                </div>
              </button>
            )),
          )}
        </div>
      )}
    </div>
  );
}
