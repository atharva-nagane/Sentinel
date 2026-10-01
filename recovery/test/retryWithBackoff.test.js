const test = require("node:test");
const assert = require("node:assert/strict");

const retryWithBackoff = require("../src/retryWithBackoff.js");

test("resolves with the first successful result, no retries needed", async () => {
  let calls = 0;
  const result = await retryWithBackoff(async () => {
    calls += 1;
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("retries on failure and resolves once an attempt succeeds", async () => {
  let calls = 0;
  const result = await retryWithBackoff(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error(`fail ${calls}`);
      return "recovered";
    },
    { retries: 5, baseDelayMs: 1, maxDelayMs: 5 }
  );
  assert.equal(result, "recovered");
  assert.equal(calls, 3);
});

test("rejects with the last error once retries are exhausted", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      retryWithBackoff(
        async () => {
          calls += 1;
          throw new Error(`attempt ${calls}`);
        },
        { retries: 2, baseDelayMs: 1, maxDelayMs: 5 }
      ),
    /attempt 3/
  );
  assert.equal(calls, 3, "retries: 2 means 3 total attempts");
});

test("calls onAttempt with the error on failure and null on success", async () => {
  const attempts = [];
  let calls = 0;
  await retryWithBackoff(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error("first try fails");
      return "ok";
    },
    {
      retries: 3,
      baseDelayMs: 1,
      maxDelayMs: 5,
      onAttempt: (attempt, err) => attempts.push({ attempt, failed: Boolean(err) }),
    }
  );
  assert.deepEqual(attempts, [
    { attempt: 0, failed: true },
    { attempt: 1, failed: false },
  ]);
});

test("does not wait after the final failed attempt", async () => {
  const start = Date.now();
  await assert.rejects(() =>
    retryWithBackoff(async () => { throw new Error("always fails"); }, {
      retries: 0,
      baseDelayMs: 10000,
      maxDelayMs: 10000,
    })
  );
  assert.ok(Date.now() - start < 1000, "a single attempt with no retries left must not sleep");
});
