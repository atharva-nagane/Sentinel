const express = require('express');
const axios = require('axios');
const { healthMiddleware } = require('./healthEndpoint');

function createApp() {
  const app = express();
  app.use(express.json());

  // Add health endpoint monitoring
  app.use(healthMiddleware('orderService'));

  const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3003';

  app.get('/', (req, res) => {
    res.json({ message: 'Order Service Root', requestId: req.headers['x-request-id'] });
  });

  app.get('/test', async (req, res) => {
    const reqId = req.headers['x-request-id'];
    try {
      const paymentRes = await axios.get(`${PAYMENT_SERVICE_URL}/test`, {
        headers: { 'x-request-id': reqId }
      });
      res.json({
        order: 123,
        status: 'created',
        paymentResponse: paymentRes.data,
        requestId: reqId
      });
    } catch (error) {
      console.error("Payment call failed", error.message);
      res.status(500).json({ error: 'Payment call failed', details: error.message });
    }
  });

  return app;
}

if (require.main === module) {
  const PORT = process.env.PORT || 3002;
  createApp().listen(PORT, () => {
    console.log(`Order Service listening on port ${PORT}`);
  });
}

module.exports = { createApp };
