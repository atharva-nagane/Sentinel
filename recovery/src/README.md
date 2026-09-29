# Recovery internals

Owner: Atharva Nagane (Member 4). Also owns `faultInjection/src/injectors/addLatency.js`
by team agreement (see that file and `faultInjection/src/README.md`).

## What triggers recovery

Failure detection calls `POST /alerts` on this service with a body shaped per
`docs/apiContracts.md` section 3 (`alertId`, `service`, `reason`, ...).
`service` may be the camelCase or docker-compose (hyphenated) name; it's
normalized once at the boundary so the breaker, isolation, and the gateway's
check all key off the same canonical name. An unknown service is rejected
with `400`. `POST /alerts` responds `202` immediately (work happens in the
background) with `409` if a recovery is already running for that service.

Each alert starts one **session** (retry -> maybe circuit-break -> maybe
recover), and every distinct **action** within that session (`retry`,
`circuitBreakerOpen`, `circuitBreakerClosed`) gets its own `recoveryId` and is
emitted as its own recovery-action event (section 4). A session does **not**
reuse one `recoveryId` across different actions - only a later event
resolving the *same* action (its outcome moving from `inProgress` to
`succeeded`/`failed`) reuses that action's `recoveryId`. This matches
`docs/apiContracts.md` section 4's model and
`dashboard/src/lib/incidents.test.js`'s fixtures: e.g. a failed `retry`
followed by a successful `circuitBreakerOpen`/`circuitBreakerClosed` sequence
are three separate recovery records sharing one `alertId`, not three updates
to one record.

## Pipeline

1. **Retry.** `retryWithBackoff` probes the service's own `/health` endpoint
   up to 3 times with exponential backoff + jitter. Every failed attempt
   calls the service's circuit breaker's `recordFailure()`. A direct success
   here closes the breaker and lifts isolation immediately (via
   `CircuitBreaker.forceClose()`), even if they were left open by an earlier
   session for the same service - it doesn't wait for the half-open flow
   below to notice.
2. **Circuit breaker.** `circuitBreaker.js` implements the standard
   closed/open/half-open state machine:
   - **closed** - requests allowed, counting consecutive failures.
   - **open** - tripped after 3 consecutive failures (`failureThreshold`).
     No trial requests until `resetTimeoutMs` (15s) has passed.
   - **half-open** - after the cooldown, the next probe is a trial. 2
     consecutive successes (`successThreshold`) close the breaker; any
     failure reopens it.
3. **Reroute.** The moment the breaker opens, `trafficRerouter.isolate(service)`
   marks that service unavailable. The gateway's `recoveryGuard.js`
   (`gateway/src/routing/recoveryGuard.js`) polls `GET /isolated-services`
   every `RECOVERY_POLL_INTERVAL_MS` (default 5s) and returns `503` for any
   route whose target is currently isolated, instead of proxying through to a
   service recovery has already given up on.
4. **Recover.** Once a half-open probe succeeds enough times to close the
   breaker, `trafficRerouter.restore(service)` lifts the isolation and a
   `circuitBreakerClosed` action with `outcome: "succeeded"` ends the session.
   If the breaker is still open after 5 half-open cycles, the session ends
   with the `circuitBreakerOpen` action resolved `outcome: "failed"` instead
   of retrying forever.

## HTTP API (port 4003)

| Method | Path | What it does |
| --- | --- | --- |
| `POST` | `/alerts` | Start a recovery session for an alert. `202` with `{ sessionId, alertId, service }`, `400` on a malformed alert or unknown service, `409` if a session is already running for that service. |
| `GET` | `/recoveries` | All sessions with their action history expanded, newest first. For debugging. |
| `GET` | `/recoveries/:recoveryId` | One action record by its `recoveryId`. |
| `GET` | `/events` | Flat list of recovery-action events (shape matches `docs/apiContracts.md` section 4 exactly), **chronological, oldest first** - matches what `dashboard/src/lib/incidents.js`'s merge expects. This is what `dashboard/src/config.js`'s `ENDPOINTS.recovery` actually resolves to after the Vite proxy strips `/api/recovery`, so it's what the dashboard polls. |
| `GET` | `/recoveries/events` | Same data as `/events`, kept for symmetry with the rest of this API's paths. |
| `GET` | `/circuit-breakers` | Current state of every service's breaker. |
| `GET` | `/isolated-services` | Services currently marked unavailable by `trafficRerouter`. |
| `GET` | `/health` | Liveness of the recovery service itself. |

## Files

- `retryWithBackoff.js` - generic retry helper, not tied to any one service.
- `circuitBreaker.js` - the `CircuitBreaker` class (including `forceClose()`
  for a direct health confirmation outside the half-open flow) plus a
  per-service registry (`getBreaker`, `listBreakers`) shared across the whole
  process.
- `trafficRerouter.js` - in-memory isolate/restore/isAvailable bookkeeping,
  consulted by the gateway.
- `lib/serviceRegistry.js` - service name (camelCase or compose form) -> base
  URL, for probing `/health`. A near-duplicate of
  `faultInjection/src/lib/serviceRegistry.js`; kept separate on purpose since
  each folder ships as its own container with no shared package - if a
  service's URL or alias ever changes, update both.
- `lib/recoveryStore.js` - in-memory sessions, action records, and the
  chronological event log `/events` serves.
- `index.js` - the express app and the pipeline that ties the above together.
