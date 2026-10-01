// Assembles and publishes the failure-detection alert contract.
// Owner: Omkar Kottawar (Member 3)

const crypto = require("crypto");
const axios = require("axios");

const MAX_ALERTS = 100;
const RECOVERY_URL = process.env.RECOVERY_URL || "http://recovery:4003";

const REASONS = [
  "heartbeatTimeout",
  "highErrorRate",
  "highLatency",
  "highCpu",
  "highMemory",
  "unreachable",
];

const AFFECTED_SERVICES = {
  gateway: [],
  userService: ["gateway"],
  orderService: ["gateway"],
  paymentService: ["orderService", "gateway"],
};

const alerts = [];

function newAlertId() {
  return `alert_${crypto.randomBytes(3).toString("hex")}`;
}

function recoveryAlertsUrl(baseUrl) {
  return new URL("/alerts", baseUrl).toString();
}

async function emitAlert(
  {
    service,
    reason,
    detectedAt = new Date().toISOString(),
    details = {},
    affectedServices,
  },
  { httpClient = axios, recoveryUrl = RECOVERY_URL } = {}
) {
  if (!service) {
    throw new TypeError("service is required");
  }

  if (!REASONS.includes(reason)) {
    throw new Error(`Unsupported failure reason "${reason}"`);
  }

  const alert = {
    alertId: newAlertId(),
    service,
    status: "unhealthy",
    reason,
    detectedAt,
    details,
    affectedServices: Array.isArray(affectedServices)
      ? [...affectedServices]
      : [...(AFFECTED_SERVICES[service] || [])],
  };

  alerts.push(alert);
  if (alerts.length > MAX_ALERTS) {
    alerts.shift();
  }

  console.log(`[failure-detection] ${alert.alertId} ${service}: ${reason} - alerting recovery`);

  try {
    await httpClient.post(recoveryAlertsUrl(recoveryUrl), alert, { timeout: 3000 });
  } catch (error) {
    // A recovery outage must not hide the alert from the dashboard or stop
    // the detection loop. Recovery can be retried independently.
    console.error(
      `[failure-detection] failed to publish alert ${alert.alertId}: ${error.message}`
    );
  }

  return alert;
}

function listAlerts(limit = 100) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return [];
  }

  return alerts.slice(-Math.floor(parsed)).map((alert) => ({
    ...alert,
    details: alert.details && { ...alert.details },
    affectedServices: [...alert.affectedServices],
  }));
}

function clearAlerts() {
  alerts.length = 0;
}

emitAlert.REASONS = Object.freeze([...REASONS]);
emitAlert.AFFECTED_SERVICES = Object.freeze(
  Object.fromEntries(
    Object.entries(AFFECTED_SERVICES).map(([service, callers]) => [
      service,
      Object.freeze([...callers]),
    ])
  )
);
emitAlert.listAlerts = listAlerts;
emitAlert.clearAlerts = clearAlerts;

module.exports = emitAlert;
