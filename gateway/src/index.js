const express = require("express");
const attachRequestId = require("./requestTracing/requestId");
const { healthMiddleware } = require("./healthEndpoint");
const { startPolling, blockIfIsolated } = require("./routing/recoveryGuard");
const userRoutes = require("./routing/userRoutes");
const orderRoutes = require("./routing/orderRoutes");
const paymentRoutes = require("./routing/paymentRoutes");

const app = express();

// Parse JSON bodies if present
app.use(express.json());

// Apply health middleware first to track all requests
app.use(healthMiddleware('gateway'));

// Ensure request IDs exist for all incoming requests
app.use(attachRequestId);

// Keeps recoveryGuard's isolated-services cache warm so the checks below
// don't block a request on a live call to recovery.
startPolling();

// Mount service routers, refusing to proxy to anything recovery has isolated
app.use("/users", blockIfIsolated("userService"), userRoutes);
app.use("/orders", blockIfIsolated("orderService"), orderRoutes);
app.use("/payments", blockIfIsolated("paymentService"), paymentRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gateway listening on port ${PORT}`);
});
