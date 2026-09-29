// Entrypoint for fault injection. Accepts commands (usually from the dashboard)
// and dispatches to the matching injector.
// Owner: Swayum Bansal (Member 5 - Fault Injection & Visualization)

const express = require("express");
const killService = require("./injectors/killService");
const addLatency = require("./injectors/addLatency");
const overloadService = require("./injectors/overloadService");
const { validateCommand } = require("./lib/validateCommand");
const faultStore = require("./lib/faultStore");

// Every injector is called the same way: injector(targetService, params).
// addLatency is Atharva Nagane's injector; see src/README.md for the contract.
const INJECTORS = { killService, addLatency, overloadService };

// Injectors may return a handle { details, done, stop, progress }. Anything
// else (including undefined) is treated as a fault that ends on its own after
// params.durationSeconds, with no early stop.
function normalizeHandle(returned, params) {
  if (returned && typeof returned === "object" && (returned.done || returned.stop)) {
    return {
      details: returned.details || null,
      done: Promise.resolve(returned.done),
      stop: typeof returned.stop === "function" ? returned.stop : null,
      progress: typeof returned.progress === "function" ? returned.progress : null,
    };
  }
  const waitMs = (params.durationSeconds || 0) * 1000;
  return {
    details: returned && typeof returned === "object" ? returned : null,
    done: new Promise((resolve) => setTimeout(() => resolve(null), waitMs)),
    stop: null,
    progress: null,
  };
}

// Runs one validated command. Resolves with the fault record once the injector
// has started the fault; the fault's end is tracked in the background.
async function dispatch(command) {
  const existing = faultStore.findActive(command.command, command.targetService);
  if (existing) {
    const err = new Error(
      `${command.command} is already active on ${command.targetService} (${existing.faultId})`
    );
    err.status = 409;
    throw err;
  }

  const fault = faultStore.create(command);
  console.log(`[faultInjection] ${fault.faultId} ${command.command} -> ${command.targetService}`, command.params);

  let handle;
  try {
    handle = normalizeHandle(await INJECTORS[command.command](command.targetService, command.params), command.params);
  } catch (err) {
    faultStore.update(fault.faultId, { status: "failed", error: err.message, endedAt: new Date().toISOString() });
    console.error(`[faultInjection] ${fault.faultId} failed to start: ${err.message}`);
    err.status = 502;
    err.fault = faultStore.get(fault.faultId);
    throw err;
  }

  faultStore.setHandle(fault.faultId, handle);
  faultStore.update(fault.faultId, { status: "active", details: handle.details });

  handle.done
    .then((result) => {
      const current = faultStore.get(fault.faultId);
      faultStore.update(fault.faultId, {
        status: current.status === "stopping" ? "stopped" : "completed",
        result: result || null,
        endedAt: new Date().toISOString(),
      });
      console.log(`[faultInjection] ${fault.faultId} ended`);
    })
    .catch((err) => {
      faultStore.update(fault.faultId, { status: "failed", error: err.message, endedAt: new Date().toISOString() });
      console.error(`[faultInjection] ${fault.faultId} failed while ending: ${err.message}`);
    });

  return faultStore.get(fault.faultId);
}

// Ends a running fault early (for killService this is the manual restart).
async function stopFault(faultId) {
  const fault = faultStore.get(faultId);
  if (!fault) {
    const err = new Error(`No fault ${faultId}`);
    err.status = 404;
    throw err;
  }
  if (fault.endedAt) return fault;
  const handle = faultStore.getHandle(faultId);
  if (!handle || !handle.stop) {
    const err = new Error(`${fault.command} cannot be stopped early; it ends at ${fault.endsAt}`);
    err.status = 409;
    throw err;
  }
  faultStore.update(faultId, { status: "stopping" });
  await handle.stop();
  await handle.done.catch(() => {});
  return faultStore.get(faultId);
}

function createApp() {
  const app = express();
  app.use(express.json());

  // Lets the dashboard call this service directly when it isn't going through
  // the Vite dev proxy.
  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.get("/health", (req, res) => {
    res.json({ service: "faultInjection", status: "healthy", timestamp: new Date().toISOString() });
  });

  // Main entry: body is a command shaped per docs/apiContracts.md section 5.
  app.post("/commands", async (req, res) => {
    const validation = validateCommand(req.body);
    if (!validation.ok) return res.status(400).json({ errors: validation.errors });
    try {
      res.status(202).json(await dispatch(validation.command));
    } catch (err) {
      res.status(err.status || 500).json({ errors: [err.message], fault: err.fault });
    }
  });

  app.get("/faults", (req, res) => res.json(faultStore.list()));

  app.get("/faults/:faultId", (req, res) => {
    const fault = faultStore.get(req.params.faultId);
    if (!fault) return res.status(404).json({ errors: [`No fault ${req.params.faultId}`] });
    res.json(fault);
  });

  app.post("/faults/:faultId/stop", async (req, res) => {
    try {
      res.json(await stopFault(req.params.faultId));
    } catch (err) {
      res.status(err.status || 500).json({ errors: [err.message] });
    }
  });

  return app;
}

if (require.main === module) {
  const PORT = process.env.PORT || 4004;
  createApp().listen(PORT, () => {
    console.log(`Fault injection listening on port ${PORT}`);
  });
}

module.exports = { createApp, dispatch, stopFault };
