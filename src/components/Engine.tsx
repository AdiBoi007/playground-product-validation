import { motion } from "motion/react";
import {
  Check,
  ScanLine,
  Route,
  Fingerprint,
  FlaskConical,
  Users,
  ArrowRight,
} from "lucide-react";
import { useDemo } from "../simulation/store";
import { buildStrategy } from "../intelligence/model";
import { useStrategyOptions } from "../workspace/strategy";

const steps = [
  {
    title: "Inspecting your product",
    detail: "B2B SaaS · early-stage · validation engine",
    Icon: ScanLine,
  },
  {
    title: "Mapping the first impression",
    detail: "Landing → value proposition → workflow → trust → CTA",
    Icon: Route,
  },
  {
    title: "Finding the risky assumptions",
    detail: "Comprehension · AI + humans · trial intent",
    Icon: Fingerprint,
  },
  {
    title: "Choosing how to test them",
    detail: "Behavioural screening + moderated founder sessions",
    Icon: FlaskConical,
  },
  {
    title: "Building the right cohort",
    detail: "20 Scout personas · 5 founders · 2 experts",
    Icon: Users,
  },
];

export default function Engine() {
  const { state } = useDemo();
  const options = useStrategyOptions();
  const strategy = buildStrategy(state.question, options);
  const strategySteps = steps.map((entry, index) => ({
    ...entry,
    detail: [
      `${options.stage} · ${options.audience} · ${options.risk} decision risk`,
      strategy.journeys.join(" → "),
      strategy.assumptions.slice(0, 2).join(" "),
      strategy.methodology.slice(0, 2).join(" · "),
      "20 Scout personas · 5 founder profiles · 2 expert reviews",
    ][index],
  }));
  const step = Math.min(4, Math.floor(state.clock));
  return (
    <div className="engine-wrap">
      <div className="eyebrow">
        <span className="live-dot" /> PLAYGROUND ENGINE / STRATEGY IN MOTION
      </div>
      <h1>
        A good question deserves
        <br />a better test.
      </h1>
      <p className="muted">
        Working out what to test, how to test it, and who should test it.
      </p>
      <div className="engine-diagram">
        <div className="engine-question">
          <Fingerprint size={24} />
          <span>YOUR QUESTION</span>
          <p>{state.question}</p>
        </div>
        <div className="engine-connector">
          <motion.span
            animate={{ scaleX: [0, 1] }}
            transition={{ duration: 5 / state.speed }}
          />
          <ArrowRight size={20} />
        </div>
        <div className="engine-steps">
          {strategySteps.map(({ title, detail, Icon }, i) => (
            <motion.div
              key={title}
              className={`engine-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: i <= step ? 1 : 0.35, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <span className="engine-node">
                {i < step ? <Check size={17} /> : <Icon size={18} />}
              </span>
              <div>
                <strong>{title}</strong>
                <p>{i <= step ? detail : "Waiting for the previous signal"}</p>
              </div>
              {i < step && <Check className="engine-check" size={16} />}
            </motion.div>
          ))}
        </div>
      </div>
      <div className="engine-progress">
        <motion.div
          animate={{ width: `${Math.min(100, (state.clock / 5) * 100)}%` }}
          transition={{ duration: 0.15 }}
        />
      </div>
      <div className="engine-bottom">
        <span className="eyebrow">ONE QUESTION. THE RIGHT RESOURCES.</span>
        <span className="mono">
          {Math.min(100, Math.round((state.clock / 5) * 100))}% assembled
        </span>
      </div>
    </div>
  );
}
