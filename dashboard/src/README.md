# Dashboard internals

Owner: Swayum Bansal (Member 5).

```
cd dashboard
npm install
npm run dev     # http://localhost:5173
npm test        # alert/recovery join tests
```

## Data sources

The browser only calls `/api/<backend>/...` on the dashboard's own origin;
`vite.config.js` proxies those to `MONITORING_URL`, `FAILURE_DETECTION_URL`,
`RECOVERY_URL` and `FAULT_INJECTION_URL` (defaults `http://localhost:400x`), so
other services need no CORS setup. Everything is polled every 2 s
(`VITE_POLL_INTERVAL_MS`).

| Stream | Default endpoint | Shape | Drives |
| --- | --- | --- | --- |
| Health | `GET /api/monitoring/metrics/latest` (`VITE_HEALTH_ENDPOINT`) | section 2 snapshots | service cards |
| Alerts | `GET /api/detection/alerts` (`VITE_ALERTS_ENDPOINT`) | section 3 alerts | alert panel, blast radius |
| Recovery | `GET /api/recovery/events` (`VITE_RECOVERY_ENDPOINT`) | section 4 events | recovery timeline |
| Faults | `/api/faults/commands`, `/api/faults/faults` | see `faultInjection/src/README.md` | fault controls |

The monitoring, failure-detection and recovery routes are not in
`docs/apiContracts.md` yet, so the defaults above are placeholders to confirm
with Om Sawakare, Om Kottawar and Atharva; change them in `src/config.js` or with
the `VITE_*` variables. Responses can be a plain array, an object wrapping one
(`{ alerts: [...] }`, `{ events: [...] }`, `{ snapshots: [...] }`), or an object
keyed by service name. Raw `/health` payloads (section 1) are also accepted for
health.

## Incident timeline (the alertId join)

`src/lib/incidents.js` merges alerts by `alertId` and recovery events by
`recoveryId` (a later event with the same id updates the earlier one), then
groups recovery actions under their alert's `alertId`. Each incident moves
through:

1. **Normal**
2. **Failure Detected**: the alert's `detectedAt`
3. **Recovery Started**: the earliest recovery action's `startedAt`
4. **System Recovered**: once no action is `inProgress` and the latest action
   `succeeded` (shown as **Recovery Failed** if the latest `failed`)

Events are kept for as long as the page is open, so an incident's early stages
stay visible even if a backend only returns recent events. A service card turns
red while its service has an incident that hasn't reached System Recovered.
