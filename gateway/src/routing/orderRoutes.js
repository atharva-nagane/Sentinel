const express = require("express");
const axios = require("axios");
const router = express.Router();

const TARGET_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3002';

router.all("/*", async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${TARGET_URL}${req.url}`,
      headers: {
        'x-request-id': req.headers['x-request-id']
      },
      data: Object.keys(req.body || {}).length > 0 ? req.body : undefined
    });
    res.status(response.status).send(response.data);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).send(error.response.data);
    } else {
      res.status(500).send({ error: 'Order Service unavailable' });
    }
  }
});

module.exports = router;
