// Where the dashboard reads each data stream from. Every path goes through the
// Vite proxy in vite.config.js (/api/<backend>/...). The endpoint paths on the
// monitoring, failure-detection and recovery services are not fixed in
// docs/apiContracts.md yet; override them with VITE_* env vars once those
// services settle on routes.
// Owner: Swayum Bansal (Member 5)

const env = import.meta.env || {};

export const SERVICES = ["gateway", "userService", "orderService", "paymentService"];

export const SERVICE_LABELS = {
  gateway: "API Gateway",
  userService: "User Service",
  orderService: "Order Service",
  paymentService: "Payment Service",
};

export const ENDPOINTS = {
  // Latest metric snapshot per service (apiContracts.md section 2).
  health: env.VITE_HEALTH_ENDPOINT || "/api/monitoring/metrics/latest",
  // Alert events (section 3).
  alerts: env.VITE_ALERTS_ENDPOINT || "/api/detection/alerts",
  // Recovery events (section 4).
  recovery: env.VITE_RECOVERY_ENDPOINT || "/api/recovery/events",
  // Fault injection (section 5); see faultInjection/src/README.md.
  faults: env.VITE_FAULTS_ENDPOINT || "/api/faults",
};

export const POLL_INTERVAL_MS = Number(env.VITE_POLL_INTERVAL_MS) || 2000;

// A snapshot older than this is shown as stale rather than trusted.
export const STALE_AFTER_MS = POLL_INTERVAL_MS * 5 + 10000;

// Local thresholds used only to colour a card yellow when monitoring still
// reports the service reachable; failure detection's alerts take precedence.
export const DEGRADED_ERROR_RATE = 0.2;
export const DEGRADED_LATENCY_MS = 1000;
