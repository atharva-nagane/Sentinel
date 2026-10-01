// Entrypoint for recovery. Listens for alert events from failure detection
// (POST /alerts, shape in docs/apiContracts.md section 3) and runs the
// retry -> circuit-break -> reroute -> recover pipeline described in
// src/README.md, emitting recovery-action events (section 4) along the way.
// Owner: Atharva Nagane (Member 4 - Recovery Mechanisms)

const express = require("express");
const axios = require("axios");

const retryWithBackoff = require("./retryWithBackoff");
const { getBreaker, listBreakers } = require("./circuitBreaker");
const trafficRerouter = require("./trafficRerouter");
const recoveryStore = require("./lib/recoveryStore");
const { getServiceUrl, resolveServiceName } = require("./lib/serviceRegistry");

const RETRY_OPTIONS = { retries: 3, baseDelayMs: 300, maxDelayMs: 3000, factor: 2 };
const HALF_OPEN_MAX_CYCLES = 5;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A probe counts as a failure both on a network/HTTP error and on a 200 that
// self-reports unhealthy, since that's still a service we shouldn't route to.
async function probeHealth(serviceName) {
  const url = getServiceUrl(serviceName);
  const response = await axios.get(`${url}/health`, { timeout: 3000 });
  if (response.data && response.data.status === "unhealthy") {
    throw new Error(`${serviceName} self-reports unhealthy`);
  }
  return response.data;
}

async function waitForBreakerCooldown(breaker) {
  if (breaker.state === "open" && breaker.nextAttemptAt) {
    const remaining = breaker.nextAttemptAt - Date.now();
    if (remaining > 0) await wait(remaining);
  }
}

// Runs in the background after POST /alerts responds. Tries retrying the
// failing service first; if that doesn't recover it, opens the circuit
// breaker and isolates traffic, then probes on a half-open cadence until the
// breaker closes again or HALF_OPEN_MAX_CYCLES is exhausted. Each of those
// phases is its own recovery-action event (own recoveryId) - see
// lib/recoveryStore.js for why a session doesn't reuse one recoveryId across
// different actions.
async function runRecoveryPipeline(alert, session) {
  const breaker = getBreaker(alert.service);
  const log = (msg) => console.log(`[recovery] ${alert.alertId} ${alert.service}: ${msg}`);

  log(`alert received (${alert.reason}) - starting retry phase`);

  const retryAction = recoveryStore.startAction(session, "retry", {
    reason: alert.reason,
    retries: RETRY_OPTIONS.retries,
  });

  try {
    await retryWithBackoff(
      async () => {
        await probeHealth(alert.service);
        breaker.recordSuccess();
      },
      {
        ...RETRY_OPTIONS,
        onAttempt: (attempt, err) => {
          if (err) {
            breaker.recordFailure();
            log(`retry attempt ${attempt + 1}/${RETRY_OPTIONS.retries + 1} failed: ${err.message}`);
          } else {
            log(`retry attempt ${attempt + 1}/${RETRY_OPTIONS.retries + 1} succeeded`);
          }
        },
      }
    );

    recoveryStore.resolveAction(retryAction.recoveryId, { outcome: "succeeded" });
    log("healthy again after a direct retry - no circuit breaking needed");

    // A direct retry success means the service is confirmed healthy right
    // now, regardless of what the breaker's state was left at by an earlier
    // recovery (e.g. still OPEN after exhausting its half-open cycles) -
    // close it and lift isolation rather than leaving both stale.
    if (breaker.state !== "closed") breaker.forceClose();
    trafficRerouter.restore(alert.service);
    recoveryStore.endSession(session);
    log("recovery session complete");
    return;
  } catch (err) {
    recoveryStore.resolveAction(retryAction.recoveryId, {
      outcome: "failed",
      details: { reason: err.message },
    });
    log(`retries exhausted (${RETRY_OPTIONS.retries + 1}/${RETRY_OPTIONS.retries + 1} attempts failed)`);
    // Retries exhausted. The breaker has very likely tripped open from the
    // recordFailure calls above; fall through to the circuit-breaker phase.
  }

  let breakerAction = null;
  if (breaker.state !== "closed") {
    trafficRerouter.isolate(alert.service, alert.reason);
    breakerAction = recoveryStore.startAction(session, "circuitBreakerOpen", breaker.getState());
    log(`circuit breaker opened - gateway will stop routing to ${alert.service} until it recovers`);
  }

  for (let cycle = 0; cycle < HALF_OPEN_MAX_CYCLES; cycle += 1) {
    await waitForBreakerCooldown(breaker);
    if (!breaker.allowRequest()) continue;

    log(`half-open trial probe ${cycle + 1}/${HALF_OPEN_MAX_CYCLES}`);
    try {
      await probeHealth(alert.service);
      breaker.recordSuccess();
      log(`half-open trial probe ${cycle + 1}/${HALF_OPEN_MAX_CYCLES} succeeded`);
    } catch (err) {
      breaker.recordFailure();
      log(`half-open trial probe ${cycle + 1}/${HALF_OPEN_MAX_CYCLES} failed: ${err.message}`);
      continue;
    }

    if (breaker.state === "closed") {
      trafficRerouter.restore(alert.service);
      log(`circuit breaker closed - traffic to ${alert.service} restored`);
      if (breakerAction) {
        recoveryStore.resolveAction(breakerAction.recoveryId, { outcome: "succeeded", details: breaker.getState() });
      }
      // This action reports a fact (the breaker is closed) rather than
      // kicking off more work, so it must resolve immediately - leaving it
      // "inProgress" would make the dashboard's incident timeline (any
      // inProgress action means "still recovering") never reach System
      // Recovered even though the service is already healthy again.
      const closedAction = recoveryStore.startAction(session, "circuitBreakerClosed", breaker.getState());
      recoveryStore.resolveAction(closedAction.recoveryId, { outcome: "succeeded", details: breaker.getState() });
      recoveryStore.endSession(session);
      log("recovery session complete");
      return;
    }
  }

  log(`gave up after ${HALF_OPEN_MAX_CYCLES} half-open cycles - ${alert.service} remains isolated`);
  if (breakerAction) {
    recoveryStore.resolveAction(breakerAction.recoveryId, {
      outcome: "failed",
      details: { ...breaker.getState(), reason: "half-open cycles exhausted" },
    });
  }
  recoveryStore.endSession(session);
}

