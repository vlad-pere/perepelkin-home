import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { MeResponse } from '@perepelkin-home/core';
import { api, setCsrfToken } from './api';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  me: MeResponse | null;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<MeResponse & { csrfToken: string }>('/api/auth/me')
      .then((data) => {
        if (cancelled) return;
        setCsrfToken(data.csrfToken);
        setMe(data);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setMe(null);
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (username: string, password: string) => {
    const data = await api<MeResponse & { csrfToken: string }>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    setCsrfToken(data.csrfToken);
    setMe(data);
    setStatus('authenticated');
  };

  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      setCsrfToken(null);
      setMe(null);
      setStatus('anonymous');
    }
  };

  return <AuthContext.Provider value={{ status, me, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
