// Holds the most recent metric snapshot per service for the monitoring HTTP API.
// Snapshot shape is defined in docs/apiContracts.md (section 2).
// Owner: Om Sawkare (Member 2)

const latestSnapshots = new Map();

function setSnapshot(serviceName, snapshot) {
  if (typeof serviceName !== "string" || serviceName.length === 0) {
    throw new TypeError("serviceName must be a non-empty string");
  }
  if (!snapshot || typeof snapshot !== "object") {
    throw new TypeError("snapshot must be an object");
  }

  latestSnapshots.set(serviceName, snapshot);
  return snapshot;
}

function getLatestSnapshot(serviceName) {
  return latestSnapshots.get(serviceName) || null;
}

function getAllSnapshots() {
  return Array.from(latestSnapshots.values());
}

module.exports = {
  getLatestSnapshot,
  // Keep the starter API available for consumers that already use its name.
  getSnapshot: getLatestSnapshot,
  getAllSnapshots,
  setSnapshot,
};
