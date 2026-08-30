import type Database from 'better-sqlite3';

const TASK_TABLE = 'module_maintenance_task';
const COMPLETION_TABLE = 'module_maintenance_completion';

interface RouteCtx {
  route(spec: { method: string; path: string; action: string }, handler: (req: any, reply: any) => any): void;
}

export default function register(app: any, ctx: RouteCtx, db: Database.Database): void {
  const listStmt = db.prepare(
    `SELECT * FROM "${TASK_TABLE}" ORDER BY CASE WHEN "next_due" = '' THEN 1 ELSE 0 END, "next_due" ASC`,
  );
  const getTask = db.prepare(`SELECT * FROM "${TASK_TABLE}" WHERE id = ?`);
  const deleteTask = db.prepare(`DELETE FROM "${TASK_TABLE}" WHERE id = ?`);
  const insertCompletion = db.prepare(
    `INSERT INTO "${COMPLETION_TABLE}" ("task_id", "completed_at", "notes", "amount", created_by)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const getCompletions = db.prepare(
    `SELECT * FROM "${COMPLETION_TABLE}" WHERE "task_id" = ? ORDER BY "completed_at" DESC`,
  );
  const countByTask = db.prepare(
    `SELECT COUNT(*) AS "count", MAX("completed_at") AS "last_completed"
     FROM "${COMPLETION_TABLE}" WHERE "task_id" = ?`,
  );

  function enrichTask(row: Record<string, unknown>): Record<string, unknown> {
    const stats = countByTask.get(row.id) as
      | { count: number; last_completed: string }
      | undefined;
    return {
      ...row,
      completion_count: stats?.count ?? 0,
      last_completed: stats?.last_completed ?? null,
    };
  }

  // --- Task CRUD ---

  ctx.route({ method: 'GET', path: '/task', action: 'read' }, async (_req: any, reply: any) => {
    const rows = listStmt.all() as Array<Record<string, unknown>>;
    return { items: rows.map(enrichTask) };
  });

  ctx.route({ method: 'POST', path: '/task', action: 'write' }, async (req: any, reply: any) => {
    const body = req.body as Record<string, unknown>;
    const title = String(body.title ?? '').trim();
    if (!title) return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Введите название' } });
    const category = Number(body.category);
    if (!Number.isFinite(category)) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Укажите категорию' } });
    }
    const description = body.description != null ? String(body.description).trim() : null;
    const intervalMonths = body.interval_months != null ? Number(body.interval_months) : null;
    const nextDue = body.next_due != null ? String(body.next_due).trim() : null;
    const notes = body.notes != null ? String(body.notes).trim() : null;

    const result = db
      .prepare(
        `INSERT INTO "${TASK_TABLE}" ("title", "description", "category", "interval_months", "next_due", "notes", created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(title, description, category, intervalMonths, nextDue, notes, req.user?.id ?? null);
    const row = getTask.get(result.lastInsertRowid) as Record<string, unknown>;
    return reply.code(201).send({ item: enrichTask(row) });
  });

  ctx.route({ method: 'PATCH', path: '/task/:rowId', action: 'write' }, async (req: any, reply: any) => {
    const id = Number.parseInt(String((req.params as { rowId?: string }).rowId), 10);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Некорректный ID' } });
    }
    const existing = getTask.get(id);
    if (!existing) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Задача не найдена' } });
    }
    const body = req.body as Record<string, unknown>;
    const allowed = ['title', 'description', 'category', 'interval_months', 'next_due', 'notes'];
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      const val = body[key];
      if (key === 'title') {
        const v = String(val ?? '').trim();
        if (!v) {
          return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Введите название' } });
        }
        sets.push(`"${key}" = ?`);
        values.push(v);
      } else if (key === 'category') {
        const v = Number(val);
        if (!Number.isFinite(v)) {
          return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Укажите категорию' } });
        }
        sets.push(`"${key}" = ?`);
        values.push(v);
      } else if (key === 'interval_months') {
        sets.push(`"${key}" = ?`);
        values.push(val != null ? Number(val) : null);
      } else {
        sets.push(`"${key}" = ?`);
        values.push(val != null ? String(val).trim() : null);
      }
    }
    if (sets.length === 0) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Нет полей для обновления' } });
    }
    db.prepare(
      `UPDATE "${TASK_TABLE}" SET ${sets.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    ).run(...values, id);
    const row = getTask.get(id) as Record<string, unknown>;
    return { item: enrichTask(row) };
  });

  ctx.route({ method: 'DELETE', path: '/task/:rowId', action: 'write' }, async (req: any, reply: any) => {
    const id = Number.parseInt(String((req.params as { rowId?: string }).rowId), 10);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Некорректный ID' } });
    }
    const result = deleteTask.run(id);
    if (result.changes === 0) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Задача не найдена' } });
    }
    db.prepare(`DELETE FROM "${COMPLETION_TABLE}" WHERE "task_id" = ?`).run(id);
    return reply.code(204).send();
  });

  // --- Complete task ---

  ctx.route(
    { method: 'POST', path: '/task/:rowId/complete', action: 'write' },
    async (req: any, reply: any) => {
      const id = Number.parseInt(String((req.params as { rowId?: string }).rowId), 10);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Некорректный ID' } });
      }
      const task = getTask.get(id) as Record<string, unknown> | undefined;
      if (!task) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Задача не найдена' } });
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const completedAt =
        body.completed_at != null && String(body.completed_at).trim() !== ''
          ? String(body.completed_at).trim()
          : new Date().toISOString().slice(0, 10);
      const notes = body.notes != null ? String(body.notes).trim() : null;
      const amount = body.amount != null ? Number(body.amount) : null;

      // Calculate next due date
      let nextDue: string | null = null;
      if (body.next_due != null && String(body.next_due).trim() !== '') {
        nextDue = String(body.next_due).trim();
      } else if (task.interval_months != null) {
        const base = new Date(`${completedAt}T00:00:00`);
        base.setMonth(base.getMonth() + Number(task.interval_months));
        nextDue = base.toISOString().slice(0, 10);
      }

      db.transaction(() => {
        insertCompletion.run(id, completedAt, notes, amount, req.user?.id ?? null);
        if (nextDue !== null) {
          db.prepare(
            `UPDATE "${TASK_TABLE}" SET "next_due" = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
          ).run(nextDue, id);
        }
      })();

      const updated = getTask.get(id) as Record<string, unknown>;
      return { item: enrichTask(updated) };
    },
  );

  // --- Digest ---

  ctx.route({ method: 'GET', path: '/digest', action: 'read' }, async (_req: any, reply: any) => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = listStmt.all() as Array<Record<string, unknown>>;
    const enriched = rows.map(enrichTask);

    const overdue = enriched.filter(
      (r) => r.next_due != null && String(r.next_due) !== '' && String(r.next_due) < today,
    );
    const upcoming = enriched.filter(
      (r) => r.next_due != null && String(r.next_due) !== '' && String(r.next_due) >= today,
    );
    const noDate = enriched.filter((r) => r.next_due == null || String(r.next_due) === '');

    return { overdue, upcoming, noDate, today };
  });

  // --- History ---

  ctx.route(
    { method: 'GET', path: '/task/:rowId/history', action: 'read' },
    async (req: any, reply: any) => {
      const id = Number.parseInt(String((req.params as { rowId?: string }).rowId), 10);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Некорректный ID' } });
      }
      const task = getTask.get(id) as Record<string, unknown> | undefined;
      if (!task) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Задача не найдена' } });
      }
      const completions = getCompletions.all(id) as Array<Record<string, unknown>>;
      return { task: enrichTask(task), completions };
    },
  );

  // --- Summary (for dashboard card) ---

  ctx.route({ method: 'GET', path: '/summary', action: 'read' }, async (_req: any, reply: any) => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = listStmt.all() as Array<Record<string, unknown>>;
    const overdue = rows.filter(
      (r) => r.next_due != null && String(r.next_due) !== '' && String(r.next_due) < today,
    );
    const count = overdue.length;
    const status =
      count === 0
        ? 'Всё под контролем'
        : `${count} ${count === 1 ? 'задача просрочена' : count < 5 ? 'задачи просрочены' : 'задач просрочены'}`;
    return { count, status };
  });
}
