import { type FormEvent, useState } from 'react';
import { ApiError, useAuth } from '../hooks/useAuth';

/** Log in / create account form. Used by the Friends and Profile tabs. */
export function AuthPanel({ reason }: { reason: string }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    try {
      await (mode === 'login' ? login(username.trim(), password) : register(username.trim(), password));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <section className="panel auth-panel" data-tour="auth">
        <div className="seg" role="tablist" aria-label="Account">
          <button role="tab" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
            Log in
          </button>
          <button role="tab" aria-pressed={mode === 'register'} onClick={() => setMode('register')}>
            Create account
          </button>
        </div>
        <p className="small muted">{reason}</p>
        <form onSubmit={submit} className="auth-form">
          <label className="field">
            Username
            <input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} required />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {mode === 'register' && (
            <>
              <label className="field">
                Confirm password
                <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </label>
              <p className="small muted" style={{ margin: 0 }}>
                Usernames: 3–20 letters, numbers or underscores (shown to friends at the table). Passwords: at least 8 characters.
              </p>
            </>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="btn primary" type="submit" disabled={busy || !username.trim() || !password}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </section>
    </div>
  );
}
