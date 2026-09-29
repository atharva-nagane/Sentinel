const express = require('express');
const db = require('./database/connection');
const { healthMiddleware } = require('./healthEndpoint');

const app = express();
app.use(express.json());

// Add health endpoint monitoring
app.use(healthMiddleware('paymentService'));

app.get('/', (req, res) => {
  res.json({ message: 'Payment Service Root', requestId: req.headers['x-request-id'] });
});

app.get('/test', async (req, res) => {
  const reqId = req.headers['x-request-id'];
  try {
    // A simple query to prove the database connection works
    const result = await db.query('SELECT NOW() as current_time');
    res.json({
      payment: 'processed',
      dbTime: result.rows[0].current_time,
      requestId: reqId
    });
  } catch (error) {
    console.error("DB query failed", error.message);
    res.status(500).json({ error: 'DB query failed', details: error.message });
  }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Payment Service listening on port ${PORT}`);
});
