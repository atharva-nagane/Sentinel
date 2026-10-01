// Reads avgResponseTimeMs off a service's /health response.
// Owner: Om Sawkare (Member 2)
function collectResponseTime(healthPayload) {
  const value = healthPayload?.metrics?.avgResponseTimeMs;
  return Number.isFinite(value) ? value : null;
}

module.exports = collectResponseTime;
