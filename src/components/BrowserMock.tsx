import { motion } from "motion/react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Globe,
  LockKeyhole,
  MousePointer2,
  ShieldCheck,
  Users,
  FileText,
  CreditCard,
  Bot,
  Sparkles,
} from "lucide-react";
import type { Session } from "../types";
import { getSessionCohort } from "../simulation/selectors";
import { useDecision } from "../intelligence/store";
import { sampleProjects } from "../workspace/catalog";
import "../session.css";

export interface BrowserMockProps {
  session: Session;
  time: number;
  heatmap?: "ai" | "human" | "combined" | null;
  large?: boolean;
}

function BotIcon() {
  return <Bot size={21} />;
}

function SampleProductScene({
  session,
  time,
}: {
  session: Session;
  time: number;
}) {
  const product = session.product!;
  const advanced = time >= 9;
  return (
    <section
      className={`sample-browser-scene sample-scene-${product.category}`}
    >
      <nav>
        <strong>
          {product.name}
          <span>.</span>
        </strong>
        <span>
          {product.category === "meetings"
            ? "Meetings / Weekly product sync"
            : product.category === "fintech"
              ? "Your account / Verification"
              : "Hiring / Product designer"}
        </span>
        <i>{session.initials}</i>
      </nav>
      {product.category === "meetings" ? (
        <>
          <span className="sample-scene-eyebrow">MEETING INTELLIGENCE</span>
          <h3>Weekly product sync</h3>
          <p className="sample-scene-sub">
            Wednesday · 32 minutes · 4 participants
          </p>
          <div className="sample-meeting-summary">
            <span>
              <Sparkles size={15} />
              Reviewed summary
            </span>
            <p>
              The team agreed to ship the new onboarding flow after customer
              feedback and a final design review.
            </p>
          </div>
          <div className="sample-action">
            <span>01</span>
            <div>
              <strong>Review onboarding with five customers</strong>
              <p>Owner: Jamie · Friday</p>
            </div>
            <b>{advanced ? "Approved" : "Review"}</b>
          </div>
          <div className="sample-action">
            <span>02</span>
            <div>
              <strong>Finalize the empty-state designs</strong>
              <p>Owner: Morgan · Tomorrow</p>
            </div>
            <b>Review</b>
          </div>
          <div className="sample-source">
            <FileText size={14} />
            <span>Source transcript · 14:32</span>
            <p>
              “Let’s make sure five customers can finish it before we release.”
            </p>
          </div>
        </>
      ) : product.category === "fintech" ? (
        <>
          <span className="sample-scene-eyebrow">GET SET UP</span>
          <h3>Verify your identity.</h3>
          <p className="sample-scene-sub">A few details, then you’re ready.</p>
          <div className="sample-verification-steps">
            <span className="done">
              <Check size={13} />
              Your details
            </span>
            <span className="selected">2 · Identity</span>
            <span>3 · Confirm</span>
          </div>
          <div className="sample-upload">
            <ShieldCheck size={31} />
            <strong>
              {advanced ? "Upload a photo ID" : "One more step to get started"}
            </strong>
            <p>Passport or driver’s licence</p>
            <div>
              Choose a document <ArrowUpRight size={12} />
            </div>
          </div>
          <div className="sample-privacy-question">
            <LockKeyhole size={13} />
            Why do you need my ID? <ChevronRight size={13} />
          </div>
          <span className="sample-save-later">Save and continue later</span>
        </>
      ) : (
        <>
          <span className="sample-scene-eyebrow">YOUR SHORTLIST</span>
          <h3>Find the right fit.</h3>
          <p className="sample-scene-sub">
            Senior Product Designer · 8 candidates
          </p>
          {[
            { name: "Casey Avery", role: "7 years · B2B SaaS", score: 94 },
            {
              name: "Drew Taylor",
              role: "6 years · Design systems",
              score: 89,
            },
            { name: "Robin Lane", role: "5 years · Marketplace", score: 84 },
          ].map((person, index) => (
            <div
              className={`sample-candidate ${index === 0 ? "top-match" : ""}`}
              key={person.name}
            >
              <i>
                {person.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </i>
              <div>
                <strong>{person.name}</strong>
                <p>{person.role}</p>
                {advanced && index === 0 && (
                  <span>Portfolio + experience + role alignment</span>
                )}
              </div>
              <b>
                {person.score}
                <small>% match</small>
              </b>
            </div>
          ))}
          <div className="sample-ranking">
            <Sparkles size={14} />
            <span>
              {advanced
                ? "Inspect the criteria behind this ranking"
                : "Ranked for your role"}
            </span>
            <ChevronRight size={13} />
          </div>
        </>
      )}
    </section>
  );
}

export default function BrowserMock({
  session,
  time,
  heatmap = null,
  large = false,
}: BrowserMockProps) {
  const event =
    [...session.events].reverse().find((item) => item.at <= time) ||
    session.events[0];
  const finished = time >= session.duration;
  const { committedActionIds } = useDecision();
  let route =
    [...session.events].reverse().find((item) => item.at <= time && item.route)
      ?.route || "/";
  if (
    event &&
    /privacy|private-product|security/i.test(event.text) &&
    ["focus", "search", "hover"].includes(event.type)
  )
    route = "/privacy";
  if (
    event &&
    /pricing|cost of|commitment/i.test(event.text) &&
    event.type === "search"
  )
    route = "/pricing";
  const version2 =
    Boolean(session.evidenceIds[0]?.startsWith("v2-")) &&
    committedActionIds.length > 0;
  const heroChanged = version2 && committedActionIds.includes("orchestration");
  const handoffChanged = version2 && committedActionIds.includes("model");
  const commitmentChanged = version2 && committedActionIds.includes("pricing");
  const destination =
    session.product ||
    [
      "/new-test",
      "/first-test",
      "/privacy",
      "/pricing",
      "/how-it-works",
    ].includes(route);
  const click = event?.type === "click" || event?.type === "task_success";
  const scroll = destination
    ? 0
    : Math.min(large ? 1100 : 750, (event?.scroll || 0) * (large ? 1.75 : 1.2));
  const path = session.events
    .filter((item) => item.at <= time)
    .map((item) => `${item.x},${item.y}`)
    .join(" ");
  const heatmapCohort = (
    session.product
      ? sampleProjects.find((product) => product.name === session.product?.name)
          ?.sessions || [session]
      : getSessionCohort(version2 ? 2 : 1)
  ).filter((item) =>
    heatmap === "combined"
      ? item.source === "ai" || item.source === "human"
      : item.source === heatmap,
  );
  const heatmapEvents = heatmap
    ? heatmapCohort.flatMap((item) =>
        item.events.filter((marker) =>
          ["click", "hover", "hesitation"].includes(marker.type),
        ),
      )
    : [];
  return (
    <div className={`browser-mock ${large ? "browser-mock-large" : ""}`}>
      <div className="browser-chrome">
        <div className="browser-dots">
          <i />
          <i />
          <i />
        </div>
        <div className="browser-address">
          <LockKeyhole size={10} />
          <span>
            {session.product?.url || "tryplayground.net"}
            {route === "/" ? "" : route}
          </span>
        </div>
        <Globe size={12} className="browser-globe" />
      </div>
      <div className="browser-stage">
        <motion.div
          className="browser-site"
          animate={{ y: -scroll }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        >
          {session.product ? (
            <SampleProductScene session={session} time={time} />
          ) : (
            <>
              <nav className="site-mini-nav">
                <div className="site-mini-wordmark">
                  <span className="site-mini-brandmark" />
                  playground
                </div>
                <div className="site-mini-links">
                  <span>How it works</span>
                  <span>
                    Sign in <ArrowUpRight size={8} />
                  </span>
                </div>
              </nav>
              {route === "/privacy" ? (
                <section className="site-mini-trust">
                  <span className="mini-page-icon">
                    <ShieldCheck size={24} />
                  </span>
                  <span className="site-mini-label">
                    PRIVATE PRODUCTS. PUBLIC CONFIDENCE.
                  </span>
                  <h3>
                    Before you share
                    <br />
                    your next big thing.
                  </h3>
                  <p>What happens to your product once testing starts?</p>
                  <div className="mini-trust-row">
                    <LockKeyhole size={14} />
                    <div>
                      <strong>Who gets access?</strong>
                      <span>
                        {commitmentChanged
                          ? "Only the testers matched to your mission."
                          : "Ask us about private product access."}
                      </span>
                    </div>
                    <ChevronRight size={12} />
                  </div>
                  <div className="mini-trust-row">
                    <FileText size={14} />
                    <div>
                      <strong>What gets recorded?</strong>
                      <span>
                        {commitmentChanged
                          ? "Session behavior and research evidence, with a clear scope."
                          : "Review the session scope with the team."}
                      </span>
                    </div>
                    <ChevronRight size={12} />
                  </div>
                  <div className="mini-trust-row">
                    <ShieldCheck size={14} />
                    <div>
                      <strong>Can I control the scope?</strong>
                      <span>
                        {commitmentChanged
                          ? "Approve product access before the test runs."
                          : "Contact Playground for private testing."}
                      </span>
                    </div>
                    <ChevronRight size={12} />
                  </div>
                </section>
              ) : route === "/pricing" ? (
                <section className="site-mini-pricing">
                  <span className="site-mini-label">
                    START WITH ONE GOOD QUESTION.
                  </span>
                  <h3>
                    Your first test.
                    <br />A clear next move.
                  </h3>
                  <p>
                    {commitmentChanged
                      ? "Review the scope and cost before your mission launches."
                      : "How much does a first experiment cost?"}
                  </p>
                  <div className="mini-test-package">
                    <span>
                      <CreditCard size={17} />
                      FIRST TEST
                    </span>
                    <strong>
                      {commitmentChanged
                        ? "Scope first. Then go."
                        : "Let’s talk testing."}
                    </strong>
                    <div>
                      <Check size={12} />
                      AI behavioral screening
                    </div>
                    <div>
                      <Check size={12} />
                      Matched founder sessions
                    </div>
                    <div>
                      <Check size={12} />
                      Evidence and a clear decision
                    </div>
                    <div className="site-mini-cta">
                      {commitmentChanged
                        ? "Build your test plan"
                        : "Ask about your first test"}
                      <ArrowUpRight size={10} />
                    </div>
                  </div>
                </section>
              ) : route === "/how-it-works" ? (
                <section className="site-mini-explainer">
                  <span className="site-mini-label">
                    FROM A QUESTION TO A CALL.
                  </span>
                  <h3>
                    AI screens it.
                    <br />
                    <span>Real people prove it.</span>
                  </h3>
                  <p>
                    {heroChanged
                      ? "Playground chooses what to test, how to test it, and who should do it."
                      : "Bring your product and the question you need answered."}
                  </p>
                  <div className="mini-explainer-flow">
                    <div>
                      <BotIcon />
                      <span>01 / SCREEN</span>
                      <strong>Scout explores.</strong>
                      <p>Different personas find repeated patterns.</p>
                    </div>
                    <ChevronRight size={15} />
                    <div>
                      <Users size={21} />
                      <span>02 / VALIDATE</span>
                      <strong>Founders react.</strong>
                      <p>Real perspectives test what the patterns mean.</p>
                    </div>
                    <ChevronRight size={15} />
                    <div>
                      <Sparkles size={21} />
                      <span>03 / DECIDE</span>
                      <strong>Experts connect.</strong>
                      <p>Evidence becomes a clear next move.</p>
                    </div>
                  </div>
                  {handoffChanged && (
                    <div className="mini-handoff-callout">
                      AI predictions are screening. Human sessions validate the
                      decision.
                    </div>
                  )}
                </section>
              ) : route === "/new-test" ? (
                <section className="site-mini-new-test">
                  <span className="site-mini-label">LET’S FIND OUT.</span>
                  <h3>
                    What do you need
                    <br />
                    to know?
                  </h3>
                  <div className="mini-form-field">
                    <span>YOUR PRODUCT</span>
                    <strong>https://tryplayground.net</strong>
                  </div>
                  <div className="mini-form-field">
                    <span>YOUR QUESTION</span>
                    <p>
                      {session.id.endsWith("-draft")
                        ? session.goal
                        : "Do startup founders understand what Playground does and would they try it?"}
                    </p>
                  </div>
                  <div className="site-mini-cta">
                    Build test plan <Sparkles size={10} />
                  </div>
                  <p className="mini-form-footnote">
                    A product. A question. A clear next move.
                  </p>
                </section>
              ) : route === "/first-test" ? (
                <section className="site-mini-first-test">
                  <span className="site-mini-label">YOUR FIRST TEST</span>
                  <h3>
                    A little less risk.
                    <br />A lot more clarity.
                  </h3>
                  <p>Bring your URL and the question keeping you up.</p>
                  <div>
                    <Check size={12} />A plan built for your product
                  </div>
                  <div>
                    <Check size={12} />
                    AI screening + matched founders
                  </div>
                  <div>
                    <Check size={12} />
                    Evidence. Recommendations. A decision.
                  </div>
                  {commitmentChanged && (
                    <strong>See the scope and cost before you run.</strong>
                  )}
                  <div className="site-mini-cta">
                    Start testing <ArrowUpRight size={11} />
                  </div>
                </section>
              ) : (
                <>
                  <section
                    className={`site-mini-hero ${heroChanged ? "mini-hero-v2" : ""}`}
                  >
                    <span className="site-mini-pill">
                      <span /> THE VALIDATION ENGINE FOR SOFTWARE
                    </span>
                    <h2>
                      {heroChanged ? (
                        <>
                          Know what to test.
                          <br />
                          <span>And who should test it.</span>
                        </>
                      ) : (
                        <>
                          You built it.
                          <br />
                          <span>Will people want it?</span>
                        </>
                      )}
                    </h2>
                    <p>
                      {heroChanged ? (
                        <>
                          Give Playground your product and a question.
                          <br />
                          We choose the method, match testers, and make the
                          call.
                        </>
                      ) : (
                        <>
                          Find out what people want, where they get stuck,
                          <br />
                          and what to fix before you launch.
                        </>
                      )}
                    </p>
                    <div className="site-mini-cta">
                      Start testing <ArrowUpRight size={11} />
                    </div>
                    {handoffChanged && (
                      <div className="mini-v2-handoff">
                        <span>AI screens it</span>
                        <ChevronRight size={8} />
                        <span>Founders prove it</span>
                        <ChevronRight size={8} />
                        <span>Experts explain why</span>
                      </div>
                    )}
                    <img
                      className="site-mini-landscape"
                      src="/brand/landscape.png"
                      alt="Playground's illustrated landscape"
                    />
                  </section>
                  <section className="site-mini-workflow">
                    <span className="site-mini-label">
                      BUILD WITH CONVICTION.
                    </span>
                    <h3>
                      Less guessing.
                      <br />
                      More knowing.
                    </h3>
                    <p>
                      Bring a product. Ask a question.
                      <br />
                      We’ll find the right way to answer it.
                    </p>
                    <div className="site-mini-steps">
                      <div>
                        <span>01</span>
                        <strong>AI screens it.</strong>
                        <p>Explore every angle.</p>
                      </div>
                      <div>
                        <span>02</span>
                        <strong>
                          {handoffChanged
                            ? "Real founders prove it."
                            : "Real users prove it."}
                        </strong>
                        <p>See what actually happens.</p>
                      </div>
                      <div>
                        <span>03</span>
                        <strong>
                          {handoffChanged
                            ? "Experts explain why."
                            : "Ship with confidence."}
                        </strong>
                        <p>Let evidence make the call.</p>
                      </div>
                    </div>
                  </section>
                  <section className="site-mini-model">
                    <Sparkles size={18} />
                    <h3>
                      Different question.
                      <br />
                      Different tester.
                      <br />
                      Same Playground.
                    </h3>
                    <div className="site-mini-chips">
                      <span>AI personas</span>
                      <span>Real founders</span>
                      <span>Domain experts</span>
                    </div>
                  </section>
                  <section className="site-mini-bottom">
                    <span className="site-mini-label">
                      YOUR NEXT GREAT DECISION STARTS HERE.
                    </span>
                    <h3>
                      Stop guessing.
                      <br />
                      Start testing.
                    </h3>
                    <div className="site-mini-cta">
                      Start your first test <ChevronRight size={11} />
                    </div>
                    <p>
                      {commitmentChanged
                        ? "See the test scope and cost before you run."
                        : "No guesswork. Just evidence."}
                    </p>
                    <div className="site-mini-proof">
                      <Check size={11} /> AI + real people <Check size={11} />{" "}
                      Built for builders
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </motion.div>
        {heatmap && (
          <div
            className={`browser-heatmap heatmap-${heatmap}`}
            aria-label={`${heatmap} attention heatmap`}
          >
            {heatmapEvents.map((marker, index) => (
              <i
                className={`heatspot heatspot-recorded ${marker.type === "click" ? "heatspot-click" : ""}`}
                key={index}
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
              />
            ))}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline
                points={path}
                fill="none"
                stroke="var(--orange, #ff7548)"
                strokeWidth="0.5"
                strokeDasharray="1.4 1"
              />
              {session.events
                .filter((item) => item.at <= time && item.type === "click")
                .map((item, index) => (
                  <circle
                    key={index}
                    cx={item.x}
                    cy={item.y}
                    r="1.2"
                    fill="#ff7548"
                  />
                ))}
            </svg>
            <span className="heatmap-legend">
              {heatmapCohort.length}{" "}
              {heatmap === "ai"
                ? "AI personas"
                : heatmap === "human"
                  ? "human participants"
                  : "participants"}{" "}
              · attention + cursor path
            </span>
          </div>
        )}
        {!finished && time >= 0 && event && (
          <motion.div
            className="sim-cursor"
            animate={{ left: `${event.x}%`, top: `${event.y}%` }}
            transition={{
              duration: event.type === "hesitation" ? 1.4 : 0.85,
              ease: [0.25, 0.1, 0.25, 1],
            }}
          >
            {click && (
              <motion.span
                key={`${event.at}-${time.toFixed(0)}`}
                className="cursor-click"
                initial={{ opacity: 0.7, scale: 0.4 }}
                animate={{ opacity: 0, scale: 2.3 }}
                transition={{ duration: 1.2 }}
              />
            )}
            <MousePointer2
              size={large ? 23 : 19}
              fill={session.source === "human" ? "#ff7548" : "#168ef9"}
              stroke="white"
              strokeWidth={1.5}
            />
            <span
              style={{
                background: session.source === "human" ? "#c95535" : "#1275ce",
              }}
            >
              {session.source === "ai"
                ? session.name.replace("Scout ", "S")
                : session.name.split(" ")[0]}
            </span>
          </motion.div>
        )}
        {finished && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="browser-finished"
          >
            <span>
              <Check size={12} />
              Session complete
            </span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
