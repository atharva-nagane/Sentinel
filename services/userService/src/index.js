const express = require('express');
const { healthMiddleware } = require('./healthEndpoint');

const app = express();
app.use(express.json());

// Add health endpoint monitoring
app.use(healthMiddleware('userService'));

app.get('/', (req, res) => {
  res.json({ message: 'User Service Root', requestId: req.headers['x-request-id'] });
});

app.get('/test', (req, res) => {
  res.json({ user: 'Alice', id: 1, requestId: req.headers['x-request-id'] });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`User Service listening on port ${PORT}`);
});
