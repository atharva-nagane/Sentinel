const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

function startFakeUpstream(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

// Deliberately does NOT bust routing/recoveryGuard.js's cache: index.js
// captures that module's blockIfIsolated at require time, so a test that
// needs to control isolation state (see below) must populate that same
// cached instance before calling this, not a separately-required one.
function freshGateway() {
  delete require.cache[require.resolve("../src/index.js")];
  delete require.cache[require.resolve("../src/routing/userRoutes.js")];
  delete require.cache[require.resolve("../src/routing/orderRoutes.js")];
  delete require.cache[require.resolve("../src/routing/paymentRoutes.js")];
  const { reset: resetHealth } = require("../src/healthEndpoint.js");
  resetHealth();
  return require("../src/index.js").createApp();
}

test("GET /health reports the gateway's own status, not a proxied one", async () => {
  const server = await listen(freshGateway());
  try {
    const res = await fetch(`${baseUrl(server)}/health`);
    const body = await res.json();
    assert.equal(body.service, "gateway");
    assert.equal(body.status, "healthy");
  } finally {
    server.close();
  }
});

test("a proxied request carries a generated x-request-id through to the upstream and back", async () => {
  let seenRequestId = null;
  const upstream = await startFakeUpstream((req, res) => {
    seenRequestId = req.headers["x-request-id"];
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  process.env.USER_SERVICE_URL = baseUrl(upstream);

  try {
    const server = await listen(freshGateway());
    try {
      const res = await fetch(`${baseUrl(server)}/users/whoami`);
      assert.equal(res.status, 200);
      assert.ok(seenRequestId, "upstream should have received a request id");
      assert.equal(res.headers.get("x-request-id"), seenRequestId);
    } finally {
      server.close();
    }
  } finally {
    upstream.close();
    delete process.env.USER_SERVICE_URL;
  }
});

test("an isolated service is blocked with 503 before the proxy is reached", async () => {
  let upstreamHit = false;
  const upstream = await startFakeUpstream((req, res) => {
    upstreamHit = true;
    res.end("{}");
  });
  const recovery = await startFakeUpstream((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ service: "paymentService", since: "2026-01-01T00:00:00.000Z" }]));
  });
  process.env.PAYMENT_SERVICE_URL = baseUrl(upstream);
  process.env.RECOVERY_URL = baseUrl(recovery);

  try {
    // Bust and re-require recoveryGuard first and populate its isolation
    // state via refresh(), so the instance freshGateway()'s index.js picks
    // up (same require cache entry, not re-busted by freshGateway) already
    // has paymentService isolated by the time its routes are mounted.
    delete require.cache[require.resolve("../src/routing/recoveryGuard.js")];
    const { refresh } = require("../src/routing/recoveryGuard.js");
    await refresh();

    const server = await listen(freshGateway());
    try {
      const res = await fetch(`${baseUrl(server)}/payments/charge`);
      assert.equal(res.status, 503);
      assert.equal(upstreamHit, false, "the proxy must not forward to an isolated service");
    } finally {
      server.close();
    }
  } finally {
    upstream.close();
    recovery.close();
    delete process.env.PAYMENT_SERVICE_URL;
    delete process.env.RECOVERY_URL;
  }
});
