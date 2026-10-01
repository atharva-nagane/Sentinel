const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveServiceName, getService, SERVICE_NAMES } = require("../src/lib/serviceRegistry.js");

test("resolves both the camelCase and docker-compose names to the same service", () => {
  assert.equal(resolveServiceName("paymentService"), "paymentService");
  assert.equal(resolveServiceName("payment-service"), "paymentService");
});

test("returns null for an unknown or non-string name", () => {
  assert.equal(resolveServiceName("not-a-service"), null);
  assert.equal(resolveServiceName(undefined), null);
  assert.equal(resolveServiceName(42), null);
});

test("getService throws for an unknown service", () => {
  assert.throws(() => getService("notAService"), /Unknown service/);
});

test("getService returns the resolved name alongside its url and compose service", () => {
  const service = getService("order-service");
  assert.equal(service.name, "orderService");
  assert.equal(service.composeService, "order-service");
  assert.ok(service.url);
});

test("SERVICE_NAMES lists all four backend services", () => {
  assert.deepEqual(new Set(SERVICE_NAMES), new Set(["gateway", "userService", "orderService", "paymentService"]));
});
