# [P3] Оптимизировать CI: кэширование и rsync исключения

## Приоритет: Низкий
## Оценка: 1/10 (~15 минут)
## Файлы: `.github/workflows/deploy.yml`, `.github/workflows/staging.yml`

## Проблема

### 1. rsync копирует ненужные файлы на прод

`deploy.yml` (строки 30-32) исключает `.git`, `.env`, `node_modules`, `.scratch`, `.10x`, `.superpowers`, `.opencode`, но **не исключает**:

- `docs/` — документация, не нужна в контейнере
- `shots2/` — скриншоты
- `update-dns.ps1` — DNS-скрипт
- `AGENTS.md` — файл агента
- `tech_debt/` — наша новая папка

### 2. Нет кэширования в CI

Ни один workflow не кэширует npm dependencies или Docker layers. Каждый билд — с нуля.

## Что сделать

### 1. Добавить excludes в rsync (`deploy.yml`):

```yaml
rsync -avz --delete \
  --exclude '.git' --exclude '.env' --exclude 'node_modules' \
  --exclude '.scratch' --exclude '.10x' --exclude '.superpowers' \
  --exclude '.opencode' --exclude 'docs' --exclude 'shots2' \
  --exclude 'update-dns.ps1' --exclude 'AGENTS.md' --exclude 'tech_debt' \
  . "$RSYNC_PATH"
```

### 2. Добавить Docker layer caching (опционально):

В workflows, если déploiement на self-hosted runner — Docker кэширует layers автоматически. Для GitHub-hosted runners:

```yaml
- uses: docker/build-push-action@v6
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

## Подводные камни

- rsync `--exclude` — glob patterns. `docs` исключит только `docs/` в корне, не `apps/server/docs/` (если бы такие были).
- Docker layer caching на self-hosted runner работает без additional config — образ уже кэширован локально.
- `tech_debt/` — новая папка, добавить в excludes.

## Валидация

- Push в main → deploy workflow → проверить что деплой работает
- Проверить что в контейнере нет `docs/`, `tech_debt/`, `shots2/`
