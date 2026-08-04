import type { FastifyInstance } from 'fastify';
import type { Core, UserRow } from '../core.js';
import { toUser } from '../core.js';
import { requireAdmin } from '../hooks.js';
import { badRequest, conflict, isUniqueViolation, notFound } from '../errors.js';
import { descriptionSchema, nameSchema, passwordSchema, usernameSchema } from '../schemas.js';

const createUserSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['username', 'password'],
  properties: {
    username: usernameSchema,
    password: passwordSchema,
  },
};

const patchUserSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    password: passwordSchema,
    isAdmin: { type: 'boolean' },
  },
};

const createGroupSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: nameSchema,
    description: descriptionSchema,
  },
};

const patchGroupSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: nameSchema,
    description: descriptionSchema,
  },
};

const addMemberSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['user_id'],
  properties: {
    user_id: { type: 'integer', minimum: 1 },
  },
};

const setGrantSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['group_id', 'can_read', 'can_write'],
  properties: {
    group_id: { type: 'integer', minimum: 1 },
    can_read: { type: 'boolean' },
    can_write: { type: 'boolean' },
  },
};

const paramsId = { type: 'object', additionalProperties: false, properties: { id: { type: 'integer', minimum: 1 } } };

export function registerAdminRoutes(app: FastifyInstance, core: Core): void {
  const admin = { preHandler: requireAdmin };

  // ---- users ----

  app.get('/api/admin/users', admin, async () => ({ users: core.users.list() }));

  app.post('/api/admin/users', { ...admin, schema: { body: createUserSchema } }, async (req, reply) => {
    const { username, password } = req.body as { username: string; password: string };
    try {
      const user = await core.users.create({ username, password });
      return reply.code(201).send({ user: toUser(user) });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('Пользователь с таким именем уже существует');
      throw err;
    }
  });

  app.patch('/api/admin/users/:id', { ...admin, schema: { body: patchUserSchema, params: paramsId } }, async (req, reply) => {
    const id = (req.params as { id: number }).id;
    const body = req.body as { password?: string; isAdmin?: boolean };

    if (body.password === undefined && body.isAdmin === undefined) {
      throw badRequest('Нет полей для изменения');
    }
    const existing = core.users.getById(id);
    if (!existing) throw notFound('Пользователь не найден');

    if (body.password !== undefined) {
      if (req.user?.id === id) throw badRequest('Нельзя менять собственный пароль через админ-API');
      await core.users.resetPassword(id, body.password);
    }
    if (body.isAdmin !== undefined) {
      if (req.user?.id === id && !body.isAdmin) throw badRequest('Нельзя снять с себя права администратора');
      core.users.setAdmin(id, body.isAdmin);
    }
    return reply.send({ user: toUser(core.users.getById(id) as UserRow) });
  });

  app.delete('/api/admin/users/:id', { ...admin, schema: { params: paramsId } }, async (req, reply) => {
    const id = (req.params as { id: number }).id;
    if (req.user?.id === id) throw badRequest('Нельзя удалить собственный аккаунт');
    const existing = core.users.getById(id);
    if (!existing) throw notFound('Пользователь не найден');
    core.users.delete(id);
    return reply.code(204).send();
  });

  // ---- groups ----

  app.get('/api/admin/groups', admin, async () => ({ groups: core.groups.list() }));

  app.post('/api/admin/groups', { ...admin, schema: { body: createGroupSchema } }, async (req, reply) => {
    const { name, description } = req.body as { name: string; description?: string };
    try {
      const group = core.groups.create({ name, description });
      return reply.code(201).send({ group });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('Группа с таким именем уже существует');
      throw err;
    }
  });

  app.patch('/api/admin/groups/:id', { ...admin, schema: { body: patchGroupSchema, params: paramsId } }, async (req, reply) => {
    const id = (req.params as { id: number }).id;
    const body = req.body as { name?: string; description?: string };
    if (body.name === undefined && body.description === undefined) {
      throw badRequest('Нет полей для изменения');
    }
    if (body.name !== undefined && body.name.trim() === '') throw badRequest('Название не может быть пустым');
    const existing = core.groups.getById(id);
    if (!existing) throw notFound('Группа не найдена');
    try {
      core.groups.update(id, body);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('Группа с таким именем уже существует');
      throw err;
    }
    return reply.send({ group: core.groups.getById(id) });
  });

  app.delete('/api/admin/groups/:id', { ...admin, schema: { params: paramsId } }, async (req, reply) => {
    const id = (req.params as { id: number }).id;
    const existing = core.groups.getById(id);
    if (!existing) throw notFound('Группа не найдена');
    core.groups.delete(id);
    return reply.code(204).send();
  });

  app.post('/api/admin/groups/:id/members', { ...admin, schema: { body: addMemberSchema, params: paramsId } }, async (req, reply) => {
    const groupId = (req.params as { id: number }).id;
    const { user_id } = req.body as { user_id: number };
    if (!core.groups.getById(groupId)) throw notFound('Группа не найдена');
    if (!core.users.getById(user_id)) throw notFound('Пользователь не найден');
    core.groups.addMember(groupId, user_id);
    return reply.code(204).send();
  });

  app.delete('/api/admin/groups/:id/members/:userId', { ...admin, schema: { params: { type: 'object', additionalProperties: false, properties: { id: { type: 'integer', minimum: 1 }, userId: { type: 'integer', minimum: 1 } } } } }, async (req, reply) => {
    const groupId = (req.params as { id: number }).id;
    const userId = (req.params as { userId: number }).userId;
    core.groups.removeMember(groupId, userId);
    return reply.code(204).send();
  });

  // ---- modules / grants ----

  app.get('/api/admin/modules', admin, async () => ({
    modules: core.listModules().map((m) => ({
      ...m,
      grants: core.grants.byModule(m.id).map((g) => ({ groupId: g.groupId, ...g.grant })),
    })),
  }));

  app.put('/api/admin/modules/:moduleId/grants', { ...admin, schema: { body: setGrantSchema } }, async (req, reply) => {
    const moduleId = (req.params as { moduleId: string }).moduleId;
    const { group_id, can_read, can_write } = req.body as { group_id: number; can_read: boolean; can_write: boolean };
    if (!core.isModuleRegistered(moduleId)) throw notFound('Модуль не найден');
    if (!core.groups.getById(group_id)) throw notFound('Группа не найдена');
    core.grants.set(group_id, moduleId, { canRead: can_read, canWrite: can_write });
    return reply.code(204).send();
  });

  app.delete('/api/admin/modules/:moduleId/grants/:groupId', { ...admin, schema: { params: { type: 'object', additionalProperties: false, properties: { moduleId: { type: 'string' }, groupId: { type: 'integer', minimum: 1 } } } } }, async (req, reply) => {
    const moduleId = (req.params as { moduleId: string }).moduleId;
    const groupId = (req.params as { groupId: number }).groupId;
    core.grants.remove(groupId, moduleId);
    return reply.code(204).send();
  });
}
