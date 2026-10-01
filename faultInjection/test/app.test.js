const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

function startFakeUpstream() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => res.end("ok"));
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

let upstream;

test.before(async () => {
  upstream = await startFakeUpstream();
  process.env.GATEWAY_URL = baseUrl(upstream);
});

test.after(() => {
  upstream.close();
  delete process.env.GATEWAY_URL;
});

test("GET /health reports the fault-injection service itself", async () => {
  const { createApp } = require("../src/index.js");
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/health`);
    const body = await res.json();
    assert.equal(body.service, "faultInjection");
    assert.equal(body.status, "healthy");
  } finally {
    server.close();
  }
});

test("POST /commands rejects an invalid command with the validator's errors", async () => {
  const { createApp } = require("../src/index.js");
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "notACommand", targetService: "gateway", params: {} }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(Array.isArray(body.errors) && body.errors.length > 0);
  } finally {
    server.close();
  }
});

test("a valid overloadService command dispatches, appears in /faults, and can be stopped early", async () => {
  const { createApp } = require("../src/index.js");
  const server = await listen(createApp());
  try {
    const url = baseUrl(server);
    const dispatchRes = await fetch(`${url}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: "overloadService",
        targetService: "gateway",
        params: { requestsPerSecond: 20, durationSeconds: 30 },
      }),
    });
    assert.equal(dispatchRes.status, 202);
    const fault = await dispatchRes.json();
    assert.equal(fault.status, "active");

    const listed = await fetch(`${url}/faults`).then((r) => r.json());
    assert.ok(listed.some((f) => f.faultId === fault.faultId));

    const single = await fetch(`${url}/faults/${fault.faultId}`).then((r) => r.json());
    assert.equal(single.faultId, fault.faultId);

    const stopRes = await fetch(`${url}/faults/${fault.faultId}/stop`, { method: "POST" });
    assert.equal(stopRes.status, 200);
    const stopped = await stopRes.json();
    assert.ok(stopped.status === "stopped" || stopped.status === "stopping");
  } finally {
    server.close();
  }
});

test("a duplicate command for the same active fault is rejected with 409", async () => {
  const { createApp } = require("../src/index.js");
  const server = await listen(createApp());
  try {
    const url = baseUrl(server);
    const body = JSON.stringify({
      command: "overloadService",
      targetService: "orderService",
      params: { requestsPerSecond: 20, durationSeconds: 30 },
    });
    const first = await fetch(`${url}/commands`, { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal(first.status, 202);
    const fault = await first.json();

    const second = await fetch(`${url}/commands`, { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal(second.status, 409);

    await fetch(`${url}/faults/${fault.faultId}/stop`, { method: "POST" });
  } finally {
    server.close();
  }
});

test("GET /faults/:faultId returns 404 for an unknown fault", async () => {
  const { createApp } = require("../src/index.js");
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/faults/fault_does_not_exist`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test("killService fails cleanly (502) when no Docker daemon is available", async () => {
  const { createApp } = require("../src/index.js");
  const server = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl(server)}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "killService", targetService: "paymentService", params: {} }),
    });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.ok(body.errors[0]);
    assert.equal(body.fault.status, "failed");
  } finally {
    server.close();
  }
});
