# ── Stage 1: dependencies ──────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./

RUN npm ci --omit=dev

# ── Stage 2: production image ──────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup -S omnicore && adduser -S omnicore -G omnicore

# Copy installed dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy backend source only
COPY backend/ .

# Remove dev/example files from image
RUN rm -f .env.example

# Set ownership
RUN chown -R omnicore:omnicore /app

USER omnicore

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
