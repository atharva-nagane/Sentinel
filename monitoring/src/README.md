# Monitoring service

The monitoring service polls the gateway and all three backend services and
publishes the normalized metric snapshots defined in `docs/apiContracts.md`
(section 2).

## Collection settings

- Polling interval: **3,000 ms** (`POLL_INTERVAL_MS`).
- Health request timeout: **2,000 ms** (`HEALTH_TIMEOUT_MS`).
- Targets: `gateway`, `userService`, `orderService`, and `paymentService`.
- All four `/health` requests run in parallel at the start of each cycle. The
  first cycle starts when monitoring starts; later cycles run at the configured
  interval. A failed request or timeout still writes an explicit snapshot with
  `reachable: false` and `null` metric values.

Service base URLs are configured with `GATEWAY_URL`, `USER_SERVICE_URL`,
`ORDER_SERVICE_URL`, and `PAYMENT_SERVICE_URL`. They default to localhost ports
3000–3003 for local development. In Docker Compose they point to the respective
Compose service names. `TARGET_SERVICES` can select a comma-separated subset;
both canonical names and Compose aliases such as `user-service` are accepted.

## Storage and HTTP contract

`src/metricsStore.js` keeps one latest snapshot per service in an in-memory
`Map`, keyed by the canonical service name. The store is process-local and is
reset when monitoring restarts. `getLatestSnapshot(serviceName)` returns the
latest snapshot (or `null` before the first poll); `getAllSnapshots()` returns
the latest snapshot for every service polled. `setSnapshot(serviceName,
snapshot)` is used by the polling engine to update the store.

Monitoring and failure detection run as separate services in Docker Compose, so
failure detection should read snapshots over HTTP rather than import the
in-memory store:

- **`GET /snapshots`** returns `{ "snapshots": [/* section 2 snapshots */] }`.
  This is the endpoint failure detection should poll using `MONITORING_URL`
  (default `http://monitoring:4001` in Compose): `GET ${MONITORING_URL}/snapshots`.
- **`GET /metrics/latest`** returns the same response and is the endpoint used
  by the dashboard's existing `/api/monitoring/metrics/latest` proxy.
- **`GET /health`** reports whether the monitoring HTTP service is running.

The raw service `status` is not substituted for `reachable`: reachability only
describes whether the health request succeeded. Snapshots contain exactly the
section 2 fields; changes to that payload or these routes should be reflected
in `docs/apiContracts.md` and coordinated with the consumers.
