// Entrypoint for failure detection. Reads monitoring snapshots, runs heartbeat,
// timeout, and threshold checks against them, and emits alerts.
// Owner: Om Kottawar (Member 3 - Failure Detection)

const heartbeatCheck = require("./heartbeatCheck");
const timeoutDetector = require("./timeoutDetector");
const thresholdRules = require("./thresholdRules");
const alertEmitter = require("./alertEmitter");

// TODO: implemented by Om Kottawar
