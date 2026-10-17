FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=1
COPY . .
# A geração do cliente não conecta ao banco; a URL abaixo só valida a configuração.
RUN DATABASE_URL=postgresql://build:build@localhost/build npm run db:generate \
    && npm run typecheck && npm run build

FROM build AS tools
USER node
CMD ["npm", "run", "db:migrate"]

FROM build AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3333
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json package-lock.json ./
USER node
EXPOSE 3333
CMD ["node", "dist/server.js"]
