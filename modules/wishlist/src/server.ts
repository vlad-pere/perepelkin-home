import type Database from 'better-sqlite3';

const GIFT_TABLE = 'module_wishlist_gift';
const RESERVATION_TABLE = 'module_wishlist_reservation';

const PIN_RE = /^\d{6}$/;
const USERNAME_MAX = 64;
const BOOKING_MAX = 30;
const BOOKING_WINDOW_MS = 15 * 60 * 1000;

interface WishlistCtx {
  route(
    spec: {
      method: string;
      path: string;
      action: string;
      public?: boolean;
      config?: Record<string, unknown>;
    },
    handler: (req: any, reply: any) => unknown,
  ): void;
  core: {
    /** Подписка на удаление пользователя. */
    onUserDelete(handler: (userId: number) => void): void;
  };
}

interface GiftValue {
  name: string;
  description: string | null;
  link: string | null;
  category: string | null;
}

export default function register(app: any, ctx: WishlistCtx, db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "${RESERVATION_TABLE}" (
      gift_id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      guest_name TEXT,
      reserved_at TEXT NOT NULL
    )
  `);
  try {
    db.exec(`ALTER TABLE "${RESERVATION_TABLE}" ADD COLUMN guest_name TEXT`);
  } catch {
    /* колонка уже есть на свежих таблицах */
  }

  const listStmt = db.prepare(
    `SELECT g.*, r.user_id AS reserved_by, r.guest_name, r.reserved_at
     FROM "${GIFT_TABLE}" g
     LEFT JOIN "${RESERVATION_TABLE}" r ON r.gift_id = g.id
     ORDER BY g.category IS NULL, g.category ASC, g.id ASC`,
  );
  const getStmt = db.prepare(
    `SELECT g.*, r.user_id AS reserved_by, r.guest_name, r.reserved_at
     FROM "${GIFT_TABLE}" g
     LEFT JOIN "${RESERVATION_TABLE}" r ON r.gift_id = g.id
     WHERE g.id = ?`,
  );
  const getGift = db.prepare(`SELECT * FROM "${GIFT_TABLE}" WHERE id = ?`);
  const countStmt = db.prepare(`SELECT COUNT(*) AS n FROM "${GIFT_TABLE}"`);
  const insertGift = db.prepare(
    `INSERT INTO "${GIFT_TABLE}" (name, description, link, category, created_by)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const updateGift = db.prepare(
    `UPDATE "${GIFT_TABLE}" SET name = ?, description = ?, link = ?, category = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  );
  const deleteGift = db.prepare(`DELETE FROM "${GIFT_TABLE}" WHERE id = ?`);
  const deleteReservation = db.prepare(`DELETE FROM "${RESERVATION_TABLE}" WHERE gift_id = ?`);
  const deleteReservationsForUser = db.prepare(
    `DELETE FROM "${RESERVATION_TABLE}" WHERE user_id = ? AND guest_name IS NULL`,
  );
  const getReservation = db.prepare(
    `SELECT gift_id, user_id FROM "${RESERVATION_TABLE}" WHERE gift_id = ?`,
  );
  const placeReservation = db.prepare(
    `INSERT INTO "${RESERVATION_TABLE}" (gift_id, user_id, guest_name, reserved_at)
     SELECT ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE NOT EXISTS (SELECT 1 FROM "${RESERVATION_TABLE}" WHERE gift_id = ?)`,
  );

  function toItem(core: any, row: Record<string, unknown>): Record<string, unknown> {
    const reservedBy = row.reserved_by == null ? null : Number(row.reserved_by);
    const createdBy = row.created_by == null ? null : Number(row.created_by);
    const guestName = row.guest_name == null ? null : String(row.guest_name);
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      link: row.link ?? null,
      category: row.category ?? null,
      created_by: createdBy,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
      created_by_username: createdBy === null ? null : (core.users.getById(createdBy)?.username ?? null),
      reserved_by: reservedBy,
      reserved_at: row.reserved_at ?? null,
      reserved_by_name:
        guestName ?? (reservedBy === null ? null : (core.users.getById(reservedBy)?.username ?? null)),
      assigned: guestName !== null,
    };
  }

  /** Публичный сериализатор: без внутренних id платформы и логинов членов семьи. */
  function toPublicItem(core: any, row: Record<string, unknown>): Record<string, unknown> {
    const reservedBy = row.reserved_by == null ? null : Number(row.reserved_by);
    const guestName = row.guest_name == null ? null : String(row.guest_name);
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      link: row.link ?? null,
      category: row.category ?? null,
      reserved_by_name:
        guestName ?? (reservedBy === null ? null : (core.users.getById(reservedBy)?.username ?? null)),
      assigned: guestName !== null,
    };
  }

  function parseId(raw: unknown): number {
    const str = String(raw);
    if (!/^\d{1,9}$/.test(str)) return 0;
    const id = Number.parseInt(str, 10);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
  }

  function badRequest(reply: any, message: string): unknown {
    return reply.code(400).send({ error: { code: 'BAD_REQUEST', message } });
  }

  /**
   * Нормализует и валидирует поля подарка.
   * `existing === null` — создание (все поля из `record`), иначе — обновление
   * (непереданные поля берутся из существующей записи).
   */
  function parseGift(
    record: Record<string, unknown>,
    existing: Record<string, unknown> | null,
  ): { error: string } | GiftValue {
    for (const key of Object.keys(record)) {
      if (!['name', 'description', 'link', 'category'].includes(key)) {
        return { error: `Unknown field "${key}"` };
      }
    }
    if (existing !== null && Object.keys(record).length === 0) {
      return { error: 'No fields to update' };
    }
    const name =
      record.name !== undefined
        ? typeof record.name === 'string'
          ? record.name.trim()
          : ''
        : (existing?.name as string);
    if (name === '') return { error: 'field "name" must not be empty' };
    const description = normalizeOptional('description');
    const link = normalizeOptional('link');
    if (link !== null && link !== '') {
      let parsed: URL;
      try {
        parsed = new URL(link);
      } catch {
        return { error: 'field "link" must be a valid URL' };
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { error: 'field "link" must be an http(s) URL' };
      }
    }
    const category = normalizeOptional('category');
    return {
      name,
      description: description === '' ? null : description,
      link: link === '' ? null : link,
      category: category === '' ? null : category,
    };

    function normalizeOptional(key: 'description' | 'link' | 'category'): string | null {
      const raw = record[key] !== undefined ? record[key] : (existing?.[key] ?? null);
      if (raw == null) return null;
      return String(raw).trim();
    }
  }

  function credentials(body: unknown): { username: string; pin: string } | null {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    const record = body as Record<string, unknown>;
    const username = typeof record.username === 'string' ? record.username.trim() : '';
    const pin = typeof record.pin === 'string' ? record.pin.trim() : '';
    if (username.length === 0 || username.length > USERNAME_MAX) return null;
    if (/\s/.test(username)) return null;
    if (!PIN_RE.test(pin)) return null;
    return { username, pin };
  }

  /** Имя гостя для админского назначения: только поле `name`, 1–64 символа без управляющих. */
  function parseGuestName(body: unknown): string | null {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    const record = body as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key !== 'name') return null;
    }
    const raw = typeof record.name === 'string' ? record.name : '';
    const name = raw.trim();
    if (name === '' || name.length > 64) return null;
    if (/[\u0000-\u001F]/.test(name)) return null;
    return name;
  }

  ctx.core.onUserDelete((userId) => {
    deleteReservationsForUser.run(userId);
  });

  // Общий бюджет book/unbook: окно 15 минут на IP, `@fastify/rate-limit`
  // с `groupId` общий счётчик между роутами не создаёт (у каждого роута свой store).
  const bookingHits = new Map<string, number[]>();

  function bookingAllowed(req: any, reply: any): boolean {
    const now = Date.now();
    const key = (req.ip ?? '0.0.0.0') + ':wishlist-booking';
    const cutoff = now - BOOKING_WINDOW_MS;
    let hits = bookingHits.get(key);
    if (hits) {
      hits = hits.filter((t) => t > cutoff);
      if (hits.length === 0) {
        bookingHits.delete(key);
        hits = undefined;
      } else {
        bookingHits.set(key, hits);
      }
    }
    if (!hits) hits = [];
    if (hits.length >= BOOKING_MAX) {
      reply.code(429).send({ error: { code: 'RATE_LIMITED', message: 'Слишком много попыток, попробуйте позже' } });
      return false;
    }
    hits.push(now);
    bookingHits.set(key, hits);
    return true;
  }

  // ---- CRUD ----

  ctx.route({ method: 'GET', path: '/gift', action: 'read' }, async (req: any, _reply: any) => {
    const rows = listStmt.all() as Array<Record<string, unknown>>;
    const item = req.user ? toItem : toPublicItem;
    return { items: rows.map((row) => item(req.core, row)) };
  });

  ctx.route({ method: 'POST', path: '/gift', action: 'write' }, async (req: any, reply: any) => {
    if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
      return badRequest(reply, 'Body must be a JSON object');
    }
    const parsed = parseGift(req.body as Record<string, unknown>, null);
    if ('error' in parsed) return badRequest(reply, parsed.error);
    const result = insertGift.run(
      parsed.name,
      parsed.description,
      parsed.link,
      parsed.category,
      req.user?.id ?? null,
    );
    const row = getStmt.get(result.lastInsertRowid) as Record<string, unknown>;
    req.log?.info?.({ module: 'wishlist', entity: 'gift', recordId: result.lastInsertRowid }, 'record created');
    return reply.code(201).send({ item: toItem(req.core, row) });
  });

  ctx.route({ method: 'PATCH', path: '/gift/:rowId', action: 'write' }, async (req: any, reply: any) => {
    const rowId = parseId((req.params as { rowId?: unknown }).rowId);
    if (rowId === 0) return badRequest(reply, 'Invalid row id');
    const existing = getGift.get(rowId) as Record<string, unknown> | undefined;
    if (!existing) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Запись не найдена' } });
    }
    if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
      return badRequest(reply, 'Body must be a JSON object');
    }
    const parsed = parseGift(req.body as Record<string, unknown>, existing);
    if ('error' in parsed) return badRequest(reply, parsed.error);
    updateGift.run(parsed.name, parsed.description, parsed.link, parsed.category, rowId);
    const row = getStmt.get(rowId) as Record<string, unknown>;
    return { item: toItem(req.core, row) };
  });

  ctx.route({ method: 'DELETE', path: '/gift/:rowId', action: 'write' }, async (req: any, reply: any) => {
    const rowId = parseId((req.params as { rowId?: unknown }).rowId);
    if (rowId === 0) return badRequest(reply, 'Invalid row id');
    const result = db.transaction(() => {
      const del = deleteGift.run(rowId);
      if (del.changes > 0) deleteReservation.run(rowId);
      return del;
    })();
    if (result.changes === 0) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Запись не найдена' } });
    }
    return reply.code(204).send();
  });

  // ---- Бронирование (гостевые роуты: аутентификация логином и пинкодом) ----

  ctx.route(
    { method: 'POST', path: '/gift/:rowId/book', action: 'write', public: true },
    async (req: any, reply: any) => {
      if (!bookingAllowed(req, reply)) return;
      const rowId = parseId((req.params as { rowId?: unknown }).rowId);
      if (rowId === 0) return badRequest(reply, 'Invalid row id');
      const gift = getGift.get(rowId);
      if (!gift) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Подарок не найден' } });
      }
      const creds = credentials(req.body);
      if (!creds) return badRequest(reply, 'Введите логин и пинкод (6 цифр)');
      const userId = await req.core.users.verifyPin(creds.username, creds.pin);
      if (userId === null) {
        return reply.code(401).send({
          error: { code: 'INVALID_CREDENTIALS', message: 'Неверный логин или пинкод' },
        });
      }
      const placed = placeReservation.run(rowId, userId, null, rowId);
      if (placed.changes === 0) {
        return reply.code(409).send({
          error: { code: 'ALREADY_BOOKED', message: 'Этот подарок уже кто-то подарит' },
        });
      }
      const row = getStmt.get(rowId) as Record<string, unknown>;
      return { item: toPublicItem(req.core, row) };
    },
  );

  ctx.route(
    { method: 'POST', path: '/gift/:rowId/unbook', action: 'write', public: true },
    async (req: any, reply: any) => {
      if (!bookingAllowed(req, reply)) return;
      const rowId = parseId((req.params as { rowId?: unknown }).rowId);
      if (rowId === 0) return badRequest(reply, 'Invalid row id');
      const gift = getGift.get(rowId);
      if (!gift) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Подарок не найден' } });
      }
      const creds = credentials(req.body);
      if (!creds) return badRequest(reply, 'Введите логин и пинкод (6 цифр)');
      const userId = await req.core.users.verifyPin(creds.username, creds.pin);
      if (userId === null) {
        return reply.code(401).send({
          error: { code: 'INVALID_CREDENTIALS', message: 'Неверный логин или пинкод' },
        });
      }
      const reservation = getReservation.get(rowId) as { user_id: number } | undefined;
      if (!reservation) {
        return reply.code(409).send({
          error: { code: 'NOT_BOOKED', message: 'Подарок никто не выбрал, убирать нечего' },
        });
      }
      if (Number(reservation.user_id) !== userId) {
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Убрать метку может только тот, кто её поставил' },
        });
      }
      deleteReservation.run(rowId);
      const row = getStmt.get(rowId) as Record<string, unknown>;
      return { item: toPublicItem(req.core, row) };
    },
  );

  // ---- Админское назначение (управляемые роуты: сессия + право write) ----

  ctx.route({ method: 'POST', path: '/gift/:rowId/assign', action: 'write' }, async (req: any, reply: any) => {
    const rowId = parseId((req.params as { rowId?: unknown }).rowId);
    if (rowId === 0) return badRequest(reply, 'Invalid row id');
    const gift = getGift.get(rowId);
    if (!gift) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Подарок не найден' } });
    }
    const name = parseGuestName(req.body);
    if (name === null) return badRequest(reply, 'Укажите имя того, кто будет дарить (1–64 символа)');
    const placed = placeReservation.run(rowId, req.user?.id ?? null, name, rowId);
    if (placed.changes === 0) {
      return reply.code(409).send({
        error: { code: 'ALREADY_BOOKED', message: 'Этот подарок уже кто-то подарит' },
      });
    }
    const row = getStmt.get(rowId) as Record<string, unknown>;
    return { item: toItem(req.core, row) };
  });

  ctx.route({ method: 'POST', path: '/gift/:rowId/release', action: 'write' }, async (req: any, reply: any) => {
    const rowId = parseId((req.params as { rowId?: unknown }).rowId);
    if (rowId === 0) return badRequest(reply, 'Invalid row id');
    const gift = getGift.get(rowId);
    if (!gift) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Подарок не найден' } });
    }
    const reservation = getReservation.get(rowId);
    if (!reservation) {
      return reply.code(409).send({
        error: { code: 'NOT_BOOKED', message: 'Подарок никто не выбрал, убирать нечего' },
      });
    }
    deleteReservation.run(rowId);
    const row = getStmt.get(rowId) as Record<string, unknown>;
    return { item: toItem(req.core, row) };
  });

  // ---- Summary (карточка на дашборде) ----

  ctx.route({ method: 'GET', path: '/summary', action: 'read' }, async (_req: any, _reply: any) => {
    const { n } = countStmt.get() as { n: number };
    const count = Number(n);
    const status = count === 0 ? 'Пока ничего' : `${count} ${pluralRu(count, 'идея', 'идеи', 'идей')}`;
    return { count, status };
  });
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}