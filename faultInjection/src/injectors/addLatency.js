// Adds artificial response latency to a target service to simulate degradation.
// Command shape is defined in docs/apiContracts.md (section 5).
// Lives under faultInjection/ but owned by recovery workstream by team agreement.
// Owner: Atharva Nagane (Member 4)

const { getService } = require("../lib/serviceRegistry");
const { findContainer, execInContainer } = require("../lib/docker");

// The network interface inside the target container to delay traffic on.
// docker-compose's default bridge network gives every container "eth0".
const NETWORK_INTERFACE = process.env.LATENCY_NET_INTERFACE || "eth0";

// Uses tc netem inside the target container to add real network latency -
// the same mechanism chaos-testing tools like Pumba and Toxiproxy use, so the
// delay is visible to monitoring's response-time collector, not just to
// fault injection's own caller. Requires the container to run with the
// NET_ADMIN capability and have iproute2 installed (see src/README.md for the
// one-line change each target service's Dockerfile/compose entry needs).
async function addDelay(containerId, latencyMs) {
  // "replace" instead of "add": if a root netem qdisc is already present
  // (e.g. left behind by a fault-injection process that crashed before its
  // cleanup ran), "add" fails with "RTNETLINK answers: File exists" while
  // "replace" applies cleanly either way.
  await execInContainer(containerId, [
    "tc", "qdisc", "replace", "dev", NETWORK_INTERFACE, "root", "netem", "delay", `${latencyMs}ms`,
  ]);
}

async function removeDelay(containerId) {
  try {
    await execInContainer(containerId, ["tc", "qdisc", "del", "dev", NETWORK_INTERFACE, "root", "netem"]);
  } catch (err) {
    // Already gone (e.g. the container restarted, which clears its network
    // namespace) counts as success - there is nothing left to clean up.
    if (!/no such file|cannot find/i.test(err.message)) throw err;
  }
}

// Resolves once latency is applied, with:
//   { details, done, stop }
//   done  - promise that settles when the latency is removed
//   stop  - ends the fault early by removing the latency now
async function addLatency(targetService, params) {
  const service = getService(targetService);
  const container = await findContainer(service);

  try {
    await addDelay(container, params.latencyMs);
  } catch (err) {
    throw new Error(
      `Could not add latency on ${targetService}: ${err.message}. ` +
        "Does its container have NET_ADMIN and iproute2? See faultInjection/src/README.md."
    );
  }

  let timer = null;
  let finished = false;
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  async function clear() {
    if (finished) return done;
    finished = true;
    clearTimeout(timer);
    try {
      await removeDelay(container);
      resolveDone({ clearedAt: new Date().toISOString() });
    } catch (err) {
      rejectDone(err);
    }
    return done;
  }

  timer = setTimeout(clear, params.durationSeconds * 1000);

  return {
    details: { container, latencyMs: params.latencyMs, interface: NETWORK_INTERFACE },
    done,
    stop: clear,
  };
}

module.exports = addLatency;
