const express = require("express");
const attachRequestId = require("./requestTracing/requestId");
const { healthMiddleware } = require("./healthEndpoint");
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

// Mount service routers
app.use("/users", userRoutes);
app.use("/orders", orderRoutes);
app.use("/payments", paymentRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gateway listening on port ${PORT}`);
});
