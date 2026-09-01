# Monitoring internals

Polling interval: TBD by Om Sawakare, document the chosen value here once set.

Each poll of a service's `/health` endpoint (shape in `docs/apiContracts.md`
section 1) produces one metric snapshot (shape in section 2) written to
`metricsStore.js`. Failure detection reads snapshots from this store - the
snapshot shape is the contract between this workstream and Member 3's, so any
change here needs to be reflected in `docs/apiContracts.md` and communicated to
Om Kottawar.
