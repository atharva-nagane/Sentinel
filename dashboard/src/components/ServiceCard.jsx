// Displays one service's current health status and key metrics.
// Reads data shaped per docs/apiContracts.md section 2.
// Owner: Swayum Bansal (Member 5)

import React from "react";
import { formatNumber, formatTime } from "../lib/format";

const STATUS_TEXT = {
  healthy: "Healthy",
  degraded: "Degraded",
  unhealthy: "Unhealthy",
  down: "Down",
  stale: "No recent data",
  unknown: "Waiting for data",
};

// `service` comes from useServiceHealth; `alerted` is true while failure
// detection has an unresolved incident for this service, which overrides a
// green card so the grid agrees with the alert panel.
export default function ServiceCard({ service, alerted = false }) {
  const { label, name, snapshot } = service;
  let status = service.status;
  if (alerted && (status === "healthy" || status === "degraded")) status = "unhealthy";

  const metrics = [
    ["CPU", formatNumber(snapshot?.cpuPercent, 1, "%")],
    ["Memory", formatNumber(snapshot?.memoryMb, 0, " MB")],
    ["Latency", formatNumber(snapshot?.avgResponseTimeMs, 0, " ms")],
    ["Requests", formatNumber(snapshot?.requestCount)],
    ["Errors", snapshot?.errorRate == null ? "—" : formatNumber(snapshot.errorRate * 100, 1, "%")],
  ];

  return (
    <article className={`card service-card status-${status}`}>
      <header className="service-card__head">
        <div>
          <h3>{label}</h3>
          <code className="muted">{name}</code>
        </div>
        <span className={`pill pill-${status}`}>
          <span className="dot" />
          {STATUS_TEXT[status] || status}
        </span>
      </header>
      <dl className="metrics">
        {metrics.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <footer className="muted small">
        {alerted ? "Open alert · " : ""}Updated {formatTime(snapshot?.collectedAt)}
      </footer>
    </article>
  );
}
