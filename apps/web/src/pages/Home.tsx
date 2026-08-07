import type { ModuleAccess } from '@perepelkin-home/core';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Topbar } from '../components/Topbar';

export function HomePage() {
  const { me } = useAuth();
  const modules = me?.modules ?? [];

  return (
    <div className="shell">
      <Topbar />

      <main className="home">
        {modules.length > 0 ? (
          <>
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
