// Серверная часть модуля «Умный дом»: проксирует запросы к Home Assistant.
//
// Модуль без собственной БД: состояние живёт в Home Assistant, а конфиг (адрес и
// токен) читается из окружения сервера (HA_URL, HA_TOKEN) и никогда не
// раскрывается клиенту. Все обращения к HA выполняет сервер, клиент получает
// только отфильтрованные состояния и управляет устройствами через безопасный
// белый список сервисов.

interface AllowedService {
  /** Допустимые ключи в `data` и их тип. */
  data?: Record<string, 'number' | 'string'>;
}

// Белый список управляемых сервисов HA. Ключ — `domain.service`.
// Всё, чего здесь нет, сервер не вызовет — защита от случайного или
// злонамеренного запуска опасных/внешних сервисов Home Assistant.
const ALLOWED_SERVICES: Record<string, AllowedService> = {
  'light.turn_on': { data: { brightness: 'number', brightness_pct: 'number' } },
  'light.turn_off': {},
  'light.toggle': {},
  'switch.turn_on': {},
  'switch.turn_off': {},
  'switch.toggle': {},
  'fan.turn_on': {},
  'fan.turn_off': {},
  'fan.toggle': {},
  'fan.set_percentage': { data: { percentage: 'number' } },
  'climate.set_temperature': { data: { temperature: 'number' } },
  'climate.set_hvac_mode': { data: { hvac_mode: 'string' } },
  'climate.set_fan_mode': { data: { fan_mode: 'string' } },
  'cover.open_cover': {},
  'cover.close_cover': {},
  'cover.stop_cover': {},
  'cover.toggle': {},
  'media_player.toggle': {},
  'media_player.turn_on': {},
  'media_player.turn_off': {},
  'media_player.media_play_pause': {},
  'humidifier.turn_on': {},
  'humidifier.turn_off': {},
  'humidifier.toggle': {},
};

const ENTITY_ID_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;

interface RouteCtx {
  route(spec: { method: string; path: string; action: string }, handler: (req: any, reply: any) => any): void;
}

function haConfig(): { url: string; token: string } {
  const url = process.env.HA_URL?.trim() || '';
  const token = process.env.HA_TOKEN?.trim() || '';
  return { url: url.replace(/\/+$/, ''), token };
}

function isConfigured(): boolean {
  const { url, token } = haConfig();
  return url !== '' && token !== '';
}

async function haFetch(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const { url, token } = haConfig();
  if (url === '' || token === '') {
    throw new Error('CONFIG');
  }
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(5000),
  });
  let body: any = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

/** Отбирает поля `data` по белому списку сервиса и проверяет их типы. */
function pickData(service: AllowedService, raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (service.data === undefined || typeof raw !== 'object' || raw === null) return out;
  for (const [key, type] of Object.entries(service.data)) {
    const value = (raw as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value !== type) continue;
    out[key] = value;
  }
  return out;
}

export default function register(app: any, ctx: RouteCtx): void {
  // Состояния всех сущностей HA (автоматическое обнаружение устройств).
  ctx.route({ method: 'GET', path: '/states', action: 'read' }, async (_req: any, reply: any) => {
    if (!isConfigured()) {
      return { states: [], connected: false, error: 'MODULE_NOT_CONFIGURED' };
    }
    try {
      const { status, body } = await haFetch('/api/states');
      if (status !== 200) {
        return { states: [], connected: false, error: 'HA_UNREACHABLE' };
      }
      const states = Array.isArray(body) ? body : [];
      return { states, connected: true, error: null };
    } catch {
      return { states: [], connected: false, error: 'HA_UNREACHABLE' };
    }
  });

  // Управление устройством: белый список сервисов + валидация entity_id.
  ctx.route({ method: 'POST', path: '/call', action: 'write' }, async (req: any, reply: any) => {
    if (!isConfigured()) {
      return reply.code(503).send({ error: { code: 'MODULE_NOT_CONFIGURED', message: 'Умный дом не настроен' } });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const entityId = typeof body.entity_id === 'string' ? body.entity_id.trim() : '';
    const fullService = typeof body.service === 'string' ? body.service.trim() : '';
    if (!ENTITY_ID_RE.test(entityId)) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Некорректный идентификатор устройства' } });
    }
    const allowed = ALLOWED_SERVICES[fullService];
    if (!allowed) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Такое действие недоступно' } });
    }
    const domain = entityId.slice(0, entityId.indexOf('.'));
    if (fullService.slice(0, fullService.indexOf('.')) !== domain) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Действие не подходит для этого устройства' } });
    }

    const payload = { entity_id: entityId, ...pickData(allowed, body.data) };
    const path = `/api/services/${fullService.replace('.', '/')}`;
    try {
      const { status } = await haFetch(path, { method: 'POST', body: JSON.stringify(payload) });
      if (status !== 200 && status !== 201) {
        return reply.code(502).send({ error: { code: 'HA_ERROR', message: 'Устройство не ответило' } });
      }
      return { ok: true };
    } catch {
      return reply.code(502).send({ error: { code: 'HA_UNREACHABLE', message: 'Не удалось связаться с умным домом' } });
    }
  });

  // Краткий статус для карточки на дашборде.
  ctx.route({ method: 'GET', path: '/summary', action: 'read' }, async (_req: any) => {
    if (!isConfigured()) {
      return { count: 0, status: 'Не настроен' };
    }
    try {
      const { status, body } = await haFetch('/api/states');
      if (status !== 200 || !Array.isArray(body)) {
        return { count: 0, status: 'Умный дом недоступен' };
      }
      const controllable = body.filter((s: any) =>
        ALLOWED_SERVICES[`${String(s.entity_id).split('.')[0]}.toggle`] !== undefined,
      );
      const on = controllable.filter((s: any) => s.state === 'on').length;
      const total = controllable.length;
      if (total === 0) return { count: 0, status: 'Нет устройств' };
      return {
        count: on,
        status: on > 0 ? `${on} из ${total} включено` : 'Всё выключено',
      };
    } catch {
      return { count: 0, status: 'Умный дом недоступен' };
    }
  });
}
