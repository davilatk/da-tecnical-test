# Contexto de build: raíz del monorepo.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web-client ./apps/web-client
RUN pnpm install --frozen-lockfile --filter web-client...
RUN pnpm --filter web-client build

FROM nginx:1.27-alpine AS runtime
COPY apps/web-client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web-client/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
