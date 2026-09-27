// Stops a target service outright to simulate total unavailability.
// Command shape is defined in docs/apiContracts.md (section 5).
// Owner: Swayum Bansal (Member 5)

const { getService } = require("../lib/serviceRegistry");
const { findContainer, stopContainer, startContainer } = require("../lib/docker");

// Stops the service's container. With params.durationSeconds the container is
// started again automatically after that long; without it the service stays
// down until the returned handle's stop() is called (manual restart).
//
// Resolves once the container is stopped, with:
//   { details, done, stop }
//   done  - promise that settles when the service is back up
//   stop  - ends the fault early by restarting the service now
async function killService(targetService, params = {}) {
  const service = getService(targetService);
  const container = await findContainer(service);
  await stopContainer(container);

  let timer = null;
  let finished = false;
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  async function restart() {
    if (finished) return done;
    finished = true;
    clearTimeout(timer);
    try {
      await startContainer(container);
      resolveDone({ restartedAt: new Date().toISOString() });
    } catch (err) {
      rejectDone(err);
    }
    return done;
  }

  if (params.durationSeconds) {
    timer = setTimeout(restart, params.durationSeconds * 1000);
  }

  return {
    details: { container, autoRestart: Boolean(params.durationSeconds) },
    done,
    stop: restart,
  };
}

module.exports = killService;
