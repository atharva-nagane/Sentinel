// Top-level layout: service health grid, alert panel, and recovery timeline.
// Owner: Swayum Bansal (Member 5)

import React from "react";
import ServiceCard from "./components/ServiceCard";
import AlertPanel from "./components/AlertPanel";
import RecoveryTimeline from "./components/RecoveryTimeline";
import FaultControls from "./components/FaultControls";
import useServiceHealth from "./hooks/useServiceHealth";
import useIncidents from "./hooks/useIncidents";
import { servicesWithOpenIncidents } from "./lib/incidents";
import { formatTime } from "./lib/format";

export default function App() {
  const health = useServiceHealth();
  const { incidents, alertsError, recoveryError } = useIncidents();
  const alerted = servicesWithOpenIncidents(incidents);

  const openCount = incidents.filter((i) => i.outcome !== "recovered").length;
  const systemState = openCount ? "incident" : health.services.every((s) => s.status === "healthy") ? "ok" : "watch";
  const systemText = { incident: `${openCount} open incident${openCount > 1 ? "s" : ""}`, ok: "All systems normal", watch: "Monitoring" }[systemState];

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Sentinel</h1>
          <span className="muted">Distributed system failure &amp; recovery</span>
        </div>
        <div className="topbar__status">
          <span className={`system system-${systemState}`}>{systemText}</span>
          <span className="muted small">Last update {health.updatedAt ? formatTime(health.updatedAt.toISOString()) : "—"}</span>
        </div>
      </header>

      {health.error && <p className="source-error banner">Monitoring unreachable: {health.error}</p>}

      <section className="service-grid">
        {health.services.map((service) => (
          <ServiceCard key={service.name} service={service} alerted={alerted.has(service.name)} />
        ))}
      </section>

      <main className="layout">
        <div className="layout__main">
          <RecoveryTimeline incidents={incidents} error={recoveryError} />
        </div>
        <aside className="layout__side">
          <FaultControls />
          <AlertPanel incidents={incidents} error={alertsError} />
        </aside>
      </main>
    </div>
  );
}
