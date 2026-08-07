import type { ReactNode } from 'react';
import { useAuth } from '../auth';

export function Topbar({ children }: { children?: ReactNode }) {
  const { me, logout } = useAuth();
  const user = me?.user;

  return (
    <header className="topbar">
      <span className="topbar-wordmark">Дом Перепелкиных</span>
      <div className="topbar-right">
        {children}
        {user && <span className="topbar-user">{user.username}</span>}
        {me && me.groups.length > 0 && (
          <span className="topbar-groups">{me.groups.map((g) => g.name).join(' · ')}</span>
        )}
        <button className="btn-ghost" type="button" onClick={() => void logout()}>
          Выйти
        </button>
      </div>
    </header>
  );
}
