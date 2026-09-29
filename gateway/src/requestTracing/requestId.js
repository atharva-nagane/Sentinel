const { v4: uuidv4 } = require('uuid');

function attachRequestId(req, res, next) {
  const reqId = req.headers['x-request-id'] || uuidv4();
  req.headers['x-request-id'] = reqId; // ensure it's in the request for downstream routing
  res.setHeader('x-request-id', reqId); // Optionally set on response as well
  next();
}

module.exports = attachRequestId;
