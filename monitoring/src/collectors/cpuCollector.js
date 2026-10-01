// Reads cpuPercent off a service's /health response.
// Owner: Om Sawkare (Member 2)
function collectCpu(healthPayload) {
  const value = healthPayload?.metrics?.cpuPercent;
  return Number.isFinite(value) ? value : null;
}

module.exports = collectCpu;
