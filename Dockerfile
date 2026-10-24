# syntax=docker/dockerfile:1.7
# BE-DVG production image. Targets:
#   runtime (default) – the API, non-root, healthchecked
#   migrate           – one-off job: `prisma migrate deploy` (+ optional seed)
ARG NODE_VERSION=22.22

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
# npm 11 honours the allowScripts allow-list in package.json.
RUN npm install -g npm@11.21.1 && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build

FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts \
  && npm rebuild argon2 sharp

FROM deps AS migrate
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./
# Seed and admin scripts import the generated client (src/generated is not copied).
RUN npx prisma generate
ENV NODE_ENV=production
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=4000
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Exec form: SIGTERM reaches Node directly for graceful shutdown.
CMD ["node", "dist/main.js"]
