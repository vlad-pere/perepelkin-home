import { useEffect, useState } from 'react';
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

export function HomePage() {
  const { me } = useAuth();
  const modules = me?.modules ?? [];
  const [summaries, setSummaries] = useState<Record<string, ModuleSummary>>({});
  const [loaded, setLoaded] = useState(false);

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

  return (
    <div className="shell">
      <Topbar />

      <main className="home">
        {modules.length > 0 ? (
          <ul className="dashboard">
            {modules.map((m, i) => (
              <DashboardCard
                key={m.id}
                module={m}
                summary={summaries[m.id]}
                loaded={loaded}
                style={{ animationDelay: `${i * 0.06}s` }}
              />
            ))}
          </ul>
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

function DashboardCard({
  module: m,
  summary,
  loaded,
  style,
}: {
  module: ModuleAccess;
  summary?: ModuleSummary;
  loaded: boolean;
  style?: React.CSSProperties;
}) {
  const Icon = ICONS[m.icon ?? ''] ?? ClipboardCheck;
  const color = m.color ?? 'var(--accent)';
  const iconBg = m.color ? m.color + '18' : undefined;

  return (
    <li className="dashboard-card" style={style}>
      <Link className="dashboard-card-link" to={m.route}>
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
      </Link>
    </li>
  );
}
