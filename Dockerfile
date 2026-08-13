# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY modules/admin/package.json modules/admin/package.json
COPY modules/todo/package.json modules/todo/package.json
# --ignore-scripts: в дереве нет пакетов с нужными lifecycle-скриптами,
# а better-sqlite3/esbuild используют prebuilds/optionalDependencies,
# node-gyp-сборка в образе не требуется.
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY modules/admin/package.json modules/admin/package.json
COPY modules/todo/package.json modules/todo/package.json
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/modules/admin/dist modules/admin/dist
COPY modules/todo/manifest.json modules/todo/manifest.json

# Сервер импортирует admin-модуль через workspace-симлинк node_modules.
# Делаем его реальным каталогом, чтобы хост-маунт ./modules не подменил
# импорт на исходники без dist (dist в gitignore).
RUN rm -f node_modules/@perepelkin-home/module-admin \
    && mkdir -p node_modules/@perepelkin-home/module-admin \
    && cp -r modules/admin/. node_modules/@perepelkin-home/module-admin/ \
    && rm -rf modules/admin/src modules/admin/scripts

RUN mkdir -p /app/data && chown -R node:node /app

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
