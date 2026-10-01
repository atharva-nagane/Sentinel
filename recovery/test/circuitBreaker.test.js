const test = require("node:test");
const assert = require("node:assert/strict");

const { CircuitBreaker, STATES } = require("../src/circuitBreaker.js");

function breaker(options = {}) {
  return new CircuitBreaker("paymentService", { failureThreshold: 3, successThreshold: 2, resetTimeoutMs: 50, ...options });
}

test("stays closed and allows requests under the failure threshold", () => {
  const b = breaker();
  b.recordFailure();
  b.recordFailure();
  assert.equal(b.state, STATES.CLOSED);
  assert.equal(b.allowRequest(), true);
});

test("opens after consecutive failures reach the threshold", () => {
  const b = breaker();
  b.recordFailure();
  b.recordFailure();
  b.recordFailure();
  assert.equal(b.state, STATES.OPEN);
  assert.equal(b.allowRequest(), false, "no trial requests before the cooldown elapses");
});

test("a success resets the failure count without closing from half-open", () => {
  const b = breaker();
  b.recordFailure();
  b.recordFailure();
  b.recordSuccess();
  b.recordFailure();
  b.recordFailure();
  assert.equal(b.state, STATES.CLOSED, "the earlier failures must not have carried over");
});

test("recordFailure is a no-op while already open", () => {
  const b = breaker();
  b.recordFailure();
  b.recordFailure();
  b.recordFailure();
  assert.equal(b.state, STATES.OPEN);
  b.recordFailure();
  b.recordFailure();
  const state = b.getState();
  assert.equal(state.failureCount, 0, "counters must not move once already open");
});

test("allowRequest transitions OPEN to HALF_OPEN only after the cooldown", async () => {
  const b = breaker({ resetTimeoutMs: 20 });
  b.recordFailure();
  b.recordFailure();
  b.recordFailure();
  assert.equal(b.allowRequest(), false);

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(b.allowRequest(), true);
  assert.equal(b.state, STATES.HALF_OPEN);
});

test("half-open closes after successThreshold consecutive successes", async () => {
  const b = breaker({ resetTimeoutMs: 10, successThreshold: 2 });
  b.recordFailure();
  b.recordFailure();
  b.recordFailure();
  await new Promise((resolve) => setTimeout(resolve, 15));
  b.allowRequest(); // consumes the trial slot, moves to HALF_OPEN

  b.recordSuccess();
  assert.equal(b.state, STATES.HALF_OPEN, "one success is not enough yet");
  b.recordSuccess();
  assert.equal(b.state, STATES.CLOSED);
});

test("a half-open failure reopens the breaker and restarts the cooldown", async () => {
  const b = breaker({ resetTimeoutMs: 10 });
  b.recordFailure();
  b.recordFailure();
  b.recordFailure();
  await new Promise((resolve) => setTimeout(resolve, 15));
  b.allowRequest();

  b.recordFailure();
  assert.equal(b.state, STATES.OPEN);
  assert.equal(b.allowRequest(), false, "a fresh cooldown must apply");
});

test("forceClose closes the breaker directly, bypassing the half-open flow", () => {
  const b = breaker();
  b.recordFailure();
  b.recordFailure();
  b.recordFailure();
  assert.equal(b.state, STATES.OPEN);
  b.forceClose();
  assert.equal(b.state, STATES.CLOSED);
  assert.equal(b.allowRequest(), true);
});

test("getBreaker returns the same instance for the same service", () => {
  const { getBreaker } = require("../src/circuitBreaker.js");
  const a = getBreaker("userService");
  const b = getBreaker("userService");
  assert.equal(a, b);
});
