# API Contracts

**Status: first draft.** These shapes are a starting point so all five workstreams
can build against something concrete in parallel. Confirm and adjust as a team once
real implementation starts, then keep this file in sync with whatever changes.

Every HTTP call in the system carries a request ID header:

```
x-request-id: <uuid>
```

The gateway generates one if the incoming request doesn't already have it
(`gateway/src/requestTracing/requestId.js`), and every service forwards the same
header on any downstream call it makes.

---

## 1. Service health payload

`GET /health` on every backend service (gateway, userService, orderService,
paymentService). Polled by monitoring on an interval.

```json
{
  "service": "paymentService",
  "status": "healthy",
  "timestamp": "2026-09-01T10:15:30.000Z",
  "uptimeSeconds": 3421,
  "metrics": {
    "cpuPercent": 12.4,
    "memoryMb": 128.5,
    "avgResponseTimeMs": 45,
    "requestCount": 1023,
    "errorRate": 0.02
  }
}
```

- `status` is one of `"healthy"`, `"degraded"`, `"unhealthy"` — the service's own
  self-reported view, independent of what the failure detector later concludes.
- `errorRate` is a fraction between 0 and 1, measured over whatever rolling window
  the service tracks internally (document the window length in the service's own
  README when implemented).

---

## 2. Monitoring metric snapshot

Emitted by monitoring once per polling interval per service. This is monitoring's
own view (it may mark a service unreachable even if the service itself never got a
chance to respond), and is what failure detection reads.

```json
{
  "service": "paymentService",
  "collectedAt": "2026-09-01T10:15:35.120Z",
  "reachable": true,
  "cpuPercent": 12.4,
  "memoryMb": 128.5,
  "avgResponseTimeMs": 45,
  "requestCount": 1023,
  "errorRate": 0.02
}
```

- `reachable: false` means the `/health` poll failed or timed out; in that case the
  numeric fields may be `null` since there's no fresh data.
- Monitoring stores the latest snapshot for each service in memory. Since
  monitoring and failure detection are separate services in Docker Compose,
  `GET /snapshots` returns `{ "snapshots": [/* section 2 snapshots */] }` for
  failure detection to consume. `GET /metrics/latest` returns the same response
  for the dashboard. See `monitoring/src/README.md` for polling and storage
  details.

---

## 3. Failure-detection alert event

Raised by failure detection when heartbeat/timeout or threshold rules confirm a
service is unhealthy. Consumed by recovery and by the dashboard.

```json
{
  "alertId": "alert_9f2a3c",
  "service": "paymentService",
  "status": "unhealthy",
  "reason": "heartbeatTimeout",
  "detectedAt": "2026-09-01T10:15:45.000Z",
  "details": {
    "lastHeartbeatAt": "2026-09-01T10:15:30.000Z",
    "thresholdSeconds": 10
  },
  "affectedServices": ["orderService", "gateway"]
}
```

- `reason` is one of `"heartbeatTimeout"`, `"highErrorRate"`, `"highLatency"`,
  `"highCpu"`, `"highMemory"`, `"unreachable"`.
- `details` shape varies by `reason` (the example above is for `heartbeatTimeout`;
  a `highErrorRate` alert would carry `{ "errorRate": 0.4, "thresholdFraction": 0.2 }`
  instead). Document each variant in `failureDetection/src/README.md` as rules are
  implemented.
- `affectedServices` is the detector's best-effort list of services that call the
  unhealthy one directly, for blast-radius display on the dashboard.

---

## 4. Recovery-action event

Emitted by recovery when it acts on an alert. Consumed by the dashboard to render
the Normal → Failure Detected → Recovery Started → System Recovered timeline.

```json
{
  "recoveryId": "recovery_7b1d90",
  "alertId": "alert_9f2a3c",
  "service": "paymentService",
  "action": "circuitBreakerOpen",
  "startedAt": "2026-09-01T10:15:46.000Z",
  "completedAt": null,
  "outcome": "inProgress",
  "details": {
    "retryCount": 3,
    "backoffMs": 2000
  }
}
```

- `action` is one of `"retry"`, `"backoff"`, `"circuitBreakerOpen"`,
  `"circuitBreakerClosed"`, `"reroute"`.
- `outcome` is one of `"inProgress"`, `"succeeded"`, `"failed"`. A later event with
  the same `recoveryId` and an updated `outcome`/`completedAt` represents that
  action resolving.
- `details` shape varies by `action`, same convention as alert `details` above.

---

## 5. Fault-injection command

Sent from the dashboard to fault injection when a team member triggers a failure
scenario.

```json
{
  "command": "addLatency",
  "targetService": "paymentService",
  "params": {
    "latencyMs": 5000,
    "durationSeconds": 30
  },
  "requestedAt": "2026-09-01T10:20:00.000Z",
  "requestedBy": "dashboard"
}
```

- `command` is one of `"killService"`, `"addLatency"`, `"overloadService"`.
- `params` shape varies by command:
  - `killService`: `{ "durationSeconds": 20 }` (how long the service stays down
    before restarting, or omit to require a manual restart)
  - `addLatency`: `{ "latencyMs": 5000, "durationSeconds": 30 }`
  - `overloadService`: `{ "requestsPerSecond": 200, "durationSeconds": 30 }`
