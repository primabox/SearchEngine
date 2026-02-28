FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/server.js"]
