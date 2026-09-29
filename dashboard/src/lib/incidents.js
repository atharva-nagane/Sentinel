// Joins failure-detection alerts (apiContracts.md section 3) with recovery
// events (section 4) on alertId, producing one incident per alert with the
// Normal -> Failure Detected -> Recovery Started -> System Recovered progression.
// This join is what lets the dashboard tell the story of one specific failure
// instead of showing two unrelated lists.
// Owner: Swayum Bansal (Member 5)

export const STAGES = [
  { key: "normal", label: "Normal" },
  { key: "detected", label: "Failure Detected" },
  { key: "recoveryStarted", label: "Recovery Started" },
  { key: "recovered", label: "System Recovered" },
];

const time = (iso) => (iso ? Date.parse(iso) || 0 : 0);

// Several events can describe the same alert/recovery action (e.g. a recovery
// event re-emitted with outcome "succeeded"). Later events override earlier
// fields, but a null never erases a value already known.
export function mergeById(events, idKey) {
  const byId = new Map();
  for (const event of events) {
    const id = event && event[idKey];
    if (!id) continue;
    const prev = byId.get(id) || {};
    const next = { ...prev };
    for (const [k, v] of Object.entries(event)) {
      if (v !== null && v !== undefined) next[k] = v;
      else if (!(k in next)) next[k] = v;
    }
    byId.set(id, next);
  }
  return byId;
}

function outcomeOf(recoveries) {
  if (recoveries.length === 0) return "detected";
  if (recoveries.some((r) => r.outcome === "inProgress" || !r.outcome)) return "recovering";
  const latest = recoveries[recoveries.length - 1];
  return latest.outcome === "succeeded" ? "recovered" : "failed";
}

export function buildIncidents(alerts, recoveryEvents) {
  const alertsById = mergeById(alerts, "alertId");
  const recoveriesById = mergeById(recoveryEvents, "recoveryId");

  const recoveriesByAlert = new Map();
  for (const r of recoveriesById.values()) {
    if (!r.alertId) continue;
    if (!recoveriesByAlert.has(r.alertId)) recoveriesByAlert.set(r.alertId, []);
    recoveriesByAlert.get(r.alertId).push(r);
  }

  const alertIds = new Set([...alertsById.keys(), ...recoveriesByAlert.keys()]);

  const incidents = [...alertIds].map((alertId) => {
    const alert = alertsById.get(alertId) || null;
    const recoveries = (recoveriesByAlert.get(alertId) || []).sort(
      (a, b) => time(a.startedAt) - time(b.startedAt)
    );
    const outcome = outcomeOf(recoveries);

    const recoveryStartedAt = recoveries[0] ? recoveries[0].startedAt : null;
    const recoveredAt =
      outcome === "recovered" || outcome === "failed"
        ? recoveries.map((r) => r.completedAt).filter(Boolean).sort((a, b) => time(a) - time(b)).pop() || null
        : null;

    const stages = [
      { ...STAGES[0], state: "done", at: null },
      // A recovery event for an alert the dashboard never saw still implies
      // the failure was detected.
      { ...STAGES[1], state: "done", at: alert ? alert.detectedAt : null },
      {
        ...STAGES[2],
        state: recoveries.length ? "done" : "active",
        at: recoveryStartedAt,
      },
      {
        ...STAGES[3],
        state:
          outcome === "recovered" ? "done" : outcome === "failed" ? "failed" : recoveries.length ? "active" : "pending",
        at: recoveredAt,
      },
    ];

    const service = (alert && alert.service) || (recoveries[0] && recoveries[0].service) || "unknown";
    const lastUpdatedAt = [
      alert && alert.detectedAt,
      ...recoveries.flatMap((r) => [r.startedAt, r.completedAt]),
    ]
      .filter(Boolean)
      .sort((a, b) => time(a) - time(b))
      .pop() || null;

    return {
      alertId,
      service,
      alert,
      alertMissing: !alert,
      reason: alert ? alert.reason : null,
      affectedServices: (alert && alert.affectedServices) || [],
      detectedAt: alert ? alert.detectedAt : recoveryStartedAt,
      recoveries,
      outcome,
      stages,
      lastUpdatedAt,
    };
  });

  // Unresolved incidents first, then newest first.
  const open = (i) => (i.outcome === "recovered" ? 1 : 0);
  return incidents.sort((a, b) => open(a) - open(b) || time(b.detectedAt) - time(a.detectedAt));
}

// Services with an incident that hasn't reached System Recovered.
export function servicesWithOpenIncidents(incidents) {
  return new Set(incidents.filter((i) => i.outcome !== "recovered").map((i) => i.service));
}
