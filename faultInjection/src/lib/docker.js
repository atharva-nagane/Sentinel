// Thin wrapper around the docker CLI, used by killService to stop/start the
// container behind a service.
// Owner: Swayum Bansal (Member 5)

const { execFile } = require("child_process");

const DOCKER_BIN = process.env.DOCKER_BIN || "docker";

function docker(args) {
  return new Promise((resolve, reject) => {
    execFile(DOCKER_BIN, args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`docker ${args.join(" ")} failed: ${(stderr || err.message).trim()}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// Finds the container for a service. An explicit <NAME>_CONTAINER env var wins
// (e.g. PAYMENTSERVICE_CONTAINER=sentinel-payment-service-1); otherwise the
// container is looked up by its docker-compose service label.
async function findContainer(service) {
  const override = process.env[`${service.name.toUpperCase()}_CONTAINER`];
  if (override) return override;

  const ids = await docker([
    "ps",
    "-a",
    "--filter",
    `label=com.docker.compose.service=${service.composeService}`,
    "--format",
    "{{.ID}}",
  ]);
  const id = ids.split("\n").filter(Boolean)[0];
  if (!id) {
    throw new Error(
      `No container found for ${service.name} (compose service "${service.composeService}")`
    );
  }
  return id;
}

module.exports = {
  findContainer,
  stopContainer: (id) => docker(["stop", id]),
  startContainer: (id) => docker(["start", id]),
  // Added by Atharva Nagane (Member 4) for addLatency.js, so it doesn't
  // reimplement the same execFile/timeout/stderr handling as docker() above.
  execInContainer: (id, args) => docker(["exec", id, ...args]),
};
