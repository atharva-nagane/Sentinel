// Per-service circuit breaker: trips open after repeated failures to stop
// hammering an unhealthy dependency, half-opens after a cooldown to test
// recovery, and closes once trial requests succeed again.
// Owner: Atharva Nagane (Member 4)

const STATES = { CLOSED: "closed", OPEN: "open", HALF_OPEN: "half_open" };

const DEFAULTS = {
  failureThreshold: 3, // consecutive failures (closed state) before opening
  successThreshold: 2, // consecutive half-open successes before closing
  resetTimeoutMs: 15000, // time in open state before a trial request is allowed
};

class CircuitBreaker {
  constructor(service, options = {}) {
    this.service = service;
    this.options = { ...DEFAULTS, ...options };
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = null;
    this.nextAttemptAt = null;
  }

  // Whether a trial/real request should be allowed through right now. NOT a
  // pure check: a true result also moves OPEN -> HALF_OPEN and consumes that
  // trial slot as a side effect. Only call this immediately before actually
  // making the probe/request it gates - calling it just to inspect state
  // (without following through) will desync the breaker from reality.
  allowRequest() {
    if (this.state === STATES.OPEN) {
      if (Date.now() >= this.nextAttemptAt) {
        this.state = STATES.HALF_OPEN;
        this.successCount = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    if (this.state === STATES.HALF_OPEN) {
      this.successCount += 1;
      if (this.successCount >= this.options.successThreshold) {
        this._close();
      }
      return;
    }
    this.failureCount = 0;
  }

  recordFailure() {
    if (this.state === STATES.OPEN) {
      // Already tripped; an in-flight retry failing after the trip shouldn't
      // move any counters.
      return;
    }
    if (this.state === STATES.HALF_OPEN) {
      // A trial request failed - back to open, wait out the cooldown again.
      this._open();
      return;
    }
    this.failureCount += 1;
    if (this.failureCount >= this.options.failureThreshold) {
      this._open();
    }
  }

  _open() {
    this.state = STATES.OPEN;
    this.openedAt = new Date().toISOString();
    this.nextAttemptAt = Date.now() + this.options.resetTimeoutMs;
    this.failureCount = 0;
    this.successCount = 0;
  }

  _close() {
    this.state = STATES.CLOSED;
    this.openedAt = null;
    this.nextAttemptAt = null;
    this.failureCount = 0;
    this.successCount = 0;
  }

  // Closes the breaker directly, for callers that have confirmed the service
  // healthy through means other than the half-open trial flow (e.g. a fresh
  // alert's own retry phase succeeding). recordSuccess() alone won't close
  // an OPEN breaker - it only closes from HALF_OPEN - so this exists to
  // avoid leaving a service isolated after it's already confirmed healthy.
  forceClose() {
    this._close();
  }

  getState() {
    return {
      service: this.service,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      openedAt: this.openedAt,
      nextAttemptAt: this.nextAttemptAt ? new Date(this.nextAttemptAt).toISOString() : null,
    };
  }
}

// One breaker per service, shared across the process.
const breakers = new Map();

function getBreaker(service, options) {
  if (!breakers.has(service)) {
    breakers.set(service, new CircuitBreaker(service, options));
  }
  return breakers.get(service);
}

function listBreakers() {
  return [...breakers.values()].map((b) => b.getState());
}

module.exports = { CircuitBreaker, STATES, getBreaker, listBreakers };
