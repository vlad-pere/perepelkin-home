import { useAuth } from '../auth';
import { Topbar } from '../components/Topbar';

export function ProfilePage() {
  const { me, logout } = useAuth();
  const user = me?.user;
  if (!user) return null;

  return (
    <div className="shell">
      <Topbar />

      <main className="profile">
        <h1 className="profile-title">{user.username}</h1>
        {me && me.groups.length > 0 && (
          <p className="profile-sub">{me.groups.map((g) => g.name).join(' · ')}</p>
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
