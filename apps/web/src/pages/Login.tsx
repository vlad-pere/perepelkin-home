import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { ApiError } from '../api';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось войти. Попробуйте ещё раз.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="auth-eyebrow">личное пространство</p>
        <h1 className="auth-title">Дом Перепелкиных</h1>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <label className="field">
          <span className="field-label">Имя пользователя</span>
          <input
            className="field-input"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Пароль</span>
          <input
            className="field-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
