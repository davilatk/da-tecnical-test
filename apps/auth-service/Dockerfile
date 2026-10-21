# Contexto de build: raíz del monorepo.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/auth-service ./apps/auth-service
RUN pnpm install --frozen-lockfile --filter auth-service...
RUN pnpm --filter @toka/shared build
RUN pnpm --filter auth-service build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3001
CMD ["node", "apps/auth-service/dist/main.js"]
