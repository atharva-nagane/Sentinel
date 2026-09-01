// Entrypoint for the User Service. Starts the express server and mounts the
// health endpoint monitoring will poll.
// Owner: Ritik Mishra (Member 1)

const express = require("express");
const healthEndpoint = require("./healthEndpoint");

const app = express();

app.use(healthEndpoint);

// TODO: implemented by Ritik Mishra
const PORT = process.env.PORT || 3001;
app.listen(PORT);
