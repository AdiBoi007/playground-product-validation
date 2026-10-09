import test from "node:test";
import assert from "node:assert/strict";
import { buildBehaviourGraph, modelDecision } from "../src/policy.mjs";
test("the state graph actually observes, decides, acts and carries memory between steps", async () => {
  const order = [];
  const graph = buildBehaviourGraph({
    observe: async (state) => {
      order.push("observe");
      return {
        observation: { text: "Available control", elements: [] },
        done: state.step >= 2,
      };
    },
    decide: async (state) => {
      order.push("decide");
      return { memory: `step ${state.step}`, action: "wait" };
    },
    act: async (state) => {
      order.push("act");
      return { step: state.step + 1, memory: state.decision.memory };
    },
  });
  const result = await graph.invoke({ step: 0, memory: "", done: false });
  assert.deepEqual(order, [
    "observe",
    "decide",
    "act",
    "observe",
    "decide",
    "act",
    "observe",
  ]);
  assert.equal(result.memory, "step 1");
});
test("the policy refuses unconfigured models and exhausted budgets before network access", async () => {
  const state = {
    spec: {
      settings: { maxModelTokens: 100, maxCostUsd: 0, model: "gpt-6-luna" },
    },
    persona: {},
    task: {},
    memory: "",
    observation: { elements: [] },
  };
  await assert.rejects(
    modelDecision(state, {
      env: {},
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    }),
    /Configure/,
  );
  await assert.rejects(
    modelDecision(state, {
      env: { OPENAI_API_KEY: "not-a-real-key" },
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    }),
    /budget/,
  );
});
