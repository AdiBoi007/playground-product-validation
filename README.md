# Playground

Product testing and validation: define a question, approve an experiment, collect participant evidence, review findings, make changes and retest.

The workspace opens without login or signup. There are no seeded testers, feedback, research or validation scores. Campaigns and saved sandboxes persist in this browser's IndexedDB; separate devices have separate workspaces.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run setup
npm run dev
```

Add `OPENAI_API_KEY` to the blank field in `.env`, then restart Vite for AI experiment design and research. `SANDBOX_MODEL` defaults to `gpt-6-luna`; the local file also sets `OPENAI_MODEL` to it. These are server-only settings: never use a `VITE_` prefix. `.env` is excluded from Git and deployment uploads. Provider usage and web searches are charged separately; see [OpenAI pricing](https://developers.openai.com/api/docs/pricing).

## Sandbox workflow

Open **Sandbox** in Founder. Inputs include ideas, websites, Figma links, web applications, mobile-app information, screenshots and PDF/text/Markdown documents.

1. **Brief:** describe the product, users, objective, biggest assumption, desired outcome and decision. Set the success threshold. Missing essential information produces targeted clarification questions.
2. **Experiment:** generate AI tasks with instructions and measurable completion criteria. Edit and approve them before creating a campaign, or link an existing campaign.
3. **Run test:** complete the labelled simulated checkout. Add actual participant profiles and match five relevant testers in Operations. Deliver instructions through Tester or download a portable participant mission.
4. **Evidence:** record success, partial completion, blocking, failure, abandonment or assistance, plus answers, observations and optional measured times. Media requires consent. Operations requests revisions or approves useful feedback.
5. **Analytics and report:** inspect QA-approved success/failure, participant counts, median recorded times, distributions, severity and prioritized fixes. Filters and evidence links drill into anonymous participant observations. Verdicts are **Ship**, **Modify**, **Retest** or **Insufficient Evidence**, using explicit sample, task and review criteria.
6. **Retest:** record changes and create the next round. Prior reports remain intact. Comparisons flag changed task definitions and insufficient samples.

Unknown metrics say **Not yet tested**. Timings are measured or participant-reported; no recorder is injected into an external product. Publication requires five QA-approved participants. Research and AI predictions do not demonstrate product usability.

Operations can request **Generate evidence-backed fixes**. A bounded AI call uses approved written observations to draft specific changes and retest instructions with source references. The AI-labelled draft requires human review before publication; generation runs only when requested.

The **Research** tab retains conversational competitor, pricing, news and customer-signal analysis. OpenAI Responses live web search supplies retrieved sources and dated citations; structured synthesis labels inference separately. Follow-up messages update saved research. Provider failure returns an error rather than fabricated results. See official [web search](https://developers.openai.com/api/docs/guides/tools-web-search) and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) documentation.

Brief extraction accepts three files, 5 MB and 30,000 characters each; selectable-text PDFs support 50 pages. Validation also accepts screenshots as AI context. Material stays in browser storage; generation sends selected text/images to the provider. Failed research retains the last complete analysis and supports retry/cancellation. Stale concurrent saves are rejected. `/research` redirects to `/sandbox`; previous research records remain stored.

## Participants and exports

Download an assigned participant's HTML mission and deliver it yourself. Participants record outcomes/timing and consented evidence, then return downloaded feedback JSON. Operations confirms identity and consent and imports it into QA. Imports validate campaign, assignment, participant, approved mission snapshot and complete results. Identity and reported timestamps are manually confirmed, not independently authenticated. Files do not synchronize devices.

Export **PDF, DOCX, PPTX, XLSX, CSV, JSON, JSONL, interactive HTML or Markdown**. PDF contains executive summary, product overview, market landscape, methodology, analytics, findings, recommendations, verdict, next experiments and evidence appendix, with the exact Playground mark, charts, tables, page numbers and clickable evidence references. PPTX has editable charts; data formats include underlying observations.

Exports anonymize participant labels and omit media without recorded consent. The web report is a downloaded interactive HTML snapshot with filters and evidence links, not a hosted or permission-controlled share URL.

## Screens and operations

| Screen      | Route                                | Purpose                                       |
| ----------- | ------------------------------------ | --------------------------------------------- |
| Founder     | `/`, `/dashboard`                    | Campaigns and reports                         |
| Sandbox     | `/sandbox`                           | Validation, research and retest               |
| Create test | `/create`                            | Direct creation with editable task templates  |
| Campaign    | `/campaigns/:id`                     | Invitations and feedback progress             |
| Tester      | `/tester`, `/tester/assignments/:id` | Profiles and missions                         |
| Feedback    | `/tester/assignments/:id/feedback`   | Outcomes, timing, evidence and revisions      |
| Results     | `/campaigns/:id/results`             | Findings and the next round                   |
| Operations  | `/admin`                             | Recruitment, imports, QA, reports and payouts |

Approved/launched missions lock. Declined invitations free a slot. MVP defaults display **$149 USD per round** and **$15 USD per approved tester**. Simulated checkout never charges a card; the payout ledger records payments made manually and transfers no money.

Recruitment, eligibility and delivery coordination are manual. Market Twin runs founder-approved synthetic browser journeys in an isolated Chromium worker. Functional journeys execute configured steps; behavioural journeys use bounded model decisions. Both record actual screenshots, traces and assertion-backed metrics. axe-core audits and browser timings remain separate from synthetic behaviour, and synthetic personas do not measure market demand. Authenticated credentials for the product under test are not yet supported.

## Deploy and verify

See the [today rollout checklist](docs/ROLLOUT_TODAY.md) and the [workspace guide](docs/MVP_SETUP.md).

```sh
npm run lint
npm test
npm run build
npm run preview
npx vercel deploy --prod
```

Set server secrets separately in Vercel and configure the browser worker as described in the rollout checklist. Deployment excludes `.env`. Connected Supabase signup enables shared campaigns, private saved Sandboxes, evidence and auth; it does not copy existing device-local work.

With Chrome and a running app:

```sh
PLAYGROUND_URL=http://localhost:5173 npm run test:flow
PLAYGROUND_URL=http://localhost:5173 npm run test:sandbox
PLAYGROUND_URL=http://localhost:5173 npm run test:validation
```

Checks cover campaigns, QA and retest; research and recovery; validation, portable feedback, measured analytics and genuine export files. Test participants/provider fixtures exist only in isolated contexts. Live AI verification requires a key and consumes usage.

The production build caches the public shell/local assets for offline reading. AI needs internet. API responses and private server evidence are excluded from the service worker.

## Retained integration and structure

Six protected APIs and the Supabase migration remain for future shared service. They verify bearer tokens, ownership and Operations allowlists, use private evidence, verify Stripe signatures and lock paid-mission snapshots. The current device workspace does not call them or use live cloud payments. Retained tests include [rollback-only PostgreSQL acceptance](supabase/tests/checkout.sql).

Public research/experiment endpoints enforce same-origin requests, bounded payloads/provider time and process-local usage limits. Page inspection rejects private network targets. Research admits actual web-tool sources and signs source history.

- `src/mvp/SandboxValidationPanel.tsx`: validation workflow/dashboard.
- `src/mvp/validation.ts`: QA-derived metrics, dossier, verdict and comparisons.
- `src/mvp/validation-export.ts`: report exports.
- `src/mvp/human-handoff.ts`: portable mission and feedback validation.
- `src/mvp/model.ts`, `store.tsx`: campaign rules and persistence.
- `src/mvp/FounderPages.tsx`, `OperationsPages.tsx`: campaign/fulfilment views.
- `src/mvp/MarketResearchPage.tsx`, `sandbox.ts`, `sandbox-store.ts`: saved Sandbox/research.
- `api/experiments.ts`, `api/_lib/experiments.ts`: AI experiment design.
- `api/validation-findings.ts`: optional evidence-backed AI fix drafts.
- `api/sandbox.ts`, `api/_lib/sandbox-agent.ts`: live research.
- `supabase/migrations/`: retained protected integration.
