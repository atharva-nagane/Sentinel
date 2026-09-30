// Entrypoint for failure detection. Reads monitoring snapshots, runs heartbeat,
// timeout, and threshold checks against them, and emits alerts.
// Owner: Om Kottawar (Member 3 - Failure Detection)

const axios = require("axios");
const express = require("express");

const heartbeatCheck = require("./heartbeatCheck");
const timeoutDetector = require("./timeoutDetector");
const thresholdRules = require("./thresholdRules");
const alertEmitter = require("./alertEmitter");

const DEFAULT_MONITORING_URL = "http://monitoring:4001";
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MONITORING_TIMEOUT_MS = 2000;
const DEFAULT_PORT = 4002;

function positiveIntegerOr(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const MONITORING_URL = process.env.MONITORING_URL || DEFAULT_MONITORING_URL;
const POLL_INTERVAL_MS = positiveIntegerOr(
  process.env.POLL_INTERVAL_MS,
  DEFAULT_POLL_INTERVAL_MS
);
const MONITORING_TIMEOUT_MS = positiveIntegerOr(
  process.env.MONITORING_TIMEOUT_MS,
  DEFAULT_MONITORING_TIMEOUT_MS
);

function snapshotsUrl(baseUrl) {
  return new URL("/snapshots", baseUrl).toString();
}

function snapshotList(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && Array.isArray(data.snapshots)) {
    return data.snapshots;
  }

  throw new Error("Monitoring response must contain a snapshots array");
}

async function fetchSnapshots({
  client = axios,
  monitoringUrl = MONITORING_URL,
  timeoutMs = MONITORING_TIMEOUT_MS,
} = {}) {
  const response = await client.get(snapshotsUrl(monitoringUrl), {
    timeout: timeoutMs,
  });

  return snapshotList(response.data);
}

async function processSnapshot(
  snapshot,
  {
    activeServices = new Set(),
    heartbeat = heartbeatCheck,
    timeout = timeoutDetector,
    thresholds = thresholdRules,
    emitter = alertEmitter,
    clock = () => new Date(),
  } = {}
) {
  if (
    !snapshot ||
    typeof snapshot.service !== "string" ||
    snapshot.service.length === 0
  ) {
    throw new TypeError("snapshot.service must be a non-empty string");
  }

  const service = snapshot.service;
  const timeoutFailure = timeout(service, snapshot);
  const heartbeatFailure = timeoutFailure
    ? null
    : heartbeat(service, snapshot, { now: clock() });

  const thresholdFailure =
    timeoutFailure || heartbeatFailure || snapshot.reachable === false
      ? null
      : thresholds.checkThresholds(snapshot);

  const failure = timeoutFailure || heartbeatFailure || thresholdFailure;

  if (!failure) {
    const wasActive = activeServices.delete(service);
    return { alert: null, recovered: wasActive };
  }

  if (activeServices.has(service)) {
    return {
      alert: null,
      recovered: false,
      deduplicated: true,
      failure,
    };
  }

  // Mark the service before awaiting the emitter so a re-entrant cycle cannot
  // create duplicate alerts. Roll back if alert assembly unexpectedly fails.
  activeServices.add(service);

  try {
    const alert = await emitter({
      service,
      reason: failure.reason,
      detectedAt: snapshot.collectedAt || clock().toISOString(),
      details: failure.details,
    });

    return { alert, recovered: false, deduplicated: false };
  } catch (error) {
    activeServices.delete(service);
    throw error;
  }
}

async function processSnapshots(snapshots, options = {}) {
  if (!Array.isArray(snapshots)) {
    throw new TypeError("snapshots must be an array");
  }

  const results = [];
  for (const snapshot of snapshots) {
    results.push(await processSnapshot(snapshot, options));
  }

  return results;
}

function startPolling({
  intervalMs = POLL_INTERVAL_MS,
  monitoringUrl = MONITORING_URL,
  timeoutMs = MONITORING_TIMEOUT_MS,
  client = axios,
  emitter = alertEmitter,
  heartbeat = heartbeatCheck,
} = {}) {
  const activeServices = new Set();
  let inFlight = false;
  let stopped = false;

  const poll = async () => {
    if (inFlight || stopped) {
      return;
    }

    inFlight = true;
    try {
      const snapshots = await fetchSnapshots({
        client,
        monitoringUrl,
        timeoutMs,
      });

      await processSnapshots(snapshots, {
        activeServices,
        heartbeat,
        emitter,
      });
    } catch (error) {
      console.error(
        `[failure-detection] poll cycle failed: ${error.message}`
      );
    } finally {
      inFlight = false;
    }
  };

  void poll();
  const timer = setInterval(() => void poll(), intervalMs);

  return {
    activeServices,
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

function createApp({ emitter = alertEmitter } = {}) {
  const app = express();

  app.get("/alerts", (request, response) => {
    const limit = request.query.limit === undefined ? 100 : request.query.limit;
    response.json({ alerts: emitter.listAlerts(limit) });
  });

  app.get("/health", (_request, response) => {
    response.json({
      service: "failureDetection",
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  return app;
}

function startFailureDetectionServer({
  port = positiveIntegerOr(process.env.PORT, DEFAULT_PORT),
  ...pollOptions
} = {}) {
  const app = createApp({ emitter: pollOptions.emitter || alertEmitter });
  const server = app.listen(port, () => {
    console.log(`Failure detection listening on port ${port}`);
  });
  const polling = startPolling(pollOptions);

  return {
    server,
    polling,
    stop() {
      polling.stop();
      server.close();
    },
  };
}

if (require.main === module) {
  startFailureDetectionServer();
}

module.exports = {
  DEFAULT_MONITORING_URL,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_MONITORING_TIMEOUT_MS,
  DEFAULT_PORT,
  MONITORING_URL,
  POLL_INTERVAL_MS,
  MONITORING_TIMEOUT_MS,
  fetchSnapshots,
  processSnapshot,
  processSnapshots,
  startPolling,
  createApp,
  startFailureDetectionServer,
};
