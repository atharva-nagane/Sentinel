const os = require('os');

// In-memory stats for a 60-second rolling window
const WINDOW_MS = 60 * 1000;
let requestLog = [];

function recordRequest(isError, responseTimeMs) {
  const now = Date.now();
  requestLog.push({ timestamp: now, isError, responseTimeMs });
  // Clean up old requests
  requestLog = requestLog.filter(req => now - req.timestamp <= WINDOW_MS);
}

function getHealthMetrics(serviceName) {
  const now = Date.now();
  // Filter active window in case recordRequest hasn't been called recently
  requestLog = requestLog.filter(req => now - req.timestamp <= WINDOW_MS);

  const requestCount = requestLog.length;
  const errorCount = requestLog.filter(req => req.isError).length;
  const errorRate = requestCount === 0 ? 0 : errorCount / requestCount;
  
  const totalResponseTime = requestLog.reduce((acc, req) => acc + req.responseTimeMs, 0);
  const avgResponseTimeMs = requestCount === 0 ? 0 : totalResponseTime / requestCount;

  let status = 'healthy';
  if (errorRate > 0.5) status = 'unhealthy';
  else if (errorRate > 0.2) status = 'degraded';

  const memoryUsage = process.memoryUsage();

  return {
    service: serviceName,
    status: status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    metrics: {
      cpuPercent: getCpuPercent(),
      memoryMb: parseFloat((memoryUsage.rss / (1024 * 1024)).toFixed(2)),
      avgResponseTimeMs: parseFloat(avgResponseTimeMs.toFixed(2)),
      requestCount: requestCount,
      errorRate: parseFloat(errorRate.toFixed(4))
    }
  };
}

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

function getCpuPercent() {
  const currentCpuUsage = process.cpuUsage();
  const currentCpuTime = Date.now();

  const userDiff = currentCpuUsage.user - lastCpuUsage.user;
  const systemDiff = currentCpuUsage.system - lastCpuUsage.system;
  
  const timeDiff = currentCpuTime - lastCpuTime;
  
  // CPU usage is in microseconds, timeDiff is in milliseconds
  let cpuPercent = 0;
  if (timeDiff > 0) {
     cpuPercent = ((userDiff + systemDiff) / 1000) / timeDiff * 100;
  }
  
  lastCpuUsage = currentCpuUsage;
  lastCpuTime = currentCpuTime;
  
  return parseFloat(cpuPercent.toFixed(2));
}

function healthMiddleware(serviceName) {
  return (req, res, next) => {
    if (req.path === '/health') {
      return res.json(getHealthMetrics(serviceName));
    }
    
    const start = Date.now();
    res.on('finish', () => {
      const responseTimeMs = Date.now() - start;
      const isError = res.statusCode >= 500;
      recordRequest(isError, responseTimeMs);
    });
    next();
  };
}

module.exports = { healthMiddleware };
