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

## Getting Started

### What We've Built So Far (In Layman's Terms)
We have successfully built the **foundation** of the Sentinel application. Think of this like the plumbing of a house before you install the sinks and appliances. 
We built an **API Gateway** (the front door) and three backend services (**User**, **Order**, and **Payment**). 
- **How it helps**: By having real, working services that talk to each other and connect to a database, the rest of the team now has something tangible to monitor, break, and fix! 
- **Request Tracing**: When a request comes in the front door, we hand it a unique sticky note (an `x-request-id`). As that request travels from service to service, the sticky note gets passed along. This allows us to track exactly where a request went and how long it took.
- **Health Contracts**: Every service now has a doctor's chart (the `/health` endpoint). If anyone asks how a service is doing, it responds with a highly standardized report showing its CPU usage, memory, how many requests it handled, and if it's currently failing.

### How to Setup and Run
You will need [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed on your machine.

1. Ensure your `.env` file is set up (you can copy it from `.env.example`).
2. Start the foundational backend services and database by running:
   ```bash
   docker compose up --build -d database gateway user-service order-service payment-service
   ```

### How to Test
Once the containers are running, you can test the APIs from your terminal:

1. **Test the Multi-Hop Tracing:**
   ```bash
   curl -i http://localhost:3000/orders/test
   ```
   *You will see the Gateway forward this to the Order service, which calls the Payment service, which queries the Database. The `x-request-id` will be returned in the headers!*

2. **Test the Health Endpoints:**
   ```bash
   curl -s http://localhost:3000/health
   curl -s http://localhost:3003/health
   ```
   *You will see the exact JSON format that the monitoring tools will use to track the health of these services.*

### Next Steps
Now that the foundation is rock solid, the other workstreams are unblocked:
- **Om Sawakare (Monitoring)**: Build the monitoring polling engine that hits these `/health` endpoints and aggregates the data.
- **Swayum Bansal (Fault Injection)**: Build the tools to target the Payment Service and purposely break its Postgres database connection to simulate a crash.
- **Om Kottawar (Failure Detection) & Atharva Nagane (Recovery)**: Build the logic to detect when the Payment Service's error rate spikes and automatically reroute or circuit-break the traffic!
