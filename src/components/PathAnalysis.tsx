import { ArrowRight, ArrowUpRight, Route } from "lucide-react";
import { useDemo } from "../simulation/store";
import { getSessionStatus, getSessionCohort } from "../simulation/selectors";
import type { Session } from "../types";

export default function PathAnalysis({
  onReplay,
}: {
  onReplay: (session: Session) => void;
}) {
  const { state } = useDemo();
  const clock = ["complete", "v2-complete"].includes(state.phase)
    ? 50
    : ["running", "analysing-results"].includes(state.phase)
      ? state.clock
      : 0;
  const cohort = getSessionCohort(state.version).filter(
    (session) =>
      ["ai", "human"].includes(session.source) &&
      getSessionStatus(session, clock) === "completed",
  );
  const pricing = (session: Session) =>
    session.events.some(
      (event) =>
        event.type === "search" && event.text.toLowerCase().includes("pricing"),
    );
  const groups = [
    {
      steps: ["Landing", "Workflow", "CTA", "Start test"],
      items: cohort.filter((session) => session.ctaFound && !pricing(session)),
      tone: "blue",
    },
    {
      steps: ["Landing", "Pricing search", "Back", "Start test"],
      items: cohort.filter((session) => session.ctaFound && pricing(session)),
      tone: "orange",
    },
    {
      steps: ["Landing", "Explanation", "Hesitation", "Exit"],
      items: cohort.filter((session) => !session.ctaFound),
      tone: "neutral",
    },
  ];
  return (
    <section className="behavior-paths panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <Route size={13} /> BEHAVIOUR, IN CONTEXT
          </span>
          <h2>Different paths. A clearer picture.</h2>
        </div>
        <span className="muted">
          {cohort.length} completed participant sessions
        </span>
      </div>
      {cohort.length ? (
        groups
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <button
              className={`behavior-path path-${group.tone}`}
              key={group.tone}
              onClick={() => onReplay(group.items[0])}
            >
              <div>
                {group.steps.map((step, index) => (
                  <span key={step}>
                    {index > 0 && <ArrowRight size={12} />}
                    <strong>{step}</strong>
                  </span>
                ))}
              </div>
              <span>
                {Math.round((group.items.length / cohort.length) * 100)}%
                <small>{group.items.length} sessions</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))
      ) : (
        <p className="path-awaiting">
          Paths take shape as participants finish. Their clicks, detours, and
          final decisions will connect here.
        </p>
      )}
    </section>
  );
}
