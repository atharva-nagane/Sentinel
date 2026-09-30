// Tracks the last time each service was seen reachable and flags stale heartbeats.
// Owner: Om Kottawar (Member 3)

const thresholds = require("./thresholdRules");

const lastHeartbeats = new Map();

function timestampOf(value, fallback) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.getTime();
  }

  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? fallback : parsed;
}

function checkHeartbeat(
  service,
  snapshot,
  { now = new Date(), thresholdSeconds = thresholds.heartbeatTimeoutSeconds } = {}
) {
  if (typeof service !== "string" || service.length === 0 || !snapshot) {
    return null;
  }

  const nowMs = timestampOf(now, Date.now());
  const collectedAtMs = timestampOf(snapshot.collectedAt, nowMs);

  if (snapshot.reachable === true) {
    const previous = lastHeartbeats.get(service);

    // Do not move the stored heartbeat backwards if snapshots arrive out of order.
    if (!previous || collectedAtMs >= previous.timestampMs) {
      lastHeartbeats.set(service, {
        timestampMs: collectedAtMs,
        value: new Date(collectedAtMs).toISOString(),
      });
    }
  }

  const lastHeartbeat = lastHeartbeats.get(service);
  if (!lastHeartbeat) {
    return null;
  }

  const elapsedSeconds = Math.max(0, nowMs - lastHeartbeat.timestampMs) / 1000;
  if (elapsedSeconds <= thresholdSeconds) {
    return null;
  }

  return {
    reason: "heartbeatTimeout",
    details: {
      lastHeartbeatAt: lastHeartbeat.value,
      thresholdSeconds,
    },
  };
}

function reset(service) {
  if (service === undefined) {
    lastHeartbeats.clear();
  } else {
    lastHeartbeats.delete(service);
  }
}

function getLastHeartbeatAt(service) {
  return (lastHeartbeats.get(service) || {}).value || null;
}

checkHeartbeat.reset = reset;
checkHeartbeat.getLastHeartbeatAt = getLastHeartbeatAt;

module.exports = checkHeartbeat;
