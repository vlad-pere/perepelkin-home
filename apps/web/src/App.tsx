import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { LoginPage } from './pages/Login';
import { HomePage } from './pages/Home';
import { Splash } from './components/Splash';

function Root() {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  return (
    <Routes>
      <Route
        path="/login"
        element={status === 'authenticated' ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={status === 'authenticated' ? <HomePage /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={status === 'authenticated' ? '/' : '/login'} replace />} />
    </Routes>
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
