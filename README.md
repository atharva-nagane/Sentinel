# Distributed System Monitoring and Failure Recovery Platform

A small distributed application (API gateway plus User, Order, and Payment services
backed by a database) wrapped in tooling that monitors service health, detects
failures, attempts automated recovery, and visualizes all of it live on a dashboard.
A fault-injection tool lets the team trigger controlled failures (latency, crashes,
overload) to demonstrate detection and recovery on demand.

## Architecture

```
Client -> API Gateway -> User Service
                       -> Order Service
                       -> Payment Service -> Database
```

Every request is tagged with a request ID at the gateway and that ID is propagated
on every downstream call, so a single request can be traced across services.

Wrapped around the application:

- Monitoring layer — collects CPU, memory, response time, request count, and error
  rate from every service on a fixed interval
- Failure detector — applies heartbeat/timeout and threshold rules to the metrics
  stream and raises alerts
- Recovery layer — reacts to alerts with retry/backoff, circuit breaking, and
  traffic rerouting
- Fault-injection tool — deliberately breaks services in a controlled, repeatable way
- Dashboard — live view of service health, alerts, and recovery actions

## Ownership

| Folder | Owner | Workstream |
| --- | --- | --- |
| `gateway/` | Ritik Mishra | Distributed Application & Communication |
| `services/userService/` | Ritik Mishra | Distributed Application & Communication |
| `services/orderService/` | Ritik Mishra | Distributed Application & Communication |
| `services/paymentService/` | Ritik Mishra | Distributed Application & Communication |
| `monitoring/` | Om Sawkare | System and Service Monitoring |
| `failureDetection/` | Omkar Kottawar | Failure Detection |
| `recovery/` | Atharva Nagane | Recovery Mechanisms |
| `faultInjection/` | Swayum Bansal | Fault Injection & Visualization |
| `faultInjection/src/injectors/addLatency.js` | Atharva Nagane | Recovery Mechanisms (by team agreement) |
| `dashboard/` | Swayum Bansal | Fault Injection & Visualization |

`docs/apiContracts.md` defines the payload shapes that cross these ownership
boundaries (health payloads, monitoring snapshots, alert events, recovery
events, fault-injection commands). Read that file before wiring one
workstream's output into another's input.

## Status

All five workstreams are implemented and wired end to end: the gateway and
three backend services expose `/health`; monitoring polls them into metric
snapshots; failure detection applies heartbeat/timeout/threshold rules against
those snapshots and raises alerts; recovery reacts with retry/backoff, circuit
breaking, and traffic rerouting, and the gateway consults recovery's isolation
list before proxying; fault injection can kill a service, add network latency,
or overload it on demand; and the dashboard polls all of the above to show
live service health, alerts, and the recovery timeline for each incident.

## Getting Started

You will need [Docker Desktop](https://www.docker.com/products/docker-desktop/)
installed and running.

1. Copy `.env.example` to `.env` and adjust if needed (defaults match
   `docker-compose.yml`).
2. Start the full stack:
   ```bash
   docker compose up --build -d
   ```
3. Open the dashboard at `http://localhost:5173`.

### Demoing detection and recovery

With the stack running, trigger a controlled failure from the dashboard's
fault controls (or directly via `faultInjection`'s API, see
`faultInjection/src/README.md`) and watch the incident move through the
timeline:

```bash
curl -s -X POST http://localhost:4004/commands \
  -H "content-type: application/json" \
  -d '{"command":"addLatency","targetService":"paymentService","params":{"latencyMs":5000,"durationSeconds":30}}'
```

Monitoring picks up the degraded response time, failure detection raises an
alert, recovery retries/circuit-breaks/reroutes, and the dashboard shows
Normal → Failure Detected → Recovery Started → System Recovered for the
incident in real time.

### Useful checks

```bash
curl -s http://localhost:3000/health          # gateway
curl -s http://localhost:4001/snapshots       # monitoring
curl -s http://localhost:4002/alerts          # failure detection
curl -s http://localhost:4003/events          # recovery
```
