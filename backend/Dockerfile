FROM node:18-bullseye-slim

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend
COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ ./

# Copy frontend
COPY frontend/ ./frontend/

EXPOSE 3001

CMD ["node", "server.js"]
