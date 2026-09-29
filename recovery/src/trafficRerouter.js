// Tracks which services traffic should currently avoid. The gateway consults
// this via GET /isolated-services (see gateway/src/routing/recoveryGuard.js)
// before proxying to any of these services.
// Owner: Atharva Nagane (Member 4)

const isolated = new Map(); // service -> { since, reason }

function isolate(service, reason) {
  if (!isolated.has(service)) {
    isolated.set(service, { since: new Date().toISOString(), reason: reason || null });
  }
  return isolated.get(service);
}

function restore(service) {
  isolated.delete(service);
}

function isAvailable(service) {
  return !isolated.has(service);
}

function list() {
  return [...isolated.entries()].map(([service, info]) => ({ service, ...info }));
}

module.exports = { isolate, restore, isAvailable, list };
