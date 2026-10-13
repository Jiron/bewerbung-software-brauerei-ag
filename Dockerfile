# syntax=docker/dockerfile:1

# ── Build the browser client ─────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime: Node runs the TypeScript server directly, no compile step ──────
FROM node:24-alpine AS runtime
# DATA_DIR keeps the daily spend counter. Mount a volume there, or every
# redeploy refills the keg.
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist/client ./dist/client
COPY src/server ./src/server
COPY src/shared ./src/shared
# Fallback so a bare `docker run` boots into the demo instead of crashing.
COPY knowledge.example ./knowledge.example

RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "src/server/index.ts"]
