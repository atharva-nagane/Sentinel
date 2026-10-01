const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

// serviceRegistry.js (required transitively by src/index.js) reads each
// service's URL from the environment once, at require time - so the fake
// upstream servers below must be listening, and these env vars set, before
// src/index.js is required anywhere in this file.
function startControllableHealthServer() {
  const state = { mode: "healthy", calls: 0, failFirst: 0 };
  const server = http.createServer((req, res) => {
    state.calls += 1;
    res.setHeader("content-type", "application/json");
    if (state.mode === "unhealthy" || state.calls <= state.failFirst) {
      res.statusCode = 503;
      res.end(JSON.stringify({ service: "test", status: "unhealthy" }));
      return;
    }
    res.statusCode = 200;
    res.end(JSON.stringify({ service: "test", status: "healthy" }));
  });
  return { server, state };
}

const userHealth = startControllableHealthServer();
const orderHealth = startControllableHealthServer();
const paymentHealth = startControllableHealthServer();

test.before(async () => {
  await Promise.all(
    [userHealth, orderHealth, paymentHealth].map(
      ({ server }) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    )
  );
  process.env.USER_SERVICE_URL = `http://127.0.0.1:${userHealth.server.address().port}`;
  process.env.ORDER_SERVICE_URL = `http://127.0.0.1:${orderHealth.server.address().port}`;
  process.env.PAYMENT_SERVICE_URL = `http://127.0.0.1:${paymentHealth.server.address().port}`;
});

test.after(() => {
  userHealth.server.close();
  orderHealth.server.close();
  paymentHealth.server.close();
});

test("a direct retry success closes the session without ever opening the breaker", async () => {
  const { runRecoveryPipeline } = require("../src/index.js");
  const { getBreaker } = require("../src/circuitBreaker.js");
  const recoveryStore = require("../src/lib/recoveryStore.js");
  const trafficRerouter = require("../src/trafficRerouter.js");

  userHealth.state.mode = "healthy";
  userHealth.state.failFirst = 0;

  const alert = { alertId: "pipe_1", service: "userService", reason: "heartbeatTimeout" };
  const session = recoveryStore.startSession(alert);
  await runRecoveryPipeline(alert, session);

  assert.equal(getBreaker("userService").state, "closed");
  assert.equal(trafficRerouter.isAvailable("userService"), true);
  assert.ok(session.endedAt);

  const retryEvent = session.actions
    .map((id) => recoveryStore.getAction(id))
    .find((a) => a.action === "retry");
  assert.equal(retryEvent.outcome, "succeeded");
});

test("exhausted retries and exhausted half-open cycles leave the service isolated", async () => {
  const { runRecoveryPipeline } = require("../src/index.js");
  const { getBreaker } = require("../src/circuitBreaker.js");
  const recoveryStore = require("../src/lib/recoveryStore.js");
  const trafficRerouter = require("../src/trafficRerouter.js");

  // Seed a fast breaker config for this service before the pipeline's own
  // getBreaker(service) call registers the slow production defaults
  // (15s cooldown) - getBreaker only applies options on first registration.
  const breaker = getBreaker("orderService", { failureThreshold: 3, successThreshold: 1, resetTimeoutMs: 20 });
  orderHealth.state.mode = "unhealthy";
  orderHealth.state.failFirst = 0;

  const alert = { alertId: "pipe_2", service: "orderService", reason: "highErrorRate" };
  const session = recoveryStore.startSession(alert);
  await runRecoveryPipeline(alert, session);

  assert.equal(breaker.state, "open");
  assert.equal(trafficRerouter.isAvailable("orderService"), false);
  assert.ok(session.endedAt);

  const events = session.actions.map((id) => recoveryStore.getAction(id));
  assert.equal(events.find((a) => a.action === "retry").outcome, "failed");
  assert.equal(events.find((a) => a.action === "circuitBreakerOpen").outcome, "failed");
});

test("a service recovering during the half-open phase closes the breaker and restores traffic", async () => {
  const { runRecoveryPipeline } = require("../src/index.js");
  const { getBreaker } = require("../src/circuitBreaker.js");
  const recoveryStore = require("../src/lib/recoveryStore.js");
  const trafficRerouter = require("../src/trafficRerouter.js");

  const breaker = getBreaker("paymentService", { failureThreshold: 3, successThreshold: 1, resetTimeoutMs: 20 });
  // Fails every retry attempt (4, with the default RETRY_OPTIONS), then
  // starts succeeding once the half-open phase begins probing.
  paymentHealth.state.mode = "flaky";
  paymentHealth.state.failFirst = 4;
  paymentHealth.state.calls = 0;

  const alert = { alertId: "pipe_3", service: "paymentService", reason: "unreachable" };
  const session = recoveryStore.startSession(alert);
  await runRecoveryPipeline(alert, session);

  assert.equal(breaker.state, "closed");
  assert.equal(trafficRerouter.isAvailable("paymentService"), true);

  const events = session.actions.map((id) => recoveryStore.getAction(id));
  assert.equal(events.find((a) => a.action === "retry").outcome, "failed");
  assert.equal(events.find((a) => a.action === "circuitBreakerOpen").outcome, "succeeded");
  assert.ok(events.find((a) => a.action === "circuitBreakerClosed"));
});
