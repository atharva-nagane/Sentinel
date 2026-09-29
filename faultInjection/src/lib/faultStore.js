// In-memory record of faults that are running or recently finished, so the
// dashboard can show what has been injected and end a fault early.
// Owner: Swayum Bansal (Member 5)

const crypto = require("crypto");

const MAX_FINISHED = 50;
const faults = new Map(); // faultId -> fault record
const handles = new Map(); // faultId -> injector handle ({ stop, progress })

function newFaultId() {
  return `fault_${crypto.randomBytes(3).toString("hex")}`;
}

function create(command) {
  const fault = {
    faultId: newFaultId(),
    ...command,
    status: "starting", // starting -> active -> completed | stopped | failed
    startedAt: new Date().toISOString(),
    endsAt: command.params.durationSeconds
      ? new Date(Date.now() + command.params.durationSeconds * 1000).toISOString()
      : null,
    endedAt: null,
    details: null,
    result: null,
    error: null,
  };
  faults.set(fault.faultId, fault);
  return fault;
}

function update(faultId, changes) {
  const fault = faults.get(faultId);
  if (fault) Object.assign(fault, changes);
  if (changes.endedAt) {
    handles.delete(faultId);
    prune();
  }
  return fault;
}

function prune() {
  const finished = [...faults.values()].filter((f) => f.endedAt);
  finished.slice(0, Math.max(0, finished.length - MAX_FINISHED)).forEach((f) => faults.delete(f.faultId));
}

function snapshot(fault) {
  const handle = handles.get(fault.faultId);
  const progress = handle && handle.progress ? handle.progress() : undefined;
  return progress ? { ...fault, result: progress } : { ...fault };
}

module.exports = {
  create,
  update,
  setHandle: (faultId, handle) => handles.set(faultId, handle),
  getHandle: (faultId) => handles.get(faultId),
  get: (faultId) => (faults.has(faultId) ? snapshot(faults.get(faultId)) : null),
  list: () => [...faults.values()].map(snapshot).reverse(),
  findActive: (command, targetService) =>
    [...faults.values()].find(
      (f) => f.command === command && f.targetService === targetService && !f.endedAt
    ),
};
