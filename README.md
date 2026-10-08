# Playground

An interactive investor demo of **the validation engine for software**. Give Playground a product and a question; watch it build a strategy, orchestrate Scout personas and matched founders, collect evidence, and make a ship / iterate decision.

The hero is Playground testing Playground. All participants, research, expert reviews, scores, and projections are synthetic. No authentication, backend, API keys, or external services are required.

## Run

Requires Node.js 22.12+ (or 24+) and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The default question and product URL are already filled in.

```sh
npm run build
npm run preview
```

The production build includes an offline service worker. Open the production preview once and let its local assets cache; it can then reload and open direct routes offline. Development also works without internet as long as the local Vite server is running. Fonts, branding, and browser replicas are bundled locally.

## The three-minute pitch

1. **Projects → New test → Build test plan.** The engine assembles a strategy in five seconds.
2. **Run test.** Watch the synthetic founder matching funnel and Scout fleet launch.
3. **Live.** Four scripted browsers navigate the product while signals and confidence arrive. Click any session to replay it; click the emerging AI / human pattern to inspect its evidence.
4. **Report.** The baseline score is **74 / 100 · ITERATE**. Every finding traces to sessions and evidence.
5. **Create version 2 → Apply all three changes & retest.** An eight-second retest shows **86 / 100 · READY TO SHIP** with improved signals, four improved findings, and a remaining trust follow-up.

## Demo controls

Open **Demo mode** in the sidebar for start, pause / resume, instant results, replay analysis, replay session, reset, and 1× / 2× / 4× / 8× speed. Playback state is saved in localStorage. Reset restores the original URL, question, study settings, and cohort; the selected speed and presentation preference remain.

| Shortcut     | Action                                     |
| ------------ | ------------------------------------------ |
| ⌘ K / Ctrl K | Command palette                            |
| P            | Presentation mode                          |
| Space        | Pause / resume the main simulation         |
| Shift R      | Reset demo                                 |
| Escape       | Close primary overlays / exit presentation |

Replay has a separate clock with pause, restart, event seeking, 0.5× / 1× / 2× / 4× playback, and attention/path overlays. Report export downloads a readable Markdown file; print produces a clean report.

## Architecture

React + TypeScript + Vite, React Router, Motion, Lucide, and custom CSS. Local Manrope typography and brand assets were inspected and sourced from tryplayground.net.

- `src/data/demo.ts`: one canonical fixture graph: 20 AI sessions, five founder sessions, two expert sessions, one separate UX specialist, six findings, and version-two outcomes.
- `src/simulation/store.ts`: deterministic phase machine and virtual clock; robust localStorage restoration, speed changes, interruption recovery, and idempotent run actions.
- `src/simulation/selectors.ts`: observed evidence, session status, cohort counts, confidence, and scores derived from participant records.
- `src/components/BrowserMock.tsx` and `ReplayModal.tsx`: local browser replicas with scripted routes, scrolling, cursor movement, clicks, and seeks.
- `src/pages/`: dashboard, test creation/plan, live mission control, sessions, Scout, tester network, evidence, findings, report, comparison, and settings.

V1 has 146 cohort evidence records plus three specialist records; V2 has its own linked evidence and replay scripts. Scores are observation indices, distinct from binary completion rates. The validation index weights comprehension 40%, usability 28%, trust 12%, trial intent 10%, and AI / human clarity 10%. All visible aggregates are calculated from the same session records.

## Verification

```sh
npm run lint
npm test
npm run build
```

Unit tests cover fixture relationships, exact scores, timing, persistence, invalid saved data, pause/resume, repeated clicks, reset, skip, selected retest scopes, evidence reciprocity, committed/draft isolation, and question-aware strategy. With a dev server running, `npm run test:demo` runs the Chrome click-path/reliability checks (Chrome must be installed). Override the target URL with `PLAYGROUND_URL` if Vite chooses another port.

With a production preview running, `npm run test:offline` checks a fully offline reload, plan generation, matching, four live browsers, and direct report navigation. Override `PLAYGROUND_PREVIEW_URL` if the preview uses another port.

No real products are analysed and no people are recruited. Editable URLs and questions change the brief; the locally available synthetic cohort supplies the demo outcomes.

## Decision workspace

The validation map connects the question, strategy, participant journeys, evidence and verdict. Its assumption register uses explicit criteria; a local question backlog carries the next question into a new study. The study builder previews a question-specific strategy and saves audience, stage, risk and depth settings.

The observation room shows one focused browser and three concurrent perspectives. Switch AI, founder or expert lanes, inspect any event, or open the full replay. Scout's persona studio lets you change behavioral parameters and run a separate local preview; recorded research remains intact.

Evidence has an interactive graph and a searchable signal library. Inspect assumption → finding → source connections, filter by AI/founder/expert, and expand the supporting records. Reports distinguish participant percentages from rating indices, compare AI and founder responses, and export the selected version.

**Changes** is the V2 workbench. Select any combination of the three recommendations, inspect the changed website, and run that scope. All three reproduce 86; a single change has a smaller effect; an unchanged control remains 74. Draft selections never alter an existing V2 report. The retest commits the selected scope and derives participant ratings, outcomes, events, quotes, findings and evidence from it. These effects are deterministic synthetic projections.

Atlas, Flux and Northstar are complete fictional sample studies, each with five participant records, product-specific browser scenes, replayable evidence, derived scores and study export.

```sh
npm run test:intelligence
```

The additional Chrome check exercises partial retests, unchanged controls, committed-versus-draft isolation, version-aware evidence, exports and graph filters. It uses the same `PLAYGROUND_URL` override as `test:demo`.

## Vercel

`vercel.json` configures the Vite build, `dist` output, SPA deep links, and service-worker revalidation. `.vercelignore` excludes dependencies, build artifacts and screenshots from source uploads. No environment variables are required.

To deploy into your Vercel account:

```sh
npx vercel login
npx vercel deploy --prod
```

Vercel CLI also supports `deploy --temporary --yes` without signing in. Temporary deployments expire after 60 minutes unless claimed using the ownership link returned by the CLI. Local Vercel credentials and project metadata are excluded from Git.

Verify a hosted deployment using the same browser checks:

```sh
PLAYGROUND_URL=https://your-project.vercel.app npm run test:intelligence
PLAYGROUND_PREVIEW_URL=https://your-project.vercel.app npm run test:offline
```
