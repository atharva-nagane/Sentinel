const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

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

function startFakePaymentService(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

test("GET / reports the service name", async () => {
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/`);
    const body = await res.json();
    assert.equal(body.message, "Order Service Root");
  } finally {
    server.close();
  }
});

test("GET /health reports the orderService name", async () => {
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/health`);
    const body = await res.json();
    assert.equal(body.service, "orderService");
    assert.equal(body.status, "healthy");
  } finally {
    server.close();
  }
});

test("GET /test forwards the request id to payment and merges its response", async () => {
  const payment = await startFakePaymentService((req, res) => {
    assert.equal(req.headers["x-request-id"], "trace-42");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ payment: "processed", dbTime: "2026-01-01T00:00:00.000Z" }));
  });
  process.env.PAYMENT_SERVICE_URL = `http://127.0.0.1:${payment.address().port}`;

  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/test`, {
      headers: { "x-request-id": "trace-42" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order, 123);
    assert.equal(body.status, "created");
    assert.equal(body.requestId, "trace-42");
    assert.deepEqual(body.paymentResponse, { payment: "processed", dbTime: "2026-01-01T00:00:00.000Z" });
  } finally {
    server.close();
    payment.close();
    delete process.env.PAYMENT_SERVICE_URL;
  }
});

test("GET /test returns 500 when payment is unreachable", async () => {
  // Nothing listening on this port - connection refused, not a timeout.
  process.env.PAYMENT_SERVICE_URL = "http://127.0.0.1:1";

  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/test`, {
      headers: { "x-request-id": "trace-99" },
    });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, "Payment call failed");
  } finally {
    server.close();
    delete process.env.PAYMENT_SERVICE_URL;
  }
});
