# ── Build stage ──────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage ────────────────────
FROM node:22-alpine
WORKDIR /app

RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN mkdir -p data uploads uploads/thumbs && chown -R app:app data uploads

USER app
EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
