const test = require("node:test");
const assert = require("node:assert/strict");

const { validateCommand, COMMANDS } = require("../src/lib/validateCommand.js");

test("accepts a well-formed addLatency command and normalizes the service name", () => {
  const result = validateCommand({
    command: "addLatency",
    targetService: "payment-service",
    params: { latencyMs: 5000, durationSeconds: 30 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.command.targetService, "paymentService");
  assert.deepEqual(result.command.params, { latencyMs: 5000, durationSeconds: 30 });
  assert.equal(result.command.requestedBy, "unknown");
  assert.ok(result.command.requestedAt);
});

test("rejects an unknown command", () => {
  const result = validateCommand({ command: "deleteEverything", targetService: "gateway", params: {} });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("command must be one of")));
});

test("rejects an unknown target service", () => {
  const result = validateCommand({ command: "killService", targetService: "notAService", params: {} });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("targetService")));
});

test("rejects a non-object body", () => {
  assert.equal(validateCommand(null).ok, false);
  assert.equal(validateCommand("addLatency").ok, false);
  assert.equal(validateCommand([1, 2, 3]).ok, false);
});

test("rejects a missing required param", () => {
  const result = validateCommand({ command: "addLatency", targetService: "gateway", params: { latencyMs: 100 } });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("durationSeconds is required")));
});

test("rejects a param outside its allowed range", () => {
  const result = validateCommand({
    command: "overloadService",
    targetService: "gateway",
    params: { requestsPerSecond: 5000, durationSeconds: 10 },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("must be between")));
});

test("rejects a non-integer param", () => {
  const result = validateCommand({
    command: "addLatency",
    targetService: "gateway",
    params: { latencyMs: 100.5, durationSeconds: 10 },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("whole number")));
});

test("rejects a param not valid for the given command", () => {
  const result = validateCommand({
    command: "killService",
    targetService: "gateway",
    params: { latencyMs: 100 },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("not valid for killService")));
});

test("killService's only param is optional", () => {
  const result = validateCommand({ command: "killService", targetService: "gateway", params: {} });
  assert.equal(result.ok, true);
  assert.deepEqual(result.command.params, {});
});

test("rejects a malformed requestedAt timestamp", () => {
  const result = validateCommand({
    command: "killService",
    targetService: "gateway",
    params: {},
    requestedAt: "not-a-date",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("requestedAt")));
});

test("every documented command is covered by a param rule set", () => {
  assert.deepEqual(new Set(COMMANDS), new Set(["killService", "addLatency", "overloadService"]));
});
