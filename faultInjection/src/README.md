# Fault injection internals

Owner: Swayum Bansal (Member 5). `addLatency` is owned by Atharva Nagane (Member 4).

`index.js` is the single command dispatcher. It accepts a command shaped per
`docs/apiContracts.md` section 5, validates it, and calls the matching injector
under `injectors/`.

## HTTP API (port 4004)

| Method | Path | What it does |
| --- | --- | --- |
| `POST` | `/commands` | Validate and run a command. `202` with the fault record, `400` with `{ errors }` on a bad command, `409` if the same command is already active on that service, `502` if the injector failed to start. |
| `GET` | `/faults` | Running and recently finished faults, newest first. |
| `GET` | `/faults/:faultId` | One fault. |
| `POST` | `/faults/:faultId/stop` | End a fault early. For `killService` this is the manual restart. |
| `GET` | `/health` | Liveness of the fault-injection service itself. |

Fault record: `faultId`, the command fields, `status` (`starting`, `active`,
`stopping`, `completed`, `stopped`, `failed`), `startedAt`, `endsAt`, `endedAt`,
`details` (from the injector), `result` (e.g. overload request stats) and `error`.

## Command shape

```json
{
  "command": "killService",
  "targetService": "paymentService",
  "params": { "durationSeconds": 20 },
  "requestedAt": "2026-09-01T10:20:00.000Z",
  "requestedBy": "dashboard"
}
```

`targetService` is one of `gateway`, `userService`, `orderService`,
`paymentService` (the docker-compose names `user-service` etc. are also accepted
and normalized). `requestedAt` defaults to now and `requestedBy` to `"unknown"`
if omitted. Unknown param keys are rejected.

| `command` | `params` | Limits |
| --- | --- | --- |
| `killService` | `{ "durationSeconds": 20 }`, or `{}` to stay down until `POST /faults/:faultId/stop` | 1 to 600 s |
| `addLatency` | `{ "latencyMs": 5000, "durationSeconds": 30 }` (both required) | 1 to 60000 ms, 1 to 600 s |
| `overloadService` | `{ "requestsPerSecond": 200, "durationSeconds": 30 }` (both required) | 1 to 2000 rps, 1 to 600 s |

All params are whole numbers.

## Injectors

### killService

Finds the service's container by its docker-compose label
(`com.docker.compose.service=payment-service`), runs `docker stop`, and after
`durationSeconds` runs `docker start`. Set `<NAME>_CONTAINER` (e.g.
`PAYMENTSERVICE_CONTAINER=sentinel-payment-service-1`) to target a container by
name instead. `DOCKER_BIN` overrides the docker binary.

When fault injection itself runs in docker-compose it needs the host's Docker
socket, which the `fault-injection` entry in `docker-compose.yml` mounts.

### overloadService

Sends `GET` requests at roughly `requestsPerSecond` for `durationSeconds`, in
batches every 100 ms. Targets: `gateway` → `/users`, other services → `/`. Base
URLs come from `GATEWAY_URL`, `USER_SERVICE_URL`, `ORDER_SERVICE_URL`,
`PAYMENT_SERVICE_URL` (default `http://localhost:300x`). Requests time out after
5 s; at most 1000 are left in flight, extra ones are counted as `skipped`.
Stats (`sent`, `succeeded`, `failed`, `skipped`, `avgLatencyMs`) show on the
fault record live and when it ends.

## Integration point with addLatency (Atharva)

The dispatcher calls every injector the same way:

```js
const handle = await injector(targetService, params);
```

- `targetService`: the camelCase service name, already validated.
- `params`: `{ latencyMs, durationSeconds }`, already validated as whole numbers.
- Throw (or reject) if the fault can't be started; the dispatcher reports it as
  a failed fault.
- Return value, either:
  - a handle `{ details?, done, stop?, progress? }`: `done` is a promise that
    settles when the fault ends (its resolved value is stored as `result`),
    `stop()` ends it early, `progress()` returns live stats. `killService` and
    `overloadService` both return this shape.
  - or nothing, in which case the dispatcher treats the fault as ending on its
    own after `durationSeconds`, with no early stop.

`injectors/addLatency.js` is left for Atharva; the dispatcher already routes
`addLatency` commands to it. Confirm the final signature against this section.
