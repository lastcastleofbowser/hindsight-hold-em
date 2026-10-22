import { type FormEvent, useEffect, useState } from 'react';
import { ApiError, useAuth } from '../hooks/useAuth';

/** Log in / create account form. Used by the Friends and Profile tabs. */
export function AuthPanel({ reason }: { reason: string }) {
  const { login, register, requestPasswordReset, resetPassword, verifyEmail } = useAuth();
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('reset') ?? '');
  const [verifyToken] = useState(() => new URLSearchParams(window.location.search).get('verify') ?? '');
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset' | 'verify'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('reset') ? 'reset' : params.has('verify') ? 'verify' : 'login';
  });
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!resetToken && !verifyToken) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('reset');
    url.searchParams.delete('verify');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [resetToken, verifyToken]);

  useEffect(() => {
    if (!verifyToken) return;
    let cancelled = false;
    setBusy(true);
    verifyEmail(verifyToken)
      .then(() => {
        if (!cancelled) {
          setMode('login');
          setNotice('Email verified. You can now log in and request password resets.');
        }
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Email verification failed.'))
      .finally(() => !cancelled && setBusy(false));
    return () => { cancelled = true; };
  }, [verifyToken, verifyEmail]);

  const changeMode = (next: 'login' | 'register' | 'forgot') => {
    setMode(next);
    setError('');
    setNotice('');
  };

  if (mode === 'verify') {
    return (
      <div className="auth-wrap">
        <section className="panel auth-panel" data-tour="auth">
          <h2>Verify email</h2>
          {busy && <p className="small muted" role="status">Verifying your email…</p>}
          {notice && <p className="small muted" role="status">{notice}</p>}
          {error && <div className="error" role="alert">{error}</div>}
        </section>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if ((mode === 'register' || mode === 'reset') && password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    try {
      if (mode === 'login') await login(username.trim(), password);
      else if (mode === 'register') await register(username.trim(), email.trim(), password);
      else if (mode === 'forgot') setNotice(await requestPasswordReset(email.trim()));
      else {
        await resetPassword(resetToken, password);
        setResetToken('');
        setPassword('');
        setConfirm('');
        setMode('login');
        setNotice('Your password has been reset. Log in with your new password.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <section className="panel auth-panel" data-tour="auth">
        {(mode === 'login' || mode === 'register') ? (
          <>
            <div className="seg" role="tablist" aria-label="Account">
              <button role="tab" aria-pressed={mode === 'login'} onClick={() => changeMode('login')}>
                Log in
              </button>
              <button role="tab" aria-pressed={mode === 'register'} onClick={() => changeMode('register')}>
                Create account
              </button>
            </div>
            <p className="small muted">{reason}</p>
          </>
        ) : (
          <>
            <h2>{mode === 'forgot' ? 'Reset your password' : 'Choose a new password'}</h2>
            <button className="auth-link" type="button" onClick={() => changeMode('login')}>Back to log in</button>
          </>
        )}
        <form onSubmit={submit} className="auth-form">
          {(mode === 'login' || mode === 'register') && (
            <label className="field">
              Username
              <input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} required />
            </label>
          )}
          {(mode === 'register' || mode === 'forgot') && (
            <label className="field">
              Email
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
            </label>
          )}
          {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <>
              <label className="field">
                {mode === 'reset' ? 'New password' : 'Password'}
                <input
                  type={showPasswords ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              {(mode === 'register' || mode === 'reset') && (
                <label className="field">
                  Confirm password
                  <input type={showPasswords ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                </label>
              )}
              {(mode === 'register' || mode === 'reset') && (
                <p className="small muted" style={{ margin: 0 }}>
                  {mode === 'register' ? 'Usernames: 3–20 letters, numbers or underscores. ' : ''}Passwords: at least 8 characters.
                </p>
              )}
              <label className="auth-password-toggle">
                <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} />
                Show {mode === 'register' || mode === 'reset' ? 'passwords' : 'password'}
              </label>
            </>
          )}
          {mode === 'login' && <button className="auth-link" type="button" onClick={() => changeMode('forgot')}>Forgot password?</button>}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {notice && <div className="small muted" role="status">{notice}</div>}
          <button className="btn primary" type="submit" disabled={busy || ((mode === 'login' || mode === 'register') && (!username.trim() || !password)) || (mode === 'reset' && !password)}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Reset password'}
          </button>
        </form>
      </section>
    </div>
  );
}
