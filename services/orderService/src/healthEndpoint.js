// Exposes GET /health, polled by the monitoring layer on an interval.
// Response shape is defined in docs/apiContracts.md (section 1).
// Owner: Ritik Mishra (Member 1)

const express = require("express");
const router = express.Router();

// TODO: implemented by Ritik Mishra
router.get("/health", (req, res) => {
  res.json({ service: "orderService" });
});

module.exports = router;
