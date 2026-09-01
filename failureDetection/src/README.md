# Failure detection internals

Reads snapshots from `monitoring/src/metricsStore.js` (shape in
`docs/apiContracts.md` section 2), applies the rules in `thresholdRules.js`,
`heartbeatCheck.js`, and `timeoutDetector.js`, and calls `alertEmitter.js` when a
service crosses from healthy to unhealthy.

Alert event shape is in `docs/apiContracts.md` section 3 - this is the contract
between this workstream and both Member 4 (recovery) and Member 5 (dashboard), so
any change here needs to be reflected in that doc and communicated to both.
