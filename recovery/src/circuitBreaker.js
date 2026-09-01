// Circuit breaker per service: trips open after repeated failures to stop
// hammering an unhealthy dependency, half-opens to test recovery, closes once
// calls succeed again.
// Owner: Atharva Nagane (Member 4)

// TODO: implemented by Atharva Nagane
class CircuitBreaker {
  constructor(service) {
    this.service = service;
    this.state = "closed";
  }
}

module.exports = CircuitBreaker;
