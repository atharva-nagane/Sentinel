# Architecture

Full background and rationale live in the project proposal doc; this file is a
quick reference for how the pieces fit together in the repo.

```
Client -> API Gateway -> User Service
                       -> Order Service
                       -> Payment Service -> Database
```

- `gateway/` routes client requests to the three backend services and attaches a
  request ID to every call.
- `services/userService/`, `services/orderService/`, `services/paymentService/`
  are the backend services themselves. Each exposes `/health` for monitoring.
- `monitoring/` polls every service's `/health` on an interval and produces
  normalized metric snapshots.
- `failureDetection/` reads those snapshots, applies heartbeat/timeout and
  threshold rules, and raises alert events.
- `recovery/` reacts to alerts with retry/backoff, circuit breaking, or traffic
  rerouting, and emits recovery events.
- `faultInjection/` accepts commands (usually from the dashboard) to kill a
  service, add latency, or overload it, for repeatable failure demos.
- `dashboard/` visualizes service health, alerts, and recovery actions live.

See `docs/apiContracts.md` for the exact payload shapes crossing each of these
boundaries.
