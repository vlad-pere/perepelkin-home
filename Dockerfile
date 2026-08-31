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
COPY modules/wife-wishlist/package.json modules/wife-wishlist/package.json
COPY modules/wishlist/package.json modules/wishlist/package.json
COPY modules/diary/package.json modules/diary/package.json
COPY modules/move/package.json modules/move/package.json
COPY modules/shopping/package.json modules/shopping/package.json
COPY modules/homeassistant/package.json modules/homeassistant/package.json
# --ignore-scripts: при первом слое не запускаются lifecycle-скрипты пакетов,
# но better-sqlite3/esbuild берут prebuilds/optionalDependencies,
# node-gyp-сборка не нужна благодаря предсобранным бинарникам.
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
COPY modules/wife-wishlist/package.json modules/wife-wishlist/package.json
COPY modules/wishlist/package.json modules/wishlist/package.json
COPY modules/diary/package.json modules/diary/package.json
COPY modules/move/package.json modules/move/package.json
COPY modules/shopping/package.json modules/shopping/package.json
COPY modules/homeassistant/package.json modules/homeassistant/package.json
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/modules/admin/dist modules/admin/dist
COPY --from=build /app/modules/homeassistant/dist modules/homeassistant/dist
COPY modules/todo/manifest.json modules/todo/manifest.json
COPY modules/wife-wishlist/manifest.json modules/wife-wishlist/manifest.json
COPY modules/wishlist/manifest.json modules/wishlist/manifest.json
COPY modules/diary/manifest.json modules/diary/manifest.json
COPY modules/move/manifest.json modules/move/manifest.json
COPY modules/shopping/manifest.json modules/shopping/manifest.json
COPY modules/homeassistant/manifest.json modules/homeassistant/manifest.json

# Сервер импортирует admin-модуль через workspace-симлинк node_modules.
# Делаем его реальным каталогом, чтобы хост-маунт ./modules не подменил
# импорт на исходники без dist (dist в gitignore).
RUN rm -f node_modules/@perepelkin-home/module-admin \
    && mkdir -p node_modules/@perepelkin-home/module-admin \
    && cp -r modules/admin/. node_modules/@perepelkin-home/module-admin/ \
    && rm -rf modules/admin/src modules/admin/scripts

# То же для homeassistant: сервер импортирует его server-плагин через симлинк,
# а хост-маунт ./modules даёт только манифест без dist.
RUN rm -f node_modules/@perepelkin-home/module-homeassistant \
    && mkdir -p node_modules/@perepelkin-home/module-homeassistant \
    && cp -r modules/homeassistant/. node_modules/@perepelkin-home/module-homeassistant/ \
    && rm -rf modules/homeassistant/src

RUN mkdir -p /app/data && chown -R node:node /app

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
