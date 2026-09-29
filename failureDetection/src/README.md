# Failure detection internals

Reads snapshots from monitoring over HTTP (shape in `docs/apiContracts.md`
section 2). In Docker Compose, poll `GET ${MONITORING_URL}/snapshots`
(`MONITORING_URL` defaults to `http://monitoring:4001`); the response is an
object with a `snapshots` array. Monitoring and failure detection run in
separate containers, so failure detection must not import the process-local
`monitoring/src/metricsStore.js` directly. It applies the rules in
`thresholdRules.js`, `heartbeatCheck.js`, and `timeoutDetector.js`, and calls
`alertEmitter.js` when a service crosses from healthy to unhealthy.

Alert event shape is in `docs/apiContracts.md` section 3 - this is the contract
between this workstream and both Member 4 (recovery) and Member 5 (dashboard), so
any change here needs to be reflected in that doc and communicated to both.
