// Turns whatever list shape a backend returns into a plain array, so the
// dashboard keeps working whether a service responds with `[...]`,
// `{ alerts: [...] }`, or an object keyed by service name.
// Owner: Swayum Bansal (Member 5)

export function toArray(data, keys = []) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }
  // Object keyed by id/service: { paymentService: {...} | [...] }
  return Object.entries(data).flatMap(([key, value]) => {
    if (Array.isArray(value)) return value.map((v) => ({ service: key, ...v }));
    if (value && typeof value === "object") return [{ service: key, ...value }];
    return [];
  });
}

// Accepts either a monitoring snapshot (section 2) or a raw /health payload
// (section 1) and returns the flat snapshot shape.
export function toSnapshot(raw) {
  const m = raw.metrics && typeof raw.metrics === "object" ? raw.metrics : raw;
  return {
    service: raw.service,
    collectedAt: raw.collectedAt || raw.timestamp || null,
    reachable: raw.reachable !== undefined ? raw.reachable : true,
    selfStatus: raw.status || null,
    cpuPercent: m.cpuPercent ?? null,
    memoryMb: m.memoryMb ?? null,
    avgResponseTimeMs: m.avgResponseTimeMs ?? null,
    requestCount: m.requestCount ?? null,
    errorRate: m.errorRate ?? null,
  };
}

// Keeps the newest snapshot per service.
export function latestPerService(snapshots) {
  const latest = {};
  for (const s of snapshots) {
    if (!s.service) continue;
    const prev = latest[s.service];
    if (!prev || Date.parse(s.collectedAt || 0) >= Date.parse(prev.collectedAt || 0)) {
      latest[s.service] = s;
    }
  }
  return latest;
}
