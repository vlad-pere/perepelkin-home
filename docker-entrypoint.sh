#!/bin/sh
set -e

# Seed идемпотентен: создаёт администратора и группы по умолчанию
# только при их отсутствии, безопасен на каждом старте контейнера.
node apps/server/dist/seed.js

exec node apps/server/dist/index.js
