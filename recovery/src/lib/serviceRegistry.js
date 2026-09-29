// Maps a service name to the base URL recovery probes when deciding whether a
// circuit breaker can close again. Mirrors faultInjection/src/lib/serviceRegistry.js
// but kept as its own copy since each folder ships as an independent container.
// Owner: Atharva Nagane (Member 4)

const SERVICES = {
  gateway: process.env.GATEWAY_URL || "http://localhost:3000",
  userService: process.env.USER_SERVICE_URL || "http://localhost:3001",
  orderService: process.env.ORDER_SERVICE_URL || "http://localhost:3002",
  paymentService: process.env.PAYMENT_SERVICE_URL || "http://localhost:3003",
};

// Accept the docker-compose hyphenated names too, same convention used by
// faultInjection commands.
const ALIASES = {
  "user-service": "userService",
  "order-service": "orderService",
  "payment-service": "paymentService",
};

function resolveServiceName(name) {
  if (typeof name !== "string") return null;
  if (SERVICES[name]) return name;
  return ALIASES[name] || null;
}

function getServiceUrl(name) {
  const resolved = resolveServiceName(name);
  if (!resolved) throw new Error(`Unknown service "${name}"`);
  return SERVICES[resolved];
}

module.exports = {
  SERVICE_NAMES: Object.keys(SERVICES),
  resolveServiceName,
  getServiceUrl,
};
