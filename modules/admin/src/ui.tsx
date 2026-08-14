import { useEffect, useState, type FormEvent } from 'react';
import './ui.css';

export interface ApiClient {
  <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export interface AdminGroup {
  id: number;
  name: string;
  description: string;
}

export interface AdminUser {
  id: number;
  username: string;
  isAdmin: boolean;
  authMode: 'pin' | 'password';
  createdAt: string;
  groups: AdminGroup[];
}

interface AdminGroupRow extends AdminGroup {
  memberCount: number;
}

interface AdminGrantRow {
  groupId: number;
  canRead: boolean;
  canWrite: boolean;
}

interface AdminModule {
  id: string;
  name: string;
  description: string;
  grants: AdminGrantRow[];
}

interface AdminPageProps {
  api: ApiClient;
  /** id текущего пользователя: для защиты собственного аккаунта. */
  currentUserId: number;
}

type Tab = 'users' | 'groups' | 'grants';

type AuthMode = 'pin' | 'password';

const AUTH_MODE_LABEL: Record<AuthMode, string> = {
  pin: 'Пинкод',
  password: 'Пароль',
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'users', label: 'Пользователи' },
  { id: 'groups', label: 'Группы' },
  { id: 'grants', label: 'Доступы к модулям' },
];

export function AdminPage({ api, currentUserId }: AdminPageProps) {
  const [tab, setTab] = useState<Tab>('users');
  const [error, setError] = useState<string | null>(null);

  const fail = (err: unknown, fallback: string): void => {
    setError(err instanceof Error ? err.message : fallback);
  };

  const meta: Record<Tab, { title: string; sub: string }> = {
    users: { title: 'Пользователи', sub: 'Аккаунты, пинкоды/пароли и права доступа к дому.' },
    groups: { title: 'Группы', sub: 'Группы людей — им выдаются доступы к модулям.' },
    grants: { title: 'Доступы к модулям', sub: 'Кто из групп что видит и может ли менять.' },
  };

  return (
    <main className="admin">
      <p className="admin-eyebrow">администрирование</p>
      <h1 className="admin-title">{meta[tab].title}</h1>
      <p className="admin-sub">{meta[tab].sub}</p>

      <nav className="admin-tabs" role="tablist" aria-label="Разделы администрирования">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`admin-tab${tab === t.id ? ' active' : ''}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      {tab === 'users' && <UsersPanel api={api} currentUserId={currentUserId} fail={fail} />}
      {tab === 'groups' && <GroupsPanel api={api} fail={fail} />}
      {tab === 'grants' && <GrantsPanel api={api} fail={fail} />}
    </main>
  );
}

interface PanelProps {
  api: ApiClient;
  fail: (err: unknown, fallback: string) => void;
}

function UsersPanel({ api, currentUserId, fail }: PanelProps & { currentUserId: number }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [username, setUsername] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('pin');
  const [secret, setSecret] = useState('');
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [resetMode, setResetMode] = useState<AuthMode>('pin');
  const [resetSecret, setResetSecret] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = async (): Promise<void> => {
    try {
      const data = await api<{ users: AdminUser[] }>('/api/admin/users');
      setUsers(data.users);
    } catch (err) {
      fail(err, 'Не удалось загрузить список пользователей');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onCreate = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (busyId !== null) return;
    setBusyId(-1);
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: { username: username.trim(), password: secret, authMode },
      });
      setUsername('');
      setSecret('');
      setAuthMode('pin');
      setCreating(false);
      await load();
    } catch (err) {
      fail(err, 'Не удалось создать пользователя');
    } finally {
      setBusyId(null);
    }
  };

  const onToggleAdmin = async (user: AdminUser): Promise<void> => {
    if (busyId !== null) return;
    setBusyId(user.id);
    try {
      await api(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: { isAdmin: !user.isAdmin },
      });
      await load();
    } catch (err) {
      fail(err, 'Не удалось изменить права');
    } finally {
      setBusyId(null);
    }
  };

  const onReset = async (user: AdminUser): Promise<void> => {
    if (busyId !== null) return;
    setBusyId(user.id);
    try {
      await api(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: { password: resetSecret, authMode: resetMode },
      });
      setResetFor(null);
      setResetSecret('');
      await load();
    } catch (err) {
      fail(err, 'Не удалось сменить учётные данные');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (user: AdminUser): Promise<void> => {
    if (busyId !== null) return;
    setBusyId(user.id);
    try {
      await api(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      await load();
    } catch (err) {
      fail(err, 'Не удалось удалить пользователя');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="admin-actions">
        <button className="btn-primary" type="button" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Свернуть' : 'Новый пользователь'}
        </button>
      </div>

      {creating && (
        <form className="admin-form" onSubmit={(e) => void onCreate(e)}>
          <div className="admin-form-row">
            <label className="field">
              <span className="field-label">Имя пользователя</span>
              <input
                className="field-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                pattern="\S+"
                title="Без пробелов"
                autoFocus
                required
              />
            </label>
            <CredentialField
              mode={authMode}
              onModeChange={setAuthMode}
              value={secret}
              onChange={setSecret}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={busyId !== null}>
            {busyId === -1 ? 'Создаём…' : 'Создать пользователя'}
          </button>
        </form>
      )}

      {users === null ? (
        <p className="admin-sub">Загружаем…</p>
      ) : (
        <ul className="admin-list">
          {users.map((u) => (
            <li className="admin-row" key={u.id}>
              <div className="admin-row-top">
                <div className="admin-row-main">
                  <div className="admin-row-title">
                    <span className="admin-username">{u.username}</span>
                    {u.isAdmin && <span className="badge badge-admin">администратор</span>}
                    <span className={`badge badge-authmode badge-${u.authMode}`}>
                      {AUTH_MODE_LABEL[u.authMode].toLowerCase()}
                    </span>
                    {u.groups.length > 0 && (
                      <span className="badge badge-groups">{u.groups.map((g) => g.name).join(' · ')}</span>
                    )}
                  </div>
                  <div className="admin-meta">
                    {formatDate(u.createdAt)}
                    {u.id === currentUserId ? ' · это вы' : ''}
                  </div>
                </div>

                {resetFor === u.id ? (
                  <form
                    className="admin-reset"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void onReset(u);
                    }}
                  >
                    <CredentialField
                      mode={resetMode}
                      onModeChange={setResetMode}
                      value={resetSecret}
                      onChange={setResetSecret}
                      autoFocus
                      placeholder="Новый пинкод или пароль"
                    />
                    <button className="btn-ghost" type="submit" disabled={busyId !== null}>
                      Сохранить
                    </button>
                    <button
                      className="btn-ghost"
                      type="button"
                      onClick={() => {
                        setResetFor(null);
                        setResetSecret('');
                      }}
                    >
                      Отмена
                    </button>
                  </form>
                ) : (
                  <div className="admin-row-actions">
                    <button
                      className="btn-ghost"
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => {
                        setResetFor(u.id);
                        setResetMode(u.authMode);
                        setResetSecret('');
                      }}
                    >
                      Пинкод/пароль
                    </button>
                    <button
                      className="btn-ghost"
                      type="button"
                      disabled={busyId !== null || u.id === currentUserId}
                      onClick={() => void onToggleAdmin(u)}
                      title={u.id === currentUserId ? 'Нельзя снять права с собственного аккаунта' : undefined}
                    >
                      {u.isAdmin ? 'Снять админа' : 'Сделать админом'}
                    </button>
                    <button
                      className="btn-ghost btn-danger"
                      type="button"
                      disabled={busyId !== null || u.id === currentUserId}
                      onClick={() => setConfirmDelete(u.id)}
                      title={u.id === currentUserId ? 'Нельзя удалить собственный аккаунт' : undefined}
                    >
                      Удалить
                    </button>
                  </div>
                )}
              </div>

              {confirmDelete === u.id && (
                <div className="admin-confirm">
                  <span>
                    Удалить <strong>{u.username}</strong>? Действие необратимо.
                  </span>
                  <button
                    className="btn-danger-solid"
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void onDelete(u)}
                  >
                    {busyId === u.id ? 'Удаляем…' : 'Удалить'}
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => setConfirmDelete(null)}>
                    Отмена
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function GroupsPanel({ api, fail }: PanelProps) {
  const [groups, setGroups] = useState<AdminGroupRow[] | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addingUserId, setAddingUserId] = useState<number | ''>('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async (): Promise<void> => {
    try {
      const [g, u] = await Promise.all([
        api<{ groups: AdminGroupRow[] }>('/api/admin/groups'),
        api<{ users: AdminUser[] }>('/api/admin/users'),
      ]);
      setGroups(g.groups);
      setUsers(u.users);
    } catch (err) {
      fail(err, 'Не удалось загрузить группы');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onCreate = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (busyId !== null) return;
    setBusyId(-1);
    try {
      await api('/api/admin/groups', {
        method: 'POST',
        body: { name: groupName.trim(), description: groupDesc.trim() || undefined },
      });
      setGroupName('');
      setGroupDesc('');
      setCreating(false);
      await load();
    } catch (err) {
      fail(err, 'Не удалось создать группу');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (group: AdminGroupRow): Promise<void> => {
    if (busyId !== null) return;
    setBusyId(group.id);
    try {
      await api(`/api/admin/groups/${group.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      if (expanded === group.id) setExpanded(null);
      await load();
    } catch (err) {
      fail(err, 'Не удалось удалить группу');
    } finally {
      setBusyId(null);
    }
  };

  const onAddMember = async (group: AdminGroupRow): Promise<void> => {
    if (busyId !== null || addingUserId === '') return;
    setBusyId(group.id);
    try {
      await api(`/api/admin/groups/${group.id}/members`, {
        method: 'POST',
        body: { user_id: addingUserId },
      });
      setAddingUserId('');
      await load();
    } catch (err) {
      fail(err, 'Не удалось добавить участника');
    } finally {
      setBusyId(null);
    }
  };

  const onRemoveMember = async (group: AdminGroupRow, user: AdminUser): Promise<void> => {
    if (busyId !== null) return;
    setBusyId(group.id);
    try {
      await api(`/api/admin/groups/${group.id}/members/${user.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      fail(err, 'Не удалось убрать участника');
    } finally {
      setBusyId(null);
    }
  };

  const membersOf = (group: AdminGroupRow): AdminUser[] =>
    users.filter((u) => u.groups.some((g) => g.id === group.id));

  const candidatesFor = (group: AdminGroupRow): AdminUser[] =>
    users.filter((u) => !u.groups.some((g) => g.id === group.id));

  return (
    <div className="admin-groups">
      <div className="admin-actions">
        <button className="btn-primary" type="button" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Свернуть' : 'Новая группа'}
        </button>
      </div>

      {creating && (
        <form className="admin-form" onSubmit={(e) => void onCreate(e)}>
          <div className="admin-form-row">
            <label className="field">
              <span className="field-label">Название</span>
              <input
                className="field-input"
                name="groupName"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                autoFocus
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Описание</span>
              <input
                className="field-input"
                name="groupDesc"
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
              />
            </label>
          </div>
          <button className="btn-primary" type="submit" disabled={busyId !== null}>
            {busyId === -1 ? 'Создаём…' : 'Создать группу'}
          </button>
        </form>
      )}

      {groups === null ? (
        <p className="admin-sub">Загружаем…</p>
      ) : (
        <ul className="admin-list">
          {groups.map((g) => {
            const members = membersOf(g);
            const candidates = candidatesFor(g);
            const isExpanded = expanded === g.id;
            return (
              <li className="admin-row admin-group-row" key={g.id}>
                <div className="admin-row-top">
                  <div className="admin-row-main">
                    <div className="admin-row-title">
                      <span className="admin-username">{g.name}</span>
                      <span className="badge badge-groups badge-members">{g.memberCount} чел.</span>
                    </div>
                    {g.description && <div className="admin-meta">{g.description}</div>}
                  </div>
                  <div className="admin-row-actions">
                    <button className="btn-ghost" type="button" onClick={() => setExpanded(isExpanded ? null : g.id)}>
                      {isExpanded ? 'Свернуть' : 'Участники'}
                    </button>
                    <button
                      className="btn-ghost btn-danger"
                      type="button"
                      onClick={() => setConfirmDelete(g.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>

                {confirmDelete === g.id && (
                  <div className="admin-confirm">
                    <span>
                      Удалить <strong>{g.name}</strong>? Участники и доступы группы будут отозваны.
                    </span>
                    <button
                      className="btn-danger-solid"
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void onDelete(g)}
                    >
                      {busyId === g.id ? 'Удаляем…' : 'Удалить'}
                    </button>
                    <button className="btn-ghost" type="button" onClick={() => setConfirmDelete(null)}>
                      Отмена
                    </button>
                  </div>
                )}

                {isExpanded && (
                  <div className="admin-members">
                    {members.length === 0 && <p className="admin-meta">В группе пока никого нет.</p>}
                    <ul className="admin-members-list">
                      {members.map((u) => (
                        <li className="admin-member" key={u.id}>
                          <span>{u.username}</span>
                          <button
                            className="btn-ghost btn-danger"
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => void onRemoveMember(g, u)}
                          >
                            Убрать
                          </button>
                        </li>
                      ))}
                    </ul>
                    {candidates.length > 0 && (
                      <div className="admin-member-add">
                        <select
                          className="field-input member-select"
                          value={addingUserId}
                          onChange={(e) =>
                            setAddingUserId(e.target.value === '' ? '' : Number(e.target.value))
                          }
                          aria-label="Кого добавить"
                        >
                          <option value="">Кого добавить?</option>
                          {candidates.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.username}
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn-ghost"
                          type="button"
                          disabled={busyId !== null || addingUserId === ''}
                          onClick={() => void onAddMember(g)}
                        >
                          Добавить
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GrantsPanel({ api, fail }: PanelProps) {
  const [modules, setModules] = useState<AdminModule[] | null>(null);
  const [groups, setGroups] = useState<AdminGroupRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    try {
      const [m, g] = await Promise.all([
        api<{ modules: AdminModule[] }>('/api/admin/modules'),
        api<{ groups: AdminGroupRow[] }>('/api/admin/groups'),
      ]);
      setModules(m.modules);
      setGroups(g.groups);
    } catch (err) {
      fail(err, 'Не удалось загрузить доступы');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const grantOf = (mod: AdminModule, groupId: number): AdminGrantRow | undefined =>
    mod.grants.find((x) => x.groupId === groupId);

  const onToggle = async (mod: AdminModule, group: AdminGroupRow, canRead: boolean, canWrite: boolean): Promise<void> => {
    const key = `${mod.id}:${group.id}`;
    if (busyKey !== null) return;
    setBusyKey(key);
    try {
      if (!canRead && !canWrite) {
        await api(`/api/admin/modules/${mod.id}/grants/${group.id}`, { method: 'DELETE' });
      } else {
        await api(`/api/admin/modules/${mod.id}/grants`, {
          method: 'PUT',
          body: { group_id: group.id, can_read: canRead, can_write: canWrite },
        });
      }
      await load();
    } catch (err) {
      fail(err, 'Не удалось изменить доступ');
    } finally {
      setBusyKey(null);
    }
  };

  if (modules === null) return <p className="admin-sub">Загружаем…</p>;

  return (
    <div className="admin-grants">
      {modules.length === 0 && <p className="admin-sub">Модулей пока нет.</p>}
      {modules.map((m) => (
        <section className="admin-module" key={m.id}>
          <header className="admin-module-head">
            <div className="admin-module-title">{m.name}</div>
            {m.description && <div className="admin-meta">{m.description}</div>}
          </header>
          <div className="admin-grant-list">
            {groups.map((g) => {
              const grant = grantOf(m, g.id);
              const read = grant?.canRead ?? false;
              const write = grant?.canWrite ?? false;
              const busy = busyKey === `${m.id}:${g.id}`;
              return (
                <div className="grant-row" key={g.id}>
                  <span className="grant-group">{g.name}</span>
                  <span className="grant-chip-group">
                    <button
                      className={`grant-chip${read ? ' on' : ''}`}
                      type="button"
                      aria-pressed={read}
                      disabled={busy}
                      onClick={() => void onToggle(m, g, !read, write)}
                    >
                      Чтение
                    </button>
                    <button
                      className={`grant-chip${write ? ' on' : ''}`}
                      type="button"
                      aria-pressed={write}
                      disabled={busy}
                      onClick={() => void onToggle(m, g, read, !write)}
                    >
                      Запись
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

interface CredentialFieldProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

function CredentialField({ mode, onModeChange, value, onChange, autoFocus, placeholder }: CredentialFieldProps) {
  const isPin = mode === 'pin';
  return (
    <div className="field">
      <div className="cred-mode" role="group" aria-label="Тип входа">
        <button
          type="button"
          className={`cred-mode-btn${isPin ? ' active' : ''}`}
          aria-pressed={isPin}
          onClick={() => onModeChange('pin')}
        >
          Пинкод
        </button>
        <button
          type="button"
          className={`cred-mode-btn${!isPin ? ' active' : ''}`}
          aria-pressed={!isPin}
          onClick={() => onModeChange('password')}
        >
          Пароль
        </button>
      </div>
      <input
        className="field-input"
        type="password"
        inputMode={isPin ? 'numeric' : undefined}
        autoComplete="new-password"
        pattern={isPin ? '[0-9]{6}' : undefined}
        title={isPin ? 'Пинкод — ровно 6 цифр' : 'Не короче 8 символов'}
        minLength={isPin ? undefined : 8}
        maxLength={isPin ? 6 : undefined}
        placeholder={placeholder ?? (isPin ? '6 цифр' : 'не короче 8 символов')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        required
      />
    </div>
  );
}
