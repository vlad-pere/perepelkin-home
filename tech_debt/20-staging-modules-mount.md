# [P2] Добавить modules/ volume mount в staging compose

## Приоритет: Средний
## Оценка: 1/10 (~5 минут)
## Файл: `docker-compose.staging.yml`

## Проблема

Прод-`docker-compose.yml` монтирует `./modules:/app/modules:ro` — можно добавлять/менять модули без пересборки образа. Staging `docker-compose.staging.yml` **не монтирует** modules — для добавления модуля нужна полная пересборка Docker image.

## Что сделать

Добавить volume mount в staging:

```yaml
# docker-compose.staging.yml, services.app
volumes:
  - staging_data:/app/data
  - ./modules:/app/modules:ro   # ← добавить
```

## Подводные камни

- При монтировании modules как read-only, staging использует те же модули что и локальная разработка. Это **хорошо** — паритет с продом.
- Если staging intentionally не должен использовать локальные модули (чтобы тестировать "чистый" image) — не монтировать, но задокументировать это решение.

## Валидация

- `docker compose -f docker-compose.staging.yml up -d --build`
- Проверить что модули доступны в staging
