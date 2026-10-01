const test = require("node:test");
const assert = require("node:assert/strict");

const { findContainer } = require("../src/lib/docker.js");

test.afterEach(() => {
  delete process.env.PAYMENTSERVICE_CONTAINER;
});

test("an explicit <NAME>_CONTAINER override wins without touching the real docker CLI", async () => {
  process.env.PAYMENTSERVICE_CONTAINER = "sentinel-payment-service-1";
  const id = await findContainer({ name: "paymentService", composeService: "payment-service" });
  assert.equal(id, "sentinel-payment-service-1");
});

test("without an override, findContainer falls through to the real docker CLI and rejects if it's unavailable", async () => {
  // No Docker daemon is available in the test environment; this confirms the
  // lookup path is actually exercised (and fails loudly) rather than silently
  // short-circuiting.
  await assert.rejects(() => findContainer({ name: "paymentService", composeService: "payment-service" }));
});
