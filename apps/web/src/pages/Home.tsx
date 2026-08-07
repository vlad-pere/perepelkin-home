import type { ModuleAccess } from '@perepelkin-home/core';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Topbar } from '../components/Topbar';

export function HomePage() {
  const { me } = useAuth();
  const user = me?.user;
  const groups = me?.groups ?? [];
  const modules = me?.modules ?? [];
  const username = user?.username ?? '';

  return (
    <div className="shell">
      <Topbar>
        {user?.isAdmin && (
          <Link className="btn-ghost" to="/admin">
            Управление
          </Link>
        )}
      </Topbar>

      <main className="home">
        <h1 className="home-title">Привет, {username}.</h1>

        {modules.length > 0 ? (
          <>
            <p className="home-sub">
              {modules.length} {plural(modules.length, 'модуль', 'модуля', 'модулей')} тебе доступно.
            </p>
            <ul className="module-list">
              {modules.map((m) => (
                <ModuleRow key={m.id} module={m} />
              ))}
            </ul>
          </>
        ) : (
          <div className="empty">
            <p className="empty-title">Пока пусто</p>
            <p className="empty-text">
              Когда администратор откроет модули для твоих групп, они появятся здесь.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function ModuleRow({ module }: { module: ModuleAccess }) {
  const to = module.route;
  const body = (
    <>
      <div>
        <h2 className="module-name">{module.name}</h2>
        {module.description && <p className="module-desc">{module.description}</p>}
      </div>
      <span className="module-access">{module.canWrite ? 'полный доступ' : 'чтение'}</span>
    </>
  );

  return (
    <li className="module-row">
      <Link className="module-row-inner module-row-link" to={to}>
        {body}
      </Link>
    </li>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
