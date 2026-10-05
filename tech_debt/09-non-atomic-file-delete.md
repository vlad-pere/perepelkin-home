# [P2] Сделать удаление файлов атомарным

## Приоритет: Средний
## Оценка: 2/10 (~15 минут)
## Файл: `apps/server/src/modules/files.ts`, строки 121-128

## Проблема

`files.remove()` удаляет **сначала DB-строку**, потом файл из хранилища:

```typescript
// files.ts:121-128
async remove(id: string) {
  const record = this.db.prepare('SELECT * FROM ...').get(id)
  if (!record) return false
  this.db.prepare('DELETE FROM ...').run(id)   // ← DB удалена
  await this.storage.remove(record.storage_key) // ← если тут ошибка — файл-орефакт
  return true
}
```

Если `storage.remove()` выбросит ошибку, DB-строка уже удалена, но файл **останётся в хранилище навсегда** (орефакт).

## Что сделать

Поменять порядок: удалить из хранилища **первым**, затем удалить DB-строку:

```typescript
async remove(id: string) {
  const record = this.db.prepare('SELECT * FROM ...').get(id)
  if (!record) return false
  await this.storage.remove(record.storage_key) // сначала storage
  this.db.prepare('DELETE FROM ...').run(id)     // потом DB
  return true
}
```

При обратном порядке: если DB-DELETE упадёт (крайне маловероятно с SQLite), файл удалён из storage, но DB-строка жива. Это **менее опасно** — орфана-строка удаляем вручную или при следующем cleanup, тогда как орефакт-файл в S3/disk не подлежит автоматическому обнаружению.

## Подводные камни

- `storage.remove()` для DiskStorage — синхронный `fs.unlinkSync`, для S3 — async `DeleteObjectCommand`. Оба могут упасть (нет прав, S3 недоступен).
- Если критично — обернуть в транзакцию: `DELETE FROM ...` в транзакции, `storage.remove()` в try/catch, при ошибке — rollback. Но для ~10 пользователей это overkill.

## Валидация

- `npm test` — тест `files.test.ts` на удаление должен пройти
- Ручная проверка: загрузить файл → удалить → файл исчезает из storage и DB
