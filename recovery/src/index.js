// Entrypoint for recovery. Listens for alert events from failure detection and
// dispatches the matching recovery action.
// Owner: Atharva Nagane (Member 4 - Recovery Mechanisms)

const retryWithBackoff = require("./retryWithBackoff");
const circuitBreaker = require("./circuitBreaker");
const trafficRerouter = require("./trafficRerouter");

// TODO: implemented by Atharva Nagane
