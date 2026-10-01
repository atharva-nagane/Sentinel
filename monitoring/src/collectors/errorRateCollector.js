// Reads errorRate and requestCount off a service's /health response.
// Owner: Om Sawkare (Member 2)

function collectErrorRate(healthPayload) {
  const metrics = healthPayload?.metrics;
  const errorRate = metrics?.errorRate;
  const requestCount = metrics?.requestCount;

  return {
    errorRate: Number.isFinite(errorRate) ? errorRate : null,
    requestCount: Number.isFinite(requestCount) ? requestCount : null,
  };
}

module.exports = collectErrorRate;
