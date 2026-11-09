import { ChevronRight, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Topbar } from '../components/Topbar';

/**
 * Профиль: имя пользователя, группы и отдельные пункты вроде «Настроек».
 * Настройки меняют тему на весь дом, поэтому доступны только администратору
 * (сам роут /settings дополнительно защищён тем же правилом).
 */
export function ProfilePage() {
  const { me, logout } = useAuth();
  const user = me?.user;
  if (!user) return null;

  return (
    <div className="shell">
      <Topbar breadcrumb={{ label: 'Профиль' }} />

      <main className="profile">
        <h1 className="profile-title">{user.username}</h1>
        {me && me.groups.length > 0 && (
          <p className="profile-sub">{me.groups.map((g) => g.name).join(' · ')}</p>
        )}

        {me.user.isAdmin && (
          <nav className="profile-menu" aria-label="Пункты профиля">
            <Link className="profile-item" to="/settings">
              <span className="profile-item-icon">
                <Settings size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="profile-item-text">
                <span className="profile-item-name">Настройки</span>
                <span className="profile-item-sub">
                  Оформление дома: палитры, шрифты, скругления
                </span>
              </span>
              <ChevronRight size={18} strokeWidth={1.8} className="profile-item-chevron" />
            </Link>
          </nav>
        )}

        <button
          className="btn-ghost btn-danger profile-logout"
          type="button"
          onClick={() => void logout()}
        >
          Выйти
        </button>
      </main>
    </div>
  );
}
