# Contexto de build: raíz del monorepo.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/audit-service ./apps/audit-service
RUN pnpm install --frozen-lockfile --filter audit-service...
RUN pnpm --filter @toka/shared build
RUN pnpm --filter audit-service build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3003
CMD ["node", "apps/audit-service/dist/main.js"]
