import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './ui.css';

export interface ApiClient {
  <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export interface HomeAssistantUiProps {
  moduleId: string;
  api: ApiClient;
  currentUserId: number;
  canWrite: boolean;
}

interface HaEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

interface StatesResponse {
  states: HaEntity[];
  connected: boolean;
  error: string | null;
}

const HVAC_MODES = ['off', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'] as const;

const DOMAIN_LABELS: Record<string, string> = {
  climate: 'Климат',
  light: 'Свет',
  switch: 'Розетки и переключатели',
  cover: 'Шторы и ворота',
  fan: 'Вентиляция',
  media_player: 'Аудио и ТВ',
  humidifier: 'Увлажнители',
  sensor: 'Датчики',
  binary_sensor: 'Датчики (вкл/выкл)',
};

const DOMAIN_ORDER = [
  'climate',
  'light',
  'switch',
  'cover',
  'fan',
  'media_player',
  'humidifier',
  'sensor',
  'binary_sensor',
] as const;

// Корневые сущности HA, которые не являются устройствами и визуально только шумят.
const HIDDEN_DOMAINS = new Set([
  'group', 'zone', 'person', 'sun', 'automation', 'script', 'scene',
  'update', 'persistent_notification', 'calendar', 'weather', 'camera',
]);

const TOGGLE_DOMAINS: ReadonlySet<string> = new Set([
  'light',
  'switch',
  'fan',
  'media_player',
  'humidifier',
]);

export default function HomeAssistantModule({ moduleId, api, canWrite }: HomeAssistantUiProps) {
  const base = `/api/modules/${moduleId}`;
  const [states, setStates] = useState<HaEntity[] | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyEntity, setBusyEntity] = useState<string | null>(null);
  const clock = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    try {
      const data = await api<StatesResponse>(`${base}/states`);
      setStates(data.states);
      setConnected(data.connected);
      setError(data.connected || data.error === null ? null : friendlyError(data.error));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить умный дом');
      setConnected(false);
    }
  }, [api, base]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  const grouped = useMemo(() => {
    const groups: Array<{ domain: string; label: string; items: HaEntity[] }> = [];
    const extras: HaEntity[] = [];
    const idx = new Map<string, number>();
    for (const domain of DOMAIN_ORDER) {
      idx.set(domain, groups.length);
      groups.push({ domain, label: DOMAIN_LABELS[domain]!, items: [] });
    }
    for (const s of states ?? []) {
      const domain = s.entity_id.split('.')[0]!;
      const at = idx.get(domain);
      if (at !== undefined) {
        groups[at]!.items.push(s);
      } else if (!HIDDEN_DOMAINS.has(domain) && !domain.startsWith('_')) {
        extras.push(s);
      }
    }
    const visible = groups.filter((g) => g.items.length > 0);
    if (extras.length > 0) visible.push({ domain: '_other', label: 'Другое', items: extras });
    return visible;
  }, [states]);

  const run = async (entityId: string, service: string, data?: Record<string, unknown>): Promise<void> => {
    if (busyEntity !== null) return;
    setBusyEntity(entityId);
    setNotice(null);
    try {
      await api(`${base}/call`, { method: 'POST', body: { entity_id: entityId, service, data } });
      setNotice('Готово.');
      window.setTimeout(() => setNotice(null), 3000);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Не удалось выполнить действие');
      window.setTimeout(() => setNotice(null), 5000);
    } finally {
      setBusyEntity(null);
    }
  };

  const root = 'ha';
  if (connected === false && states === null && error !== null) {
    return (
      <main className={root}>
        <p className="ha-sub">Умный дом</p>
        <p className="auth-error" role="alert">
          {error}
        </p>
        <button className="btn-ghost ha-retry" type="button" onClick={() => void load()}>
          Обновить
        </button>
      </main>
    );
  }

