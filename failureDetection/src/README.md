# Failure detection implementation

These files are for `failureDetection/` on top of the current `main` baseline.
The implementation follows the repository's HTTP boundary: failure detection
reads `GET ${MONITORING_URL}/snapshots` and publishes alerts to
`POST ${RECOVERY_URL}/alerts`.

## Files

- `src/index.js` - polling loop, rule orchestration, deduplication, HTTP API.
- `src/heartbeatCheck.js` - tracks the latest reachable heartbeat and enforces the timeout.
- `src/timeoutDetector.js` - handles monitoring's explicit `reachable: false` signal.
- `src/thresholdRules.js` - central thresholds and numeric comparisons.
- `src/alertEmitter.js` - single alert-envelope builder and recovery publisher.
- `src/README.md` - the README content to place in the repository.
- `test/failureDetection.test.js` - focused unit tests.
- `package.json` - adds the `npm test` script.
