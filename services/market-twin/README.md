# Market Twin worker

This dedicated Node service executes actual Chromium sessions. The Vercel app submits asynchronous experiments and retrieves private evidence through `api/twin.ts`; browser execution does not run inside a Vercel request.

```sh
npm ci
npx playwright install chromium
# Set TWIN_WORKER_SECRET (32+ random characters) in the server environment.
npm start
```

The repository's `npm run dev` launcher supplies the local worker environment. Local macOS testing may set `TWIN_CHROME_CHANNEL=chrome` to use installed Chrome. Worker defaults are 127.0.0.1:8787, two concurrent browsers, 30 sessions, 40 actions, 180 seconds per session, 20,000 tokens and a $1 maximum campaign model budget. Functional mode uses no model calls. Behavioural mode defaults to a smaller approved budget in the app.

## Execution and evidence

Functional mode executes founder-approved steps and observable browser assertions. Behavioural mode uses an actual LangGraph state machine: observe the page, request a bounded structured model decision, evaluate the configured persona and safety policy, execute one action, update memory and persist evidence. This is a Node/Playwright navigation implementation rather than the Python Browser Use/FastAPI stack suggested in the architecture brief. It preserves the explicit observe/decide/act contract and avoids a second application stack.

Independent browser contexts capture timestamped actions, policy decisions, screenshots, browser errors, assertion results and downloadable Playwright traces. Raw trace DOM/source snapshots are disabled; the application provides screenshot/event replay alongside the trace. Axe-core runs WCAG-related checks. Browser Navigation Timing measures real load timings. Lighthouse is available as a dependency but its standalone runner is deliberately not invoked: a second unguarded browser could bypass this worker's request and action policies. Reports identify navigation timings accurately and do not present a Lighthouse score.

Synthetic task success requires actual passed assertions. Model claims, inferred usability or trust explanations and human-validated findings remain distinct. Configured personas are experimental policies, not psychologically calibrated measurements. Training SetFit or claiming predictive calibration requires reviewed historical data and held-out evaluation.

## Access and safety

- `TWIN_WORKER_SECRET` authenticates the app-to-worker connection and signs opaque workspace capabilities. Capabilities scope job and artifact access; guessing a run ID does not grant access. Rotate the secret to invalidate all capabilities. The app keeps its capability locally without adding login UI.
- Exact approved origins apply to navigation, subrequests and redirects. A separate DNS-pinning HTTP CONNECT proxy rejects private/reserved addresses and connects to the checked public IP, preventing DNS rebinding between validation and browser connection. Service workers, browser downloads, new tabs, WebSockets and browser permissions are blocked.
- Purchase, payment, outbound-message, secret-field and destructive controls are rejected. Non-read requests are denied unless an exact staging path is both founder-approved in `authorizedWritePaths` and present in the server-only `TWIN_SAFE_WRITE_PATHS` JSON map. Do not add production payment, deletion or messaging routes to that map.
- Browser basic authentication, passwords and stored session credentials are not accepted. Screenshots mask input fields and marked private elements; text evidence redacts emails and common secrets. Product content and screenshots remain confidential evidence and are protected by workspace access. Trace downloads must be treated as private product evidence.
- `TWIN_TEST_ALLOWED_ORIGINS` permits specific loopback fixture origins only outside `NODE_ENV=production`; it is never a blanket private-network exemption.

Application checks and separate contexts are not a substitute for infrastructure isolation. Deploy one worker process per container as a non-root user, with a read-only root filesystem, writable temporary/data mounts, CPU/memory limits and a restrictive egress policy. Enable Chromium's sandbox with an appropriate seccomp profile on Linux. Keep the worker behind TLS and limit ingress to the app. Do not deploy the browser worker alongside internal databases or cloud metadata credentials. S3 credentials should grant only the dedicated evidence prefix. Additional network isolation provides defense in depth against browser exploits.

```sh
docker build -f services/market-twin/Dockerfile -t playground-market-twin .
docker run --rm --init --read-only --tmpfs /tmp:rw,size=512m \
  --mount type=volume,source=playground-twin-data,target=/data \
  --memory=2g --cpus=2 -p 127.0.0.1:8787:8787 \
  --env-file /secure/path/worker.env playground-market-twin
```

## Persistence and deployment

Local mode writes atomic job JSON and artifacts to `TWIN_DATA_DIR`. Mount a persistent volume. A restart preserves completed evidence, marks interrupted sessions failed, and requires an explicit retry instead of silently spending another model budget.

Set `TWIN_DATABASE_URL` for PostgreSQL metadata, optionally `TWIN_DATABASE_SSL=true` for verified TLS. The service creates `playground_twin_jobs` with workspace ownership, indexed primary IDs, status and JSON documents. Run one queue owner per deployment; horizontal worker leasing is not implemented.

With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, artifacts use the private `twin-artifacts` storage bucket created by the rollout migration. No separate object-storage account is needed. The service key remains on the worker; artifact retrieval still verifies workspace ownership. Set `TWIN_SUPABASE_STORAGE_BUCKET` only if the migration uses a different private bucket.

Alternatively set `TWIN_S3_BUCKET`, `TWIN_S3_REGION`, optional `TWIN_S3_ENDPOINT` and `TWIN_S3_FORCE_PATH_STYLE=true` for S3-compatible private artifact storage. Use AWS credential environment variables or an infrastructure role. Evidence uploads use server-side encryption; artifacts stream only after workspace authorization.

On Vercel set `TWIN_WORKER_URL=https://your-worker.example` and the same `TWIN_WORKER_SECRET`. Configured Supabase authentication binds capabilities to the verified account; the proxy ignores caller-supplied owner tokens. Production private actions require verified authentication. The worker receives `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-6-luna` and optional explicit per-million pricing settings `TWIN_MODEL_INPUT_USD_PER_MILLION`, `TWIN_MODEL_OUTPUT_USD_PER_MILLION`. Short-context default rates are $0.10 input / $0.50 output. Any other model requires explicit verified prices. Campaign cost is computed from returned provider usage; conservative byte-based token reservation precedes each call. `TWIN_DAILY_MODEL_BUDGET_USD` defaults to $2 and reserves each approved behavioural campaign's maximum cost for 24 hours, including retry attempts. Creation is serialized and PostgreSQL uses advisory locks; one queue owner holds a persistent database lease. No provider call occurs during functional testing.

```sh
npm test
npm run test:browser
```

The browser acceptance test launches ten independent fixture sessions, captures real screenshots/traces, checks objective completion and browser-storage isolation, blocks destruction and unapproved writes, checks private evidence access, runs the behavioural state graph with an injected test policy, cancels/retries a job and verifies restart persistence. It makes zero paid model calls. The injected graph policy and its fixture usage are test data and never become a production campaign.
