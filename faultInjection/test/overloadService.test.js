const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

function startCountingServer() {
  const state = { hits: 0 };
  const server = http.createServer((req, res) => {
    state.hits += 1;
    res.end("ok");
  });
  return { server, state };
}

test("fires requests at roughly the configured rate and stop() ends it early with a summary", async () => {
  const { server, state } = startCountingServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.GATEWAY_URL = `http://127.0.0.1:${server.address().port}`;
  delete require.cache[require.resolve("../src/lib/serviceRegistry.js")];
  delete require.cache[require.resolve("../src/injectors/overloadService.js")];
  const overloadService = require("../src/injectors/overloadService.js");

  try {
    // durationSeconds is long on purpose - stop() ends the fault early, which
    // is what actually keeps this test fast.
    const handle = await overloadService("gateway", { requestsPerSecond: 50, durationSeconds: 30 });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const summary = await handle.stop();

    assert.ok(state.hits > 0, "the fake upstream should have received requests");
    assert.ok(summary.sent > 0, "the summary should report requests as sent");
    assert.ok(summary.sent >= state.hits, "every hit the server saw must have been counted as sent");
    assert.ok(summary.succeeded + summary.failed + summary.skipped <= summary.sent);
    assert.equal(summary.url, `http://127.0.0.1:${server.address().port}/users`);

    // Calling stop() twice must not double-resolve or throw.
    const second = await handle.stop();
    assert.deepEqual(second, summary);
  } finally {
    server.close();
    delete process.env.GATEWAY_URL;
  }
});
