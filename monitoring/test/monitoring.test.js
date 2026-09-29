const assert = require("node:assert/strict");
const test = require("node:test");

const cpuCollector = require("../src/collectors/cpuCollector");
const memoryCollector = require("../src/collectors/memoryCollector");
const responseTimeCollector = require("../src/collectors/responseTimeCollector");
const errorRateCollector = require("../src/collectors/errorRateCollector");
const metricsStore = require("../src/metricsStore");
const {
  DEFAULT_HEALTH_TIMEOUT_MS,
  createApp,
  getTargets,
  pollService,
  pollServices,
} = require("../src");

const healthPayload = {
  service: "paymentService",
  status: "healthy",
  timestamp: "2026-09-01T10:15:30.000Z",
  uptimeSeconds: 3421,
  metrics: {
    cpuPercent: 12.4,
    memoryMb: 128.5,
    avgResponseTimeMs: 45,
    requestCount: 1023,
    errorRate: 0.02,
  },
};

function createStore() {
  const snapshots = new Map();
  return {
    setSnapshot(serviceName, snapshot) {
      snapshots.set(serviceName, snapshot);
    },
    getLatestSnapshot(serviceName) {
      return snapshots.get(serviceName) || null;
    },
    getAllSnapshots() {
      return Array.from(snapshots.values());
    },
  };
}

test("collectors extract numeric health metrics and ignore invalid values", () => {
  assert.equal(cpuCollector(healthPayload), 12.4);
  assert.equal(memoryCollector(healthPayload), 128.5);
  assert.equal(responseTimeCollector(healthPayload), 45);
  assert.deepEqual(errorRateCollector(healthPayload), {
    errorRate: 0.02,
    requestCount: 1023,
  });

  const malformedPayload = { metrics: { cpuPercent: "12", errorRate: Infinity } };
  assert.equal(cpuCollector(malformedPayload), null);
  assert.equal(memoryCollector(malformedPayload), null);
  assert.equal(responseTimeCollector(malformedPayload), null);
  assert.deepEqual(errorRateCollector(malformedPayload), {
    errorRate: null,
    requestCount: null,
  });
});

test("metricsStore returns the latest snapshot by service and as a collection", () => {
  const firstSnapshot = { service: "metricsStoreTestService", collectedAt: "first" };
  const latestSnapshot = { service: "metricsStoreTestService", collectedAt: "latest" };
  const otherSnapshot = { service: "metricsStoreOtherService", collectedAt: "other" };

  metricsStore.setSnapshot(firstSnapshot.service, firstSnapshot);
  metricsStore.setSnapshot(firstSnapshot.service, latestSnapshot);
  metricsStore.setSnapshot(otherSnapshot.service, otherSnapshot);

  assert.equal(metricsStore.getLatestSnapshot(firstSnapshot.service), latestSnapshot);
  assert.equal(metricsStore.getSnapshot(firstSnapshot.service), latestSnapshot);
  assert.equal(metricsStore.getLatestSnapshot("unknownService"), null);
  assert.deepEqual(metricsStore.getAllSnapshots(), [latestSnapshot, otherSnapshot]);
});

test("pollService stores a contract-shaped snapshot and applies the request timeout", async () => {
  const store = createStore();
  const target = { service: "paymentService", url: "http://payment/health" };
  const collectedAt = "2026-09-01T10:15:35.120Z";
  let requestOptions;

  const snapshot = await pollService(target, {
    store,
    clock: () => new Date(collectedAt),
    client: {
      async get(url, options) {
        assert.equal(url, target.url);
        requestOptions = options;
        return { status: 200, data: healthPayload };
      },
    },
  });

  assert.deepEqual(snapshot, {
    service: "paymentService",
    collectedAt,
    reachable: true,
    cpuPercent: 12.4,
    memoryMb: 128.5,
    avgResponseTimeMs: 45,
    requestCount: 1023,
    errorRate: 0.02,
  });
  assert.equal(requestOptions.timeout, DEFAULT_HEALTH_TIMEOUT_MS);
  assert.equal(store.getLatestSnapshot("paymentService"), snapshot);
});

test("one failed health request creates an unreachable snapshot without blocking others", async () => {
  const store = createStore();
  const targets = [
    { service: "gateway", url: "http://gateway/health" },
    { service: "paymentService", url: "http://payment/health" },
  ];
  const requestedUrls = [];

  const snapshots = await pollServices(targets, {
    store,
    clock: () => new Date("2026-09-01T10:15:35.120Z"),
    client: {
      async get(url) {
        requestedUrls.push(url);
        if (url.includes("gateway")) throw new Error("connection refused");
        return { status: 200, data: healthPayload };
      },
    },
  });

  assert.equal(requestedUrls.length, 2);
  assert.equal(snapshots[0].reachable, false);
  assert.deepEqual(
    [
      snapshots[0].cpuPercent,
      snapshots[0].memoryMb,
      snapshots[0].avgResponseTimeMs,
      snapshots[0].requestCount,
      snapshots[0].errorRate,
    ],
    [null, null, null, null, null]
  );
  assert.equal(snapshots[1].reachable, true);
  assert.equal(store.getLatestSnapshot("gateway"), snapshots[0]);
  assert.equal(store.getLatestSnapshot("paymentService"), snapshots[1]);
});

test("target aliases resolve to canonical service names and configured base URLs", () => {
  assert.deepEqual(
    getTargets({
      targetServices: "gateway,user-service,orderService,payment-service",
      env: {
        GATEWAY_URL: "http://gateway:3000",
        USER_SERVICE_URL: "http://users:3001",
        ORDER_SERVICE_URL: "http://orders:3002",
        PAYMENT_SERVICE_URL: "http://payments:3003",
      },
    }),
    [
      { service: "gateway", url: "http://gateway:3000/health" },
      { service: "userService", url: "http://users:3001/health" },
      { service: "orderService", url: "http://orders:3002/health" },
      { service: "paymentService", url: "http://payments:3003/health" },
    ]
  );
});

test("snapshot HTTP routes expose the same latest snapshot envelope", async (t) => {
  const snapshots = [{ service: "gateway", reachable: true }];
  const app = createApp({ getAllSnapshots: () => snapshots });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  for (const route of ["/snapshots", "/metrics/latest"]) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { snapshots });
  }
});
