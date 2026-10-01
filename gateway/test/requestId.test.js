const test = require("node:test");
const assert = require("node:assert/strict");

const attachRequestId = require("../src/requestTracing/requestId.js");

function mockReqRes(headers = {}) {
  const req = { headers: { ...headers } };
  const responseHeaders = {};
  const res = { setHeader: (name, value) => { responseHeaders[name] = value; } };
  return { req, res, responseHeaders };
}

test("generates a request id when the caller sends none", () => {
  const { req, res, responseHeaders } = mockReqRes();
  let called = false;
  attachRequestId(req, res, () => { called = true; });

  assert.ok(called, "next() must be called");
  assert.ok(req.headers["x-request-id"], "a request id must be attached");
  assert.equal(responseHeaders["x-request-id"], req.headers["x-request-id"]);
});

test("preserves an incoming request id instead of replacing it", () => {
  const { req, res, responseHeaders } = mockReqRes({ "x-request-id": "client-supplied-id" });
  attachRequestId(req, res, () => {});

  assert.equal(req.headers["x-request-id"], "client-supplied-id");
  assert.equal(responseHeaders["x-request-id"], "client-supplied-id");
});

test("generates a different id on each call with no incoming header", () => {
  const first = mockReqRes();
  const second = mockReqRes();
  attachRequestId(first.req, first.res, () => {});
  attachRequestId(second.req, second.res, () => {});

  assert.notEqual(first.req.headers["x-request-id"], second.req.headers["x-request-id"]);
});
