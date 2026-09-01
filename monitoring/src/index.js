// Entrypoint for the monitoring collector. Starts the polling loop against
// every service in TARGET_SERVICES and exposes the collected snapshots.
// Owner: Om Sawakare (Member 2 - System and Service Monitoring)

const cpuCollector = require("./collectors/cpuCollector");
const memoryCollector = require("./collectors/memoryCollector");
const responseTimeCollector = require("./collectors/responseTimeCollector");
const errorRateCollector = require("./collectors/errorRateCollector");
const metricsStore = require("./metricsStore");

// TODO: implemented by Om Sawakare
