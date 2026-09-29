// Polls the recovery service's isolated-services list and blocks proxying to
// anything recovery has isolated, so the gateway actually stops sending
// traffic to a service the circuit breaker has tripped on - this is what
// completes the "traffic rerouting" leg of the recovery pipeline described in
// recovery/src/README.md.
// Added by Atharva Nagane (Member 4 - Recovery). Sits in front of the proxy
// routers in routing/, which stay Ritik Mishra's (Member 1).

const axios = require("axios");

const RECOVERY_URL = process.env.RECOVERY_URL || "http://localhost:4003";
const POLL_INTERVAL_MS = Number(process.env.RECOVERY_POLL_INTERVAL_MS) || 5000;

let isolated = new Set();
let lastPollFailed = false;

async function refresh() {
  try {
    const { data } = await axios.get(`${RECOVERY_URL}/isolated-services`, { timeout: 2000 });
    isolated = new Set(data.map((entry) => entry.service));
    if (lastPollFailed) {
      console.log(`[recoveryGuard] recovered connection to ${RECOVERY_URL}`);
      lastPollFailed = false;
    }
  } catch (err) {
    // Recovery being unreachable shouldn't take the gateway down with it;
    // keep the last known isolation state and try again on the next tick.
    // Logged once per failure streak so this doesn't go silently unnoticed
    // (RECOVERY_URL must point at recovery's container name, not localhost,
    // when running under docker-compose).
    if (!lastPollFailed) {
      console.warn(`[recoveryGuard] cannot reach recovery at ${RECOVERY_URL}: ${err.message}`);
      lastPollFailed = true;
    }
  }
}

function startPolling() {
  refresh();
  setInterval(refresh, POLL_INTERVAL_MS);
}

// Express middleware factory: short-circuits with 503 if recovery currently
// has serviceName isolated, otherwise passes through untouched.
function blockIfIsolated(serviceName) {
  return (req, res, next) => {
    if (isolated.has(serviceName)) {
      return res.status(503).json({
        error: `${serviceName} is temporarily isolated by recovery`,
        service: serviceName,
      });
    }
    next();
  };
}

module.exports = { startPolling, blockIfIsolated };
