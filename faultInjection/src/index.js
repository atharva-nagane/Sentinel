// Entrypoint for fault injection. Accepts commands (usually from the dashboard)
// and dispatches to the matching injector.
// Owner: Swayum Bansal (Member 5 - Fault Injection & Visualization)

const killService = require("./injectors/killService");
const addLatency = require("./injectors/addLatency");
const overloadService = require("./injectors/overloadService");

// TODO: implemented by Swayum Bansal
