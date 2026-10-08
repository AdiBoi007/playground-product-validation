import { motion } from "motion/react";
import { Check, Users, ArrowDown, ScanFace } from "lucide-react";
import { sessions } from "../data/demo";
import { useDemo } from "../simulation/store";
const funnel = [62, 31, 14, 8, 5];
const labels = [
  "in the demo network",
  "fit your audience",
  "available now",
  "high-confidence matches",
  "founders selected",
];
export default function Matching() {
  const { state } = useDemo();
  const step = Math.min(4, Math.floor(state.clock / 0.7));
  return (
    <div className="matching-wrap">
      <div className="eyebrow">
        <span className="live-dot" /> FINDING YOUR PEOPLE
      </div>
      <h1>
        Different question.
        <br />
        The right testers.
      </h1>
      <p className="muted">
        Scout is ready. Your founder cohort is coming together.
      </p>
      <div className="matching-layout">
        <div className="match-funnel">
          {funnel.map((n, i) => (
            <motion.div
              key={n}
              className={`funnel-row ${i <= step ? "selected" : ""}`}
              animate={{ opacity: i <= step ? 1 : 0.25, x: i <= step ? 0 : 10 }}
            >
              <span className="funnel-number">{n}</span>
              <span>{labels[i]}</span>
              {i < 4 ? <ArrowDown size={16} /> : <Check size={18} />}
            </motion.div>
          ))}
        </div>
        <div className="matching-people">
          {sessions
            .filter((s) => s.source === "human")
            .map((s, i) => (
              <motion.div
                className="matching-person"
                key={s.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: step >= 2 ? 1 : 0.35, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <span className="avatar" style={{ background: s.color }}>
                  {s.initials}
                </span>
                <div>
                  <strong>{s.name}</strong>
                  <span>
                    {s.role} · {s.location}
                  </span>
                </div>
                <span className="match-score">
                  {s.match}% <Check size={13} />
                </span>
              </motion.div>
            ))}
        </div>
      </div>
      <div className="matching-confirm">
        <span>
          <ScanFace size={18} />
          20 Scout personas ready
        </span>
        <span>
          <Users size={18} />2 expert slots confirmed
        </span>
        <span>
          <Check size={18} />1 UX specialist confirmed
        </span>
      </div>
      <p className="fine-print">
        Synthetic participants in a deterministic demo network.
      </p>
    </div>
  );
}
