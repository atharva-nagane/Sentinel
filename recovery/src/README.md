# Recovery internals

States and transitions: TBD by Atharva Nagane, document circuit breaker states
(closed/open/half-open) and their triggering thresholds here once implemented.

Consumes alert events from failure detection (shape in `docs/apiContracts.md`
section 3) and emits recovery events (shape in section 4) for the dashboard to
render as a timeline.
