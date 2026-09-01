// Entrypoint for the Payment Service. Starts the express server, mounts the
// health endpoint, and opens the database connection.
// Owner: Ritik Mishra (Member 1)

const express = require("express");
const healthEndpoint = require("./healthEndpoint");
const database = require("./database/connection");

const app = express();

app.use(healthEndpoint);

// TODO: implemented by Ritik Mishra
const PORT = process.env.PORT || 3003;
app.listen(PORT);
