# Contexto de build: raíz del monorepo.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/user-service ./apps/user-service
RUN pnpm install --frozen-lockfile --filter user-service...
RUN pnpm --filter @toka/shared build
RUN pnpm --filter user-service build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3002
CMD ["node", "apps/user-service/dist/main.js"]
