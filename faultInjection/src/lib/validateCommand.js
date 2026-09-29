// Validates a fault-injection command against docs/apiContracts.md section 5.
// Owner: Swayum Bansal (Member 5)

const { resolveServiceName, SERVICE_NAMES } = require("./serviceRegistry");

const MAX_DURATION_SECONDS = 600;

// Per-command param rules: [name, required, min, max]
const PARAM_RULES = {
  killService: [["durationSeconds", false, 1, MAX_DURATION_SECONDS]],
  addLatency: [
    ["latencyMs", true, 1, 60000],
    ["durationSeconds", true, 1, MAX_DURATION_SECONDS],
  ],
  overloadService: [
    ["requestsPerSecond", true, 1, 2000],
    ["durationSeconds", true, 1, MAX_DURATION_SECONDS],
  ],
};

const COMMANDS = Object.keys(PARAM_RULES);

// Returns { ok: true, command } with a normalized command, or { ok: false, errors }.
function validateCommand(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: ["Request body must be a JSON object"] };
  }

  const { command, targetService, params = {}, requestedAt, requestedBy } = body;

  if (!COMMANDS.includes(command)) {
    errors.push(`command must be one of ${COMMANDS.join(", ")}`);
  }

  const service = resolveServiceName(targetService);
  if (!service) {
    errors.push(`targetService must be one of ${SERVICE_NAMES.join(", ")}`);
  }

  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    errors.push("params must be an object");
  }

  const cleanParams = {};
  if (PARAM_RULES[command] && params && typeof params === "object") {
    const allowed = PARAM_RULES[command].map(([name]) => name);
    for (const key of Object.keys(params)) {
      if (!allowed.includes(key)) {
        errors.push(`params.${key} is not valid for ${command} (allowed: ${allowed.join(", ")})`);
      }
    }
    for (const [name, required, min, max] of PARAM_RULES[command]) {
      const value = params[name];
      if (value === undefined || value === null || value === "") {
        if (required) errors.push(`params.${name} is required for ${command}`);
        continue;
      }
      if (typeof value !== "number" || !Number.isInteger(value)) {
        errors.push(`params.${name} must be a whole number`);
      } else if (value < min || value > max) {
        errors.push(`params.${name} must be between ${min} and ${max}`);
      } else {
        cleanParams[name] = value;
      }
    }
  }

  if (requestedAt !== undefined && Number.isNaN(Date.parse(requestedAt))) {
    errors.push("requestedAt must be an ISO-8601 timestamp");
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    command: {
      command,
      targetService: service,
      params: cleanParams,
      requestedAt: requestedAt || new Date().toISOString(),
      requestedBy: requestedBy || "unknown",
    },
  };
}

module.exports = { validateCommand, COMMANDS };
