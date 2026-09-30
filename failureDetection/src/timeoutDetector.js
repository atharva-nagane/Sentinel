// Flags the explicit reachable:false signal from monitoring immediately.
// Owner: Om Kottawar (Member 3)

function detectTimeout(service, snapshot) {
  if (
    typeof service !== "string" ||
    service.length === 0 ||
    !snapshot ||
    snapshot.reachable !== false
  ) {
    return null;
  }

  return {
    reason: "unreachable",
    details: {
      pollFailedAt: snapshot.collectedAt || null,
    },
  };
}

module.exports = detectTimeout;
