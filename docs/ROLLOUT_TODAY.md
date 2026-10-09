# Roll out Playground today

The app, Market Twin worker, signup/sign-in, shared campaign records, owner-only Sandboxes, verified Stripe checkout and evidence storage are implemented. Deploy the web app and browser worker as two services: the web app uses Vercel, the long-running Chromium worker uses Railway/Render, and Supabase supplies auth, PostgreSQL and private object storage. The UI only offers connected accounts when both public Supabase variables are set.

## Values to collect

Create one Supabase project and a Stripe account in **test mode** first. Do not send secrets in this chat. Add them to the local `.env` or the named host's private environment settings.

| Variable | Source |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (public URL) |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable/anon key (public browser key; never the service-role key) |
| `SUPABASE_URL` | Same project URL, server setting |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role secret; server only |
| `ADMIN_EMAILS` | Comma-separated, exact email addresses for Operations admins |
| `TWIN_DATABASE_URL` | Supabase PostgreSQL session-pooler connection URI (port 5432) or direct URI, with SSL enabled |
| `STRIPE_SECRET_KEY` | Stripe test secret (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from the Stripe webhook endpoint after deploy |
| `OPENAI_API_KEY` | Already in your local `.env`; set the same server-only value on Vercel and the worker host |
| `TWIN_WORKER_SECRET` | One generated random value of at least 32 characters, identical on Vercel and the worker host |
| `TWIN_WORKER_URL` | Public HTTPS URL for the worker, set on Vercel; worker host binds to its private/internal interface when possible |

Optional operations variables are in [.env.example](../.env.example). Market Twin stores browser traces/screenshots in the private Supabase `twin-artifacts` bucket using the service key. Its small durable job index is in PostgreSQL. No separate S3 account is needed. Configure a database backup/retention policy in Supabase before storing confidential product material.

## Local connected setup

1. Fill the Supabase values above into `.env` and set `APP_URL=http://localhost:5178`. Keep the worker URL, generated worker secret and data directory that `npm run dev` already added to `.env`.
2. Apply migrations in timestamp order: `supabase/migrations/202610090001_playground_mvp.sql`, then `supabase/migrations/202610090002_sandbox_twin.sql`. Use the Supabase SQL editor or the Supabase CLI linked to this project.
3. In Supabase Auth URL configuration, set the Site URL to your deployed domain. Add `http://localhost:5178/**`, `https://tryplayground.net/**`, and the exact Vercel preview redirect pattern for your own Vercel team. Set email confirmations and configure SMTP before public signup.
4. Start the app with `npm run dev`. It starts the worker and UI together on `http://127.0.0.1:5178`. New sessions enter through `/signup`; old device-only work remains on that device and is not copied to cloud accounts.
5. Verify Signup, email confirmation, Sign in, owner-only Sandbox save/reload on a second browser, Operations admin access for one email from `ADMIN_EMAILS`, worker configuration and a functional test on a product/staging origin you control.

## Host and connect the browser worker

Deploy the repository's `services/market-twin/Dockerfile` with the **repository root as Docker build context**. Railway, Render or another always-on container host must support Chromium, outbound DNS/HTTPS and a persistent service process. Set `TWIN_WORKER_SECRET`, `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-6-luna`, `TWIN_DATABASE_URL`, `TWIN_DATABASE_SSL=true`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TWIN_DAILY_MODEL_BUDGET_USD=2`, `TWIN_MAX_CONCURRENCY=2`, and let the host provide its `PORT`. The container uses Supabase Storage for private evidence. The image includes the browser and runs under its non-root browser user. Set the worker's public origin as `TWIN_WORKER_URL` on Vercel and reuse the exact same `TWIN_WORKER_SECRET` there.

Keep the worker URL HTTPS, allow only approved HTTPS product origins, and leave `TWIN_SAFE_WRITE_PATHS={}` until a dedicated test/staging write endpoint has been reviewed and explicitly approved. The worker blocks private/reserved addresses, cross-origin redirects, service workers, WebSockets, payments, destructive actions, messages and password/payment fields. Do not add production credentials to a test mission.

## Vercel and Stripe

1. Connect the GitHub repository to Vercel or install the Vercel CLI. Keep build command `npm run build` and output folder `dist`. The worker is deployed separately; Vercel only proxies authorized job requests.
2. Add the Supabase public URL/key as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel's build environment. Add service-role, database, worker, Stripe, `OPENAI_API_KEY`, and `APP_URL=https://tryplayground.net` settings as server-only environment variables. Never prefix a secret with `VITE_`.
3. Apply both SQL migrations before exposing signup. Add a Stripe webhook endpoint at `https://tryplayground.net/api/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`; put its signing secret in `STRIPE_WEBHOOK_SECRET`. Keep Stripe in test mode until a complete paid campaign flow, refund policy, tester recruitment and manual reward operations have been checked.
4. Set the production domain and Supabase email redirect allowlist, then deploy. Sign up as a founder and a separate tester; set the initial Operations email in `ADMIN_EMAILS`. The `service_role` is server-only. Tester identity cannot be selected from another user's account.

## Launch checks

- Confirm Signup → email verification → Sign in → sign out.
- Save a Sandbox, open it from another signed-in device, confirm another account cannot read or edit it.
- Run the 10-session browser acceptance: `npm run test:twin:browser`. This executes real Chromium sessions on a local fixture and makes no paid model calls.
- On a staging product that you own, run a small functional experiment, inspect a screenshot, download the trace, and verify task metrics come from that run.
- Run a behavioural session only after checking its visible token and USD cap. The account-level reserved AI ceiling defaults to 50 AI requests/day globally, 10/account/day, and the browser worker's behavioural reservation defaults to $2 per rolling day.
- Complete a Stripe test payment and confirm the paid campaign is activated by the signed webhook only. Verify cancelled/expired sessions remain editable and paid missions stay locked.
- Confirm backups/retention, auth email delivery, refund handling, manual tester sourcing and reward payout owners before charging the first customer.

Use `npm test`, `npm run test:twin`, `npm run lint` and `npm run build` for the local checks. Live account setup and an actual deployment still require your provider project access and DNS/domain ownership.
