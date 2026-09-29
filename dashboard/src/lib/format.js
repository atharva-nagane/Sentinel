// Small display helpers shared by the dashboard components.
// Owner: Swayum Bansal (Member 5)

import { SERVICE_LABELS } from "../config";

export const serviceLabel = (name) => SERVICE_LABELS[name] || name;

export function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString([], { hour12: false });
}

export function formatNumber(value, digits = 0, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(digits)}${suffix}`;
}

export function secondsBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  return Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000));
}

// "reason": "heartbeatTimeout" -> "Heartbeat timeout"
export function humanize(camel) {
  if (!camel) return "";
  const spaced = camel.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
