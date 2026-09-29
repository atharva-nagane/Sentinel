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
| `monitoring/` | Om Sawakare | System and Service Monitoring |
| `failureDetection/` | Om Kottawar | Failure Detection |
| `recovery/` | Atharva Nagane | Recovery Mechanisms |
| `faultInjection/` | Swayum Bansal | Fault Injection & Visualization |
| `faultInjection/src/injectors/addLatency.js` | Atharva Nagane | Recovery Mechanisms (by team agreement) |
| `dashboard/` | Swayum Bansal | Fault Injection & Visualization |

`docs/apiContracts.md` defines the payload shapes that cross these ownership
boundaries (health payloads, alert events, recovery events, fault-injection
commands). Read that file before wiring one workstream's output into another's
input.

## Getting started

Once each service has a working `Dockerfile` and `docker-compose.yml` is filled in:

```
docker-compose up --build
```

This starts the gateway, all backend services, the database, monitoring,
failure detection, recovery, fault injection, and the dashboard together.

Until then, each service can be run individually with:

```
cd <service-folder>
npm install
npm start
```
