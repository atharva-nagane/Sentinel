const test = require("node:test");
const assert = require("node:assert/strict");

const thresholdRules = require("../src/thresholdRules");
const heartbeatCheck = require("../src/heartbeatCheck");
const timeoutDetector = require("../src/timeoutDetector");
const alertEmitter = require("../src/alertEmitter");
const { processSnapshot, fetchSnapshots } = require("../src/index");

function snapshot(overrides = {}) {
  return {
    service: "paymentService",
    collectedAt: "2026-09-01T10:15:30.000Z",
    reachable: true,
    cpuPercent: 20,
    memoryMb: 128,
    avgResponseTimeMs: 50,
    requestCount: 100,
    errorRate: 0.02,
    ...overrides,
  };
}

test.beforeEach(() => {
  heartbeatCheck.reset();
  alertEmitter.clearAlerts();
});

test("detects all numeric threshold reasons with the documented details", () => {
  const cases = [
    ["highErrorRate", { errorRate: 0.4 }],
    ["highLatency", { avgResponseTimeMs: 2500 }],
    ["highCpu", { cpuPercent: 90 }],
    ["highMemory", { memoryMb: 600 }],
  ];

  for (const [reason, overrides] of cases) {
    const result = thresholdRules.checkThresholds(snapshot(overrides));
    assert.equal(result.reason, reason);
  }

  assert.deepEqual(
    thresholdRules.checkThresholds(snapshot({ errorRate: 0.4 })).details,
    { errorRate: 0.4, thresholdFraction: 0.2 }
  );
  assert.deepEqual(
    thresholdRules.checkThresholds(snapshot({ avgResponseTimeMs: 2500 })).details,
    { avgResponseTimeMs: 2500, thresholdMs: 2000 }
  );
  assert.deepEqual(
    thresholdRules.checkThresholds(snapshot({ cpuPercent: 90 })).details,
    { cpuPercent: 90, thresholdPercent: 80 }
  );
  assert.deepEqual(
    thresholdRules.checkThresholds(snapshot({ memoryMb: 600 })).details,
    { memoryMb: 600, thresholdMb: 512 }
  );
});

test("does not treat threshold values at the boundary as failures", () => {
  assert.equal(
    thresholdRules.checkThresholds(
      snapshot({ errorRate: 0.2, avgResponseTimeMs: 2000, cpuPercent: 80, memoryMb: 512 })
    ),
    null
  );
});

test("heartbeat only fires after the configured timeout window", () => {
  heartbeatCheck("paymentService", snapshot(), {
    now: new Date("2026-09-01T10:15:35.000Z"),
  });

  assert.equal(
    heartbeatCheck("paymentService", snapshot({ reachable: false }), {
      now: new Date("2026-09-01T10:15:39.999Z"),
    }),
    null
  );

  const result = heartbeatCheck("paymentService", snapshot({ reachable: false }), {
    now: new Date("2026-09-01T10:15:40.001Z"),
  });
  assert.equal(result.reason, "heartbeatTimeout");
  assert.deepEqual(result.details, {
    lastHeartbeatAt: "2026-09-01T10:15:30.000Z",
    thresholdSeconds: 10,
  });
});

test("reachable:false produces the distinct unreachable reason", () => {
  assert.deepEqual(
    timeoutDetector("paymentService", snapshot({ reachable: false, collectedAt: "2026-09-01T10:15:45.000Z" })),
    {
      reason: "unreachable",
      details: { pollFailedAt: "2026-09-01T10:15:45.000Z" },
    }
  );
});

test("deduplicates an ongoing alert and clears the state after recovery", async () => {
  const activeServices = new Set();
  const emitted = [];
  const emitter = async (alert) => {
    emitted.push(alert);
    return { ...alert, alertId: `alert_${emitted.length}` };
  };

  const clock = () => new Date("2026-09-01T10:15:31.000Z");

  const first = await processSnapshot(snapshot({ errorRate: 0.4 }), {
    activeServices,
    emitter,
    clock,
  });
  assert.equal(first.alert.reason, "highErrorRate");

  const duplicate = await processSnapshot(snapshot({ errorRate: 0.5 }), {
    activeServices,
    emitter,
    clock,
  });
  assert.equal(duplicate.deduplicated, true);
  assert.equal(emitted.length, 1);

  const recovered = await processSnapshot(snapshot(), {
    activeServices,
    emitter,
    clock,
  });
  assert.equal(recovered.recovered, true);

  await processSnapshot(snapshot({ avgResponseTimeMs: 2500 }), {
    activeServices,
    emitter,
    clock,
  });
  assert.equal(emitted.length, 2);
});

test("alert emitter creates contract-compatible alerts with unique IDs and blast radius", async () => {
  const posts = [];
  const httpClient = {
    post: async (url, body, options) => posts.push({ url, body, options }),
  };

  const first = await alertEmitter(
    {
      service: "paymentService",
      reason: "highErrorRate",
      detectedAt: "2026-09-01T10:15:45.000Z",
      details: { errorRate: 0.4, thresholdFraction: 0.2 },
    },
    { httpClient, recoveryUrl: "http://recovery:4003" }
  );
  const second = await alertEmitter(
    {
      service: "paymentService",
      reason: "unreachable",
      detectedAt: "2026-09-01T10:16:00.000Z",
      details: { pollFailedAt: "2026-09-01T10:16:00.000Z" },
    },
    { httpClient, recoveryUrl: "http://recovery:4003" }
  );

  assert.notEqual(first.alertId, second.alertId);
  assert.equal(first.status, "unhealthy");
  assert.deepEqual(first.affectedServices, ["orderService", "gateway"]);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].url, "http://recovery:4003/alerts");
  assert.deepEqual(posts[0].body, first);
});

test("fetchSnapshots consumes monitoring's { snapshots } HTTP response", async () => {
  const client = {
    get: async (url, options) => {
      assert.equal(url, "http://monitoring:4001/snapshots");
      assert.equal(options.timeout, 2000);
      return { data: { snapshots: [snapshot()] } };
    },
  };

  const snapshots = await fetchSnapshots({ client });
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].service, "paymentService");
});
