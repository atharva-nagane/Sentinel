const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

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

// Each router reads its TARGET_URL from the environment once at require
// time, so the env var must be set and the module cache cleared before each
// router is (re)required against a fresh fake upstream.
function freshRouter(envVar, modulePath, upstreamUrl) {
  process.env[envVar] = upstreamUrl;
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

async function mountedApp(router, mountPath) {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  return listen(app);
}

test("userRoutes proxies method, body, and the request id to the user service", async () => {
  const upstream = await startFakeUpstream((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      assert.equal(req.method, "POST");
      assert.equal(req.url, "/profile");
      assert.equal(req.headers["x-request-id"], "trace-1");
      assert.deepEqual(JSON.parse(raw), { name: "Alice" });
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ created: true }));
    });
  });

  try {
    const userRoutes = freshRouter("USER_SERVICE_URL", "../src/routing/userRoutes.js", baseUrl(upstream));
    const gateway = await mountedApp(userRoutes, "/users");
    try {
      const res = await fetch(`${baseUrl(gateway)}/users/profile`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "trace-1" },
        body: JSON.stringify({ name: "Alice" }),
      });
      assert.equal(res.status, 201);
      assert.deepEqual(await res.json(), { created: true });
    } finally {
      gateway.close();
    }
  } finally {
    upstream.close();
    delete process.env.USER_SERVICE_URL;
  }
});

test("orderRoutes relays the upstream error status and body on a non-2xx response", async () => {
  const upstream = await startFakeUpstream((req, res) => {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "not found" }));
  });

  try {
    const orderRoutes = freshRouter("ORDER_SERVICE_URL", "../src/routing/orderRoutes.js", baseUrl(upstream));
    const gateway = await mountedApp(orderRoutes, "/orders");
    try {
      const res = await fetch(`${baseUrl(gateway)}/orders/missing`);
      assert.equal(res.status, 404);
      assert.deepEqual(await res.json(), { error: "not found" });
    } finally {
      gateway.close();
    }
  } finally {
    upstream.close();
    delete process.env.ORDER_SERVICE_URL;
  }
});

test("paymentRoutes returns 500 when the payment service is unreachable", async () => {
  try {
    // Nothing listens on this port - a fast connection-refused, not a hang.
    const paymentRoutes = freshRouter("PAYMENT_SERVICE_URL", "../src/routing/paymentRoutes.js", "http://127.0.0.1:1");
    const gateway = await mountedApp(paymentRoutes, "/payments");
    try {
      const res = await fetch(`${baseUrl(gateway)}/payments/charge`);
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: "Payment Service unavailable" });
    } finally {
      gateway.close();
    }
  } finally {
    delete process.env.PAYMENT_SERVICE_URL;
  }
});
