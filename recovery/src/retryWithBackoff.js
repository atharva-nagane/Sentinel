// Retries an async function with exponential backoff and full jitter.
// Owner: Atharva Nagane (Member 4)

const DEFAULT_OPTIONS = {
  retries: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
  factor: 2,
  onAttempt: null, // (attemptIndex, error|null) => void, called after every attempt
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Full jitter: a random delay between 0 and the exponential ceiling, which
// spreads out retries from multiple callers instead of them all retrying in
// lockstep.
function backoffDelay(attempt, { baseDelayMs, maxDelayMs, factor }) {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * factor ** attempt);
  return Math.floor(Math.random() * ceiling);
}

// Calls fn(attemptIndex) up to options.retries + 1 times. Resolves with the
// first successful result; rejects with the last error once retries run out.
async function retryWithBackoff(fn, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError;

  for (let attempt = 0; attempt <= opts.retries; attempt += 1) {
    try {
      const result = await fn(attempt);
      if (opts.onAttempt) opts.onAttempt(attempt, null);
      return result;
    } catch (err) {
      lastError = err;
      if (opts.onAttempt) opts.onAttempt(attempt, err);
      if (attempt < opts.retries) {
        await wait(backoffDelay(attempt, opts));
      }
    }
  }

  throw lastError;
}

module.exports = retryWithBackoff;
