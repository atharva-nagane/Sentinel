// In-memory store for recovery activity. Two levels:
//   - a "session" per alert: the whole retry -> circuit-break -> recover
//     process triggered by one alert, used only for dedupe/bookkeeping.
//   - one recovery-action event per action within that session (retry,
//     circuitBreakerOpen, circuitBreakerClosed), each with its OWN
//     recoveryId. This matches docs/apiContracts.md section 4 and
//     dashboard/src/lib/incidents.test.js: "a later event with the same
//     recoveryId" resolves ONE action's outcome - a session moving from one
//     action to the next (e.g. retry failing into circuitBreakerOpen) is a
//     NEW recoveryId, not a reused one, sharing only alertId/service.
// Owner: Atharva Nagane (Member 4)

const crypto = require("crypto");

const MAX_FINISHED_SESSIONS = 50;
const MAX_EVENTS = 500;

const sessions = new Map(); // sessionId -> session
const actionRecords = new Map(); // recoveryId -> current event snapshot
// Chronological (oldest first) log of every event snapshot ever emitted -
// dashboard/src/lib/incidents.js's mergeById folds same-recoveryId events in
// array order, letting later entries win per field, so order matters here.
let events = [];

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(3).toString("hex")}`;
}

// One alert starts one session. Sessions exist only so POST /alerts can
// reject a duplicate alert for a service that's already being worked on;
// dashboard/etc. only ever see the action events below.
function startSession(alert) {
  const session = {
    id: newId("session"),
    alertId: alert.alertId,
    service: alert.service,
    startedAt: new Date().toISOString(),
    endedAt: null,
    actions: [], // recoveryIds, in order
  };
  sessions.set(session.id, session);
  return session;
}

function endSession(session) {
  session.endedAt = new Date().toISOString();
  pruneSessions();
}

// Starts one action (shape: docs/apiContracts.md section 4, outcome starts
// "inProgress"). Returns the event, whose recoveryId is what resolveAction
// needs later.
function startAction(session, action, details = null) {
  const event = {
    recoveryId: newId("recovery"),
    alertId: session.alertId,
    service: session.service,
    action,
    startedAt: new Date().toISOString(),
    completedAt: null,
    outcome: "inProgress",
    details,
  };
  actionRecords.set(event.recoveryId, event);
  session.actions.push(event.recoveryId);
  events.push({ ...event });
  trimEvents();
  return event;
}

// Resolves an action already started with startAction, appending the
// resolved snapshot as a new entry in the event log (same recoveryId, the
// "later event" the contract describes) rather than only mutating in place.
function resolveAction(recoveryId, { outcome, completedAt = new Date().toISOString(), details }) {
  const record = actionRecords.get(recoveryId);
  if (!record) throw new Error(`Unknown recovery ${recoveryId}`);
  record.outcome = outcome;
  record.completedAt = completedAt;
  if (details !== undefined) record.details = details;
  events.push({ ...record });
  trimEvents();
  return record;
}

function trimEvents() {
  if (events.length > MAX_EVENTS) events = events.slice(events.length - MAX_EVENTS);
}

function pruneSessions() {
  const finished = [...sessions.values()].filter((s) => s.endedAt);
  finished
    .slice(0, Math.max(0, finished.length - MAX_FINISHED_SESSIONS))
    .forEach((s) => {
      s.actions.forEach((id) => actionRecords.delete(id));
      sessions.delete(s.id);
    });
}

module.exports = {
  startSession,
  endSession,
  startAction,
  resolveAction,
  getAction: (recoveryId) => actionRecords.get(recoveryId) || null,
  // Sessions with their action history expanded, newest first - for
  // debugging via GET /recoveries, not what the dashboard polls.
  listSessions: () =>
    [...sessions.values()]
      .map((s) => ({ ...s, actions: s.actions.map((id) => actionRecords.get(id)) }))
      .reverse(),
  // Most recent `limit` events, kept chronological (oldest first) - what
  // GET /events (dashboard) and GET /recoveries/events (debugging) return.
  // limit <= 0 means "none", not "all" - array.slice(-0) would otherwise
  // return the whole array since -0 === 0.
  listEvents: (limit = 50) => (limit <= 0 ? [] : events.slice(-limit)),
  findActiveSessionForService: (service) =>
    [...sessions.values()].find((s) => s.service === service && !s.endedAt),
};
