const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp } = require("../src/index.js");
const { reset: resetHealth } = require("../src/healthEndpoint.js");

test.beforeEach(() => {
  resetHealth();
});

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

test("GET /test returns the stub user and echoes the request id", async () => {
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/test`, {
      headers: { "x-request-id": "req-123" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { user: "Alice", id: 1, requestId: "req-123" });
  } finally {
    server.close();
  }
});

test("GET / reports the service name", async () => {
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/`);
    const body = await res.json();
    assert.equal(body.message, "User Service Root");
  } finally {
    server.close();
  }
});

test("GET /health reports healthy with no traffic yet", async () => {
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.service, "userService");
    assert.equal(body.status, "healthy");
    assert.equal(body.metrics.requestCount, 0);
    assert.equal(body.metrics.errorRate, 0);
  } finally {
    server.close();
  }
});

test("health metrics track error rate from recent requests", async () => {
  const app = createApp();
  // A route that always 500s, purely to drive the health middleware's error
  // tracking - userService itself has no route that fails on demand.
  app.get("/boom", (req, res) => res.status(500).json({ error: "boom" }));
  const server = await listen(app);
  try {
    const url = baseUrl(server);
    await fetch(`${url}/test`);
    await fetch(`${url}/boom`);
    const res = await fetch(`${url}/health`);
    const body = await res.json();
    assert.equal(body.metrics.requestCount, 2);
    assert.equal(body.metrics.errorRate, 0.5);
    assert.equal(body.status, "degraded");
  } finally {
    server.close();
  }
});
