import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';

export function Topbar({ children }: { children?: ReactNode }) {
  const { me } = useAuth();
  const user = me?.user;

  return (
    <header className="topbar">
      <Link className="topbar-wordmark" to="/">
        Дом Перепелкиных
      </Link>
      <div className="topbar-right">
        {children}
        {user && (
          <Link className="topbar-identity" to="/profile">
            <span className="topbar-user">{user.username}</span>
            {me && me.groups.length > 0 && (
              <span className="topbar-groups">{me.groups.map((g) => g.name).join(' · ')}</span>
            )}
          </Link>
        )}
      </div>
    </header>
  );
}
