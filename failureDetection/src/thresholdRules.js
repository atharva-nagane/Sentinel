// Threshold values and rule checks, e.g. "no heartbeat for 10s -> unhealthy" or
// "errorRate above 0.2 -> unhealthy". Central place to tune detection sensitivity.
// Owner: Om Kottawar (Member 3)

// TODO: implemented by Om Kottawar
const THRESHOLDS = {
  heartbeatTimeoutSeconds: 10,
  errorRateFraction: 0.2,
  latencyMs: 2000,
};

module.exports = THRESHOLDS;