  return (
    <main className={root}>
      <p className="ha-sub">Устройства Home Assistant — состояние и управление.</p>

      {notice && (
        <p className="ha-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      {connected === false && states !== null && states.length === 0 && (
        <div className="ha-empty">
          <p className="ha-empty-title">Умный дом недоступен</p>
          <p className="ha-empty-text">Проверьте подключение Home Assistant и попробуйте снова.</p>
          <button className="btn-primary ha-empty-btn" type="button" onClick={() => void load()}>
            Обновить
          </button>
        </div>
      )}

      {connected && states?.length === 0 && (
        <div className="ha-empty">
          <p className="ha-empty-title">Устройств пока нет</p>
          <p className="ha-empty-text">В Home Assistant ещё не добавлены устройства.</p>
        </div>
      )}

      {grouped.map((group) => (
        <section className="ha-group" key={group.domain} aria-label={group.label}>
          <h3 className="ha-group-title">{group.label}</h3>
          <ul className="ha-list">
            {group.items.map((entity) => (
              <EntityCard
                key={entity.entity_id}
                entity={entity}
                canWrite={canWrite && group.domain !== 'sensor' && group.domain !== 'binary_sensor' && group.domain !== '_other'}
                busy={busyEntity === entity.entity_id}
                onToggle={() => void run(entity.entity_id, `${group.domain}.toggle`)}
                onCall={(service, data) => void run(entity.entity_id, service, data)}
              />
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

function EntityCard({
  entity,
  canWrite,
  busy,
  onToggle,
  onCall,
}: {
  entity: HaEntity;
  canWrite: boolean;
  busy: boolean;
  onToggle: () => void;
  onCall: (service: string, data?: Record<string, unknown>) => void;
}) {
  const name =
    (entity.attributes.friendly_name as string) || friendlyId(entity.entity_id);
  const domain = entity.entity_id.split('.')[0]!;
  const on = entity.state === 'on' || entity.state === 'open' || entity.state === 'playing';

  if (domain === 'climate') {
    const modes = Array.isArray(entity.attributes.hvac_modes)
      ? (entity.attributes.hvac_modes as string[])
      : [...HVAC_MODES];
    const hvac = String(entity.attributes.hvac_mode ?? entity.state);
    const current = entity.attributes.current_temperature as number | undefined;
    const target = Number(entity.attributes.temperature ?? 0);
    const min = Number(entity.attributes.min_temp ?? 7);
    const max = Number(entity.attributes.max_temp ?? 35);

    return (
      <li className={`ha-row ha-row-climate${on ? ' on' : ''}`}>
        <div className="ha-row-main">
          <span className="ha-status-dot" aria-hidden="true" />
          <span className="ha-row-title">{name}</span>
          {typeof current === 'number' && (
            <span className="ha-row-meta">{current.toFixed(1)}°</span>
          )}
          <span className="ha-meta">цель {target.toFixed(1)}°</span>
        </div>
        {canWrite && (
          <div className="ha-climate-controls" onClick={(e) => e.stopPropagation()}>
            <select
              className="ha-select"
              aria-label="Режим климата"
              disabled={busy}
              value={modes.includes(hvac) ? hvac : ''}
              onChange={(e) => onCall('climate.set_hvac_mode', { hvac_mode: e.target.value })}
            >
              {!modes.includes(hvac) && hvac && <option value={hvac}>{hvac}</option>}
              {modes.map((m) => (
                <option key={m} value={m}>
                  {hvacLabel(m)}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost btn-sm ha-temp-btn"
              type="button"
              disabled={busy || target <= min}
              onClick={() => onCall('climate.set_temperature', { temperature: Number((target - 0.5).toFixed(1)) })}
              aria-label="Уменьшить температуру"
            >
              −
            </button>
            <button
              className="btn-ghost btn-sm ha-temp-btn"
              type="button"
              disabled={busy || target >= max}
              onClick={() => onCall('climate.set_temperature', { temperature: Number((target + 0.5).toFixed(1)) })}
              aria-label="Увеличить температуру"
            >
              +
            </button>
          </div>
        )}
      </li>
    );
  }

  if (domain === 'cover') {
    return (
      <li className={`ha-row${on ? ' on' : ''}`}>
        <div className="ha-row-main">
          <span className="ha-status-dot" aria-hidden="true" />
          <span className="ha-row-title">{name}</span>
          <span className="ha-meta">{entity.state}</span>
        </div>
        {canWrite && (
          <div className="ha-row-actions">
            <button className="btn-ghost btn-sm" type="button" disabled={busy} onClick={() => onCall('cover.open_cover')}>
              Открыть
            </button>
            <button className="btn-ghost btn-sm" type="button" disabled={busy} onClick={() => onCall('cover.close_cover')}>
              Закрыть
            </button>
            <button className="btn-ghost btn-sm" type="button" disabled={busy} onClick={() => onCall('cover.stop_cover')}>
              Стоп
            </button>
          </div>
        )}
      </li>
    );
  }

  if (TOGGLE_DOMAINS.has(domain)) {
    return (
      <li className={`ha-row${on ? ' on' : ''}`}>
        <div className="ha-row-main">
          <span className="ha-status-dot" aria-hidden="true" />
          <span className="ha-row-title">{name}</span>
          <span className="ha-meta">{entity.state}</span>
        </div>
        {canWrite && (
          <button
            className={`ha-toggle${on ? ' on' : ''}`}
            type="button"
            disabled={busy}
            aria-pressed={on}
            onClick={onToggle}
          >
            <span className="ha-toggle-knob" />
          </button>
        )}
      </li>
    );
  }

  // Датчики и прочее — только чтение.
  return (
    <li className="ha-row ha-row-readonly">
      <div className="ha-row-main">
        <span className="ha-status-dot" aria-hidden="true" />
        <span className="ha-row-title">{name}</span>
        <span className="ha-meta">{sensorValue(entity)}</span>
      </div>
    </li>
  );
}

function friendlyId(entityId: string): string {
  return entityId
    .replace(/^[a-z0-9_]+\./, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function hvacLabel(mode: string): string {
  const map: Record<string, string> = {
    off: 'Выкл',
    heat: 'Тепло',
    cool: 'Холод',
    heat_cool: 'Авто',
    auto: 'Авто',
    dry: 'Осушение',
    fan_only: 'Вентиляция',
  };
  return map[mode] ?? mode;
}

function sensorValue(entity: HaEntity): string {
  const unit = (entity.attributes.unit_of_measurement as string) || '';
  return `${entity.state}${unit ? ` ${unit}` : ''}`;
}

function friendlyError(code: string): string {
  const map: Record<string, string> = {
    MODULE_NOT_CONFIGURED: 'Умный дом пока не настроен администратором.',
    HA_UNREACHABLE: 'Не удалось связаться с Home Assistant.',
  };
  return map[code] ?? 'Умный дом недоступен.';
}
