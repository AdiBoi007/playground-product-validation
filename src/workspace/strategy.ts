import { useSyncExternalStore } from "react";

export interface StrategyOptions {
  audience: string;
  stage: string;
  risk: string;
  depth: string;
}
const defaults: StrategyOptions = {
  audience: "Startup founders",
  stage: "Pre-launch",
  risk: "Medium",
  depth: "Balanced",
};
const key = "playground-strategy-options";
function read(): StrategyOptions {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return defaults;
    return Object.fromEntries(
      Object.entries(defaults).map(([field, fallback]) => [
        field,
        typeof value[field] === "string" ? value[field].slice(0, 80) : fallback,
      ]),
    ) as unknown as StrategyOptions;
  } catch {
    return defaults;
  }
}
let snapshot = read();
const listeners = new Set<() => void>();
export function saveStrategyOptions(value: StrategyOptions) {
  snapshot = { ...value };
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    /* In-memory configuration still works. */
  }
  listeners.forEach((listener) => listener());
}
export function getStrategyOptions() {
  return snapshot;
}
export function resetStrategyOptions() {
  saveStrategyOptions(defaults);
}
export function useStrategyOptions() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => defaults,
  );
}
