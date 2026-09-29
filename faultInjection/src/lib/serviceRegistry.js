// Maps the service names used in commands (docs/apiContracts.md section 5) to
// where each service is reachable and which Docker container runs it.
// Owner: Swayum Bansal (Member 5)

const SERVICES = {
  gateway: {
    composeService: "gateway",
    url: process.env.GATEWAY_URL || "http://localhost:3000",
    // The gateway has no root route, so overload goes through a proxied route.
    overloadPath: "/users",
  },
  userService: {
    composeService: "user-service",
    url: process.env.USER_SERVICE_URL || "http://localhost:3001",
    overloadPath: "/",
  },
  orderService: {
    composeService: "order-service",
    url: process.env.ORDER_SERVICE_URL || "http://localhost:3002",
    overloadPath: "/",
  },
  paymentService: {
    composeService: "payment-service",
    url: process.env.PAYMENT_SERVICE_URL || "http://localhost:3003",
    overloadPath: "/",
  },
};

// Accept both the camelCase names from the contract and the docker-compose names.
const ALIASES = Object.fromEntries(
  Object.entries(SERVICES).map(([name, s]) => [s.composeService, name])
);

function resolveServiceName(name) {
  if (typeof name !== "string") return null;
  if (SERVICES[name]) return name;
  return ALIASES[name] || null;
}

function getService(name) {
  const resolved = resolveServiceName(name);
  if (!resolved) throw new Error(`Unknown service "${name}"`);
  return { name: resolved, ...SERVICES[resolved] };
}

module.exports = {
  SERVICE_NAMES: Object.keys(SERVICES),
  resolveServiceName,
  getService,
};
