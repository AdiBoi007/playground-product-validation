/* global document, window, getComputedStyle */
import { chromium } from "playwright";
import axe from "axe-core";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEgressProxy } from "./egress.mjs";
import {
  allowedWrite,
  permittedUrl,
  redact,
  safeAction,
  safeUrl,
  WorkerError,
} from "./security.mjs";
import { buildBehaviourGraph, modelDecision } from "./policy.mjs";
import {
  captureEvaluationSnapshot,
  evaluateUsability,
  evaluateAccessibility,
  evaluateTrust,
  evaluateConversion,
} from "./evaluators.mjs";

const id = (prefix) => `${prefix}-${randomUUID()}`;
export async function assertionResults(page, task, record) {
  const results = [];
  for (const assertion of task.assertions || []) {
    let passed = false,
      observed;
    try {
      if (assertion.type === "url-contains") {
        passed = page.url().includes(assertion.value);
        observed = `Current URL: ${safeUrl(page.url())}`;
      } else if (assertion.type === "text-visible") {
        passed = await page
          .getByText(assertion.value, { exact: false })
          .first()
          .isVisible();
        observed = passed
          ? "Expected text visible"
          : "Expected text not visible";
      } else {
        const visible = await page.locator(assertion.value).first().isVisible();
        passed = assertion.type === "selector-hidden" ? !visible : visible;
        observed = visible ? "Element visible" : "Element not visible";
      }
    } catch {
      observed = "Assertion could not inspect the element";
    }
    const event = await record(
      "assertion",
      `${assertion.description}: ${passed ? "passed" : "failed"}`,
      { assertionId: assertion.id, passed },
    );
    results.push({
      assertionId: assertion.id,
      passed,
      observed,
      eventId: event.id,
    });
  }
  return results;
}
async function observe(page) {
  const observed = await page.evaluate(() => {
    for (const element of document.querySelectorAll("[data-twin-element]"))
      element.removeAttribute("data-twin-element");
    const candidates = Array.from(
      document.querySelectorAll(
        'a,button,input,textarea,select,[role="button"],[role="link"]',
      ),
    )
      .filter((element) => {
        const rect = element.getBoundingClientRect(),
          style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          !element.disabled
        );
      })
      .slice(0, 30);
    const elements = candidates.map((element, index) => {
      const id = `e${index}`;
      element.setAttribute("data-twin-element", id);
      return {
        id,
        tag: element.tagName.toLowerCase(),
        text: (element.innerText || element.textContent || "")
          .trim()
          .slice(0, 100),
        label: (
          element.getAttribute("aria-label") ||
          element.labels?.[0]?.textContent ||
          element.placeholder ||
          ""
        )
          .trim()
          .slice(0, 100),
        inputType: element.type || "",
        name: element.name || "",
        href: element.getAttribute("href") || "",
        formAction: element.form?.getAttribute("action") || "",
      };
    });
    return {
      title: document.title,
      text: document.body.innerText.slice(0, 2200),
      elements,
    };
  });
  observed.text = redact(observed.text);
  for (const element of observed.elements) {
    element.text = redact(element.text);
    element.label = redact(element.label);
    element.href = element.href ? redact(element.href) : "";
  }
  return { url: safeUrl(page.url()), ...observed };
}
export async function executeStep(page, step, spec, env) {
  let element;
  if (step.selector)
    element = await page
      .locator(step.selector)
      .first()
      .evaluate((element) => ({
        text: element.textContent?.slice(0, 300),
        label:
          element.getAttribute("aria-label") ||
          element.labels?.[0]?.textContent ||
          element.placeholder ||
          "",
        inputType: element.type || "",
        name: element.name || "",
        href: element.getAttribute("href") || "",
        formAction: element.form?.getAttribute("action") || "",
      }));
  safeAction(step, element);
  const locator = step.selector ? page.locator(step.selector).first() : null;
  switch (step.type) {
    case "navigate":
      await page.goto(
        permittedUrl(
          new URL(step.url || spec.targetUrl, spec.targetUrl).toString(),
          spec.allowedOrigins,
          env,
        ).toString(),
        { waitUntil: "domcontentloaded" },
      );
      break;
    case "click":
      await locator.click();
      break;
    case "fill":
      if (!locator || typeof step.value !== "string")
        throw new WorkerError(
          422,
          "A fill action needs a visible selector and value.",
        );
      await locator.fill(step.value);
      break;
    case "select":
      await locator.selectOption(step.value);
      break;
    case "press":
      if (locator) await locator.press(step.key);
      else await page.keyboard.press(step.key);
      break;
    case "scroll":
      await page.mouse.wheel(0, 500);
      break;
    case "back":
      await page.goBack({ waitUntil: "domcontentloaded" });
      break;
    case "wait":
      await page.waitForTimeout(
        Math.min(1500, Math.max(0, step.milliseconds || 300)),
      );
      break;
    case "assert":
      break;
    default:
      throw new WorkerError(422, "Unsupported browser action.");
  }
  await page.waitForTimeout(80);
}
export async function runBrowser(record, run, environment) {
  const {
    env,
    signal,
    artifacts,
    persist,
    addIssue,
    decide,
    ledger,
    withModelLock,
  } = environment;
  const spec = record.job.spec,
    persona = spec.personas.find((x) => x.id === run.personaId),
    start = Date.now();
  const timeoutMs =
    Math.min(spec.settings.maxDurationSeconds, persona.timeBudgetSeconds) *
    1000;
  let browser,
    context,
    page,
    currentTask,
    stepCount = 0,
    timedOut = false,
    temporary,
    proxy;
  const abort = () => void context?.close().catch(() => {});
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, timeoutMs);
  const recordEvent = async (type, summary, data, action) => {
    const event = {
      id: id("event"),
      ...(currentTask ? { taskId: currentTask.id } : {}),
      at: new Date().toISOString(),
      elapsedMs: Date.now() - start,
      type,
      url: safeUrl(page?.url() || spec.targetUrl),
      summary: redact(summary),
      ...(data ? { data } : {}),
      ...(action ? { action } : {}),
    };
    run.events.push(event);
    await persist(run);
    return event;
  };
  const artifact = async (type, name, bytes, mimeType, event) => {
    const item = {
      id: id("artifact"),
      type,
      name,
      url: "",
      mimeType,
      createdAt: new Date().toISOString(),
      ...(event ? { eventId: event.id } : {}),
    };
    item.url = `/api/twin?action=artifact&jobId=${encodeURIComponent(record.job.id)}&artifactId=${encodeURIComponent(item.id)}`;
    item.sizeBytes = await artifacts.put(
      record.job.id,
      item.id,
      bytes,
      mimeType,
    );
    run.artifacts.push(item);
    if (event) event.screenshotId = item.id;
    await persist(run);
    return item;
  };
  const screenshot = async (event) => {
    if (!page || page.isClosed()) return;
    try {
      await artifact(
        "screenshot",
        `Step ${run.events.length}.png`,
        await page.screenshot({
          type: "png",
          mask: [
            page.locator("input,textarea,[data-private],[data-sensitive]"),
          ],
          fullPage: false,
        }),
        "image/png",
        event,
      );
    } catch {
      /* A page may close during cancellation. */
    }
  };
  const issue = async (value) =>
    addIssue({
      ...value,
      id: id("issue"),
      sourceRunIds: [run.id],
      sourceEventIds: value.sourceEventIds || [],
      taskIds: currentTask ? [currentTask.id] : [],
      artifactIds: value.artifactIds || [],
      affectedUrl: safeUrl(page?.url() || spec.targetUrl),
      reproductionSteps: [
        `Open ${safeUrl(spec.targetUrl)}`,
        ...run.events
          .filter((x) => x.action)
          .map((x) => x.summary)
          .slice(-12),
      ],
    });
  const audit = async () => {
    if (signal.aborted || timedOut) return;
    try {
      await page.addScriptTag({ content: axe.source });
      const result = await page.evaluate(async () =>
        window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          resultTypes: ["violations"],
        }),
      );
      const event = await recordEvent(
        "audit",
        `axe-core found ${result.violations.length} accessibility rules with violations.`,
        { engine: "axe-core", version: axe.version },
      );
      const item = await artifact(
        "audit",
        "Accessibility audit.json",
        Buffer.from(
          JSON.stringify(
            {
              engine: "axe-core",
              version: axe.version,
              url: safeUrl(page.url()),
              violations: result.violations.map((x) => ({
                id: x.id,
                impact: x.impact,
                description: x.description,
                help: x.help,
                helpUrl: x.helpUrl,
                nodes: x.nodes.map((n) => ({
                  target: n.target,
                  failureSummary: redact(n.failureSummary || ""),
                })),
              })),
            },
            null,
            2,
          ),
        ),
        "application/json",
      );
      for (const finding of evaluateAccessibility(result.violations))
        await issue({
          ...finding,
          sourceEventIds: [event.id],
          artifactIds: [item.id],
        });
      const snapshot = await captureEvaluationSnapshot(page);
      const snapshotEvent = await recordEvent(
        "audit",
        "Usability and trust specialists inspected the visible page.",
        {
          engine: "observed-dom-rules",
          viewportWidth: snapshot.viewportWidth,
          documentWidth: snapshot.documentWidth,
          visibleControls: snapshot.controls.length,
          visibleForms: snapshot.forms.length,
        },
      );
      await screenshot(snapshotEvent);
      const snapshotArtifact = await artifact(
        "audit",
        "Visible interface measurements.json",
        Buffer.from(JSON.stringify(snapshot, null, 2)),
        "application/json",
      );
      for (const finding of [
        ...evaluateUsability(snapshot),
        ...evaluateTrust(snapshot, page.url()),
      ])
        await issue({
          ...finding,
          sourceEventIds: [snapshotEvent.id],
          artifactIds: [
            snapshotArtifact.id,
            ...(snapshotEvent.screenshotId ? [snapshotEvent.screenshotId] : []),
          ],
        });
      const performance = await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        return navigation
          ? {
              domContentLoadedMs: Math.round(
                navigation.domContentLoadedEventEnd,
              ),
              loadEventMs: Math.round(navigation.loadEventEnd),
              responseMs: Math.round(navigation.responseStart),
              transferBytes: navigation.transferSize,
            }
          : null;
      });
      if (performance) {
        const measured = await recordEvent(
          "audit",
          "Measured browser navigation performance.",
          performance,
        );
        if (performance.domContentLoadedMs > 3000)
          await issue({
            title: "Slow document readiness",
            category: "performance",
            severity: "medium",
            basis: "observed",
            description: `DOM content loaded after ${performance.domContentLoadedMs} ms in this browser session. This is a measured session timing, not a Lighthouse score.`,
            sourceEventIds: [measured.id],
            proposedFix:
              "Inspect resource loading and server latency; repeat with controlled network conditions.",
            requiresHumanVerification: false,
          });
      }
    } catch (error) {
      await recordEvent(
        "audit",
        `Accessibility audit unavailable: ${redact(error.message)}`,
      );
    }
  };
  try {
    run.status = "running";
    run.startedAt = new Date().toISOString();
    await persist(run);
    proxy = await createEgressProxy(spec.allowedOrigins, env);
    browser = await chromium.launch({
      headless: true,
      chromiumSandbox: env.TWIN_CHROMIUM_SANDBOX !== "false",
      ...(env.TWIN_CHROME_CHANNEL ? { channel: env.TWIN_CHROME_CHANNEL } : {}),
      proxy: { server: proxy.url, bypass: "<-loopback>" },
      args: [
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--disable-extensions",
        "--disable-sync",
        "--no-first-run",
        "--proxy-bypass-list=<-loopback>",
      ],
    });
    context = await browser.newContext({
      viewport:
        persona.device === "mobile"
          ? { width: 390, height: 844 }
          : { width: 1365, height: 900 },
      isMobile: persona.device === "mobile",
      hasTouch: persona.device === "mobile",
      serviceWorkers: "block",
      acceptDownloads: false,
      permissions: [],
      ignoreHTTPSErrors: false,
    });
    context.setDefaultTimeout(7000);
    context.setDefaultNavigationTimeout(15000);
    await context.route("**/*", async (route) => {
      const request = route.request();
      try {
        const url = permittedUrl(request.url(), spec.allowedOrigins, env);
        if (
          !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
          !allowedWrite(url, spec, env)
        )
          throw new WorkerError(
            422,
            "An unapproved data-changing request was blocked.",
          );
        const headers = { ...request.headers() };
        delete headers.authorization;
        delete headers.cookie;
        await route.continue({ headers });
      } catch (error) {
        await recordEvent("policy-block", error.message, {
          method: request.method(),
          requestUrl: safeUrl(request.url()),
        });
        await route.abort("blockedbyclient");
      }
    });
    if (context.routeWebSocket)
      await context.routeWebSocket("**/*", (socket) => socket.close());
    context.on("page", (p) => {
      if (page && p !== page) void p.close();
    });
    page = await context.newPage();
    page.on("dialog", (dialog) => void dialog.dismiss());
    page.on("download", (download) => void download.cancel());
    page.on("pageerror", (error) => {
      void (async () => {
        const event = await recordEvent("console-error", error.message);
        await issue({
          title: "Browser JavaScript error",
          category: "technical",
          severity: "high",
          basis: "observed",
          description: redact(error.message),
          sourceEventIds: [event.id],
          proposedFix:
            "Reproduce the linked journey and fix the browser exception.",
          requiresHumanVerification: false,
        });
      })().catch(() => {});
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        void recordEvent(
          "network-error",
          `HTTP ${response.status()} at ${safeUrl(response.url())}`,
          { status: response.status() },
        ).catch(() => {});
    });
    temporary = await mkdtemp(path.join(os.tmpdir(), "playground-twin-"));
    // DOM snapshots and source capture are disabled to reduce private product content in raw traces.
    await context.tracing.start({
      screenshots: false,
      snapshots: false,
      sources: false,
    });
    await page.goto(spec.targetUrl, { waitUntil: "domcontentloaded" });
    await screenshot(
      await recordEvent("navigation", "Opened the approved product."),
    );
    await audit();
    for (const task of spec.tasks) {
      currentTask = task;
      const taskStart = Date.now(),
        eventStart = run.events.length;
      let reason = "",
        requestedStop;
      if (signal.aborted || timedOut) break;
      try {
        if (spec.mode === "functional") {
          for (const step of task.steps) {
            if (signal.aborted || timedOut) break;
            if (++stepCount > spec.settings.maxSteps)
              throw new WorkerError(
                422,
                "The browser step budget has been reached.",
              );
            await executeStep(page, step, spec, env);
            const event = await recordEvent(
              "action",
              step.description,
              undefined,
              step,
            );
            await screenshot(event);
            if (step.type === "assert") {
              const chosen = task.assertions.find(
                (x) => x.id === step.assertionId,
              );
              if (!chosen)
                throw new WorkerError(
                  422,
                  "The referenced assertion is missing.",
                );
              const check = await assertionResults(
                page,
                { assertions: [chosen] },
                recordEvent,
              );
              if (check[0].passed !== true)
                throw new WorkerError(
                  422,
                  "An intermediate success assertion failed.",
                );
            }
          }
          reason =
            "Executed the approved functional steps; browser assertions determine success.";
        } else {
          const graph = buildBehaviourGraph({
            observe: async () => {
              const remainingSeconds = Math.floor(
                (timeoutMs - (Date.now() - start)) / 1000,
              );
              return {
                observation: await observe(page),
                remainingSeconds,
                done:
                  signal.aborted ||
                  timedOut ||
                  remainingSeconds <= 0 ||
                  stepCount >= spec.settings.maxSteps,
                stopReason:
                  stepCount >= spec.settings.maxSteps
                    ? "Step budget reached"
                    : undefined,
              };
            },
            decide: async (state) => {
              const event = await recordEvent(
                "observation",
                `Observed ${state.observation.elements.length} available controls.`,
                { availableControls: state.observation.elements.length },
              );
              await screenshot(event);
              return withModelLock(async () => {
                const before = { ...ledger };
                const decision = await (decide || modelDecision)(state, {
                  env,
                  signal,
                  usage: ledger,
                });
                run.usage.inputTokens +=
                  ledger.inputTokens - before.inputTokens;
                run.usage.outputTokens +=
                  ledger.outputTokens - before.outputTokens;
                run.usage.costUsd += ledger.costUsd - before.costUsd;
                run.usage.modelCalls += ledger.modelCalls - before.modelCalls;
                await persist(run);
                return decision;
              });
            },
            act: async (state) => {
              const decision = state.decision;
              stepCount++;
              if (decision.action === "stop") {
                requestedStop = decision.stopReason;
                reason = decision.reason;
                await recordEvent("stop", decision.reason, {
                  reason: decision.stopReason || "unknown",
                });
                return {
                  done: true,
                  memory: decision.memory,
                  step: state.step + 1,
                  stopReason: decision.stopReason,
                };
              }
              const element = state.observation.elements.find(
                (x) => x.id === decision.elementId,
              );
              const step = {
                id: id("step"),
                type: decision.action,
                description: decision.reason,
                ...(element
                  ? { selector: `[data-twin-element="${element.id}"]` }
                  : {}),
                ...(decision.value ? { value: decision.value } : {}),
                ...(decision.key ? { key: decision.key } : {}),
              };
              safeAction(step, element);
              try {
                await executeStep(page, step, spec, env);
                await screenshot(
                  await recordEvent("action", decision.reason, undefined, step),
                );
                return {
                  memory: decision.memory,
                  step: state.step + 1,
                  friction: state.friction,
                  done: false,
                };
              } catch (error) {
                await recordEvent(
                  error instanceof WorkerError ? "policy-block" : "observation",
                  redact(error.message),
                );
                if (error instanceof WorkerError) throw error;
                return {
                  memory: decision.memory,
                  step: state.step + 1,
                  friction: state.friction + 1,
                  done: state.friction >= 2 && persona.exploration === "low",
                  stopReason: "Repeated interaction failure",
                };
              }
            },
          });
          const final = await graph.invoke(
            {
              spec,
              persona,
              task,
              step: 0,
              memory: "",
              friction: 0,
              remainingSeconds: timeoutMs / 1000,
              done: false,
            },
            { recursionLimit: spec.settings.maxSteps * 4 + 10, signal },
          );
          reason =
            reason ||
            final.stopReason ||
            "The configured browser policy stopped after bounded exploration.";
        }
        if (signal.aborted || timedOut)
          throw new Error(
            timedOut ? "Session duration budget reached" : "Run cancelled",
          );
        const assertions = await assertionResults(page, task, recordEvent),
          success =
            assertions.length > 0 && assertions.every((x) => x.passed === true);
        const outcome = success
          ? "success"
          : requestedStop === "abandoned"
            ? "abandoned"
            : requestedStop === "blocked"
              ? "blocked"
              : "failure";
        run.taskResults.push({
          taskId: task.id,
          outcome,
          durationSeconds: Math.round((Date.now() - taskStart) / 100) / 10,
          reason,
          eventIds: run.events.slice(eventStart).map((x) => x.id),
          assertions,
        });
        for (const finding of evaluateConversion(
          task,
          run.taskResults.at(-1),
          spec.mode,
        ))
          await issue({
            ...finding,
            sourceEventIds: run.taskResults.at(-1).eventIds,
            artifactIds: run.events
              .slice(eventStart)
              .filter((x) => x.screenshotId)
              .map((x) => x.screenshotId),
          });
        if (!success) {
          const event = await recordEvent(
            "observation",
            "The required task completion criteria were not observed.",
          );
          await screenshot(event);
          await issue({
            title: `${task.title}: completion not observed`,
            category: spec.mode === "functional" ? "technical" : "usability",
            severity: "high",
            basis: spec.mode === "functional" ? "observed" : "inferred",
            description:
              spec.mode === "functional"
                ? "The specified workflow did not satisfy its browser assertions."
                : "This configured synthetic policy did not complete the task. Human difficulty is an unvalidated hypothesis.",
            sourceEventIds: [event.id, ...assertions.map((x) => x.eventId)],
            artifactIds: event.screenshotId ? [event.screenshotId] : [],
            proposedFix:
              "Inspect the recorded steps and failed assertions; reproduce the technical failure or verify the behavioural hypothesis with human testers.",
            requiresHumanVerification: spec.mode === "behavioural",
          });
        }
        await persist(run);
        if (!signal.aborted && !timedOut) await audit();
      } catch (error) {
        const blocked =
          error instanceof WorkerError &&
          /blocked|not allowed|Secret|purchase|unapproved/i.test(error.message);
        const event = await recordEvent(
          blocked ? "policy-block" : "stop",
          redact(error.message),
        );
        run.taskResults.push({
          taskId: task.id,
          outcome: blocked
            ? "blocked"
            : timedOut || signal.aborted
              ? "unknown"
              : "failure",
          durationSeconds: Math.round((Date.now() - taskStart) / 100) / 10,
          reason: redact(error.message),
          eventIds: run.events.slice(eventStart).map((x) => x.id),
          assertions: [],
        });
        await persist(run);
        if (timedOut || signal.aborted) break;
        if (!blocked)
          await issue({
            title: `${task.title}: browser workflow error`,
            category: "technical",
            severity: "high",
            basis: "observed",
            description: redact(error.message),
            sourceEventIds: [event.id],
            proposedFix:
              "Replay the failure, check the approved selectors and fix the interaction or test definition.",
            requiresHumanVerification: false,
          });
      }
    }
    currentTask = undefined;
    if (!signal.aborted && !timedOut) {
      await audit();
      await screenshot(await recordEvent("stop", "Browser session completed."));
    }
    run.status = signal.aborted
      ? "cancelled"
      : timedOut
        ? "timed-out"
        : "completed";
  } catch (error) {
    run.status = signal.aborted
      ? "cancelled"
      : timedOut
        ? "timed-out"
        : "failed";
    run.error = redact(error.message);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    try {
      if (context) {
        const tracePath = path.join(temporary, "trace.zip");
        await context.tracing.stop({ path: tracePath });
        await artifact(
          "trace",
          "Browser trace.zip",
          await readFile(tracePath),
          "application/zip",
        );
      }
    } catch {
      /* A cancelled browser may not flush the trace; recorded events remain. */
    }
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await proxy?.close().catch(() => {});
    if (temporary) await rm(temporary, { recursive: true, force: true });
    run.finishedAt = new Date().toISOString();
    await persist(run);
  }
  return run;
}
