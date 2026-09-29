FROM node:20-alpine

# iproute2 (tc) is required so faultInjection's addLatency can add network
# delay inside this container. Paired with the NET_ADMIN capability granted
# to this service in docker-compose.yml.
RUN apk add --no-cache iproute2

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY src/ ./src/

EXPOSE 3001

CMD ["npm", "start"]
