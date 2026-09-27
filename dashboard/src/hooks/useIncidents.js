// Polls failure detection (alerts) and recovery (recovery events), keeps every
// event seen since the dashboard opened, and joins them into incidents by
// alertId (see lib/incidents.js).
// Owner: Swayum Bansal (Member 5)

import { useMemo, useRef } from "react";
import usePolling from "./usePolling";
import { toArray } from "../lib/normalize";
import { buildIncidents, mergeById } from "../lib/incidents";
import { ENDPOINTS, POLL_INTERVAL_MS } from "../config";

// Backends may return only recent events; accumulating them here means an
// incident's early stages don't disappear from the timeline mid-demo.
function useAccumulated(list, idKey) {
  const seen = useRef(new Map());
  return useMemo(() => {
    const merged = mergeById([...seen.current.values(), ...list], idKey);
    seen.current = merged;
    return [...merged.values()];
  }, [list, idKey]);
}

export default function useIncidents() {
  const alertsPoll = usePolling(ENDPOINTS.alerts, POLL_INTERVAL_MS);
  const recoveryPoll = usePolling(ENDPOINTS.recovery, POLL_INTERVAL_MS);

  const alertList = useMemo(() => toArray(alertsPoll.data, ["alerts", "events", "data"]), [alertsPoll.data]);
  const recoveryList = useMemo(
    () => toArray(recoveryPoll.data, ["events", "recoveries", "recoveryEvents", "data"]),
    [recoveryPoll.data]
  );

  const alerts = useAccumulated(alertList, "alertId");
  const recoveryEvents = useAccumulated(recoveryList, "recoveryId");
  const incidents = useMemo(() => buildIncidents(alerts, recoveryEvents), [alerts, recoveryEvents]);

  return {
    alerts,
    recoveryEvents,
    incidents,
    alertsError: alertsPoll.error,
    recoveryError: recoveryPoll.error,
  };
}
