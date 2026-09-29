// Floods a target service with requests to simulate overload.
// Command shape is defined in docs/apiContracts.md (section 5).
// Owner: Swayum Bansal (Member 5)

const axios = require("axios");
const { getService } = require("../lib/serviceRegistry");

const TICK_MS = 100;
const REQUEST_TIMEOUT_MS = 5000;
// Requests still waiting on a response beyond this are skipped rather than
// piling up, so a dead target can't exhaust this process's memory/sockets.
const MAX_IN_FLIGHT = 1000;

// Fires requests at roughly params.requestsPerSecond for params.durationSeconds.
// Every TICK_MS a batch of requestsPerSecond/10 requests is sent, which keeps
// the rate close to the target even at a few hundred requests per second.
//
// Resolves immediately with { details, done, stop }; `done` resolves with the
// final request stats when the duration elapses or stop() is called.
async function overloadService(targetService, params) {
  const service = getService(targetService);
  const url = `${service.url}${service.overloadPath}`;
  const perTick = params.requestsPerSecond * (TICK_MS / 1000);

  const stats = { sent: 0, succeeded: 0, failed: 0, skipped: 0, totalLatencyMs: 0 };
  let inFlight = 0;
  let carry = 0;

  function fire() {
    if (inFlight >= MAX_IN_FLIGHT) {
      stats.skipped += 1;
      return;
    }
    inFlight += 1;
    stats.sent += 1;
    const started = Date.now();
    axios
      .get(url, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { "x-request-id": `overload-${started}-${stats.sent}` },
        validateStatus: (status) => status < 500,
      })
      .then(() => {
        stats.succeeded += 1;
      })
      .catch(() => {
        stats.failed += 1;
      })
      .finally(() => {
        stats.totalLatencyMs += Date.now() - started;
        inFlight -= 1;
      });
  }

  const interval = setInterval(() => {
    carry += perTick;
    const batch = Math.floor(carry);
    carry -= batch;
    for (let i = 0; i < batch; i += 1) fire();
  }, TICK_MS);

  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  let finished = false;

  function summary() {
    const completed = stats.succeeded + stats.failed;
    return {
      url,
      ...stats,
      avgLatencyMs: completed ? Math.round(stats.totalLatencyMs / completed) : null,
    };
  }

  function stop() {
    if (!finished) {
      finished = true;
      clearInterval(interval);
      clearTimeout(timer);
      resolveDone(summary());
    }
    return done;
  }

  const timer = setTimeout(stop, params.durationSeconds * 1000);

  return { details: { url }, done, stop, progress: summary };
}

module.exports = overloadService;
