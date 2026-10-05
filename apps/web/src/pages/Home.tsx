import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import type { ModuleAccess, ModuleSummary } from '@perepelkin-home/core';
import { Link } from 'react-router-dom';
import {
  ClipboardCheck,
  ShoppingCart,
  BookOpen,
  Gift,
  Truck,
  Wrench,
  Heart,
  Lightbulb,
  Settings,
  Eye,
  EyeOff,
  GripVertical,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth';
import { api } from '../api';
import { Topbar } from '../components/Topbar';

const ICONS: Record<string, LucideIcon> = {
  'clipboard-check': ClipboardCheck,
  'shopping-cart': ShoppingCart,
  'book-open': BookOpen,
  'gift': Gift,
  'truck': Truck,
  'wrench': Wrench,
  'heart': Heart,
  'bulb': Lightbulb,
  'settings': Settings,
};

/**
 * Порядок карточек: сначала сохранённый пользователем, затем модули, которых в
 * нём ещё нет (новые), — в исходном порядке. Так новый модуль не теряется и не
 * перетасовывает уже настроенную главную.
 */
function orderModules(modules: readonly ModuleAccess[], order: readonly string[]): ModuleAccess[] {
  const rest = new Map(modules.map((m) => [m.id, m]));
  const ordered: ModuleAccess[] = [];
  for (const id of order) {
    const found = rest.get(id);
    if (found) {
      ordered.push(found);
      rest.delete(id);
    }
  }
  for (const m of modules) {
    if (rest.has(m.id)) ordered.push(m);
  }
  return ordered;
}

export function HomePage() {
  const { me, refresh } = useAuth();
  const modules = useMemo(() => me?.modules ?? [], [me]);
  const [summaries, setSummaries] = useState<Record<string, ModuleSummary>>({});
  const [loaded, setLoaded] = useState(false);

  // Настройка главной: черновик живёт локально и уходит на сервер целиком («Готово»).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [hiddenDraft, setHiddenDraft] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draggedRef = useRef<string | null>(null);

  useEffect(() => {
    if (modules.length === 0) return;
    let cancelled = false;

    Promise.all(
      modules.map((m) =>
        api<ModuleSummary>(`/api/modules/${m.id}/summary`).catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, ModuleSummary> = {};
      modules.forEach((m, i) => {
        if (results[i]) map[m.id] = results[i]!;
      });
      setSummaries(map);
      setLoaded(true);
    });

    return () => { cancelled = true; };
  }, [modules.map((m) => m.id).join(',')]);

  const ordered = useMemo(
    () => (editing ? orderModules(modules, draft) : modules),
    [editing, modules, draft],
  );
  const hiddenSet = useMemo(
    () =>
      new Set(
        editing ? hiddenDraft : modules.filter((m) => m.hidden).map((m) => m.id),
      ),
    [editing, hiddenDraft, modules],
  );
  const visibleCards = ordered.filter((m) => !hiddenSet.has(m.id));
  const hiddenCards = ordered.filter((m) => hiddenSet.has(m.id));

  const startEditing = (): void => {
    setDraft(modules.map((m) => m.id));
    setHiddenDraft(modules.filter((m) => m.hidden).map((m) => m.id));
    setError(null);
    setEditing(true);
  };

  const stopEditing = (): void => {
    setEditing(false);
    setDraggingId(null);
    draggedRef.current = null;
    setError(null);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/me/home', { method: 'PUT', body: { order: draft, hidden: hiddenDraft } });
      await refresh();
      stopEditing();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить настройки главной');
    } finally {
      setBusy(false);
    }
  };

  /** Быстрый возврат модуля с прежнего места — без входа в режим настройки. */
  const unhide = async (moduleId: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/me/home', {
        method: 'PUT',
        body: {
          order: modules.map((m) => m.id),
          hidden: modules.filter((m) => m.hidden && m.id !== moduleId).map((m) => m.id),
        },
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось вернуть модуль');
    } finally {
      setBusy(false);
    }
  };

  const moveDraft = (moduleId: string, delta: number): void => {
    setDraft((prev) => {
      const from = prev.indexOf(moduleId);
      const to = from + delta;
      if (from === -1 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, moduleId);
      return next;
    });
  };

  const moveDraftTo = (moduleId: string, targetId: string): void => {
    setDraft((prev) => {
      const from = prev.indexOf(moduleId);
      const to = prev.indexOf(targetId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, moduleId);
      return next;
    });
  };

  const toggleHiddenDraft = (moduleId: string): void => {
    setHiddenDraft((prev) =>
      prev.includes(moduleId) ? prev.filter((id) => id !== moduleId) : [...prev, moduleId],
    );
  };

  const onDragStart = (event: PointerEvent<HTMLButtonElement>, moduleId: string): void => {
    if (busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedRef.current = moduleId;
    setDraggingId(moduleId);
  };

  const onDragMove = (event: PointerEvent<HTMLButtonElement>): void => {
    const dragged = draggedRef.current;
    if (dragged === null) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-module-card]');
    const targetId = target?.dataset.moduleCard;
    if (targetId !== undefined && targetId !== dragged) moveDraftTo(dragged, targetId);
  };

  const onDragEnd = (event: PointerEvent<HTMLButtonElement>): void => {
    if (draggedRef.current === null) return;
    draggedRef.current = null;
    setDraggingId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, moduleId: string): void => {
    const delta =
      event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    moveDraft(moduleId, delta);
  };

  if (modules.length === 0) {
    return (
      <div className="shell">
        <Topbar />
        <main className="home">
          <div className="empty">
            <p className="empty-title">Пока пусто</p>
            <p className="empty-text">
              Когда администратор откроет модули для твоих групп, они появятся здесь.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <Topbar />

      <main className="home">
        <div className="home-controls">
          {editing ? (
            <>
              <p className="home-controls-hint">
                Перетащите карточки за ручку, чтобы изменить порядок. Глазок скрывает модуль.
              </p>
              <button className="btn-ghost" type="button" onClick={stopEditing} disabled={busy}>
                Отмена
              </button>
              <button className="btn-primary" type="button" onClick={() => void save()} disabled={busy}>
                {busy ? 'Сохраняем…' : 'Готово'}
              </button>
            </>
          ) : (
            <>
              {hiddenCards.length > 0 && (
                <button
                  className="home-link"
                  type="button"
                  aria-expanded={showHidden}
                  onClick={() => setShowHidden((v) => !v)}
                >
                  {showHidden ? 'Скрыть список' : `Скрытые (${hiddenCards.length})`}
                </button>
              )}
              <button className="btn-ghost" type="button" onClick={startEditing}>
                Настроить
              </button>
            </>
          )}
        </div>

        {error !== null && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        {visibleCards.length > 0 ? (
          <ul className={`dashboard${editing ? ' dashboard--editing' : ''}`}>
            {visibleCards.map((m, i) => (
              <DashboardCard
                key={m.id}
                module={m}
                summary={summaries[m.id]}
                loaded={loaded}
                style={editing ? undefined : { animationDelay: `${i * 0.06}s` }}
                edit={
                  editing
                    ? {
                        hidden: false,
                        draggable: true,
                        dragging: draggingId === m.id,
                        busy,
                        onToggleHidden: () => toggleHiddenDraft(m.id),
                        onDragStart: (e) => onDragStart(e, m.id),
                        onDragMove,
                        onDragEnd,
                        onHandleKeyDown: (e) => onHandleKeyDown(e, m.id),
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        ) : (
          <div className="empty">
            <p className="empty-title">Все модули скрыты</p>
            <p className="empty-text">
              Нажмите «Скрытые»: модуль можно открыть сразу или вернуть его на главную.
            </p>
          </div>
        )}

        {editing && hiddenCards.length > 0 && (
          <>
            <p className="home-hidden-hint">Скрытые модули — они не видны на главной</p>
            <ul className="dashboard dashboard--editing">
              {hiddenCards.map((m) => (
                <DashboardCard
                  key={m.id}
                  module={m}
                  summary={summaries[m.id]}
                  loaded={loaded}
                  edit={{
                    hidden: true,
                    draggable: false,
                    dragging: false,
                    busy,
                    onToggleHidden: () => toggleHiddenDraft(m.id),
                    onDragStart: (e) => onDragStart(e, m.id),
                    onDragMove,
                    onDragEnd,
                    onHandleKeyDown: (e) => onHandleKeyDown(e, m.id),
                  }}
                />
              ))}
            </ul>
          </>
        )}

        {!editing && showHidden && hiddenCards.length > 0 && (
          <section className="home-hidden">
            <h2 className="home-hidden-title">Скрытые модули</h2>
            <ul className="home-hidden-list">
              {hiddenCards.map((m) => (
                <li key={m.id} className="home-hidden-row">
                  <Link className="home-hidden-name" to={m.route}>
                    {m.name}
                  </Link>
                  <button
                    className="btn-ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => void unhide(m.id)}
                  >
                    Вернуть
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

interface CardEdit {
  hidden: boolean;
  /** Ручка перетаскивания: у скрытых модулей порядок меняется после возврата. */
  draggable: boolean;
  dragging: boolean;
  busy: boolean;
  onToggleHidden(): void;
  onDragStart(event: PointerEvent<HTMLButtonElement>): void;
  onDragMove(event: PointerEvent<HTMLButtonElement>): void;
  onDragEnd(event: PointerEvent<HTMLButtonElement>): void;
  onHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void;
}

function DashboardCard({
  module: m,
  summary,
  loaded,
  style,
  edit,
}: {
  module: ModuleAccess;
  summary?: ModuleSummary;
  loaded: boolean;
  style?: CSSProperties;
  edit?: CardEdit;
}) {
  const Icon = ICONS[m.icon ?? ''] ?? ClipboardCheck;
  const color = m.color ?? 'var(--accent)';
  const iconBg = m.color ? m.color + '18' : undefined;

  const body = (
    <>
      <div className="dashboard-card-icon" style={{ backgroundColor: iconBg, color }}>
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <h2 className="dashboard-card-name">{m.name}</h2>
      {summary ? (
        <p className="dashboard-card-status">{summary.status}</p>
      ) : loaded ? (
        <p className="dashboard-card-status">—</p>
      ) : (
        <p className="dashboard-card-status dashboard-card-status--loading">&nbsp;</p>
      )}
    </>
  );

  const className = [
    'dashboard-card',
    edit ? 'dashboard-card--editing' : '',
    edit?.hidden ? 'dashboard-card--hidden' : '',
    edit?.dragging ? 'dashboard-card--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={className} style={style} data-module-card={m.id}>
      {edit && (
        <div className="dashboard-card-tools">
          {edit.draggable && (
            <button
              className="dashboard-tool dashboard-tool--drag"
              type="button"
              title="Перетащите, чтобы изменить порядок"
              aria-label={`Переместить «${m.name}»`}
              disabled={edit.busy}
              onPointerDown={edit.onDragStart}
              onPointerMove={edit.onDragMove}
              onPointerUp={edit.onDragEnd}
              onPointerCancel={edit.onDragEnd}
              onKeyDown={edit.onHandleKeyDown}
            >
              <GripVertical size={16} strokeWidth={1.8} />
            </button>
          )}
          <button
            className="dashboard-tool"
            type="button"
            aria-pressed={edit.hidden}
            aria-label={edit.hidden ? `Вернуть «${m.name}» на главную` : `Скрыть «${m.name}»`}
            disabled={edit.busy}
            onClick={edit.onToggleHidden}
          >
            {edit.hidden ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
          </button>
        </div>
      )}
      {edit ? (
        <div className="dashboard-card-link dashboard-card-link--static">{body}</div>
      ) : (
        <Link className="dashboard-card-link" to={m.route}>
          {body}
        </Link>
      )}
    </li>
  );
}
