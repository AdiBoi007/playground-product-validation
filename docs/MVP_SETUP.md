# Playground workspace setup

Founder, Tester and Operations open without login/signup. Data persists in this browser; other devices have separate workspaces. Nothing is preloaded as participant evidence or validation results.

## Start and configure

```sh
npm ci
npm run dev
```

Add `OPENAI_API_KEY` to `.env` and restart Vite for AI experiment design/research. Local `SANDBOX_MODEL` and `OPENAI_MODEL` use `gpt-6-luna`. `SANDBOX_MODEL` controls Sandbox calls; `OPENAI_MODEL` is a fallback override and retained drafting setting. Set server variables separately in Vercel.

Never put secrets in `VITE_` variables. `.env` is excluded from Git/deployment uploads. Provider usage costs money, and searches add a separate charge; see [OpenAI pricing](https://developers.openai.com/api/docs/pricing). Human testing can run without AI; provider failure does not invent results.

## Validate a product

1. Open Founder → **Sandbox**. Supply an idea, website/Figma/application link, mobile-app information, screenshots or documents.
2. Complete **Brief** with product description, users, objective, assumption, desired outcome and decision. Choose a focus and success threshold. Essential missing inputs produce targeted clarification questions.
3. Generate and edit AI task instructions/completion criteria. Approve the mission and create a campaign, or link an existing suitable campaign. Approved missions lock; change a launched mission through a new round.
4. In **Run test**, complete labelled simulated checkout. Add five actual testers and their expertise, device and availability. Operations manually reviews relevance and assigns invitations.
5. Participants accept missions and record actual outcomes, answers, observations, optional measured times and evidence. Failure, abandonment and assistance remain distinct from unassisted success. Media requires consent.
6. Operations requests revisions or approves evidence. Only QA-approved observations contribute to analytics.
7. Review and publish the report once five participants pass QA. Inspect anonymous results, evidence filters, success/failure, median recorded times, distributions, severity and prioritized fixes in the Sandbox dossier.
8. After product changes, create a retest with the URL/change notes, approve tasks and collect fresh evidence. Previous reports remain saved; comparisons flag differing tasks and sample limitations.

Missing metrics say **Not yet tested**. Verdicts—Ship, Modify, Retest or Insufficient Evidence—use participant minimums, measurable criteria, thresholds, observed issues and reviewed publication. Research and AI recommendations are not behavioural validation evidence.

Operations can select **Generate evidence-backed fixes** for an optional AI draft. It uses QA-approved written observations and verified source references to propose product changes and retest instructions. Review the AI-labelled draft before publication. This is a separate, user-triggered provider call.

Timing comes from participant-operated timers or entered measured values; no external-product instrumentation is installed. Workspace screenshots accept PNG/JPEG/WebP/GIF up to 3 MB; recordings are HTTP(S) links.

## Participants on another device

Download their assigned HTML mission from **Run test** or Operations and deliver it yourself. Participants open it locally, follow approved tasks, record results/timing, confirm consent and attach evidence. They download feedback JSON and return it to the coordinator.

In Operations, select **Import participant feedback**, confirm identity/consent and import the returned file. Checks cover campaign, assignment, tester, approved mission snapshot and all required tasks. Imports enter normal QA and can require revision; they never publish automatically.

Identity and reported timestamps are not independently authenticated. Files do not synchronize workspaces. Portable missions accept two screenshots per task, up to 450 KB each; returned JSON is bounded at 25 MB.

## Research and inputs

The **Research** tab retains the saved chatbot: idea/link/pasted input, optional PDF/TXT/Markdown briefs, live competitor/pricing discovery, news and customer signals. Follow-ups update the same workspace. Retrieved facts link to sources; summaries/opportunities/risks are labelled inference. Public signals do not establish demand for this product.

Extract three briefs up to 5 MB/30,000 characters each. Selectable-text PDFs support 50 pages; scanned/password-protected PDFs need a text version. Validation accepts screenshots as AI context. Material stays in browser storage; requested generation sends selected text/images to the provider.

Messages, plans, research and source history persist locally. Failed/cancelled research keeps the last complete analysis; retries retain the message. Stale saves are rejected. Earlier research records remain stored; `/research` redirects to `/sandbox`.

`/api/experiments`, `/api/sandbox` and `/api/validation-findings` run in Vite dev/preview and Vercel. Same-origin requests, payload/time bounds and process-local concurrency/usage limits apply. Research admits real web-tool or signed earlier sources; page inspection blocks private targets/unsafe redirects.

## Exports

PDF, DOCX, PPTX, XLSX, CSV, JSON, JSONL, interactive HTML and Markdown are genuine downloadable files. Participant labels are anonymous; media without consent is omitted. PDF uses the exact Playground mark, measured charts, tables, page numbers and clickable citations/evidence, with:

1. Executive Summary
2. Product Overview
3. Market Landscape
4. Test Methodology
5. Analytics Dashboard
6. Key Findings
7. Recommendations
8. Validation Verdict
9. Next Experiments
10. Evidence Appendix

Absent test data says **Not yet tested**. The web report downloads an HTML snapshot with task/outcome filters and evidence links. It supplies no public URL, access control or expiring share; deliver the file through your chosen channel.

## Limits

Simulated checkout displays $149 USD/round and charges no card. Rewards default to $15 USD/approved tester; Operations records references after manual payment. The app transfers no payouts.

Recruitment, eligibility and delivery coordination are manual; no recruitment turnaround is guaranteed. Live cloud payments, authenticated product-test credentials, automated browser execution, instrumented funnels, expert reviews and synthetic audience simulations are not implemented/connected.

## Build, verify and host

```sh
npm run lint
npm test
npm run build
npm run preview
```

With Chrome and a running app:

```sh
PLAYGROUND_URL=http://localhost:5173 npm run test:flow
PLAYGROUND_URL=http://localhost:5173 npm run test:sandbox
PLAYGROUND_URL=http://localhost:5173 npm run test:validation
```

Acceptance uses isolated provider/participant fixtures. Export tests inspect real file structures, values, citations, privacy and missing-data labels. Live provider checks incur usage.

```sh
npx vercel deploy --prod
```

Configure server credentials in Vercel; `.env` is not uploaded. The UI remains visitor-local; `/sign-in` redirects into it. Production caches public shell/assets for offline reading, excluding API responses/private server evidence. AI requires internet.

## Retained backend

Six protected endpoints and [the Supabase migration](../supabase/migrations/202610090001_playground_mvp.sql) remain for future shared service. The current UI does not call them; Supabase variables do not enable login or connect it.

They verify bearer tokens, confirmed identities, ownership/Operations allowlists and retain service-role-only storage, compare-and-swap revisions and private evidence. Stripe atomically reserves approved missions, stores immutable snapshots, verifies paid sessions/raw webhook signatures and expires cancelled sessions before unlocking missions.

See [.env.example](../.env.example):

| Setting                     | Purpose                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `OPENAI_API_KEY`            | Server-only AI experiment design/research; optional retained drafting |
| `SANDBOX_MODEL`             | Sandbox override; defaults to `gpt-6-luna`                            |
| `OPENAI_MODEL`              | Retained drafting model/Sandbox fallback                              |
| `SUPABASE_URL`              | Retained server project URL                                           |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database/storage credential                               |
| `ADMIN_EMAILS`              | Verified Operations allowlist                                         |
| `APP_URL`                   | Trusted request/checkout origin                                       |
| `STRIPE_SECRET_KEY`         | Retained server-only Stripe credential                                |
| `STRIPE_WEBHOOK_SECRET`     | Raw webhook signing secret                                            |

A shared client needs a designed identity/access-control flow. Retained checks include [rollback-only PostgreSQL acceptance](../supabase/tests/checkout.sql).

Official references: [Supabase token verification](https://supabase.com/docs/reference/javascript/auth-getuser), [database privileges](https://supabase.com/docs/guides/database/functions), [private signed URLs](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl), [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment), [signature verification](https://docs.stripe.com/events/manage-webhook-endpoints#signature-errors), [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
