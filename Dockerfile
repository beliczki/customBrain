FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --production
COPY server/ ./server/
COPY scripts/ ./scripts/
CMD ["node", "server/index.js"]
