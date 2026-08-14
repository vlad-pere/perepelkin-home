import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { ApiError } from '../api';

type LoginMode = 'pin' | 'password';

const PIN_LENGTH = 6;
const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [mode, setMode] = useState<LoginMode>('pin');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isPin = mode === 'pin';

  const switchMode = (next: LoginMode): void => {
    setMode(next);
    setSecret('');
    setError(null);
  };

  const submit = async (value: string): Promise<void> => {
    if (pending) return;
    const name = username.trim();
    if (!name) {
      setError('Введите имя пользователя');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await login(name, value);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось войти. Попробуйте ещё раз.');
      if (isPin) setSecret('');
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    void submit(secret);
  };

  const pressDigit = (digit: string): void => {
    if (pending) return;
    setError(null);
    const next = (secret + digit).slice(0, PIN_LENGTH);
    setSecret(next);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  const pressBackspace = (): void => {
    if (pending) return;
    setSecret((s) => s.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!isPin) return;
      if (e.key >= '0' && e.key <= '9') pressDigit(e.key);
      else if (e.key === 'Backspace') pressBackspace();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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

        <div className="auth-mode" role="group" aria-label="Тип входа">
          <button
            type="button"
            className={`auth-mode-btn${isPin ? ' active' : ''}`}
            aria-pressed={isPin}
            onClick={() => switchMode('pin')}
          >
            Пинкод
          </button>
          <button
            type="button"
            className={`auth-mode-btn${!isPin ? ' active' : ''}`}
            aria-pressed={!isPin}
            onClick={() => switchMode('password')}
          >
            Пароль
          </button>
        </div>

        {isPin ? (
          <>
            <div
              className="pin-dots"
              role="status"
              aria-label={`Пинкод: введено ${secret.length} из ${PIN_LENGTH}`}
            >
              {Array.from({ length: PIN_LENGTH }, (_, i) => (
                <span key={i} className={`pin-dot${i < secret.length ? ' filled' : ''}`} />
              ))}
            </div>

            <div className="keypad" aria-label="Клавиатура пинкода">
              {KEYPAD_KEYS.map((key) =>
                key === '' ? (
                  <span key="spacer" />
                ) : key === 'back' ? (
                  <button
                    key="back"
                    type="button"
                    className="keypad-btn backspace"
                    aria-label="Стереть"
                    disabled={pending}
                    onClick={pressBackspace}
                  >
                    ⌫
                  </button>
                ) : (
                  <button
                    key={key}
                    type="button"
                    className="keypad-btn"
                    aria-label={`Цифра ${key}`}
                    disabled={pending}
                    onClick={() => pressDigit(key)}
                  >
                    {key}
                  </button>
                ),
              )}
            </div>
          </>
        ) : (
          <label className="field">
            <span className="field-label">Пароль</span>
            <input
              className="field-input"
              type="password"
              autoComplete="current-password"
              placeholder="Не короче 8 символов"
              minLength={8}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              required
            />
          </label>
        )}

        {!isPin && (
          <button className="btn-primary" type="submit" disabled={pending}>
            {pending ? 'Входим…' : 'Войти'}
          </button>
        )}
      </form>
    </main>
  );
}
