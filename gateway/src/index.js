// Entrypoint for the API gateway. Starts the express server, applies the
// request ID middleware, and mounts the per-service routers.
// Owner: Ritik Mishra (Member 1 - Distributed Application & Communication)

const express = require("express");
const attachRequestId = require("./requestTracing/requestId");
const userRoutes = require("./routing/userRoutes");
const orderRoutes = require("./routing/orderRoutes");
const paymentRoutes = require("./routing/paymentRoutes");

const app = express();

app.use(attachRequestId);
app.use("/users", userRoutes);
app.use("/orders", orderRoutes);
app.use("/payments", paymentRoutes);

// TODO: implemented by Ritik Mishra
const PORT = process.env.PORT || 3000;
app.listen(PORT);
