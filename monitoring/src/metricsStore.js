// Holds the most recent metric snapshot per service so failure detection and
// the dashboard can read current state without re-polling every service.
// Snapshot shape is defined in docs/apiContracts.md (section 2).
// Owner: Om Sawakare (Member 2)

// TODO: implemented by Om Sawakare
module.exports = {
  getSnapshot(service) {
    return null;
  },
  setSnapshot(service, snapshot) {},
};