function createApp() {
  const app = express();
  app.use(express.json());

  // Lets the dashboard call this service directly when it isn't going
  // through the Vite dev proxy, same convention as faultInjection.
  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.get("/health", (req, res) => {
    res.json({
      service: "recovery",
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      metrics: { cpuPercent: 0, memoryMb: 0, avgResponseTimeMs: 0, requestCount: 0, errorRate: 0 },
    });
  });

  // Main entry: body is an alert event shaped per docs/apiContracts.md section 3.
  app.post("/alerts", (req, res) => {
    const alert = req.body;
    if (!alert || typeof alert !== "object" || !alert.alertId || !alert.service || !alert.reason) {
      return res.status(400).json({ errors: ["alertId, service, and reason are required"] });
    }

    const resolvedService = resolveServiceName(alert.service);
    if (!resolvedService) {
      return res.status(400).json({ errors: [`Unknown service "${alert.service}"`] });
    }
    // Normalize once at the boundary so the breaker, trafficRerouter, and the
    // gateway's isolation check all key off the same canonical name,
    // regardless of whether the alert used the camelCase or compose form.
    const normalizedAlert = { ...alert, service: resolvedService };

    const existing = recoveryStore.findActiveSessionForService(resolvedService);
    if (existing) {
      return res.status(409).json({
        errors: [`A recovery is already in progress for ${resolvedService} (session ${existing.id})`],
      });
    }

    const session = recoveryStore.startSession(normalizedAlert);
    runRecoveryPipeline(normalizedAlert, session).catch((err) => {
      console.error(`[recovery] session ${session.id} pipeline error: ${err.message}`);
      recoveryStore.endSession(session);
    });

    res.status(202).json({ sessionId: session.id, alertId: session.alertId, service: session.service });
  });

  app.get("/recoveries", (req, res) => res.json(recoveryStore.listSessions()));

  function sendEvents(req, res) {
    const parsedLimit = Number(req.query.limit);
    const limit = Number.isFinite(parsedLimit) && req.query.limit !== undefined ? parsedLimit : 50;
    res.json(recoveryStore.listEvents(limit));
  }

  // What the dashboard actually polls (dashboard/src/config.js's
  // ENDPOINTS.recovery proxies to RECOVERY_URL/events).
  app.get("/events", sendEvents);
  // Same data, kept under /recoveries/events too for symmetry with the rest
  // of this API's paths.
  app.get("/recoveries/events", sendEvents);

  app.get("/recoveries/:recoveryId", (req, res) => {
    const action = recoveryStore.getAction(req.params.recoveryId);
    if (!action) return res.status(404).json({ errors: [`No recovery ${req.params.recoveryId}`] });
    res.json(action);
  });

  app.get("/circuit-breakers", (req, res) => res.json(listBreakers()));

  app.get("/isolated-services", (req, res) => res.json(trafficRerouter.list()));

  return app;
}

if (require.main === module) {
  const PORT = process.env.PORT || 4003;
  createApp().listen(PORT, () => {
    console.log(`Recovery listening on port ${PORT}`);
  });
}

module.exports = { createApp, runRecoveryPipeline };
