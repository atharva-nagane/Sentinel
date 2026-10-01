const test = require("node:test");
const assert = require("node:assert/strict");

const faultStore = require("../src/lib/faultStore.js");

function command(overrides = {}) {
  return { command: "addLatency", targetService: "paymentService", params: { latencyMs: 100, durationSeconds: 5 }, ...overrides };
}

test("create assigns a faultId and starts in the starting status", () => {
  const fault = faultStore.create(command());
  assert.ok(fault.faultId.startsWith("fault_"));
  assert.equal(fault.status, "starting");
  assert.equal(fault.endedAt, null);
});

test("endsAt is derived from durationSeconds, null without one", () => {
  const withDuration = faultStore.create(command());
  assert.ok(withDuration.endsAt);

  const withoutDuration = faultStore.create(command({ command: "killService", params: {} }));
  assert.equal(withoutDuration.endsAt, null);
});

test("update merges changes and get reflects them", () => {
  const fault = faultStore.create(command());
  faultStore.update(fault.faultId, { status: "active", details: { container: "abc" } });

  const fetched = faultStore.get(fault.faultId);
  assert.equal(fetched.status, "active");
  assert.deepEqual(fetched.details, { container: "abc" });
});

test("findActive matches an in-flight fault by command and target, ignores ended ones", () => {
  const fault = faultStore.create(command({ targetService: "orderService" }));
  assert.equal(faultStore.findActive("addLatency", "orderService"), fault);

  faultStore.update(fault.faultId, { status: "completed", endedAt: new Date().toISOString() });
  assert.equal(faultStore.findActive("addLatency", "orderService"), undefined);
});

test("get returns null for an unknown faultId", () => {
  assert.equal(faultStore.get("fault_does_not_exist"), null);
});

test("list returns newest-first snapshots", () => {
  const older = faultStore.create(command({ targetService: "gateway" }));
  const newer = faultStore.create(command({ targetService: "gateway" }));
  const list = faultStore.list();
  const newerIndex = list.findIndex((f) => f.faultId === newer.faultId);
  const olderIndex = list.findIndex((f) => f.faultId === older.faultId);
  assert.ok(newerIndex < olderIndex);
});

test("get reflects the handle's live progress() when one is set", () => {
  const fault = faultStore.create(command({ command: "overloadService", targetService: "userService" }));
  faultStore.setHandle(fault.faultId, { progress: () => ({ sent: 42 }) });

  const snapshot = faultStore.get(fault.faultId);
  assert.deepEqual(snapshot.result, { sent: 42 });
});

test("update with endedAt clears the fault's handle", () => {
  const fault = faultStore.create(command({ targetService: "paymentService" }));
  faultStore.setHandle(fault.faultId, { stop: () => {} });
  assert.ok(faultStore.getHandle(fault.faultId));

  faultStore.update(fault.faultId, { status: "completed", endedAt: new Date().toISOString() });
  assert.equal(faultStore.getHandle(fault.faultId), undefined);
});
