import { useSyncExternalStore } from "react";
import { defaultQuestion, defaultUrl } from "../data/demo";
import { decisionStore, type DecisionStore } from "../intelligence/store";
import type { DemoState, Phase } from "../types";

const STORAGE_KEY = "playground-demo-v1";
const SCHEMA_VERSION = 1;
const speeds = [1, 2, 4, 8];
const phases: Phase[] = [
  "idle",
  "analysing",
  "plan",
  "matching",
  "running",
  "analysing-results",
  "complete",
  "retesting",
  "v2-complete",
];
const initialState: DemoState = {
  phase: "idle",
  clock: 0,
  speed: 1,
  paused: false,
  presentation: false,
  version: 1,
  url: defaultUrl,
  question: defaultQuestion,
};
const timedPhases = new Set<Phase>([
  "analysing",
  "matching",
  "running",
  "analysing-results",
  "retesting",
]);

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
interface StoreOptions {
  storage?: StorageLike | null;
  autoTick?: boolean;
  now?: () => number;
  decisions?: DecisionStore;
}

export function parseStoredState(raw: string | null): DemoState | null {
  if (!raw) return null;
  try {
    const envelope: unknown = JSON.parse(raw);
    if (
      !envelope ||
      typeof envelope !== "object" ||
      !("schema" in envelope) ||
      envelope.schema !== SCHEMA_VERSION ||
      !("state" in envelope)
    )
      return null;
    const value = envelope.state;
    if (!value || typeof value !== "object") return null;
    const state = value as Record<string, unknown>;
    if (
      typeof state.phase !== "string" ||
      !phases.includes(state.phase as Phase) ||
      typeof state.clock !== "number" ||
      !Number.isFinite(state.clock) ||
      state.clock < 0 ||
      state.clock > 50 ||
      typeof state.speed !== "number" ||
      !speeds.includes(state.speed) ||
      typeof state.paused !== "boolean" ||
      typeof state.presentation !== "boolean" ||
      (state.version !== 1 && state.version !== 2) ||
      typeof state.url !== "string" ||
      state.url.length > 2048 ||
      typeof state.question !== "string" ||
      !state.question.trim() ||
      state.question.length > 2000
    )
      return null;
    const phase = state.phase as Phase;
    const clock = state.clock;
    try {
      const productUrl = new URL(state.url);
      if (
        !["http:", "https:"].includes(productUrl.protocol) ||
        !productUrl.hostname ||
        productUrl.username ||
        productUrl.password
      )
        return null;
    } catch {
      return null;
    }
    if (
      (phase === "analysing" && clock > 5) ||
      (phase === "matching" && clock > 4) ||
      (phase === "running" && clock > 45) ||
      (phase === "analysing-results" && (clock < 45 || clock > 50)) ||
      (phase === "retesting" && clock > 8)
    )
      return null;
    if (
      (phase === "retesting" || phase === "v2-complete") !==
      (state.version === 2)
    )
      return null;
    if ((phase === "idle" || phase === "plan") && clock !== 0) return null;
    if ((phase === "complete" || phase === "v2-complete") && clock !== 50)
      return null;
    return {
      phase,
      clock,
      speed: state.speed,
      paused: state.paused,
      presentation: state.presentation,
      version: state.version,
      url: state.url,
      question: state.question,
    };
  } catch {
    return null;
  }
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createDemoStore(options: StoreOptions = {}) {
  const storage =
    options.storage === undefined ? browserStorage() : options.storage;
  const now = options.now ?? (() => performance.now());
  const decisions = options.decisions ?? decisionStore;
  let restored: DemoState | null = null;
  try {
    restored = parseStoredState(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    /* Storage may be blocked in privacy modes. */
  }
  let state: DemoState = restored ?? { ...initialState };
  let lastTick = now();
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastSaved = 0;
  const listeners = new Set<() => void>();

  function persist(force = false) {
    const time = now();
    if (!force && time - lastSaved < 500) return;
    lastSaved = time;
    try {
      storage?.setItem(
        STORAGE_KEY,
        JSON.stringify({ schema: SCHEMA_VERSION, state }),
      );
    } catch {
      /* The demo remains usable without persistence. */
    }
  }

  function publish(next: DemoState, forceSave = true) {
    state = next;
    persist(forceSave);
    listeners.forEach((listener) => listener());
  }

  function advanceBy(milliseconds: number) {
    if (
      state.paused ||
      !timedPhases.has(state.phase) ||
      !Number.isFinite(milliseconds) ||
      milliseconds <= 0
    )
      return;
    let seconds = (milliseconds / 1000) * state.speed;
    let next = { ...state };
    // Carry elapsed time through automatic transitions. Repeated clicks and
    // background-tab timer delays cannot strand the engine between phases.
    while (seconds > 0 && timedPhases.has(next.phase)) {
      const boundary =
        next.phase === "analysing"
          ? 5
          : next.phase === "matching"
            ? 4
            : next.phase === "running"
              ? 45
              : next.phase === "retesting"
                ? 8
                : 50;
      const delta = Math.min(seconds, Math.max(0, boundary - next.clock));
      next.clock = Math.min(boundary, next.clock + delta);
      seconds -= delta;
      if (next.clock < boundary) break;
      if (next.phase === "analysing")
        next = { ...next, phase: "plan", clock: 0 };
      else if (next.phase === "matching")
        next = { ...next, phase: "running", clock: 0 };
      else if (next.phase === "running")
        next = { ...next, phase: "analysing-results", clock: 45 };
      else if (next.phase === "retesting")
        next = { ...next, phase: "v2-complete", clock: 50, paused: false };
      else next = { ...next, phase: "complete", clock: 50, paused: false };
    }
    publish(next, next.phase !== state.phase);
  }

  function tick() {
    const time = now();
    const delta = time - lastTick;
    lastTick = time;
    advanceBy(delta);
  }

  const actions = {
    startAnalysis(url = state.url, question = state.question) {
      lastTick = now();
      publish({
        ...state,
        phase: "analysing",
        clock: 0,
        paused: false,
        version: 1,
        url: url.trim() || defaultUrl,
        question: question.trim() || defaultQuestion,
      });
    },
    startRun() {
      if (
        ["matching", "running", "analysing-results", "retesting"].includes(
          state.phase,
        )
      )
        return;
      lastTick = now();
      publish({
        ...state,
        phase: "matching",
        clock: 0,
        paused: false,
        version: 1,
      });
    },
    pause() {
      tick();
      publish({ ...state, paused: true });
    },
    resume() {
      lastTick = now();
      publish({ ...state, paused: false });
    },
    setSpeed(speed: number) {
      if (!speeds.includes(speed)) return;
      tick();
      publish({ ...state, speed });
    },
    skipToResults() {
      publish({
        ...state,
        phase: state.version === 2 ? "v2-complete" : "complete",
        clock: 50,
        paused: false,
      });
    },
    reset() {
      lastTick = now();
      decisions.resetChanges();
      publish({
        ...initialState,
        speed: state.speed,
        presentation: state.presentation,
      });
    },
    retest() {
      if (state.phase === "retesting") return;
      lastTick = now();
      decisions.commitChanges();
      publish({
        ...state,
        phase: "retesting",
        version: 2,
        clock: 0,
        paused: false,
      });
    },
    togglePresentation() {
      publish({ ...state, presentation: !state.presentation });
    },
    replayAnalysis() {
      actions.startAnalysis(state.url, state.question);
    },
  };

  if (options.autoTick !== false && typeof window !== "undefined")
    timer = setInterval(tick, 100);

  return {
    ...actions,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    advanceBy,
    destroy() {
      if (timer) clearInterval(timer);
      listeners.clear();
      persist(true);
    },
  };
}

export const demoStore = createDemoStore();

export function useDemo() {
  const state = useSyncExternalStore(
    demoStore.subscribe,
    demoStore.getSnapshot,
    demoStore.getSnapshot,
  );
  return {
    state,
    startAnalysis: demoStore.startAnalysis,
    startRun: demoStore.startRun,
    pause: demoStore.pause,
    resume: demoStore.resume,
    setSpeed: demoStore.setSpeed,
    skipToResults: demoStore.skipToResults,
    reset: demoStore.reset,
    retest: demoStore.retest,
    togglePresentation: demoStore.togglePresentation,
    replayAnalysis: demoStore.replayAnalysis,
  };
}
