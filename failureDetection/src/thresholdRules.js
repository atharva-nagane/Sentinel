// Central detection thresholds and numeric rule checks.
// Owner: Omkar Kottawar (Member 3)

function positiveNumberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const THRESHOLDS = {
  heartbeatTimeoutSeconds: positiveNumberOr(process.env.HEARTBEAT_TIMEOUT_SECONDS, 10),
  errorRateFraction: positiveNumberOr(process.env.ERROR_RATE_THRESHOLD, 0.2),
  latencyMs: positiveNumberOr(process.env.LATENCY_THRESHOLD_MS, 2000),
  cpuPercent: positiveNumberOr(process.env.CPU_THRESHOLD_PERCENT, 80),
  memoryMb: positiveNumberOr(process.env.MEMORY_THRESHOLD_MB, 512),
};

function checkThresholds(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || snapshot.reachable === false) {
    return null;
  }

  if (
    Number.isFinite(snapshot.errorRate) &&
    snapshot.errorRate > THRESHOLDS.errorRateFraction
  ) {
    return {
      reason: "highErrorRate",
      details: {
        errorRate: snapshot.errorRate,
        thresholdFraction: THRESHOLDS.errorRateFraction,
      },
    };
  }

  if (
    Number.isFinite(snapshot.avgResponseTimeMs) &&
    snapshot.avgResponseTimeMs > THRESHOLDS.latencyMs
  ) {
    return {
      reason: "highLatency",
      details: {
        avgResponseTimeMs: snapshot.avgResponseTimeMs,
        thresholdMs: THRESHOLDS.latencyMs,
      },
    };
  }

  if (
    Number.isFinite(snapshot.cpuPercent) &&
    snapshot.cpuPercent > THRESHOLDS.cpuPercent
  ) {
    return {
      reason: "highCpu",
      details: {
        cpuPercent: snapshot.cpuPercent,
        thresholdPercent: THRESHOLDS.cpuPercent,
      },
    };
  }

  if (
    Number.isFinite(snapshot.memoryMb) &&
    snapshot.memoryMb > THRESHOLDS.memoryMb
  ) {
    return {
      reason: "highMemory",
      details: {
        memoryMb: snapshot.memoryMb,
        thresholdMb: THRESHOLDS.memoryMb,
      },
    };
  }

  return null;
}

THRESHOLDS.checkThresholds = checkThresholds;

module.exports = THRESHOLDS;
