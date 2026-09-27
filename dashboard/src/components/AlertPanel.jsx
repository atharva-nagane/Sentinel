// Lists active and recent failure alerts.
// Reads data shaped per docs/apiContracts.md section 3.
// Owner: Swayum Bansal (Member 5)

import React from "react";
import { formatTime, humanize, serviceLabel } from "../lib/format";

const OUTCOME_TEXT = {
  detected: "Awaiting recovery",
  recovering: "Recovering",
  recovered: "Recovered",
  failed: "Recovery failed",
};

// `incidents` come from lib/incidents.js so each alert carries its recovery
// state; the alert fields themselves are the section 3 payload.
export default function AlertPanel({ incidents, error }) {
  const withAlerts = incidents.filter((i) => i.alert);
  const active = withAlerts.filter((i) => i.outcome !== "recovered");
  const recent = withAlerts.filter((i) => i.outcome === "recovered");

  return (
    <section className="card panel">
      <header className="panel__head">
        <h2>Alerts</h2>
        <span className={`count ${active.length ? "count-alert" : ""}`}>{active.length} active</span>
      </header>
      {error && <p className="source-error">Failure detection unreachable: {error}</p>}
      {withAlerts.length === 0 && <p className="empty">No alerts. All services nominal.</p>}
      <ul className="alert-list">
        {[...active, ...recent].map((incident) => (
          <AlertItem key={incident.alertId} incident={incident} />
        ))}
      </ul>
    </section>
  );
}

function AlertItem({ incident }) {
  const { alert, outcome } = incident;
  const resolved = outcome === "recovered";
  return (
    <li className={`alert ${resolved ? "alert-resolved" : `alert-${alert.status || "unhealthy"}`}`}>
      <div className="alert__row">
        <strong>{serviceLabel(alert.service)}</strong>
        <span className="muted small">{formatTime(alert.detectedAt)}</span>
      </div>
      <div className="alert__row">
        <span>
          {humanize(alert.reason)} · <span className="muted">{alert.status}</span>
        </span>
        <span className={`tag tag-${outcome}`}>{OUTCOME_TEXT[outcome]}</span>
      </div>
      <div className="blast">
        <span className="muted small">Blast radius:</span>{" "}
        {incident.affectedServices.length ? (
          incident.affectedServices.map((s) => (
            <span key={s} className="chip">
              {serviceLabel(s)}
            </span>
          ))
        ) : (
          <span className="muted small">none reported</span>
        )}
      </div>
      <code className="muted small">{alert.alertId}</code>
    </li>
  );
}
