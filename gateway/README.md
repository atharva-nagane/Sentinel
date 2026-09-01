# API Gateway

The single entry point for all client requests into the Sentinel application. It attaches a request ID to incoming requests and routes them to the appropriate backend services.

## Base URLs and Ports
The following are the internal base URLs and ports used by the backend services. Use these to target services from within the Docker network:

- **Gateway**: `http://gateway:3000` (External port: 3000)
- **User Service**: `http://user-service:3001` (External port: 3001)
- **Order Service**: `http://order-service:3002` (External port: 3002)
- **Payment Service**: `http://payment-service:3003` (External port: 3003)

## Health Metrics Contract
All services (including Gateway, User, Order, and Payment) expose a `GET /health` endpoint that returns a standardized JSON structure.

**Error Rate Rolling Window**: The `errorRate` in the health metrics is calculated over a rolling window of the **last 60 seconds**.
