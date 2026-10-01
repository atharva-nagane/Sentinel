// Reads memoryMb off a service's /health response.
// Owner: Om Sawkare (Member 2)
function collectMemory(healthPayload) {
  const value = healthPayload?.metrics?.memoryMb;
  return Number.isFinite(value) ? value : null;
}

module.exports = collectMemory;
