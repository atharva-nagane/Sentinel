// No Postgres instance is available in the test environment, so
// DATABASE_URL is pointed at a port nothing listens on. That's enough to
// exercise both the service's plumbing (routes, health, request id) and its
// db-failure error path without needing a real database.
process.env.DATABASE_URL = "postgres://capstone:capstone@127.0.0.1:1/capstone";

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

test("GET / reports the service name", async () => {
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/`);
    const body = await res.json();
    assert.equal(body.message, "Payment Service Root");
  } finally {
    server.close();
  }
});

test("GET /health reports the paymentService name", async () => {
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/health`);
    const body = await res.json();
    assert.equal(body.service, "paymentService");
    assert.equal(body.status, "healthy");
  } finally {
    server.close();
  }
});

test("GET /test returns 500 with the failure reason when the database is unreachable", async () => {
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/test`, {
      headers: { "x-request-id": "trace-7" },
    });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, "DB query failed");
    assert.ok(body.details, "expected the connection error message to be surfaced");
  } finally {
    server.close();
  }
});
