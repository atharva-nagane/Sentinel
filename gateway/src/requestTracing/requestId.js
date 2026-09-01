// Express middleware that attaches an x-request-id header to every incoming
// request (generating one if missing) so it can be propagated on downstream calls.
// Owner: Ritik Mishra (Member 1)

// TODO: implemented by Ritik Mishra
function attachRequestId(req, res, next) {
  next();
}

module.exports = attachRequestId;
