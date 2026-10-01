const test = require("node:test");
const assert = require("node:assert/strict");

const recoveryStore = require("../src/lib/recoveryStore.js");

function alert(overrides = {}) {
  return { alertId: "alert_1", service: "paymentService", reason: "highErrorRate", ...overrides };
}

test("startAction assigns a fresh recoveryId per action, not per session", () => {
  const session = recoveryStore.startSession(alert());
  const retry = recoveryStore.startAction(session, "retry");
  const breakerOpen = recoveryStore.startAction(session, "circuitBreakerOpen");

  assert.notEqual(retry.recoveryId, breakerOpen.recoveryId);
  assert.equal(retry.alertId, breakerOpen.alertId, "both actions share the triggering alert");
});

test("resolveAction updates outcome in place and appends a new chronological event", () => {
  const session = recoveryStore.startSession(alert({ alertId: "alert_2" }));
  const action = recoveryStore.startAction(session, "retry");
  assert.equal(action.outcome, "inProgress");

  recoveryStore.resolveAction(action.recoveryId, { outcome: "succeeded" });
  const resolved = recoveryStore.getAction(action.recoveryId);
  assert.equal(resolved.outcome, "succeeded");
  assert.ok(resolved.completedAt);

  const events = recoveryStore.listEvents(10).filter((e) => e.recoveryId === action.recoveryId);
  assert.equal(events.length, 2, "both the inProgress and succeeded snapshots are kept");
  assert.equal(events[0].outcome, "inProgress");
  assert.equal(events[1].outcome, "succeeded");
});

test("resolveAction throws for an unknown recoveryId", () => {
  assert.throws(() => recoveryStore.resolveAction("recovery_does_not_exist", { outcome: "succeeded" }));
});

test("listEvents stays chronological (oldest first) across sessions", () => {
  const session = recoveryStore.startSession(alert({ alertId: "alert_3" }));
  const first = recoveryStore.startAction(session, "retry");
  const second = recoveryStore.startAction(session, "circuitBreakerOpen");

  const events = recoveryStore.listEvents(100);
  const firstIndex = events.findIndex((e) => e.recoveryId === first.recoveryId);
  const secondIndex = events.findIndex((e) => e.recoveryId === second.recoveryId);
  assert.ok(firstIndex < secondIndex, "retry must appear before circuitBreakerOpen");
});

test("listEvents with limit <= 0 returns nothing, not the whole log", () => {
  const session = recoveryStore.startSession(alert({ alertId: "alert_4" }));
  recoveryStore.startAction(session, "retry");

  assert.deepEqual(recoveryStore.listEvents(0), []);
  assert.deepEqual(recoveryStore.listEvents(-5), []);
});

test("findActiveSessionForService only matches a session that hasn't ended", () => {
  const session = recoveryStore.startSession(alert({ alertId: "alert_5", service: "orderService" }));
  assert.equal(recoveryStore.findActiveSessionForService("orderService"), session);

  recoveryStore.endSession(session);
  assert.equal(recoveryStore.findActiveSessionForService("orderService"), undefined);
});

test("listSessions expands each session's actions in order, newest session first", () => {
  const older = recoveryStore.startSession(alert({ alertId: "alert_6", service: "gateway" }));
  recoveryStore.startAction(older, "retry");
  const newer = recoveryStore.startSession(alert({ alertId: "alert_7", service: "gateway" }));
  recoveryStore.startAction(newer, "retry");

  const sessions = recoveryStore.listSessions();
  const newerIndex = sessions.findIndex((s) => s.id === newer.id);
  const olderIndex = sessions.findIndex((s) => s.id === older.id);
  assert.ok(newerIndex < olderIndex, "listSessions is newest-first");
  assert.equal(sessions[newerIndex].actions.length, 1);
  assert.equal(sessions[newerIndex].actions[0].action, "retry");
});
