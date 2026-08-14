import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AdminPage } from '@perepelkin-home/module-admin/ui';
import { AuthProvider, useAuth } from './auth';
import { api } from './api';
import { Topbar } from './components/Topbar';
import { LoginPage } from './pages/Login';
import { HomePage } from './pages/Home';
import { ProfilePage } from './pages/Profile';
import { WishlistPublicPage } from './pages/Wishlist';
import { Splash } from './components/Splash';
import { ModuleUnavailable, resolveModuleUi } from './modules/registry';

function Root() {
  const { status, me } = useAuth();
  const isAdmin = status === 'authenticated' && me !== null && me.user.isAdmin;

  return (
    <Routes>
      <Route path="/wishlist" element={<WishlistPublicPage />} />
      {status === 'loading' ? (
        <Route path="*" element={<Splash />} />
      ) : (
        <>
          <Route
            path="/login"
            element={status === 'authenticated' ? <Navigate to="/" replace /> : <LoginPage />}
          />
          <Route
            path="/"
            element={status === 'authenticated' ? <HomePage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/admin"
            element={
              isAdmin ? (
                <div className="shell">
                  <Topbar />
                  <AdminPage api={api} currentUserId={me!.user.id} />
                </div>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/profile"
            element={
              status === 'authenticated' ? <ProfilePage /> : <Navigate to="/login" replace />
            }
          />
          <Route
            path="/m/:moduleId/*"
            element={
              status === 'authenticated' ? (
                <ModulePage />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to={status === 'authenticated' ? '/' : '/login'} replace />} />
        </>
      )}
    </Routes>
  );
}

function ModulePage() {
  const { me } = useAuth();
  const { moduleId } = useParams();
  const module = me?.modules.find((m) => m.id === moduleId);
  if (!module) return <Navigate to="/" replace />;
  if (module.route !== `/m/${module.id}`) return <Navigate to={module.route} replace />;
  const Ui = resolveModuleUi(module.id, module.kind);
  return (
    <div className="shell">
      <Topbar />
      {Ui ? (
        <Ui
          moduleId={module.id}
          api={api}
          currentUserId={me!.user.id}
          canWrite={module.canWrite}
        />
      ) : (
        <ModuleUnavailable module={module} />
      )}
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </BrowserRouter>
  );
}
