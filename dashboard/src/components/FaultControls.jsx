// Fault-trigger controls: builds a command in the exact shape of
// docs/apiContracts.md section 5 and sends it to fault injection, then lists
// running faults with a button to end them early (manual restart for
// killService).
// Owner: Swayum Bansal (Member 5)

import React, { useState } from "react";
import usePolling, { getJson } from "../hooks/usePolling";
import { ENDPOINTS, POLL_INTERVAL_MS, SERVICES } from "../config";
import { formatTime, humanize, serviceLabel } from "../lib/format";

const COMMANDS = {
  killService: {
    label: "Kill service",
    fields: [{ name: "durationSeconds", label: "Down for (seconds)", default: 20, optional: true }],
  },
  addLatency: {
    label: "Add latency",
    fields: [
      { name: "latencyMs", label: "Latency (ms)", default: 5000 },
      { name: "durationSeconds", label: "Duration (seconds)", default: 30 },
    ],
  },
  overloadService: {
    label: "Overload service",
    fields: [
      { name: "requestsPerSecond", label: "Requests / second", default: 200 },
      { name: "durationSeconds", label: "Duration (seconds)", default: 30 },
    ],
  },
};

const defaultsFor = (command) =>
  Object.fromEntries(COMMANDS[command].fields.map((f) => [f.name, String(f.default)]));

export function buildCommand(command, targetService, values, manualRestart) {
  const params = {};
  for (const field of COMMANDS[command].fields) {
    if (field.optional && manualRestart) continue;
    params[field.name] = Number(values[field.name]);
  }
  return {
    command,
    targetService,
    params,
    requestedAt: new Date().toISOString(),
    requestedBy: "dashboard",
  };
}

export default function FaultControls() {
  const [targetService, setTargetService] = useState("paymentService");
  const [command, setCommand] = useState("killService");
  const [values, setValues] = useState(defaultsFor("killService"));
  const [manualRestart, setManualRestart] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);
  const faults = usePolling(`${ENDPOINTS.faults}/faults`, POLL_INTERVAL_MS);

  const pickCommand = (next) => {
    setCommand(next);
    setValues(defaultsFor(next));
    setManualRestart(false);
  };

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    setMessage(null);
    const body = buildCommand(command, targetService, values, manualRestart);
    try {
      const fault = await getJson(`${ENDPOINTS.faults}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setMessage({ ok: true, text: `${COMMANDS[command].label} sent to ${serviceLabel(targetService)} (${fault.faultId})` });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSending(false);
      faults.refresh();
    }
  };

  const stop = async (fault) => {
    try {
      await getJson(`${ENDPOINTS.faults}/faults/${fault.faultId}/stop`, { method: "POST" });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
    faults.refresh();
  };

  const list = Array.isArray(faults.data) ? faults.data : [];
  const running = list.filter((f) => !f.endedAt);
  const finished = list.filter((f) => f.endedAt).slice(0, 5);

  return (
    <section className="card panel controls">
      <header className="panel__head">
        <h2>Fault injection</h2>
      </header>
      {faults.error && <p className="source-error">Fault injection unreachable: {faults.error}</p>}
      <form onSubmit={send} className="fault-form">
        <label>
          Target service
          <div className="segmented">
            {SERVICES.map((s) => (
              <button type="button" key={s} className={s === targetService ? "on" : ""} onClick={() => setTargetService(s)}>
                {serviceLabel(s)}
              </button>
            ))}
          </div>
        </label>
        <label>
          Fault
          <div className="segmented">
            {Object.entries(COMMANDS).map(([key, c]) => (
              <button type="button" key={key} className={key === command ? "on" : ""} onClick={() => pickCommand(key)}>
                {c.label}
              </button>
            ))}
          </div>
        </label>
        <div className="fields">
          {COMMANDS[command].fields.map((field) => (
            <label key={field.name}>
              {field.label}
              <input
                type="number"
                min="1"
                step="1"
                required={!(field.optional && manualRestart)}
                disabled={field.optional && manualRestart}
                value={values[field.name]}
                onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
              />
            </label>
          ))}
          {command === "killService" && (
            <label className="check">
              <input type="checkbox" checked={manualRestart} onChange={(e) => setManualRestart(e.target.checked)} />
              Stay down until restarted manually
            </label>
          )}
        </div>
        <button className="primary" type="submit" disabled={sending}>
          {sending ? "Sending…" : `${COMMANDS[command].label}: ${serviceLabel(targetService)}`}
        </button>
        {message && <p className={message.ok ? "ok-msg" : "source-error"}>{message.text}</p>}
      </form>

      <h3 className="subhead">Running faults</h3>
      {running.length === 0 && <p className="empty small">None</p>}
      <ul className="fault-list">
        {running.map((f) => (
          <FaultRow key={f.faultId} fault={f} onStop={() => stop(f)} />
        ))}
      </ul>
      {finished.length > 0 && (
        <>
          <h3 className="subhead">Recently ended</h3>
          <ul className="fault-list">
            {finished.map((f) => (
              <FaultRow key={f.faultId} fault={f} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function FaultRow({ fault, onStop }) {
  const canStop = Boolean(onStop);
  const r = fault.result;
  return (
    <li className={`fault fault-${fault.status}`}>
      <div>
        <strong>{humanize(fault.command)}</strong> · {serviceLabel(fault.targetService)}
        <div className="muted small">
          {fault.status} · started {formatTime(fault.startedAt)}
          {fault.endsAt && !fault.endedAt ? ` · ends ${formatTime(fault.endsAt)}` : ""}
          {!fault.endsAt && !fault.endedAt ? " · until restarted" : ""}
          {r && r.sent !== undefined ? ` · ${r.sent} sent, ${r.failed} failed` : ""}
          {fault.error ? ` · ${fault.error}` : ""}
        </div>
      </div>
      {canStop && (
        <button type="button" onClick={onStop}>
          {fault.command === "killService" ? "Restart now" : "Stop"}
        </button>
      )}
    </li>
  );
}
