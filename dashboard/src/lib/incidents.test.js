// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIncidents, servicesWithOpenIncidents } from "./incidents.js";

const alert = {
  alertId: "alert_1",
  service: "paymentService",
  status: "unhealthy",
  reason: "heartbeatTimeout",
  detectedAt: "2026-09-01T10:15:45.000Z",
  affectedServices: ["orderService", "gateway"],
};
const recovery = (overrides) => ({
  recoveryId: "recovery_1",
  alertId: "alert_1",
  service: "paymentService",
  action: "circuitBreakerOpen",
  startedAt: "2026-09-01T10:15:46.000Z",
  completedAt: null,
  outcome: "inProgress",
  ...overrides,
});
const states = (incident) => incident.stages.map((s) => s.state);

test("alert with no recovery yet is at Failure Detected", () => {
  const [i] = buildIncidents([alert], []);
  assert.equal(i.outcome, "detected");
  assert.deepEqual(states(i), ["done", "done", "active", "pending"]);
});

test("in-progress recovery marks Recovery Started", () => {
  const [i] = buildIncidents([alert], [recovery()]);
  assert.equal(i.outcome, "recovering");
  assert.deepEqual(states(i), ["done", "done", "done", "active"]);
  assert.equal(i.stages[2].at, "2026-09-01T10:15:46.000Z");
});

test("later event with same recoveryId resolves it to System Recovered", () => {
  const done = recovery({ outcome: "succeeded", completedAt: "2026-09-01T10:16:10.000Z" });
  const [i] = buildIncidents([alert], [recovery(), done]);
  assert.equal(i.recoveries.length, 1);
  assert.equal(i.outcome, "recovered");
  assert.deepEqual(states(i), ["done", "done", "done", "done"]);
  assert.equal(i.stages[3].at, "2026-09-01T10:16:10.000Z");
  assert.equal(servicesWithOpenIncidents([i]).size, 0);
});

test("recovery events only attach to their own alert", () => {
  const other = { ...alert, alertId: "alert_2", service: "userService", detectedAt: "2026-09-01T10:20:00.000Z" };
  const incidents = buildIncidents(
    [alert, other],
    [recovery({ outcome: "succeeded", completedAt: "2026-09-01T10:16:00.000Z" }), recovery({ recoveryId: "recovery_2", alertId: "alert_2" })]
  );
  const byId = Object.fromEntries(incidents.map((i) => [i.alertId, i]));
  assert.equal(byId.alert_1.outcome, "recovered");
  assert.equal(byId.alert_2.outcome, "recovering");
  assert.equal(incidents[0].alertId, "alert_2", "open incidents sort first");
  assert.deepEqual([...servicesWithOpenIncidents(incidents)], ["userService"]);
});

test("failed last action shows Recovery Failed; a later success recovers", () => {
  const failed = recovery({ action: "retry", outcome: "failed", completedAt: "2026-09-01T10:15:50.000Z" });
  assert.equal(buildIncidents([alert], [failed])[0].stages[3].state, "failed");
  const cb = recovery({ recoveryId: "recovery_2", startedAt: "2026-09-01T10:15:51.000Z", outcome: "succeeded", completedAt: "2026-09-01T10:16:05.000Z" });
  assert.equal(buildIncidents([alert], [failed, cb])[0].outcome, "recovered");
});

test("recovery for an alert not yet seen still forms an incident", () => {
  const [i] = buildIncidents([], [recovery()]);
  assert.equal(i.alertMissing, true);
  assert.equal(i.service, "paymentService");
  assert.equal(i.outcome, "recovering");
});

test("a null in a later event does not erase a known completedAt", () => {
  const done = recovery({ outcome: "succeeded", completedAt: "2026-09-01T10:16:10.000Z" });
  const [i] = buildIncidents([alert], [done, recovery({ outcome: "succeeded" })]);
  assert.equal(i.recoveries[0].completedAt, "2026-09-01T10:16:10.000Z");
});
