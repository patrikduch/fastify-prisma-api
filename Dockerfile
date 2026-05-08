# ---------------------------------------------------------------------------
# Multi-stage build for the Fastify + TS + Prisma backend.
# Final image runs as a non-root user, contains only production dependencies,
# and applies Prisma migrations before starting the server.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=20-alpine

# ---------- 1. deps ---------------------------------------------------------
# Install ALL dependencies (incl. dev) so we can build TS + generate Prisma.
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# OpenSSL is required by Prisma's query engine on alpine.
RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2. build --------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma client and compile TS -> dist/
RUN npx prisma generate
RUN npm run build

# Re-install ONLY production deps into a clean tree (smaller final image).
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Re-generate the Prisma client against the production node_modules so the
# query engine binary is available at runtime.
RUN npx prisma generate

# ---------- 3. runtime ------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8001 \
    HOST=0.0.0.0

RUN apk add --no-cache openssl libc6-compat tini \
    && addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist         ./dist
COPY --from=build --chown=app:app /app/prisma       ./prisma
COPY --from=build --chown=app:app /app/package.json ./package.json

USER app
EXPOSE 8001

# tini → proper PID 1 / signal handling.
ENTRYPOINT ["/sbin/tini", "--"]

# Apply migrations, then start the server. If the DB is unreachable, this
# will fail fast and the container will exit (so the orchestrator can retry).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8001/api/health || exit 1