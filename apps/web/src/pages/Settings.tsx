import { useAuth } from '../auth';
import { Topbar } from '../components/Topbar';
import { AppearanceSection } from './settings/Appearance';

/**
 * Раздел «Настройки». Подразделы подключаются здесь; сейчас — только «Оформление».
 * Права решил роут: раздел открывает администратор, потому что меняет тему на всех.
 */
export function SettingsPage() {
  const { me } = useAuth();
  if (!me) return null;

  return (
    <div className="shell">
      <Topbar breadcrumb={{ label: 'Настройки' }} />
      <main className="settings">
        <section className="settings-section">
          <div className="settings-section-head">
            <h2 className="settings-section-title">Оформление</h2>
            <p className="settings-section-sub">
              Тема одна для всего дома и видна всем пользователям. Меняется администратором.
            </p>
          </div>
          <AppearanceSection />
        </section>
      </main>
    </div>
  );
}
