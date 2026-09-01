// Entrypoint for the Order Service. Starts the express server, mounts the
// health endpoint, and calls the Payment Service to complete an order.
// Owner: Ritik Mishra (Member 1)

const express = require("express");
const healthEndpoint = require("./healthEndpoint");

const app = express();

app.use(healthEndpoint);

// TODO: implemented by Ritik Mishra
const PORT = process.env.PORT || 3002;
app.listen(PORT);
