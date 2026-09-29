FROM node:20-alpine

# killService stops/starts sibling containers through the host's Docker socket.
RUN apk add --no-cache docker-cli

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src/ ./src/

EXPOSE 4004

CMD ["npm", "start"]
