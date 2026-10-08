import { useSyncExternalStore } from "react";
import { actionIds, normalizeActionIds, type ActionId } from "./actions";

export interface DecisionState {
  draftActionIds: ActionId[];
  committedActionIds: ActionId[];
}
type StorageLike = Pick<Storage, "getItem" | "setItem">;
const storageKey = "playground-decision-experiments-v1";
const schema = 1;

export function parseDecisionState(raw: string | null): DecisionState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("schema" in value) ||
      value.schema !== schema ||
      !("state" in value) ||
      !value.state ||
      typeof value.state !== "object"
    )
      return null;
    const state = value.state as Record<string, unknown>;
    const valid = (ids: unknown): ids is ActionId[] =>
      Array.isArray(ids) &&
      ids.every(
        (id) => typeof id === "string" && actionIds.includes(id as ActionId),
      ) &&
      new Set(ids).size === ids.length;
    if (!valid(state.draftActionIds) || !valid(state.committedActionIds))
      return null;
    return {
      draftActionIds: normalizeActionIds(state.draftActionIds),
      committedActionIds: normalizeActionIds(state.committedActionIds),
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

export function createDecisionStore(
  storage: StorageLike | null = browserStorage(),
) {
  let restored: DecisionState | null = null;
  try {
    restored = parseDecisionState(storage?.getItem(storageKey) ?? null);
  } catch {
    /* Continue locally if browser storage is blocked. */
  }
  let state: DecisionState = restored ?? {
    draftActionIds: [...actionIds],
    committedActionIds: [...actionIds],
  };
  const listeners = new Set<() => void>();
  function publish(next: DecisionState) {
    state = next;
    try {
      storage?.setItem(storageKey, JSON.stringify({ schema, state }));
    } catch {
      /* Selections still work without persistence. */
    }
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    toggleAction(id: string) {
      if (!actionIds.includes(id as ActionId)) return;
      publish({
        ...state,
        draftActionIds: normalizeActionIds(
          state.draftActionIds.includes(id as ActionId)
            ? state.draftActionIds.filter((item) => item !== id)
            : [...state.draftActionIds, id],
        ),
      });
    },
    selectAll() {
      publish({ ...state, draftActionIds: [...actionIds] });
    },
    commitChanges(ids: readonly string[] = state.draftActionIds) {
      const selected = normalizeActionIds(ids);
      publish({
        draftActionIds: [...selected],
        committedActionIds: [...selected],
      });
      return selected;
    },
    resetChanges() {
      publish({
        draftActionIds: [...actionIds],
        committedActionIds: [...actionIds],
      });
    },
  };
}

export type DecisionStore = ReturnType<typeof createDecisionStore>;
export const decisionStore = createDecisionStore();

export function useDecision() {
  const state = useSyncExternalStore(
    decisionStore.subscribe,
    decisionStore.getSnapshot,
    decisionStore.getSnapshot,
  );
  return {
    ...state,
    toggleAction: decisionStore.toggleAction,
    selectAll: decisionStore.selectAll,
    commitChanges: decisionStore.commitChanges,
    resetChanges: decisionStore.resetChanges,
  };
}
