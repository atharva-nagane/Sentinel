// Retries a failed call against a service with exponential backoff between
// attempts.
// Owner: Atharva Nagane (Member 4)

// TODO: implemented by Atharva Nagane
async function retryWithBackoff(fn, options) {
  return fn();
}

module.exports = retryWithBackoff;
