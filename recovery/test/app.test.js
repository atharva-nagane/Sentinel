const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

// A fast-failing fake gateway so any alert posted in this file resolves its
// background pipeline in well under a second instead of hanging the process
// on the production-sized 15s breaker cooldown.
function startFakeGateway() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.statusCode = 503;
      res.end("{}");
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

let gateway;

test.before(async () => {
  gateway = await startFakeGateway();
  process.env.GATEWAY_URL = `http://127.0.0.1:${gateway.address().port}`;
});

test.after(() => {
  gateway.close();
});

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

test("GET /health reports the recovery service itself", async () => {
  const { createApp } = require("../src/index.js");
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/health`);
    const body = await res.json();
    assert.equal(body.service, "recovery");
    assert.equal(body.status, "healthy");
  } finally {
    server.close();
  }
});

test("POST /alerts rejects a body missing required fields", async () => {
  const { createApp } = require("../src/index.js");
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/alerts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service: "gateway" }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test("POST /alerts rejects an unknown service", async () => {
  const { createApp } = require("../src/index.js");
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/alerts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alertId: "a1", service: "notAService", reason: "unreachable" }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test("POST /alerts accepts the docker-compose hyphenated service name too", async () => {
  const { getBreaker } = require("../src/circuitBreaker.js");
  getBreaker("gateway", { resetTimeoutMs: 20 });

  const { createApp } = require("../src/index.js");
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/alerts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alertId: "a2", service: "gateway", reason: "unreachable" }),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.service, "gateway");
    assert.ok(body.sessionId);
  } finally {
    server.close();
  }
});

test("POST /alerts returns 409 for a service that already has an active session", async () => {
  const { getBreaker } = require("../src/circuitBreaker.js");
  getBreaker("userService", { resetTimeoutMs: 20 });

  const { createApp } = require("../src/index.js");
  const server = await listen(createApp());
  try {
    const url = baseUrl(server);
    const body = JSON.stringify({ alertId: "a3", service: "userService", reason: "unreachable" });
    const first = await fetch(`${url}/alerts`, { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal(first.status, 202);

    const second = await fetch(`${url}/alerts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alertId: "a4", service: "userService", reason: "highLatency" }),
    });
    assert.equal(second.status, 409);
  } finally {
    server.close();
  }
});

test("GET /events and GET /recoveries/events serve the same data", async () => {
  const { createApp } = require("../src/index.js");
  const server = await listen(createApp());
  try {
    const url = baseUrl(server);
    const [a, b] = await Promise.all([
      fetch(`${url}/events`).then((r) => r.json()),
      fetch(`${url}/recoveries/events`).then((r) => r.json()),
    ]);
    assert.deepEqual(a, b);
  } finally {
    server.close();
  }
});

test("GET /circuit-breakers and GET /isolated-services return arrays", async () => {
  const { createApp } = require("../src/index.js");
  const server = await listen(createApp());
  try {
    const url = baseUrl(server);
    const breakers = await fetch(`${url}/circuit-breakers`).then((r) => r.json());
    const isolated = await fetch(`${url}/isolated-services`).then((r) => r.json());
    assert.ok(Array.isArray(breakers));
    assert.ok(Array.isArray(isolated));
  } finally {
    server.close();
  }
});
