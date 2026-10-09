import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedWrite,
  issueWorkspace,
  permittedUrl,
  publicAddress,
  redact,
  resolveTarget,
  safeAction,
  validateSpec,
  workspaceFromCapability,
} from "../src/security.mjs";
import { fixtureSpec } from "./fixtures.mjs";

test("workspace capabilities are tamper proof and secret scoped", () => {
  const secret = "s".repeat(40),
    workspace = issueWorkspace(secret);
  assert.equal(
    workspaceFromCapability(workspace.capability, secret),
    workspace.workspaceId,
  );
  assert.throws(() =>
    workspaceFromCapability(workspace.capability + "x", secret),
  );
  assert.throws(() =>
    workspaceFromCapability(workspace.capability, "z".repeat(40)),
  );
});
test("private, metadata and reserved IPv4/IPv6 addresses are rejected", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "172.18.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
});
test("the exact origin allowlist blocks protocols, credentials and redirect origins", () => {
  assert.throws(() =>
    permittedUrl("https://evil.test", ["https://example.test"]),
  );
  assert.throws(() =>
    permittedUrl("https://person:password@example.test", [
      "https://example.test",
    ]),
  );
  assert.throws(() =>
    permittedUrl("file:///etc/passwd", ["https://example.test"]),
  );
  assert.throws(() =>
    permittedUrl("http://127.0.0.1:4000", ["http://127.0.0.1:4000"]),
  );
  assert.equal(
    permittedUrl("http://127.0.0.1:4000", ["http://127.0.0.1:4000"], {
      TWIN_TEST_ALLOWED_ORIGINS: "http://127.0.0.1:4000",
    }).origin,
    "http://127.0.0.1:4000",
  );
  assert.throws(() =>
    permittedUrl("http://127.0.0.1:4000", ["http://127.0.0.1:4000"], {
      NODE_ENV: "production",
      TWIN_TEST_ALLOWED_ORIGINS: "http://127.0.0.1:4000",
    }),
  );
});
test("DNS rebinding and mixed public/private resolutions fail closed", async () => {
  await assert.rejects(
    resolveTarget(new URL("https://example.test"), {}, async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]),
  );
  assert.equal(
    (
      await resolveTarget(new URL("https://example.test"), {}, async () => [
        { address: "8.8.8.8", family: 4 },
      ])
    ).address,
    "8.8.8.8",
  );
});
test("purchases, messages, destruction and secret fields are blocked before action", () => {
  for (const text of [
    "Place order",
    "Buy now",
    "Send message",
    "Delete account",
  ])
    assert.throws(() =>
      safeAction({ type: "click", description: "Continue" }, { text }),
    );
  assert.throws(() =>
    safeAction(
      { type: "fill", description: "Enter data", value: "abc" },
      { inputType: "password" },
    ),
  );
  assert.throws(() =>
    safeAction({ type: "press", description: "Execute", key: "F12" }),
  );
  assert.doesNotThrow(() =>
    safeAction(
      { type: "click", description: "Start booking" },
      { text: "Start booking" },
    ),
  );
});
test("writes require the intersection of approved paths and server staging configuration", () => {
  const spec = fixtureSpec("https://example.test", {
    authorizedWritePaths: ["/test/create"],
  });
  const env = {
    TWIN_SAFE_WRITE_PATHS: '{"https://example.test":["/test/create"]}',
  };
  assert.equal(
    allowedWrite(new URL("https://example.test/test/create"), spec, env),
    true,
  );
  assert.equal(
    allowedWrite(new URL("https://example.test/delete"), spec, env),
    false,
  );
  assert.equal(
    allowedWrite(new URL("https://other.test/test/create"), spec, env),
    false,
  );
  assert.equal(
    allowedWrite(new URL("https://example.test/test/create"), spec, {}),
    false,
  );
});
test("free prose criteria cannot manufacture executed success", () => {
  const spec = fixtureSpec("https://example.test");
  assert.equal(validateSpec(spec).settings.maxModelTokens, 0);
  spec.tasks[0].assertions = [];
  assert.throws(() => validateSpec(spec), /observable/);
});
test("strict campaign budgets and explicit permission are enforced before browser launch", () => {
  const spec = fixtureSpec("https://example.test");
  assert.throws(() => validateSpec({ ...spec, authorizationConfirmed: false }));
  assert.throws(() =>
    validateSpec({ ...spec, settings: { ...spec.settings, maxCostUsd: 2 } }),
  );
  assert.throws(() => validateSpec({ ...spec, mode: "behavioural" }));
});
test("redaction removes secrets and emails from recorded text", () => {
  const value = redact(
    "john@example.com sk-abcdefghijklmnop https://x.test/?token=private&next=yes",
  );
  assert.ok(!value.includes("john@"));
  assert.ok(!value.includes("abcdefghijklmnop"));
  assert.ok(!value.includes("token=private"));
});
