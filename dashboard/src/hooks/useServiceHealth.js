// Polls monitoring for current service health and exposes one ready-to-render
// entry per service (apiContracts.md section 2 snapshot, plus a derived status).
// Owner: Swayum Bansal (Member 5)

import { useMemo } from "react";
import usePolling from "./usePolling";
import { toArray, toSnapshot, latestPerService } from "../lib/normalize";
import {
  ENDPOINTS,
  POLL_INTERVAL_MS,
  SERVICES,
  SERVICE_LABELS,
  STALE_AFTER_MS,
  DEGRADED_ERROR_RATE,
  DEGRADED_LATENCY_MS,
} from "../config";

// Status from monitoring's own view: unknown (no data yet), stale (data too
// old to trust), down (unreachable), degraded, or healthy.
export function deriveStatus(snapshot, now = Date.now()) {
  if (!snapshot) return "unknown";
  if (snapshot.collectedAt && now - Date.parse(snapshot.collectedAt) > STALE_AFTER_MS) return "stale";
  if (snapshot.reachable === false) return "down";
  if (snapshot.selfStatus === "unhealthy") return "unhealthy";
  if (
    snapshot.selfStatus === "degraded" ||
    (snapshot.errorRate ?? 0) > DEGRADED_ERROR_RATE ||
    (snapshot.avgResponseTimeMs ?? 0) > DEGRADED_LATENCY_MS
  ) {
    return "degraded";
  }
  return "healthy";
}

export default function useServiceHealth() {
  const { data, error, updatedAt } = usePolling(ENDPOINTS.health, POLL_INTERVAL_MS);

  const services = useMemo(() => {
    const latest = latestPerService(
      toArray(data, ["snapshots", "services", "data"]).filter(Boolean).map(toSnapshot)
    );
    const now = Date.now();
    return SERVICES.map((name) => ({
      name,
      label: SERVICE_LABELS[name],
      snapshot: latest[name] || null,
      status: deriveStatus(latest[name], now),
    }));
    // updatedAt changes on every successful poll so staleness is re-evaluated.
  }, [data, updatedAt]);

  return { services, error, updatedAt };
}
