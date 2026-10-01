const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

function startFakeRecovery(isolatedServices) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/isolated-services") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(isolatedServices.map((service) => ({ service, since: "2026-01-01T00:00:00.000Z" }))));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function mockReqRes() {
  const res = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return { req: {}, res };
}

test("blockIfIsolated passes requests through when recovery has nothing isolated", async () => {
  const recovery = await startFakeRecovery([]);
  process.env.RECOVERY_URL = `http://127.0.0.1:${recovery.address().port}`;
  delete require.cache[require.resolve("../src/routing/recoveryGuard.js")];
  const { refresh, blockIfIsolated } = require("../src/routing/recoveryGuard.js");

  try {
    await refresh();
    const { req, res } = mockReqRes();
    let nextCalled = false;
    blockIfIsolated("paymentService")(req, res, () => { nextCalled = true; });

    assert.ok(nextCalled, "next() should be called when nothing is isolated");
    assert.equal(res.statusCode, null);
  } finally {
    recovery.close();
    delete process.env.RECOVERY_URL;
  }
});

test("blockIfIsolated returns 503 for a service recovery has isolated", async () => {
  const recovery = await startFakeRecovery(["paymentService"]);
  process.env.RECOVERY_URL = `http://127.0.0.1:${recovery.address().port}`;
  delete require.cache[require.resolve("../src/routing/recoveryGuard.js")];
  const { refresh, blockIfIsolated } = require("../src/routing/recoveryGuard.js");

  try {
    await refresh();
    const { req, res } = mockReqRes();
    let nextCalled = false;
    blockIfIsolated("paymentService")(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, "next() must not be called for an isolated service");
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.service, "paymentService");
  } finally {
    recovery.close();
    delete process.env.RECOVERY_URL;
  }
});

test("blockIfIsolated leaves other services unaffected", async () => {
  const recovery = await startFakeRecovery(["paymentService"]);
  process.env.RECOVERY_URL = `http://127.0.0.1:${recovery.address().port}`;
  delete require.cache[require.resolve("../src/routing/recoveryGuard.js")];
  const { refresh, blockIfIsolated } = require("../src/routing/recoveryGuard.js");

  try {
    await refresh();
    const { req, res } = mockReqRes();
    let nextCalled = false;
    blockIfIsolated("userService")(req, res, () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.equal(res.statusCode, null);
  } finally {
    recovery.close();
    delete process.env.RECOVERY_URL;
  }
});

test("a failed refresh keeps serving the last known isolation state", async () => {
  const recovery = await startFakeRecovery(["paymentService"]);
  process.env.RECOVERY_URL = `http://127.0.0.1:${recovery.address().port}`;
  delete require.cache[require.resolve("../src/routing/recoveryGuard.js")];
  const { refresh, blockIfIsolated } = require("../src/routing/recoveryGuard.js");

  await refresh();
  recovery.close();
  // Recovery is now unreachable; refresh should not throw, and the previously
  // known isolation state should still apply.
  await refresh();

  const { req, res } = mockReqRes();
  let nextCalled = false;
  blockIfIsolated("paymentService")(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 503);
  delete process.env.RECOVERY_URL;
});
