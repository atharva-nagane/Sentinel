// Renders the Normal -> Failure Detected -> Recovery Started -> System Recovered
// sequence for each incident, joined by alertId (see lib/incidents.js).
// Reads data shaped per docs/apiContracts.md sections 3 and 4.
// Owner: Swayum Bansal (Member 5)

import React from "react";
import { formatTime, humanize, secondsBetween, serviceLabel } from "../lib/format";

export default function RecoveryTimeline({ incidents, error }) {
  return (
    <section className="card panel timeline-panel">
      <header className="panel__head">
        <h2>Recovery timeline</h2>
        <span className="muted small">one row per incident, joined by alertId</span>
      </header>
      {error && <p className="source-error">Recovery service unreachable: {error}</p>}
      {incidents.length === 0 && (
        <div className="incident incident-idle">
          <Stages stages={[{ key: "normal", label: "Normal", state: "done" }]} />
          <p className="empty">System normal. Trigger a fault to see an incident unfold here.</p>
        </div>
      )}
      {incidents.map((incident) => (
        <Incident key={incident.alertId} incident={incident} />
      ))}
    </section>
  );
}

function Incident({ incident }) {
  const totalSeconds = secondsBetween(incident.detectedAt, incident.stages[3].at);
  return (
    <article className={`incident incident-${incident.outcome}`}>
      <header className="incident__head">
        <div>
          <h3>{serviceLabel(incident.service)}</h3>
          <span className="muted small">
            {incident.reason ? humanize(incident.reason) : "Alert not received yet"} · <code>{incident.alertId}</code>
          </span>
        </div>
        {totalSeconds !== null && (
          <span className={`tag tag-${incident.outcome}`}>
            {incident.outcome === "recovered" ? "Recovered" : "Failed"} in {totalSeconds}s
          </span>
        )}
      </header>
      <Stages stages={incident.stages} />
      {incident.recoveries.length > 0 && (
        <ol className="actions">
          {incident.recoveries.map((r) => (
            <li key={r.recoveryId} className={`action action-${r.outcome || "inProgress"}`}>
              <span>{humanize(r.action)}</span>
              <span className="muted small">
                {formatTime(r.startedAt)}
                {r.completedAt ? ` → ${formatTime(r.completedAt)}` : ""}
              </span>
              <span className={`tag tag-action-${r.outcome || "inProgress"}`}>{humanize(r.outcome || "inProgress")}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function Stages({ stages }) {
  return (
    <ol className="stages">
      {stages.map((stage, i) => (
        <li key={stage.key} className={`stage stage-${stage.state}`}>
          <span className="stage__marker">{stage.state === "done" ? "✓" : stage.state === "failed" ? "✕" : i + 1}</span>
          <span className="stage__label">{stage.state === "failed" ? "Recovery Failed" : stage.label}</span>
          <span className="stage__time muted small">
            {stage.key === "normal" ? "before failure" : stage.at ? formatTime(stage.at) : stage.state === "active" ? "in progress…" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
