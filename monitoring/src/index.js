// Polls each service's /health endpoint and exposes the latest snapshots.
// Owner: Om Sawkare (Member 2 - System and Service Monitoring)

const axios = require("axios");
const express = require("express");
const cpuCollector = require("./collectors/cpuCollector");
const memoryCollector = require("./collectors/memoryCollector");
const responseTimeCollector = require("./collectors/responseTimeCollector");
const errorRateCollector = require("./collectors/errorRateCollector");
const metricsStore = require("./metricsStore");

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_HEALTH_TIMEOUT_MS = 2000;
const DEFAULT_PORT = 4001;

const SERVICE_DEFINITIONS = {
  gateway: {
    urlEnv: "GATEWAY_URL",
    defaultUrl: "http://localhost:3000",
    aliases: [],
  },
  userService: {
    urlEnv: "USER_SERVICE_URL",
    defaultUrl: "http://localhost:3001",
    aliases: ["user-service"],
  },
  orderService: {
    urlEnv: "ORDER_SERVICE_URL",
    defaultUrl: "http://localhost:3002",
    aliases: ["order-service"],
  },
  paymentService: {
    urlEnv: "PAYMENT_SERVICE_URL",
    defaultUrl: "http://localhost:3003",
    aliases: ["payment-service"],
  },
};

const SERVICE_ALIASES = new Map(
  Object.entries(SERVICE_DEFINITIONS).flatMap(([serviceName, definition]) =>
    definition.aliases.map((alias) => [alias, serviceName])
  )
);

function positiveIntegerOr(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const POLL_INTERVAL_MS = positiveIntegerOr(
  process.env.POLL_INTERVAL_MS,
  DEFAULT_POLL_INTERVAL_MS
);
const HEALTH_TIMEOUT_MS = positiveIntegerOr(
  process.env.HEALTH_TIMEOUT_MS,
  DEFAULT_HEALTH_TIMEOUT_MS
);

function getTargets({
  targetServices = process.env.TARGET_SERVICES,
  env = process.env,
} = {}) {
  const requestedServices =
    typeof targetServices === "string"
      ? targetServices.split(",").map((name) => name.trim()).filter(Boolean)
      : [];
  const serviceNames = requestedServices.length
    ? requestedServices
    : Object.keys(SERVICE_DEFINITIONS);

  return serviceNames.map((requestedName) => {
    const serviceName = SERVICE_ALIASES.get(requestedName) || requestedName;
    const definition = SERVICE_DEFINITIONS[serviceName];

    if (!definition) {
      throw new Error(
        `Unknown monitoring target "${requestedName}". Supported services: ${Object.keys(
          SERVICE_DEFINITIONS
        ).join(", ")}`
      );
    }

    const baseUrl = env[definition.urlEnv] || definition.defaultUrl;
    let healthUrl;
    try {
      healthUrl = new URL("/health", baseUrl).toString();
    } catch {
      throw new Error(`${definition.urlEnv} must be a valid service base URL`);
    }

    return { service: serviceName, url: healthUrl };
  });
}

const TARGETS = getTargets();

function numericMetric(value) {
  return Number.isFinite(value) ? value : null;
}

function unreachableSnapshot(serviceName, collectedAt) {
  return {
    service: serviceName,
    collectedAt,
    reachable: false,
    cpuPercent: null,
    memoryMb: null,
    avgResponseTimeMs: null,
    requestCount: null,
    errorRate: null,
  };
}

async function pollService(
  target,
  {
    client = axios,
    store = metricsStore,
    timeoutMs = HEALTH_TIMEOUT_MS,
    clock = () => new Date(),
  } = {}
) {
  let snapshot;

  try {
    const requestStartedAt = Date.now();
    const response = await client.get(target.url, { timeout: timeoutMs });
    // How long monitoring itself waited for the response, as opposed to the
    // self-reported avgResponseTimeMs below (the service's own view of how
    // long IT takes to serve requests). A network-level problem between here
    // and the service - like injected latency - slows this down without the
    // service ever seeing it, so it wouldn't show up self-reported alone.
    const observedResponseTimeMs = Date.now() - requestStartedAt;
    if (
      typeof response.status === "number" &&
      (response.status < 200 || response.status >= 300)
    ) {
      throw new Error(`Health endpoint returned HTTP ${response.status}`);
    }

    const healthPayload = response.data;
    const errorMetrics = errorRateCollector(healthPayload);
    const selfReportedResponseTimeMs = responseTimeCollector(healthPayload);
    snapshot = {
      service: target.service,
      collectedAt: clock().toISOString(),
      reachable: true,
      cpuPercent: cpuCollector(healthPayload),
      memoryMb: memoryCollector(healthPayload),
      avgResponseTimeMs:
        selfReportedResponseTimeMs === null
          ? observedResponseTimeMs
          : Math.max(selfReportedResponseTimeMs, observedResponseTimeMs),
      requestCount: numericMetric(errorMetrics.requestCount),
      errorRate: numericMetric(errorMetrics.errorRate),
    };
  } catch {
    snapshot = unreachableSnapshot(target.service, clock().toISOString());
  }

  store.setSnapshot(target.service, snapshot);
  return snapshot;
}

function pollServices(targets = TARGETS, options = {}) {
  return Promise.all(targets.map((target) => pollService(target, options)));
}

function startPolling({
  targets = TARGETS,
  intervalMs = POLL_INTERVAL_MS,
  timeoutMs = HEALTH_TIMEOUT_MS,
  client = axios,
  store = metricsStore,
} = {}) {
  let inFlight = false;
  let stopped = false;

  const poll = async () => {
    if (inFlight || stopped) return;
    inFlight = true;
    try {
      await pollServices(targets, { client, store, timeoutMs });
    } catch (error) {
      console.error("Monitoring poll cycle failed:", error.message);
    } finally {
      inFlight = false;
    }
  };

  // Collect once immediately so the HTTP API is populated as soon as possible.
  void poll();
  const timer = setInterval(() => void poll(), intervalMs);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

function createApp(store = metricsStore) {
  const app = express();
  const snapshotsHandler = (_request, response) => {
    response.json({ snapshots: store.getAllSnapshots() });
  };

  // /snapshots is the failure-detection handoff; /metrics/latest is used by
  // the dashboard's existing Vite proxy configuration.
  app.get(["/snapshots", "/metrics/latest"], snapshotsHandler);
  app.get("/health", (_request, response) => {
    response.json({
      service: "monitoring",
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

function startMonitoringServer({
  port = positiveIntegerOr(process.env.PORT, DEFAULT_PORT),
  targets = TARGETS,
  intervalMs = POLL_INTERVAL_MS,
  timeoutMs = HEALTH_TIMEOUT_MS,
  client = axios,
  store = metricsStore,
} = {}) {
  const server = createApp(store).listen(port, () => {
    console.log(`Monitoring service listening on port ${port}`);
  });
  const polling = startPolling({ targets, intervalMs, timeoutMs, client, store });

  return {
    server,
    stop() {
      polling.stop();
      server.close();
    },
  };
}

if (require.main === module) {
  startMonitoringServer();
}

module.exports = {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_HEALTH_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  HEALTH_TIMEOUT_MS,
  TARGETS,
  getTargets,
  pollService,
  pollServices,
  startPolling,
  createApp,
  startMonitoringServer,
};
