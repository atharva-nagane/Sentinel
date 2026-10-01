const test = require("node:test");
const assert = require("node:assert/strict");

const trafficRerouter = require("../src/trafficRerouter.js");

test.afterEach(() => {
  for (const entry of trafficRerouter.list()) trafficRerouter.restore(entry.service);
});

test("a service is available until isolated", () => {
  assert.equal(trafficRerouter.isAvailable("paymentService"), true);
  trafficRerouter.isolate("paymentService", "highErrorRate");
  assert.equal(trafficRerouter.isAvailable("paymentService"), false);
});

test("isolate records the reason and a timestamp, restore clears it", () => {
  trafficRerouter.isolate("orderService", "heartbeatTimeout");
  const [entry] = trafficRerouter.list();
  assert.equal(entry.service, "orderService");
  assert.equal(entry.reason, "heartbeatTimeout");
  assert.ok(entry.since);

  trafficRerouter.restore("orderService");
  assert.equal(trafficRerouter.isAvailable("orderService"), true);
  assert.equal(trafficRerouter.list().length, 0);
});

test("isolating an already-isolated service keeps the original reason and timestamp", () => {
  trafficRerouter.isolate("paymentService", "highErrorRate");
  const first = trafficRerouter.list()[0];
  trafficRerouter.isolate("paymentService", "highLatency");
  const second = trafficRerouter.list()[0];
  assert.deepEqual(first, second);
});

test("restoring a service that was never isolated is a no-op", () => {
  assert.doesNotThrow(() => trafficRerouter.restore("userService"));
  assert.equal(trafficRerouter.isAvailable("userService"), true);
});
